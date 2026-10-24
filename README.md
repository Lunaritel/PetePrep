# PetePrep

An offline Windows app that turns a DECA exam PDF into a practice engine. Import the exam
PDF (questions plus answer key and explanations), practice it, and keep re-testing the
questions you have not mastered until every one sticks.

- Works offline. No accounts, no telemetry, no bundled exam content. The only network use is the optional update check described below.
- Explanations are shown word for word from the answer key.
- A question counts as mastered after two correct answers in a row. A wrong answer sends it back to learning.
- Questions with a picture or table are shown as a screenshot of the original page area.

## Download and install

**[Download the latest version](https://github.com/Lunaritel/PetePrep/releases/latest)**, then under Assets pick
`PetePrep-Setup-<version>.exe` (installer) or the `.zip` (portable).

Windows SmartScreen may warn that the app is unrecognised because it is not code signed. Choose **More info**, then
**Run anyway**. After that, open the app, choose **Import exam**, and pick your exam PDF.

Full walkthrough with troubleshooting: **[User guide](docs/USER_GUIDE.md)**.

Your data stays on your computer. Use **Settings > Export backup** to keep a copy. The app also saves a
backup to `Documents\PetePrep Backups` after each round (you can turn that off in Settings).

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

## Legal

- **License.** PetePrep is released under the MIT License (see `LICENSE`). Open-source components keep their own licenses, listed in `THIRD_PARTY_NOTICES.txt`.
- **Not affiliated with DECA.** PetePrep is an independent project. It is not affiliated with, endorsed by or sponsored by DECA Inc. or the MBA Research and Curriculum Center. DECA is a registered trademark of DECA Inc.
- **No exam content.** This repository and the app contain no exam questions, answers or explanations. You import your own PDF and it stays on your computer. You are responsible for having the right to use any PDF you import.
- **Accuracy.** Questions, answers and explanations are read automatically from the PDF and can contain mistakes. Check anything important against the original. No exam result is guaranteed.
- **Privacy.** No accounts, no analytics, no telemetry. The only network request is the optional update check, which asks GitHub whether a newer release exists.
