# Parakeet AI Clone - Development Milestones

This document outlines the roadmap to complete the Parakeet AI clone (Reverse Engineered from ParakeetAI 3.9.135).

## 1. Core Infrastructure & Shared Types
- [x] Reverse engineer core app constants (`src/shared/limits.ts`).
- [x] Define core shared data models (`SessionMode`, `SessionBrief`, `SessionRecord`) (`src/shared/types.ts`).
- [x] Align `SessionMeta` with `SessionBrief` (`SessionRecord extends SessionBrief`).
- [x] Fix all TypeScript compilation errors in the renderer (`src/renderer/src/App.tsx`).

## 2. Main Process & Electron Integration
- [x] Core Electron Window Management (`src/main/windows.ts`).
- [x] IPC Handlers for core operations (`src/main/ipc.ts`).
- [x] Deep Linking & System Tray (`src/main/index.ts`, `src/main/deeplink.ts`).
- [x] Meeting Detection (`src/main/meetings.ts`).
- [x] Document & Resume Context Management (`src/main/documents.ts`).
- [x] Session Lifecycle Management (`src/main/sessions.ts`).
- [x] Billing & Quota Logic (`src/main/billing.ts`).

## 3. Renderer UI (Dashboard & Overlays)
- [x] Dashboard UI & Sidebar (`src/renderer/src/App.tsx`).
- [x] Overlay UI (Live Transcription & Answers) (`src/renderer/src/overlay.tsx`).
- [x] Settings Panel (STT, LLM, Overlay config) (`src/renderer/src/components/SettingsPanel.tsx`).
- [x] History Panel (Session list & export) (`src/renderer/src/components/HistoryPanel.tsx`).

## 4. Audio & Speech Processing
- [x] Audio Capture (Microphone & System Audio Loopback) (`src/renderer/src/audio.ts`).
- [x] Speech-to-Text Client (OpenAI, Speechmatics, Local) (`src/renderer/src/stt.ts`).
- [x] Optimize audio streaming & session handover to STT.

## 5. Intelligence & Answer Generation
- [x] LLM Streaming Communication (`src/main/llm.ts`).
- [x] Answer Generation using transcript + document context (`src/main/ipc.ts`).
- [x] UI Logic to trigger answers (`ask` callback) and stream updates (`AnswerDelta`).
- [x] Integrate billing/limits with session start (10-minute trial / 30-minute paid sessions).

## 6. Advanced Features & Integration
- [x] Session history tracking and Markdown export.
- [x] Integrating `SessionBrief` with UI form inputs.
- [x] 1:1 cloning of UI text and styles (Virtual Match).

## 7. Quality Assurance & Build
- [x] Fix `documents.ts` and `index.ts` TS compilation errors.
- [x] Run `npm run typecheck` to ensure 0 errors.
- [x] Run `npm run build` to produce the final executable.
- [x] Test Windows Installer and executable build.
 