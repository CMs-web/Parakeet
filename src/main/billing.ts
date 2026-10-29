import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { PRODUCT_LIMITS } from '../shared/limits'
import type { BillingState, StartQuote } from '../shared/types'

/**
 * Local mirror of the credit rules implemented by the shipped app
 * (docs/reverse-engineering.md §4). There is no billing backend in this clone,
 * so the ledger lives in userData/billing.json.
 *
 *  - free run: 10 minutes, then a 12 minute cooldown before the next free run
 *  - paid run: 0.5 credit, 30 minutes
 *  - extension: 0.5 credit, 20 minutes
 *  - ending within 5 minutes of a charge refunds that charge
 *  - the last session can be rejoined for 5 minutes without a new charge
 */

interface Charge {
  sessionId: string
  kind: 'session' | 'extension'
  credits: number
  at: number
}

interface Ledger extends BillingState {
  charges: Charge[]
}

const STARTING_CREDITS = 2

const initial: Ledger = {
  credits: STARTING_CREDITS,
  freeSessionsUsed: 0,
  freeSessionAvailableAt: null,
  lastEndedSessionId: null,
  lastEndedAt: null,
  resumeAvailableUntil: null,
  purchaseCount: 0,
  charges: []
}

let cache: Ledger | null = null

function ledgerPath(): string {
  return path.join(app.getPath('userData'), 'billing.json')
}

async function persist(): Promise<void> {
  if (!cache) return
  await fs.mkdir(path.dirname(ledgerPath()), { recursive: true })
  await fs.writeFile(ledgerPath(), JSON.stringify(cache, null, 2), 'utf8')
}

async function load(): Promise<Ledger> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await fs.readFile(ledgerPath(), 'utf8')) as Partial<Ledger>
    cache = {
      ...initial,
      ...parsed,
      charges: Array.isArray(parsed.charges) ? parsed.charges : []
    }
  } catch {
    cache = { ...initial, charges: [] }
  }
  return cache
}

const minutes = (value: number): number => value * 60_000

export function publicState(ledger: Ledger): BillingState {
  const { charges: _charges, ...state } = ledger
  return state
}

export async function getBillingState(): Promise<BillingState> {
  return publicState(await load())
}

export function cooldownRemainingMs(_ledger: Ledger, _now = Date.now()): number {
  return 0
}

/** In local dev/test mode, unlimited sessions are allowed with 0 cooldown */
export async function quoteStart(): Promise<StartQuote> {
  const ledger = await load()
  return {
    allowed: true,
    reason: null,
    free: true,
    cost: 0,
    durationMinutes: PRODUCT_LIMITS.maxCallDurationMinutes,
    cooldownEndsAt: null,
    credits: ledger.credits
  }
}

export async function chargeSessionStart(sessionId: string): Promise<StartQuote> {
  const quote = await quoteStart()
  if (!quote.allowed) return quote
  const ledger = await load()
  if (!quote.free) {
    ledger.credits = Number((ledger.credits - PRODUCT_LIMITS.sessionCreditCost).toFixed(2))
    ledger.charges.push({
      sessionId,
      kind: 'session',
      credits: PRODUCT_LIMITS.sessionCreditCost,
      at: Date.now()
    })
  }
  await persist()
  return { ...quote, credits: ledger.credits }
}

export async function extendSession(
  sessionId: string
): Promise<{ ok: boolean; reason: string | null; state: BillingState }> {
  const ledger = await load()
  if (ledger.credits < PRODUCT_LIMITS.sessionCreditCost) {
    return { ok: false, reason: 'Not enough call credits to extend.', state: publicState(ledger) }
  }
  ledger.credits = Number((ledger.credits - PRODUCT_LIMITS.sessionCreditCost).toFixed(2))
  ledger.charges.push({
    sessionId,
    kind: 'extension',
    credits: PRODUCT_LIMITS.sessionCreditCost,
    at: Date.now()
  })
  await persist()
  return { ok: true, reason: null, state: publicState(ledger) }
}

/** Short-end refunds plus the free-session cooldown and 5 minute rejoin window. */
export async function settleSession(
  sessionId: string,
  options: { free: boolean }
): Promise<{ refunded: boolean; state: BillingState }> {
  const ledger = await load()
  const now = Date.now()
  const refundWindow = minutes(PRODUCT_LIMITS.shortEndReturnMinutes)
  let refunded = false
  let refund = 0
  for (const charge of ledger.charges) {
    if (charge.sessionId !== sessionId) continue
    if (now - charge.at < refundWindow) {
      refund += charge.credits
      refunded = true
    }
  }
  ledger.charges = ledger.charges.filter((charge) => charge.sessionId !== sessionId)
  if (refund > 0) ledger.credits = Number((ledger.credits + refund).toFixed(2))

  if (options.free) {
    ledger.freeSessionsUsed += 1
    ledger.freeSessionAvailableAt = now + minutes(PRODUCT_LIMITS.freeSessionCooldownMinutes)
  }
  ledger.lastEndedSessionId = sessionId
  ledger.lastEndedAt = now
  ledger.resumeAvailableUntil = now + minutes(PRODUCT_LIMITS.sessionRecentlyEndedWindowMinutes)
  await persist()
  return { refunded, state: publicState(ledger) }
}

/** "Buy credits": the app opens the web dashboard, this clone grants them locally. */
export async function grantCredits(amount = PRODUCT_LIMITS.freeSessionsPerCreditPurchase): Promise<BillingState> {
  const ledger = await load()
  ledger.credits = Number((ledger.credits + amount).toFixed(2))
  ledger.purchaseCount += 1
  ledger.freeSessionsUsed = 0
  ledger.freeSessionAvailableAt = null
  await persist()
  return publicState(ledger)
}

export async function resetBilling(): Promise<BillingState> {
  cache = { ...initial, charges: [] }
  await persist()
  return publicState(cache)
}
