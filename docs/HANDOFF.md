# PetePrep handoff

For an engineer or AI agent picking this project up with no prior context. Read this file first, then do the
mission in section 5. Everything here was true at v0.1.1 (2026-10-25).

## 1. What PetePrep is

A free, offline Windows desktop app (Electron) for practicing multiple-choice exams that come as a PDF with an
answer key (built for DECA sample exams). The user imports their own exam PDF. The app reads the questions, answers
and explanations out of the PDF, saves them on the computer, and drills the user until each question is mastered.
No accounts, no telemetry, no exam content in the repo or the app.

- Repo: https://github.com/Lunaritel/PetePrep (public, MIT). Default branch `main`.
- Releases: tag `vX.Y.Z` triggers `.github/workflows/release.yml`, which typechecks, tests, builds the Windows
  installer and portable zip, and publishes them (plus `latest.yml` and the blockmap that the in-app updater reads).
- Shipped: v0.1.0 (first release), v0.1.1 (mistake bank, Weak points, mixed drill, on-page help).
- Not yet verified by anyone: a real in-app update from 0.1.0 to 0.1.1 on an installed copy.

## 2. Stack and layout

Electron 33, electron-vite 2, React 18, TypeScript 5.7 (strict), Tailwind v4, Dexie (IndexedDB), pdfjs-dist 6 (legacy
build), electron-updater, Vitest 2 with Testing Library (jsdom). Node 22.

```
src/core/            Pure logic. No Electron, React or DOM imports.
  mastery.ts           mastery rule: 2 consecutive correct answers = mastered
  pdf/                 PDF -> questions: extract, layout, questionParser, answerKey, validate,
                       visuals + attachVisuals (pictures/tables), snapshot (question screenshot), parseExam
src/main/            Electron main: window, app:// protocol, native file dialogs, updater
src/preload/         The only bridge to the renderer, exposed as window.deca (typed in updateTypes.ts)
src/renderer/src/
  app/                 Shell (router), helpText (single source of truth for button explanations), HelpPanel
  storage/             contract.ts (Repository interface), dexieRepository, memoryRepository,
                       studyService, mistakeBank, backupFormat, backupService
  screens/             import, library, practice, master, weak, bank, results, stats, settings, onboarding
  study/               shared question loop (StudyRunner, StudyFlow)
  pdf/                 renderer-side pdf.js worker setup, page renderer, DOM canvas for screenshots
scripts/             gen-notices.mjs (third-party licenses), make-icon.mjs (icon)
docs/                USER_GUIDE.md (end users), HANDOFF.md (this file)
```

Commands: `npm install`, `npm run dev`, `npm run typecheck`, `npx vitest run` (341 tests at v0.1.1),
`npm run build`, `npm run dist` (installer + zip into `release/`, also regenerates `THIRD_PARTY_NOTICES.txt`).

## 3. Rules you must keep (learned the hard way)

Product and logic
- **Mastery** is derived, never stored: replay every answer in time order. Mastered = 2 correct answers in a row.
  Skips (null choice) are ignored. Excluded questions never count.
- **Mistake bank** (`storage/mistakeBank.ts`) is also derived. A question enters on a miss and leaves after 2
  correct answers in 2 SEPARATE rounds (sessions). A second correct answer in the same session does not count.
  A new miss re-enters it. A question appears at most once per round.
- **Session kinds**: `practice`, `master`, `weak` (one exam's bank), `bank` (all exams mixed; its sessions use
  `examId = BANK_EXAM_ID = '*'`). Backups validate these.
- **Option order is never shuffled** (explanations refer to letters). Only question order may be shuffled.
- **Explanations are shown verbatim** from the PDF. Never rewrite or truncate them.
- Nothing is saved from an import until the user confirms the review step.

Legal and privacy (this is a public repo)
- **Never commit exam PDFs or exam wording.** `*.pdf` is gitignored. Tests that read real exams look in `../pdfs/`
  and skip themselves if missing; they compare one-way hashes (`src/core/pdf/testing/fingerprint.ts`), not text.
  Synthetic fixtures must use invented wording.
- The product name must not contain "DECA" (trademark). "DECA exam" is fine only as plain description.
- Keep the non-affiliation, accuracy and "only import exams you are allowed to use" notices (About screen,
  import screen, README, installer agreement `build/license.txt`).
- Dependencies must stay permissive (MIT, Apache-2.0, ISC, BSD, OFL). No GPL, LGPL, AGPL. After changing
  production dependencies run `npm run notices` and commit `THIRD_PARTY_NOTICES.txt`.
- Commit identity: use the GitHub no-reply address, never a personal email:
  `git config user.email 284340762+Lunaritel@users.noreply.github.com`. Do not add attribution lines to commits.
- The only network use may be the optional update check (desktop) and loading the site itself (web). No analytics.

Code style
- Visible text: no em-dashes or en-dashes; use plain hyphens, commas or periods. Plain language for students.
- Colors only through theme tokens in `src/renderer/src/styles.css` (periwinkle on cloud, light and dark).
  Utilities such as `bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-accent`, `text-on-accent`. No
  hard-coded colors. One radius scale. Contrast must stay AA in both modes.
- Buttons at least 44px tall, visible focus rings, `prefers-reduced-motion` respected.
- Internal identifiers kept on purpose: `window.deca`, IndexedDB name `deca-mastery`, localStorage keys `deca.*`,
  backup format tag `peteprep-backup`. Renaming them gains nothing and risks losing user data.
- The app version has one source: `package.json` (injected as `__APP_VERSION__` for the preload).
- Windows tooling: large heredocs in the bash tool fail; write files with an editor/Write tool. Git warns about
  LF/CRLF; that is harmless.

## 4. How things were verified (reuse the approach)

- Unit and component tests with Vitest, jsdom, fake-indexeddb, in-memory repository. Repository tests run in a
  `node` environment (`// @vitest-environment node`) because fake-indexeddb cannot clone jsdom Blobs.
- Real end-to-end checks drove the packaged app over the Chrome DevTools Protocol with two real exam PDFs:
  import, a 100-question practice run recording exactly 100 answers, master rounds to 100%, Weak points asking
  exactly the missed set, a mixed bank across two exams shrinking round by round, bank empty after two correct
  rounds, a new miss re-entering. Invariants worth re-checking after any change to study logic:
  1. Weak points asks only that exam's missed questions. 2. They stay in the bank after one correct round.
  3. They leave after the second correct round. 4. No question twice in a row inside a round.
  5. Mixed drill counts equal the sum across exams.
- Both sample exams parse to 100 questions with 100 key entries. One question (the 2020 exam, number 47) legitimately
  shows a review warning because its explanation opens with slightly different wording than the keyed option.

## 5. MISSION: make PetePrep available on phones, for free (target v0.2.0)

Decision already made with the owner: build an installable **web app (PWA)** hosted free on **GitHub Pages**, using
the existing React renderer. Do not build a React Native or native iOS app, and do not make an Android APK or Play
Store listing (the owner decided against it).

Why it is feasible: the renderer is already a web app. Dexie/IndexedDB, pdf.js and every screen run in a browser.
Only these places use the desktop bridge (all already tolerate `window.deca` being undefined, but some show
desktop-only text or errors):

| File | Desktop-only behavior | Web behavior needed |
|---|---|---|
| `screens/import/services.ts` | native "open PDF" dialog | already falls back to the hidden file input and drag and drop; verify on touch devices |
| `storage/backupService.ts` | native save/open dialogs, auto-backup to `Documents\PetePrep Backups` | export = download a `.json` Blob, restore = file input, auto-backup = off (hide the toggle and the folder text) |
| `screens/settings/UpdateCard.tsx`, `app/useAutoUpdateCheck.ts` | Electron updater | hide on web (the service worker updates the app) |
| `screens/settings/SettingsScreen.tsx` | version from `window.deca.version`, desktop folder text | version from a build-time define, wording for web |
| `index.html` CSP | tuned for `app://` and dev server | production web CSP (see M5) |

### Milestones (do in order; each ends green: typecheck, tests, and a manual check)

**M0. Spike (completed 2026-10-25).** The web build and `dev:web` / `build:web` scripts are present. The production build succeeds, and the phone-sized Playwright journey passes at 360 x 800 in iPhone 14/WebKit and Pixel 7/Chromium emulation, including synthetic PDF file-input import, study flow, backup/restore, and offline reload. No blocking layout/runtime failures were reproduced. The build warns that the PDF.js worker (~2.42 MB) and PDF.js chunk (~541 KB) exceed the 500 KB chunk advisory. Physical-device performance remains for M4; the detailed narrow-layout pass remains M3. See `docs/M0_SPIKE.md` for the results and limitations.

**M1. Platform layer (completed 2026-10-25).** The `src/renderer/src/platform/` abstraction exposes native-picker capability, PDF and text-file picking, downloads, desktop detection, app version and best-effort persistent browser storage. The desktop implementation wraps `window.deca`; the web implementation uses Blob downloads and file inputs. Import, backup and Settings use the abstraction, desktop-only update and auto-backup UI is hidden on web, and platform tests cover native PDF picking and storage persistence. Existing desktop tests remain green.

**M2. PWA (completed locally 2026-10-25).** The web manifest, 192/512/maskable icons, Workbox service worker, app-shell/font/PDF-worker precache, update-ready reload prompt, persistent-storage request on import, and iPhone storage note are implemented. The production build and offline reload journey pass in browser emulation. Workbox is MIT and its notices are included. The updated build is not deployed yet; release deployment remains gated on approval of tag `v0.2.0`.

**M3. Phone layout (completed locally 2026-10-25).** The header navigation, Library action rows, import review layout, Stats card list, Settings and other tested screens are usable at 360 to 430px. Playwright checks for document/body overflow and visible elements clipped outside the viewport at 360, 390 and 430px across the main mobile journey. No horizontal clipping was reproduced in iPhone 14/WebKit or Pixel 7/Chromium emulation. This remains a layout-only pass, not a redesign.

**M4. Mobile performance (partially complete 2026-10-25).** The web import limit is 25 MB and the UI displays a busy state during parsing. Local browser-emulation import-to-report timings for the two 100-question sample exams were 1.6s and 2.4s in Pixel 7/Chromium emulation, and 5.2s and 5.1s in iPhone 14/WebKit emulation. See `docs/PHONE_ACCEPTANCE.md`. These are not physical-device measurements. Do not change parsing logic based on these results alone; actual iPhone and mid-range Android testing remains required.

**M5. Hosting and CI (implemented; release deployment pending).** `.github/workflows/pages.yml` builds and tests the PWA on pull requests, and on `v*` tags or manual dispatch it deploys the Pages artifact. The production CSP is configured for the web build, `release.yml` remains separate, and the site URL is `https://lunaritel.github.io/PetePrep/`. Local build and offline tests pass. The current local changes have not been pushed or deployed.

**M6. Automated and real-device testing (automated complete; physical-device check pending).** Playwright runs the onboarding, synthetic PDF file-input import, review/save, practice and mistake-bank invariants, backup export/restore, installability metadata, offline reload, console-error checks and responsive checks at 360/390/430px in iPhone 14/WebKit and Pixel 7/Chromium emulation. Current local validation: 348 tests across 33 files, typecheck, PWA build, desktop build, Windows installer and portable ZIP all pass. Ask the owner to test the updated deployed build on an actual iPhone and Android phone before release.

**M7. Docs and legal (content complete; release approval pending).** README and USER_GUIDE explain phone installation, PDF import, offline use, backups and restore between devices, iPhone storage caveats, no analytics, normal GitHub request logs, and the 25 MB web limit. About/Settings includes the non-affiliation, accuracy and permitted-use notices, MIT license link and third-party notices link. `THIRD_PARTY_NOTICES.txt` was regenerated to include Workbox. The dependency audit previously reported 21 advisories, including critical findings, so the toolchain was updated to Electron 45, electron-builder 26, electron-vite 6, Vite 7, Vitest 5, `@vitejs/plugin-react` 5, `vite-plugin-pwa` 1.3 and Workbox 7.4; `npm audit` now reports zero vulnerabilities. See `docs/PHONE_ACCEPTANCE.md` for build and audit details. `package.json` is already at `0.2.0`. Do not create or push tag `v0.2.0` without explicit owner approval; it also publishes the desktop release.

### Out of scope for v0.2.0
Accounts or cloud sync (breaks the offline, no-accounts promise), a native iPhone or Android app, React Native or
Flutter rewrites, a visual redesign, push notifications, custom domain.

### Decisions already made by the owner
1. Ship the web version together with the next desktop release as **v0.2.0** (one tag builds the desktop release
   and deploys the site).
2. **No visual redesign** in this work. Layout and phone usability only (see M3).
3. **No Android APK or Play Store listing.** The PWA is the only phone version.

### Definition of done
- `npm run typecheck` clean, `npx vitest run` green (desktop tests unchanged and passing, new web and platform tests
  added), `npm run dist` still works, `build:web` works.
- The deployed site installs to the Home Screen on iPhone and Android, imports a real exam PDF, and the full study
  journey works with no console errors, including offline after first load.
- No exam content anywhere in the repo or the site. Notices and license links present.

## 6. Other open items (lower priority)

- Test a real in-app update on an installed copy (0.1.0 to a newer release).
- Identical question wording can exist in two exams (different question rows). They are separate by design;
  mixed drills keep identical wordings apart.
- No code signing: Windows SmartScreen shows a warning (documented in the user guide).
- Parser calibrated on two sample exams from the same publisher. Other layouts may need the review screen. The
  answer-key parser expects the number and the letter as separate text items.
- Table drawn only with aligned text (no ruled lines) is not detected as a figure.
- "Reset all data" does not reset the onboarding or auto-backup preferences.

## 7. Reporting back

Commit in small steps with clear messages, keep `main` releasable, and summarise at the end: what was done, what was
verified and how, what was not verified, and any concerns.
