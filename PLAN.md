# PetePrep — Build Plan

An offline Windows desktop app that turns a DECA exam PDF into a practice engine:
import the PDF, extract the questions and answer key, drill missed questions with
verbatim rationales, and keep re-testing until every question is mastered.

---

## 1. Objective

Students import their own DECA exam PDF (100 multiple-choice questions plus an
answer key and explanations). The app scores them, shows the official explanation
word-for-word, and generates repeat "master exams" from the questions they have not
mastered yet. No accounts, no internet, no telemetry, no bundled exam content.

Success looks like: a student who cannot use a terminal downloads one `.exe`,
imports their PDF in under a minute, and finishes a full mastery cycle without
touching a settings screen they do not understand.

---

## 2. Stack decision

**Electron 33 + electron-vite 2 + React 18 + TypeScript 5.7.** Confirmed.

The earlier Tauri v2 choice was reversed after finding a complete, working Electron
scaffold already in the repo that packages a Windows NSIS installer.

| | Electron (chosen) | Tauri v2 (rejected) |
|---|---|---|
| Installer size | ~100 MB | ~5 MB |
| Local toolchain | Node only (already installed) | Node + Rust + MSVC build tools (~7 GB) |
| Web layer | Chromium, uniform pdf.js behaviour | WebView2 on Windows, WebKit elsewhere |
| Build per iter | Vite only | Vite + `cargo` |
| Current state | Working app + NSIS config | Nothing exists |

Installer size is the only real loss, and it does not matter for a free download
from GitHub Releases. Revisit Tauri only if the download size becomes a genuine
complaint — the parser and all UI live in `src/renderer`, so the port would be a
build-layer change, not a rewrite.

**Deliberately unchanged:** `pdfjs-dist`, Dexie, and the PDF parser are plain web
APIs, so this decision is cheap to reverse later.

---

## 3. Current repository state

Working Electron demo, single commit (`f7fb254`), everything untracked.

| Path | State |
|---|---|
| `src/core/domain.ts` | Types: `Choice`, `Question`, `Exam`, `Attempt`, `AnswerRecord`, `MasteryState`, `Progress` |
| `src/core/mastery.ts` | Mastery engine — **rewritten** to the 2-consecutive-correct rule |
| `src/core/mastery.test.ts` | 25 tests, all passing against the new rule |
| `src/core/sampleExam.ts` | 5-question demo exam |
| `src/renderer/src/App.tsx` | Playable demo: instant feedback, rationale, master-exam flow, progress bar |
| `src/main/index.ts` | Electron shell, `contextIsolation` on, `nodeIntegration` off |
| `src/preload/index.ts` | Stub bridge exposing `appName`/`version` |
| `src/renderer/index.html` | CSP present; needs `worker-src` for pdf.js |
| `electron.vite.config.ts` | externalizeDeps for main/preload, React for renderer |
| `tsconfig.json` | strict, ES2022, Bundler resolution, no path aliases |
| `vitest.config.ts` | `src/**/*.test.ts`, node environment |

**Not present yet:** Tailwind, `pdfjs-dist`, `dexie`, any persistence, PDF import,
library, stats, backup, installer CI.

### Known gaps this plan closes

1. No persistence — mastery lives in `useState` and dies on reload.
2. No PDF import at all.
3. Only one hard-coded demo exam; no library of exams.
4. Progress is a percentage bar; no per-question history or stats.
5. Production loads the renderer over `file://`, which has an opaque/awkward origin
   for IndexedDB and workers. Fixed in P0 with a custom `app://` scheme.

---

## 4. Architecture

```
src/
  core/                  pure logic, no Electron/React imports, fully unit-tested
    domain.ts            types
    mastery.ts           streak/mastery derivation
    sampleExam.ts        demo data
    pdf/
      extract.ts         PDF -> positioned text items (pdfjs-dist)
      layout.ts          column detection, header/footer stripping, segmentation
      questionParser.ts  number-anchored question + A-D blocks
      answerKey.ts       key table + rationale paragraphs
      validate.ts        completeness gate + per-question confidence
      adapters/          one module per known DECA layout
      types.ts           ParsedExam, ParsedQuestion, ParseReport
  main/                  Electron main: window, app:// protocol, filesystem dialogs
  preload/               narrow IPC bridge (dialogs, file read, backup paths)
  renderer/src/
    storage/             Dexie schema + repositories
    screens/             Library, Import, Review, Practice, Master, Stats, Settings
    components/          shared UI
    App.tsx              router/shell
```

**Invariants**

- `core/` never imports Electron, Dexie, React, or the DOM. It stays portable and
  testable, which is what keeps the Electron/Tauri decision reversible.
- The renderer owns the database; the main process only supplies file bytes and
  native dialogs over IPC. No business logic in main.
- Every exam that reaches the database has passed the validator and the user has
  confirmed it in the review screen. Parsing never auto-saves.

**Production origin.** Serve the built renderer from a registered `app://` scheme
(`protocol.handle`, `standard: true, secure: true`) instead of `loadFile`. This gives
IndexedDB, the pdf.js worker, and CSP a stable secure origin. CSP gains
`worker-src 'self' blob:`.

---

## 5. Data model (IndexedDB via Dexie)

```ts
exams      { id, title, event?, year?, fileHash, importedAt, questionCount }
questions  { id, examId, number, prompt, options: [string,string,string,string],
             correctIndex: 0..3, explanation, sourcePage, parseConfidence,
             rawText, hasLetterRefs }
sessions   { id, examId, kind: 'practice' | 'master', questionIds: string[],
             startedAt, completedAt? }
answers    { id, sessionId, questionId, chosenIndex: number | null,
             correct: boolean, answeredAt }
```

- **Mastery is derived, never stored.** Recompute streaks by replaying `answers` in
  `answeredAt` order. Deleting a session therefore correctly reverts mastery.
- `fileHash` (SHA-256 of the PDF) prevents duplicate imports of the same exam.
- `hasLetterRefs` (whether the explanation says "the correct answer is C") exists so
  a future option-shuffle setting is safe. Option order is **never** changed in v1.
- `rawText` and `sourcePage` keep the review screen and future re-parsing honest.
- `core/domain.ts` stays id-based; a thin adapter maps rows to `Exam`/`Question` so
  the engine does not need to know about Dexie.

---

## 6. Mastery rule

A question is mastered after **two consecutive correct answers**, in any session or
round.

| Current | Answer | Next | Streak |
|---|---|---|---|
| unseen | correct | learning | 1 |
| learning | correct | mastered | 2 |
| learning | wrong | learning | 0 |
| mastered | wrong | **learning** (demoted) | 0 |
| mastered | correct | mastered | 3+ |

- Unanswered questions stay `unseen`; an abandoned attempt never penalises.
- Implemented and tested in `src/core/mastery.ts`.
- Master-exam pool = every question that is not `mastered` (learning + unseen).
- The optional "include X% of mastered questions for review" slider (default 0%)
  lands in P5 and only changes pool selection, not the rule.

---

## 7. Parsing strategy

Deterministic only — no LLM, no API keys, no network.

Pipeline: **extract → layout → segment → parse key → validate → review → save.**

1. **Extract** `pdfjs-dist` text items with x/y/width/height/font size per page.
2. **Layout** — detect one- vs two-column by clustering x positions; strip running
   headers/footers by repeated-text detection; keep page index per item.
3. **Segment questions** — number-anchored (`^1.`, `^1)`, `1 `) with column
   awareness so a column break does not split a stem.
4. **Options** — `A.` / `A)` / `(A)` / `A.` inline; four options per question,
   failing loudly otherwise.
5. **Answer key** — end-of-document table (`1. C`, `1-C`, `1 C`); tolerate letter-only
   keys. Rationales are the paragraphs following each key entry, captured verbatim
   until the next entry.
6. **Validate** — hard gate: question count matches key count, numbering contiguous,
   four options each, `correctIndex` in range, no duplicate stems, explanation
   present. Emit per-question `parseConfidence` and a human-readable `ParseReport`.
7. **Review** — the wizard shows the detected exam beside the rendered PDF page;
   every low-confidence question is highlighted and editable.

**Text fidelity:** explanations are stored verbatim. Only whitespace collapse and
end-of-line hyphen rejoin are permitted, and `rawText` preserves what was extracted.

**Refusals:** image-only/scanned PDFs (no text layer) are detected and rejected with
a plain-language message. OCR is out of scope for v1.

**Fixtures** (built in P1, synthetic, checked in):
two-column exam · single-column exam · key table at end · key dispersed per question ·
rationales with "The correct answer is C" · rationales with no letter reference ·
letter-only key · malformed key (missing entries) · scrambled numbering · scanned PDF.

---

## 8. Screens

| Screen | Purpose |
|---|---|
| Onboarding (3 cards, first run only) | What the app does; how to get a PDF; privacy promise |
| Library | All imported exams, mastery %, last studied, import button |
| Import wizard | Choose file → parse → validate report → review/repair → confirm save |
| Practice | One question at a time, instant right/wrong, correct letter + verbatim rationale, question-order shuffle |
| Master exam | Pool of unmastered questions, optional mastered mix slider, same feedback loop |
| Results | End-of-round score, per-question outcome, "start next master round" |
| Stats | Overall mastery, per-question history, weakest topics, streak counts |
| Settings | Backup/restore, export layout report, reset exam, about, update check |

Navigation is a simple in-app router; no URL routing needed.

---

## 9. Phases

Each phase ends green: `npm test` and `npm run typecheck` pass, and the app runs.

### P0 — Foundation hardening
- Register `app://` scheme in production; update `loadFile` → `protocol.handle`.
- CSP: add `worker-src 'self' blob:`.
- Add Tailwind + design tokens; keep the existing CSS as the visual baseline.
- Add `jsdom` environment for renderer tests alongside the node environment.
- Extend `.gitignore` for build/coverage artifacts.
- **Done when:** dev and packaged builds both load, tests run in both environments.

### P1 — PDF parsing core (no UI)
- Install `pdfjs-dist`; implement `extract`, `layout`, `questionParser`, `answerKey`,
  `validate`, `types`.
- Unit tests for every fixture above, including refusal cases.
- **Done when:** a synthetic 100-question two-column fixture parses to 100 questions,
  100 keys, four options each, with correct explanations, deterministically.

### P2 — Import wizard + review UI
- File picker over IPC, drag-and-drop, parse progress.
- Validation report; side-by-side PDF page and editable parsed question.
- Repair controls: edit stem/options/answer/explanation, mark question excluded.
- **Done when:** an unsupported-but-parseable PDF can be hand-corrected and saved.

### P3 — Persistence + Library
- Dexie schema, repositories, adapter to `core` types.
- Mastery recomputed from stored answers on load.
- Library with exam cards, delete, re-import guard via `fileHash`.
- **Done when:** mastery survives restart and matches a fresh replay of the answers.

### P4 — Practice mode
- Real exam flow on stored questions; question-order shuffle; resume in-progress.
- Answer → grade → show letter + verbatim explanation → next.
- **Done when:** a full 100-question practice run records exactly 100 answers.

### P5 — Master exam + rounds
- Pool = unmastered; optional mastered-mix slider (default 0%).
- Repeat rounds until `isMasteryComplete`; results screen between rounds.
- **Done when:** a scripted run of miss → drill → drill reaches 100% and stops offering rounds.

### P6 — Stats
- Per-question history, weakest questions, mastered/learning/unseen breakdown,
  time-per-question, attempt timeline.
- **Done when:** stats match the replayed answer history exactly.

### P7 — Backup, onboarding, settings
- JSON export/import of full database; auto-backup to Documents after each session;
  restore flow with confirmation.
- Three-card onboarding, about, update-check placeholder, reset controls.
- **Done when:** export → wipe → import restores identical state.

### P8 — Packaging, CI, calibration gate
- `electron-builder` NSIS + portable zip; GitHub Actions workflow building on
  `windows-latest` and attaching artifacts to a Release.
- **Blocking gate:** calibrate the parser against a real DECA PDF supplied by the
  user before calling it shippable. Fix adapters from actual output, not guesses.
- Document SmartScreen ("More info → Run anyway"), no code signing.

### P9 — Auto-update (last, optional)
- `electron-updater` against static `latest.json` on Releases; off by default until
  P8 is stable.

---

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| DECA PDF layouts vary by year/event | Parser misses questions | Adapter modules + confidence scoring + review UI + real-PDF calibration gate (P8) |
| Scanned PDFs have no text layer | Import impossible | Detect and refuse with clear guidance; OCR out of scope |
| Rationales reference option letters | Shuffling options would teach wrong letters | Option order frozen in v1; `hasLetterRefs` reserved for a future gated feature |
| `file://` origin breaks IndexedDB/workers | Data loss in production only | `app://` scheme in P0, tested in the packaged build |
| 100 MB installer deters students | Friction | Portable zip alternative; Tauri port remains cheap if it becomes a complaint |
| Broken parse silently teaches wrong answers | Worst possible failure | Hard validation gate + mandatory human review before save |
| Auto-update misfire | Broken install for students | Ship last, off by default, single-instance + manual fallback |

---

## 11. Distribution

- Free GitHub Actions (`windows-latest`) builds the NSIS installer and portable zip.
- Published to free GitHub Releases. No hosting, no signing certificates, no paid service.
- Windows only for v1.
- No bundled DECA PDFs — students import their own.

## 12. Non-goals for v1

- No LLM/API parsing, no telemetry, no accounts, no cloud sync.
- No OCR for scanned PDFs.
- No option shuffling or letter remapping.
- No macOS/Linux builds.
- No code signing.
- No exam authoring tool — the app consumes DECA PDFs, it does not create content.

## 13. Open questions

- A real DECA PDF is needed to finish P8. Everything before that runs on synthetic
  fixtures.
- Auto-update stays undecided until after P8; it is additive and can be skipped.
