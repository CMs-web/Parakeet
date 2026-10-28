# ParakeetAI desktop 3.9.135 — reverse-engineering notes

Target: `D:\Downloads\ParakeetAI-Setup-3.9.135.exe`
SHA-256: `21223424c1f71d1ccdb90a92c099f3d645f53a8f2baea5d6f4e654a73210d687`

Everything below is static evidence from the shipped artifact unless a line says **inference**.
Nothing here was obtained by running the app or contacting its servers.

## 1. Package layout

The installer is a 7z-compressed Electron payload that extracts straight to a directory:

```
locales/
resources/app.asar             177 MB
resources/app.asar.unpacked/   native modules + Rust sources
resources/app-update.yml        owner: parakeetai, repo: parakeetai-desktop-releases
<U+2800>.exe                    Electron host, filename is a braille blank + .exe
```

`package.json` inside the asar:

```json
{ "name": "parakeetai-desktop", "version": "3.9.135",
  "description": "ParakeetAI Desktop App", "main": "./dist/main/main.js" }
```

Application code is two minified bundles plus a preload shim:

| file | size | role |
| --- | --- | --- |
| `dist/main/main.js` | 2.0 MB | main process (windows, tray, shortcuts, meeting detection, updates, Sentry, native bridge) |
| `dist/main/preload.js` | 4 KB | context bridge (theme, Sentry IPC) |
| `dist/main/mic-monitor-worker.js` | 26 KB | utility process that watches mic activity |
| `dist/main/parakeetai-native.win32-x64-msvc.node` | 1.4 MB | Rust N-API addon (WASAPI / CoreAudio loopback, FFI, process/window helpers) |
| `dist/renderer/renderer.js` | 4.2 MB | React SPA (dashboard shell + live call panel) |
| `dist/renderer/style.css` | 228 KB | theme tokens for `shell` (light) and `liveCall` (dark) |

The renderer HTML is `<title>pmodule</title>` with a single `#root` (Electron Forge "webpack" template naming).

## 2. Window model

Single floating panel, not a normal app window:

```js
new BrowserWindow({
  transparent: true, roundedCorners: false, hasShadow: false,
  alwaysOnTop: true, frame: false, resizable: false, skipTaskbar: true,
  hiddenInMissionControl: true, movable: false, type: 'panel',
  webPreferences: {
    experimentalFeatures: true,
    additionalArguments: ['--show-meeting-start-toast-only=<bool>',
      '--pk-theme-shell=<light|dark>', '--pk-theme-live=<light|dark>']
  }
})
win.setAlwaysOnTop(true, 'screen-saver', 1)   // re-asserted every 1 s on Windows
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
webPreferences.session.setPermissionRequestHandler(...)  // allows only 'media' and 'clipboard-read'
win.loadURL(resolveHtmlPath('index.html'))
```

The same renderer serves two surfaces, chosen by the theme arguments: the dashboard **shell** and the in-call **liveCall** panel. Theme is persisted in cookies `pk_theme_shell` / `pk_theme_live` (1 year).

Content-Security-Policy is injected for a fixed origin allow-list:
`https://www.parakeet-ai.com`, `https://staging.parakeet-ai.com`, `https://*.vercel.app`.

## 3. Routes and deep links

Renderer routes: `/dashboard`, `/callSession`, `/auth/desktop`, `/resumeMaker`, `/resumeMaker/print`
(print-only: `/resumeMaker/print`; live call pattern `/callSession/:id(/mobile)?`).

Custom protocol `parakeetai://`:

* `parakeetai://auth?payload=<base64 json>` where the JSON is `{ callSessionId, authToken }`.
  On arrival the app stores `authToken` as the next auth cookie for the main window and focuses/creates it.
* Initial protocol URL is queued until the window's `ready-to-show`.

There is also a browser-side handoff: `?payload=` is decoded only when it "needs further decoding", so both base64 and pre-decoded payloads are accepted.

## 4. Session + credit rules (exact constants)

```js
FREE_SESSION_COOLDOWN_MINUTES   = 12
MAX_TRIAL_DURATION_MINUTES      = 10
MAX_CALL_DURATION_MINUTES       = 30
FREE_SESSION_EXTENSION_MINUTES  = MAX_CALL - MAX_TRIAL = 20
SESSION_CREDIT_COST             = 0.5
SHORT_END_RETURN_MINUTES        = 5
SESSION_RECENTLY_ENDED_WINDOW_MINUTES = 5
AUTO_EXTEND_HEADROOM_SECONDS    = 15
AUTO_EXTEND_PROMPT_THRESHOLD_MS = 60_000
AUTO_EXTEND_PROMPT_DISMISS_MS   = 15_000
CALL_SESSION_LIST_POLL_MS       = 5000
PU (free sessions per credit purchase) = 10
```

Behaviour encoded in the UI copy:

* Free trial run is 10 minutes; a 12-minute cooldown separates free sessions.
* Paid run costs 0.5 credit and lasts 30 minutes; extending costs another 0.5 credit for 20 more minutes.
* Ending within 5 minutes of start (or of an extension) refunds that credit.
* After a session ends there is a 5-minute window to rejoin it (`/callSession`), no credit used.
* Auto Extend charges automatically 15 s before the timer hits zero, and prompts 60 s before that.

Session modes: `interview`, `regular_call`. Mock interviews are a flag on a session (`isMock`), not a mode.

Session input object (`updateLiveInputFromFormValues`):

```js
{ callSessionId, mode, title, companyDomain, description, jobPostUrl, language,
  extraContext, resumeId, saveTranscription, isMock, aiModel, responseLength,
  responseFormat, responseTone, useStarMethod, useFillerWords, autoAnswer,
  documentSelectionMode, selectedDocumentIds }
```

Defaults: `language: 'en'`, `responseLength: 'balanced'`, `responseFormat: 'balanced'`,
`responseTone: 'simple'`, `useStarMethod: false`, `useFillerWords: false`,
`saveTranscription: true`, `autoAnswer: false`, `documentSelectionMode: 'all'`,
`aiModel: 'gemini-3-5-flash-lite'`.

Enumerations:

* `RESPONSE_LENGTH_VALUES = ['concise','balanced','detailed']`
* `RESPONSE_FORMAT_VALUES = ['bullets','balanced','paragraph']` (presentation order: paragraph, balanced, bullets)
* `RESPONSE_TONE_VALUES = ['formal','casual','simple']` (selectable: simple, formal)
* `DOCUMENT_SELECTION_MODE_VALUES = ['all','none','custom']`

Model catalogue (`AI_MODEL_VALUES`): `gpt-4.1`, `gpt-4.1-mini`, `gpt-5`, `gpt-5-mini`,
`claude-sonnet-4-5`, `claude-haiku-4-5`, `cerebras-gpt-oss-120b`, `gemini-3-1-flash-lite`,
`gemini-3-5-flash`, `gemini-3-5-flash-lite`, `gemini-3-6-flash`, `gpt-5-6-luna`,
`gpt-5-6-terra`, `claude-sonnet-5`, `claude-opus-5`, `gpt-5-6-sol`.
Recommended: `gemini-3-5-flash-lite`, `gpt-5-6-luna`. Advanced: `gemini-3-6-flash`,
`gpt-5-6-terra`, `claude-haiku-4-5`, `claude-sonnet-5`.
Sessions created on an older API version are migrated: `claude-sonnet-4-5 → claude-sonnet-5`,
`gpt-5-6-sol → gpt-5-6-terra`.

## 5. Transcription and answer transport

* STT is **Speechmatics realtime**: `wss://eu2.rt.speechmatics.com/v2`, speaker diarization on,
  `language`, `speakers`, `additionalVocab` supplied per session.
  The API key is minted per call session: tRPC `callSession.generateSpeechmaticsApiKey`
  ("Call session ID is required to mint Speechmatics key").
* A separate OpenAI realtime token is minted via `callSession.generateRealtimeSessionToken`
  (endpoint `/v1/realtime/calls` is present in the main bundle).
* Answers are **not** generated in the client. The renderer mounts the Vercel AI SDK chat transport at
  `${apiConfig.url}/api/chat` with `requestSource: 'desktop-chat'` and desktop auth headers.
* Usage and errors are reported back: `callSession.recordRealtimeUsage`,
  `callSession.reportLiveCallSessionError` (with a transcription-context snapshot,
  connection watcher, queueing and severity resolution).

### tRPC surface observed in the renderer

```
callSession.create | delete | get | getMany | updateLive | updateEnded | ping | takeOver
callSession.generateRealtimeSessionToken | generateSpeechmaticsApiKey
callSession.recordRealtimeUsage | reportLiveCallSessionError | stampMeetingApp
callDocument.getMany
configuration.getLanguages | getMixpanelConfig | getVercelRegion
feedback.answerPostCall | rateResponse | recordCopied
resume.getMany
speakerEnrollment.attachToCallSession | list | markStale
subscription.getState
user.get | update | accountSharingStatus | getSessionForcedLogout
user.markAnswerPreferencesOpened | selfUnlockAccountSharingHold
```

Every answer can be rated (`feedback.rateResponse`) and copied events are recorded
(`feedback.recordCopied`); post-call feedback asks whether the answers helped.

## 6. Global shortcuts

| accelerator | channel |
| --- | --- |
| `Ctrl+Enter` | `ai-message-shortcut-pressed` |
| `Ctrl+Shift+Enter` | `ai-message-shortcut-pressed` (second binding) |
| `Ctrl+Up` / `Ctrl+Down` | `live-call-session-screen-shortcut-pressed` |
| `Ctrl+Left` / `Ctrl+Right` | `ai-message-shortcut-pressed` (prev/next answer) |
| `Ctrl+H` | `live-call-session-screen-shortcut-pressed` |
| `Ctrl+Backspace` | `clear-ai-messages-shortcut-pressed` |
| `Ctrl+Shift+Backspace` | `clear-transcript-shortcut-pressed` |
| `Ctrl+Shift+Space` | show/restore the panel, then `chat-shortcut-pressed` |
| `Ctrl+Alt+Enter` | `chat-shortcut-pressed` |
| `Ctrl+Shift+Up/Down/Left/Right` | `up/down/left/right-app-shortcut-pressed` |

Shortcuts for the live call screen are registered only while that screen is open; the
`Ctrl+Shift+*` app shortcuts are always registered.

## 7. Meeting auto-detection

A meeting detector runs in the main process, fed by `mic-monitor-worker` and a process/title
snapshot. It reduces events into `{ isInMeeting, starterAppSlug, activeProcesses,
webServiceRefinement, isLiveCallSessionVisible }`, and starts the detector renderer with
`--show-meeting-start-toast-only`, `main/on-meeting-detector-status-changed`,
`main/meeting-app-changed`.

Known apps (slug / appName / processNames / title patterns):

```
chrome, firefox, arc, safari, microsoft_edge      (isBrowser: true)
zoom                zoom.exe
slack               slack.exe
webex               webex.exe
microsoft_teams     ms-teams.exe, teams.exe
whatsapp            whatsapp.exe
web services: google meet, zoom web ("Zoom Meeting", "Zoom Workplace"),
              microsoft teams web ("Microsoft Teams")
```

Endings: `Meeting ended:`, `Meeting started - mic input detected:`,
`No web meeting service matched. Titles:`.
Settings toggle: `autoDetectMeetings`. On `window-all-closed` the tray is re-registered when
auto-detect is on, then the app quits unless an update is pending.

## 8. Updates, telemetry, resilience

* `electron-updater` against GitHub releases `parakeetai/parakeetai-desktop-releases`,
  cache dir `parakeetai-desktop-updater`. Severities `all` / `forced`; forced updates are
  skipped while a live call session is visible.
* Sentry (main + renderer, IPC envelopes, spans, structured logs, metrics), Mixpanel config
  fetched per region, Vercel region probe.
* Antivirus/quarantine failure copy instructs restoring the file or reinstalling from
  `parakeet-ai.com/dashboard?support=true` — i.e. native addon load failure is a supported
  user-visible error path.

## 9. Parity checklist for this clone

| real behaviour | state in this repo |
| --- | --- |
| Floating panel, always-on-top, no frame | done (separate overlay window; keep) |
| `interview` / `regular_call` modes | **added** (was `general/interview/sales/support`) |
| Session brief: companyDomain, jobPostUrl, language, resume, documents | **added** |
| Answer prefs: length/format/tone + STAR + filler words | **added** |
| Free trial 10 min, 12 min cooldown | **added** (`billing.ts`) |
| 0.5 credit / 30 min, +0.5 / 20 min extension | **added** |
| 5 min short-end refund + 5 min rejoin window | **added** |
| Auto Extend with 15 s headroom + 60 s prompt | **added** |
| Meeting auto-detection (process + window title) | **added** (`meetings.ts`) |
| Deep link `parakeetai://auth?payload=` | **added** (`deeplink.ts`) |
| Shortcut map from §6 | **aligned** |
| Speechmatics per-call key, diarization | local key in Settings (no backend to mint against) |
| Answers via `/api/chat` + tRPC session records | local `llm.ts` streaming; no backend |
| Credits/plans/billing UI | local credit ledger only |
| Auto-update via GitHub releases | electron-updater config not wired |

## 10. What is *not* established

* Server-side prompt templates: they are behind `/api/chat`, so the clone's system prompt is a
  reconstruction, not recovered text.
* The native addon's exact WASAPI loopback strategy (`parakeetai-native.win32-x64-msvc.node`)
  was inventoried but not decompiled in this pass; the Rust source tree shipped in
  `app.asar.unpacked/node_modules/@parakeetai-desktop/native-modules/src` is the better
  reference for a future pass.
* No runtime evidence was collected (app not executed), so DOM structure, animation and
  pixel layout are inferred from strings/CSS only.
