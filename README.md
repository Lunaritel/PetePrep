# DECA Mastery

An offline Windows app that turns a DECA exam PDF into a practice engine. Import the exam
PDF (questions plus answer key and explanations), practice it, and keep re-testing the
questions you have not mastered until every one sticks.

- Works fully offline. No accounts, no telemetry, no bundled exam content.
- Explanations are shown word for word from the answer key.
- A question counts as mastered after two correct answers in a row. A wrong answer sends it back to learning.
- Questions with a picture or table are shown as a screenshot of the original page area.

## Install (students)

1. Download `DECA Mastery-Setup-<version>.exe` (installer) or the `.zip` (portable) from the latest GitHub Release.
2. Windows SmartScreen may say the app is unrecognised because it is not code signed. Choose **More info**, then **Run anyway**.
3. Open the app, choose **Import exam**, and pick your DECA exam PDF.

Your data stays on your computer. Use **Settings > Export backup** to keep a copy. The app also saves a
backup to `Documents\DECA Mastery Backups` after each round (you can turn that off in Settings).

## Develop

```
npm install
npm run dev        # run with hot reload
npm test           # unit and component tests
npm run typecheck
npm run build      # production build into out/
npm run dist       # installer and portable zip into release/
```

Tests that parse real exam PDFs read them from `../pdfs/` and skip themselves when that folder is missing.
Exam PDFs are licensed content and are never committed.

## Layout

```
src/core/            pure logic, no Electron/React/DOM: mastery rules, PDF parsing
src/core/pdf/        extract, layout, question parser, answer key, validator, figure detection, snapshots
src/main/            Electron main process: window, app:// protocol, native file dialogs
src/preload/         narrow bridge exposed to the renderer as window.deca
src/renderer/src/    React UI: storage (IndexedDB via Dexie), study service, screens
```

## Known limits

- PDFs must have a text layer. Scanned PDFs are refused (no OCR).
- The parser is calibrated on the MBA Research / DECA sample exam layout (single column, numbered questions, a key section with rationales). Other layouts may need the review screen to repair questions.
- A table drawn only with aligned text (no ruled lines) is not detected as a figure.
- Windows only. No code signing.
