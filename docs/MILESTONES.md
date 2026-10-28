# Parakeet Clone — Milestone Tracker

Evidence source: `docs/reverse-engineering.md` (static RE of ParakeetAI-Setup-3.9.135.exe,
SHA-256 `21223424c1f71d1ccdb90a92c099f3d645f53a8f2baea5d6f4e654a73210d687`).
Status vocabulary: ☐ not started · ◐ in progress · ✅ done · 🚫 deliberately out of scope.

## M0 — Evidence baseline (REA / static RE)
- ✅ M0.1 Extract and inventory the installer (asar, native addon, updater config)
- ✅ M0.2 Document package layout, window model, routes, deep links (`docs/reverse-engineering.md` §1–3)
- ✅ M0.3 Recover session/credit constants, enums, model catalogue (§4)
- ✅ M0.4 Recover transport model: Speechmatics realtime STT, `/api/chat` answers, tRPC surface (§5)
- ✅ M0.5 Recover global shortcut map (§6)
- ✅ M0.6 Recover meeting auto-detection app list + event flow (§7)
- ✅ M0.7 Recover updates/telemetry behaviour (§8)
- 🚫 M0.8 Decompile native WASAPI addon — Rust source ships in `app.asar.unpacked`; use as reference only if needed
- 🚫 M0.9 Server prompt templates — behind `/api/chat`, not recoverable statically; clone uses its own reconstruction

## M1 — Project scaffold
- ✅ M1.1 electron-vite + React + TypeScript workspace
- ✅ M1.2 Main / preload / renderer process split
- ✅ M1.3 electron-builder NSIS packaging config (`package.json` `build`)
- ✅ M1.4 Shared types module (`src/shared/types.ts`)

## M2 — Main process: shell
- ✅ M2.1 Floating panel overlay window (frameless, always-on-top, skip taskbar)
- ✅ M2.2 Main dashboard window + tray (open, toggle overlay, quit)
- ✅ M2.3 Global shortcut registry matching §6 map, re-registered from settings
- ✅ M2.4 Permission handler limited to `media`, `display-capture`, `clipboard-read`
- ✅ M2.5 `getDisplayMedia` handler → screen + system audio (`loopback`) for renderer capture
- ✅ M2.6 Single-instance lock + `parakeetai://` protocol queueing (initial URL drained after ready)
- ☐ M2.7 Re-assert always-on-top every 1 s on Windows (shipped app parity)

## M3 — Deep links & auth
- ✅ M3.1 `parakeetai://auth?payload=<base64>` handler; stores auth, focuses panel
- ✅ M3.2 `parakeetai://callSession?id=…` handler; opens that session
- ✅ M3.3 Browser handoff parity (`?payload=` base64 or pre-decoded)
- ◐ M3.4 Persisted auth + "logged in" UI state in renderer (auth exposed via API; UI wiring pending)

## M4 — Session & billing rules (constants from §4)
- ✅ M4.1 Free trial 10 min, 12 min cooldown
- ✅ M4.2 Paid session 0.5 credit / 30 min; extension +0.5 / 20 min
- ✅ M4.3 5-minute short-end refund (session start or extension)
- ✅ M4.4 5-minute rejoin window after session end
- ✅ M4.5 Auto Extend: charge 15 s before zero, prompt 60 s before that, dismiss after 15 s
- ✅ M4.6 Local credit ledger (`billing.ts`) with quote/charge/refund/grant
- ✅ M4.7 Session modes `interview` / `regular_call` (was general/sales/support)
- ✅ M4.8 Session brief fields: companyDomain, jobPostUrl, language, resume, documents, isMock

## M5 — Meeting auto-detection
- ✅ M5.1 Process-name + window-title detector in main process (`meetings.ts`)
- ✅ M5.2 Known app table from §7 (zoom, slack, webex, teams, whatsapp, browsers, web services)
- ✅ M5.3 `autoDetectMeetings` toggle + tray balloon on meeting start
- ◐ M5.4 mic-monitor-worker parity (mic activity feeding the detector) — pending utility process

## M6 — Audio capture & STT
- ✅ M6.1 Renderer `getUserMedia` mic capture
- ✅ M6.2 System audio loopback via `getDisplayMedia` handler (main grants primary screen + loopback audio)
- ✅ M6.3 Speechmatics realtime WS client with speaker diarization, `additionalVocab` per session
- ✅ M6.4 Local STT option (WS endpoint, e.g. whisper server) + OpenAI transcribe option
- ◐ M6.5 Transcript segmentation with interim → final segments, per-speaker labelling

## M7 — Answers (LLM)
- ✅ M7.1 Streaming LLM client (`llm.ts`) with cancel, model catalogue
- ✅ M7.2 Prompt reconstruction: session brief + transcript window + answer prefs (format/length/tone/STAR/filler words)
- ✅ M7.3 Question detection from transcript + auto-answer trigger
- ✅ M7.4 Context documents/resume injection with selection modes (`all` / `none` / `custom`)
- ◐ M7.5 Answer history navigation (prev/next) wired to `Ctrl+Left`/`Ctrl+Right`

## M8 — Documents & resume
- ✅ M8.1 Document store (paste text, add from file dialog, delete)
- ✅ M8.2 Resume record type + selection in session brief
- ☐ M8.3 Resume maker routes (`/resumeMaker`, `/resumeMaker/print`) — out of scope for now (server-backed in real app)

## M9 — Renderer UI
- ✅ M9.1 Dashboard shell: session brief form, mode switch, history
- ✅ M9.2 Live call overlay: transcript view, answer view, status, timer
- ✅ M9.3 Settings panel: STT / LLM / overlay / limits / hotkeys / defaults
- ✅ M9.4 History panel: session list, session detail, export markdown, save to file
- ◐ M9.5 Auto-extend prompt UI (60 s before expiry, 15 s auto-dismiss)
- ☐ M9.6 Rating UI per answer (up/down) + copy-event tracking
- ☐ M9.7 Post-call feedback ("did the answers help?")
- ☐ M9.8 Account/login surface driven by deep-link auth (M3.4)

## M10 — Session records
- ✅ M10.1 Session persistence (list/detail/append transcript/append answer/delete)
- ✅ M10.2 Answer records with latency, model, rating field
- ✅ M10.3 Markdown export + save-to-file
- ☐ M10.4 Rejoin-window enforcement in UI (show "rejoin" entry for 5 min after end)

## M11 — Build, packaging, verification
- ◐ M11.1 `npm run typecheck` passes — 2 errors left (documents.ts, index.ts)
- ☐ M11.2 `npm run build` + `npm start` smoke run
- ☐ M11.3 `npm run dist` produces NSIS installer
- ☐ M11.4 Final pass over §9 parity checklist; mark every row done or explicitly out of scope
- 🚫 M11.5 Server-side features (tRPC backend, per-call key minting, subscriptions) — clone runs locally by design
- 🚫 M11.6 Sentry/Mixpanel telemetry — out of scope for a local clone

## Working rules
1. Every milestone change must trace back to a line in `docs/reverse-engineering.md` or be marked **inference**.
2. Keep §9 checklist in the RE notes in sync with this file.
3. Typecheck must pass before each commit.
