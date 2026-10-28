# ROADMAP & MILESTONES

Companion to `docs/PROJECT_PLAN.md`. Status: [ ] todo, [~] in progress, [x] done, [-] cancelled.
Rule: finish milestones in order. Payments come LAST, after validation.
Rule: update this file after every finished task. One task at a time, explain line by line.

## M0 — Cleanup and rebrand (no cost)
- [x] M0.1 Product name chosen: Talkwise (written in PROJECT_PLAN.md)
- [ ] M0.1b Check domain (.in/.com) and trademark for Talkwise
- [x] M0.2 Rename app: package.json (name, productName, appId), window titles, overlay text, tray
- [ ] M0.3 Replace `parakeetai://` protocol with our own in `deeplink.ts` / `index.ts`
- [ ] M0.4 Rewrite UI copy and colors so it is not a 1:1 copy
- [ ] M0.5 Fix SettingsPanel option values to match `types.ts` (known bug #1)
- [ ] M0.6 Run `npm run typecheck` and `npm run build` with 0 errors
- [-] Old milestone "1:1 cloning of UI text and styles" is cancelled

## M1 — Stable local core (no cost)
- [ ] M1.1 Smoke test: mic capture -> STT -> transcript on Windows
- [ ] M1.2 Smoke test: system audio loopback works
- [ ] M1.3 Answer streaming works with one chosen LLM
- [ ] M1.4 Finish session history (list, open, export markdown, delete)
- [ ] M1.5 Label billing as TEST MODE in UI

## M2 — Practice mode (free funnel; live assist already exists from the clone)
- [ ] M2.1 New session type `practice` in `types.ts`
- [ ] M2.2 AI interviewer asks questions (role + level chosen by user)
- [ ] M2.3 User answers by voice, STT converts to text
- [ ] M2.4 Feedback prompt: score + 3 improvements (clarity, structure, filler words)
- [ ] M2.5 Question bank for Indian freshers (HR, technical basics, self-intro)
- [ ] M2.6 Save each practice answer with score for progress tracking

## M3 — India angle
- [ ] M3.1 Hinglish/Indian-accent STT test (compare 2 providers on 10 real recordings)
- [ ] M3.2 Service-company HR round pack (TCS/Infosys/Wipro style questions)
- [ ] M3.3 Notice period and salary negotiation scripts
- [ ] M3.4 Simple English-confidence drills (filler words, pace)

## M4 — Post-call analysis
- [ ] M4.1 Upload an audio file -> transcript
- [ ] M4.2 Summary + action items + coaching notes
- [ ] M4.3 Export report as markdown

## M5 — Progress and UX
- [ ] M5.1 Progress screen (scores over time)
- [ ] M5.2 Finish auto-extend prompt and rejoin window (or remove if not needed)
- [ ] M5.3 Simple onboarding screen (pick goal: interview / sales / English)

## M6 — Closed beta (still no payment)
- [ ] M6.1 Build Windows installer (`npm run dist`) and test on 2 clean PCs
- [ ] M6.2 Give to 20-30 users (college friends, E-Skills students)
- [ ] M6.3 Feedback form + weekly check-in with users
- [ ] M6.4 Log usage per session (minutes, features used) locally

## M7 — Validation gate (decision point)
- [ ] M7.1 Measure real cost per session (STT + LLM) in Rs
- [ ] M7.2 Pick the ONE winning use case from beta data
- [ ] M7.3 Price test: ask users to pre-commit to Rs 99 / 199 / 299
- [ ] M7.4 Gate check from PROJECT_PLAN section 9. If it fails, iterate M2-M6. Do NOT start M8.

## M8 — Backend (only after M7 passes)
- [ ] M8.1 Choose backend (Supabase or Node + Postgres)
- [ ] M8.2 Auth (email / Google login)
- [ ] M8.3 LLM + STT proxy so users never see provider keys
- [ ] M8.4 Real credit ledger on the server, remove local fake billing
- [ ] M8.5 Move API keys out of plain JSON (secure storage)

## M9 — Payments (LAST)
- [ ] M9.0 Get free Udyam registration (no business certificate needed to start)
- [ ] M9.1 Individual/proprietor Razorpay or Cashfree KYC (PAN, bank, website with policies); give the true product description
- [ ] M9.2 Privacy policy, terms, refund policy pages
- [ ] M9.3 Razorpay checkout (UPI + cards) for credit packs
- [ ] M9.4 Webhook -> add credits -> verify signature
- [ ] M9.5 Test mode end-to-end, then live mode with Rs 1 test payment
- [ ] M9.6 Student discount and coupon codes

## M10 — Launch and growth
- [ ] M10.1 Landing page
- [ ] M10.2 YouTube / Instagram reels demo content
- [ ] M10.3 College placement-cell partnerships
- [ ] M10.4 Track revenue toward Rs 1 crore (monthly dashboard)

## Current focus
Next task: M0.2 (rename app to Talkwise in package.json, window titles, overlay, tray).
