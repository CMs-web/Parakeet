# PROJECT PLAN — Talkwise: Live AI Assistant for Calls, Meetings and Interviews (India-first)

Product name: **Talkwise** (decided 2026-10-29). Before launch: check domain (.in/.com)
and trademark (ipindia.gov.in).

> READ THIS FIRST. Any AI assistant working on this repo must read this file and
> `docs/ROADMAP_MILESTONES.md` before touching code. This is the source of truth.

## 1. Who we are / working rules for the AI

- Owner: Shivam, solo founder, ~2 years MERN/Python dev, based in Indore, India.
- Shivam **types code by hand** (does not copy-paste). Therefore:
  - Keep code minimal. Write only what the current milestone needs. No over-engineering.
  - Explain every change line by line, in simple words (Hinglish is fine).
  - Give direct, concrete recommendations, not long lists of options.
  - Work on ONE milestone task at a time, then check in.
- Be honest and direct. If an idea is risky or wrong, say so.
- No investment right now. Everything runs **locally and free/cheap** until validation is done.

## 2. What we are building

A desktop (Electron) app + later web app: a **live AI assistant** for Indian users
(students, freshers, job switchers, sales/client-facing professionals).
Demand insight: people do not pay for "coach"; they pay for live help during a real call.
So the core paid feature is live help, and practice is the free funnel.

Honest positioning rules: describe the product as it is (live transcript + answer
suggestions). Never market it as "undetectable" or "cheat". Tell the payment gateway the
real product description.

1. **Live assist (core, paid):** live transcript of the call + instant suggested answers
   for interviews (where allowed), sales calls, client calls, and meetings.
2. **Practice mode (free funnel):** mock interviews with an AI interviewer. Speak the answer,
   get scored feedback (clarity, structure, filler words, confidence, content). Brings
   users in, converts to paid live assist.
3. **Post-call analysis:** upload/record a call, get transcript, summary, action items,
   and notes.
4. **India-specific content:** Hinglish speech support, campus placement and service-company
   HR rounds (TCS/Infosys/Wipro style), HR questions, notice period and salary negotiation
   scripts, communication/English confidence drills.

Why this wins: Indian-accent and Hinglish speech, Indian interview formats, UPI-friendly
low pricing (Rs 99-299), and Shivam's college/workshop distribution (E-Skills,
Gitanjali college, Renaissance University).

## 3. What exists today (the starting code)

The repo was produced by reverse-engineering ParakeetAI desktop 3.9.135 with REA
(`docs/reverse-engineering.md`). It is an Electron + React + TypeScript app:

| Area | Files | State |
| --- | --- | --- |
| Main process | `src/main/*` (windows, ipc, billing, sessions, documents, meetings, llm, store, deeplink) | works locally |
| Preload bridge | `src/preload/index.ts` | works |
| Renderer | `src/renderer/src/App.tsx`, `audio.ts`, `stt.ts`, `question.ts`, components | works, has bugs |
| Shared | `src/shared/types.ts`, `limits.ts` | constants copied from Parakeet |

Flow today: capture mic + system audio -> STT (Speechmatics / OpenAI Realtime / local Whisper)
-> transcript segments -> question detection -> LLM streaming answer -> overlay + history.

Keys are entered by the user in Settings (BYO API keys). Billing is a fake local ledger
(`billing.ts`, `billing.json`). There is no backend.

## 4. Legal and brand rules (must follow)

- We must NOT ship as "Parakeet". Rename the app, logo, UI copy, colors, protocol
  (`parakeetai://`), appId, productName, overlay text.
- Reimplementing behavior is fine; copying their text, assets, design 1:1 is not.
  Milestone file line "1:1 cloning of UI text and styles" is **cancelled**.
- Remove copied constants that only make sense for their pricing (keep our own limits).
- Do not market as "undetectable" or "cheat" tool. Do not hide the app from screen share
  as a selling point.

## 5. Target architecture

### Phase A — Local only (now, Rs 0 spend)
- Electron app, everything on the user's machine.
- STT: local Whisper HTTP (whisper.cpp) or a free tier key for testing.
- LLM: free/cheap tier for development (test keys by owner only).
- Storage: JSON files in userData (already done).
- Payments: **none**. Credits are fake and clearly marked as test mode.

### Phase B — Closed beta (still no investment)
- Same local app, given to 20-30 real users (friends, college students).
- Owner provides keys through a tiny proxy OR users bring their own keys.
- Collect feedback in a Google Form / sheet. Track what they use and would pay for.

### Phase C — Real SaaS (only after validation passes)
- Small backend (Node/Express or Next.js API) + Postgres/Supabase:
  auth, user table, credits, usage logs.
- LLM/STT proxy so users never see provider keys.
- Payments via **Razorpay** (UPI, cards), webhook -> credit top-up.
- Plans: free trial, Rs 99-299 packs/monthly, student discount.
- Landing page, privacy policy, terms, refund policy (needed for payment gateway KYC).
- No company certificate needed to start. Individual/proprietor Razorpay or Cashfree
  account needs: PAN, bank account, working website with the 3 policies. Get free
  Udyam registration to help KYC. Lemon Squeezy/Paddle (merchant of record) is an option
  for international users. GST registration becomes needed past Rs 20 lakh/year turnover
  (verify with a CA when near).
- Until Phase C: collect from <=20 beta users via direct UPI only, manually.

## 6. Core flows

1. **Practice session:** pick role/company type -> AI asks question (text + optional voice)
   -> user answers by voice -> STT -> LLM scores and gives feedback -> saved to history.
2. **Call/meeting session:** start session -> capture audio -> live transcript ->
   optional suggestions -> end -> summary + coaching report -> export markdown.
3. **Post-call upload:** user picks audio file -> STT -> same report pipeline.
4. **Billing (Phase C):** buy pack -> Razorpay checkout -> webhook -> credits added ->
   each session spends credits via backend.

## 7. Tech stack (keep it small)

- Electron 33, electron-vite, React 18, TypeScript (already set).
- STT: Speechmatics / OpenAI Realtime / local Whisper (already coded in `stt.ts`).
- LLM: OpenAI-compatible and Anthropic (already in `llm.ts`).
- Later: Supabase or Postgres, Razorpay, a simple landing page.

## 8. Known problems to fix first

1. `SettingsPanel.tsx` offers `general/sales/support`, `short-paragraph/structured`,
   `brief`, `professional/friendly/confident/concise` but `types.ts` only allows
   `interview|regular_call`, `bullets|balanced|paragraph`, `concise|balanced|detailed`,
   `formal|casual|simple`. Saved values silently break `llm.ts` rules.
2. API keys stored in plain JSON in userData.
3. `billing.ts` "buy credits" grants free credits (fine for test mode, must be labelled).
4. Auto-extend and rejoin-window UI are unfinished.
5. Parakeet branding everywhere.

## 9. Validation targets (gate before payments)

Do not build Phase C until ALL are true:
- 20+ real users completed at least 3 sessions each.
- At least 10 users say they would pay, and 5 agree to a real price in a quick test.
- Cost per session (STT + LLM) known and under 30% of the planned price.
- One clear winning use case chosen (e.g. fresher interview practice).

## 10. Money math (reference)

- Rs 1 crore/year ~ Rs 8.3 lakh/month.
- At Rs 299/month ~ 2,800 paying users. At Rs 499 ~ 1,700.
- Per-session AI cost must be measured in Milestone 7 before fixing prices.
