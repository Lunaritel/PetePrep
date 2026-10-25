# PetePrep

Free exam practice for Windows and phones. Import an exam PDF with its answer key and explanations, practice it, and keep re-testing questions until every one sticks.

- Works offline after setup. No accounts, no analytics, no telemetry, and no bundled exam content.
- Explanations are shown word for word from the answer key.
- A question counts as mastered after two correct answers in a row. A wrong answer sends it back to learning.
- Questions with a picture or table are shown as a screenshot of the original page area.
- The mistake bank collects missed questions across all your exams. A question leaves after correct answers in two separate rounds.

## Use on your phone

Open **[PetePrep for phones](https://lunaritel.github.io/PetePrep/)** in Safari on iPhone or Chrome on Android. The installable web app is free. The site must be published from GitHub Pages before the link becomes available.

- **iPhone:** open the site in Safari, tap Share, choose **Add to Home Screen**, then tap Add. Open PetePrep from the new Home Screen icon.
- **Android:** open the site in Chrome, open the menu, then choose **Install app** or **Add to Home screen**.
- Import a PDF from Files or Downloads. Web imports are limited to 25 MB to reduce the chance of running out of memory on a phone. The PDF must contain selectable text, not scanned page images.
- Your exams and progress stay in that browser on that device. There is no cloud sync. In Settings, export a backup to move progress to another device, then restore that file there.
- On iPhone, adding PetePrep to the Home Screen reduces the chance Safari clears its storage, but it is not a guarantee. Export backups regularly.
- The first visit needs internet. After the app has loaded once, its app shell, fonts and PDF worker are cached for offline use. The site uses no analytics or tracking. GitHub may record normal web request logs.

## Download the Windows app

**[Download the latest version](https://github.com/Lunaritel/PetePrep/releases/latest)**, then under Assets pick `PetePrep-Setup-<version>.exe` (installer) or the `.zip` (portable).

Windows SmartScreen may warn that the app is unrecognised because it is not code signed. Choose **More info**, then **Run anyway**. After that, open the app, choose **Import exam**, and pick your exam PDF.

Full walkthrough with troubleshooting: **[User guide](docs/USER_GUIDE.md)**.

On Windows, data stays on your computer. Use **Settings > Export backup** to keep a copy. The desktop app also saves a backup to `Documents\PetePrep Backups` after each round (you can turn that off in Settings).

## Develop

```
npm install
npm run dev        # run Electron with hot reload
npm run build      # production desktop build into out/
npm run dist       # installer and portable zip into release/
npm run dev:web    # run the web version
npm run build:web  # build the PWA into dist-web/
npm run test:e2e   # iPhone 14 and Pixel 7 browser journeys
npm run typecheck
npx vitest run
```

Tests that parse real exam PDFs read them from `../pdfs/` and skip themselves when that folder is missing. Exam PDFs are licensed content and must never be committed.

### Publish the PWA

The GitHub Pages workflow deploys on `v*` tags or manual dispatch. Before the first deployment, the repository owner must set **Settings > Pages > Build and deployment > Source** to **GitHub Actions**. The workflow builds `dist-web/` and does not include the sibling `pdfs/` folder. Review and merge the branch before running the workflow on `main`; do not create a release tag until the release is approved.

## Layout

```
src/core/            pure logic: mastery rules and PDF parsing
src/main/            Electron main process and native dialogs
src/preload/         narrow bridge exposed as window.deca
src/renderer/src/    shared React UI, IndexedDB storage and platform layer
vite.web.config.mts   GitHub Pages web build and PWA setup
.github/workflows/   Windows releases and GitHub Pages deployment
```

## Known limits

- PDFs must have a text layer. Scanned PDFs are refused (no OCR).
- The parser is calibrated on a sample exam layout with numbered questions, four options and a key section with rationales. Other layouts may need repairs in the review screen.
- Web PDF imports are limited to 25 MB.
- Browser data is local to that device and browser. There are no accounts or automatic sync. Keep backup files if moving devices or reinstalling.
- A table drawn only with aligned text (no ruled lines) is not detected as a figure.
- The desktop app is Windows only.

## Legal and privacy

- **License.** PetePrep is released under the [MIT License](LICENSE). Open-source components keep their own licenses, listed in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
- **Not affiliated with DECA.** PetePrep is an independent project. It is not affiliated with, endorsed by or sponsored by DECA Inc. or the MBA Research and Curriculum Center. DECA is a registered trademark of DECA Inc.
- **No exam content.** The repository and app contain no exam questions, answers or explanations. You import your own PDF and it stays on your device. You are responsible for having the right to use any PDF you import.
- **Accuracy.** Questions, answers and explanations are read automatically from the PDF and can contain mistakes. Check anything important against the original. No exam result is guaranteed.
- **Privacy.** No accounts, analytics or telemetry. The desktop app only checks for updates when asked or enabled. The web app requests its own site files and checks for service-worker updates. GitHub may record normal web request logs.
