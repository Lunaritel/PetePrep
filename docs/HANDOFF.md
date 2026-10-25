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
the existing React renderer. Do not build a React Native or native iOS app. Optional later: wrap the PWA as an Android
APK (Trusted Web Activity) if the owner wants a Play Store listing ($25 one-time).

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

**M0. Spike (about an hour).** Add `vite.web.config.ts` (root `src/renderer`, plugins react and tailwind, `define`
for `__APP_VERSION__`, `base: '/PetePrep/'`) and scripts `dev:web` and `build:web` writing to `dist-web/`. Run it in a
desktop browser, then in a phone-sized viewport. Import a PDF via the file input. Write down what breaks in a short
note and update this plan before continuing.

**M1. Platform layer.** Add `src/renderer/src/platform/` exposing one small interface (`canPickNatively`,
`downloadFile(name, text)`, `pickTextFile()`, `isDesktop`, `appVersion`). The desktop implementation wraps
`window.deca`; the web implementation uses Blob downloads and a file input. Route `backupService`, import and
Settings through it. Hide desktop-only UI on web. Keep all existing desktop behavior and tests unchanged.

**M2. PWA.** Web manifest (name PetePrep, `display: standalone`, theme and background colors from the tokens),
icons 192, 512 and a maskable 512 generated from `scripts/make-icon.mjs`, a service worker that precaches the app
shell, fonts and the pdf.js worker so it works offline (`vite-plugin-pwa` is MIT; confirm and record its license),
an "update ready, reload" prompt, `navigator.storage.persist()` on first import, and an iPhone note: "Add to Home
Screen so your progress is not cleared by Safari". Verify offline by loading once, going offline, and reloading.

**M3. Phone layout.** The screens were built for 760px and wider. Make every screen usable at 360 to 430px wide:
header navigation (currently four items in a row), Library exam cards (a 5-button row plus a quiet group), the Mistake
bank strip, the import review screen (list + PDF page + form side by side, must stack), Stats tables (make them card
lists on narrow screens), Settings. Use `min-h-[100dvh]`, safe-area insets, 44px touch targets, no hover-only
affordances, no horizontal scroll, readable explanation text. Keyboard shortcuts (A to D, Enter) stay for desktop.
Do the visual polish the owner postponed together with this pass.

**M4. Mobile performance.** Measure PDF import on a mid-range Android and an iPhone with both sample exams
(100 questions each). If layout and parsing block the main thread, add progress feedback or move work off the main
thread. Set a sensible maximum PDF size with a friendly message. Do not regress parsing correctness.

**M5. Hosting and CI.** Add `.github/workflows/pages.yml`: on tags `v*` and manual dispatch, `npm ci`, typecheck,
test, `build:web`, upload the Pages artifact, deploy. Enable Pages with source "GitHub Actions" (needs repo admin;
ask the owner or use `gh api`). Site URL will be https://lunaritel.github.io/PetePrep/. Production CSP for the web
build: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
worker-src 'self' blob:; manifest-src 'self'; connect-src 'self'`. Do not break `release.yml` (desktop releases).

**M6. Automated and real-device testing.**
- Playwright (add `@playwright/test` as a dev dependency) with iPhone 14 and Pixel 7 device emulation. Script the
  journey: complete onboarding, import a PDF through the file input, review and save, practice with some misses,
  Weak points, Mistake bank, export a backup (download) and restore it. Assert the invariants in section 4.
- Check installability (manifest and service worker present), offline reload, and no console errors.
- Ask the owner to try it on a real iPhone and Android phone; record results.

**M7. Docs and legal.**
- README "Use on your phone" and a USER_GUIDE section: open the link, Add to Home Screen, how to get a PDF onto the
  phone, how to move progress between devices (export a backup, restore on the other device), iPhone storage warning.
- The site must show the same not-affiliated, accuracy and "only import exams you are allowed to use" notices, a link
  to the MIT license, and the third-party notices (publish `THIRD_PARTY_NOTICES.txt` as a static file linked from
  About; web bundles include extra libraries such as the service worker toolkit, so regenerate and verify them).
- Privacy text must stay true: no analytics, no accounts; the only requests are the site loading its own files from
  GitHub Pages. Mention that GitHub, like any host, sees normal web request logs.
- Bump `package.json` to `0.2.0`, update the user guide, tag `v0.2.0` (this builds the desktop release and the site).

### Out of scope for v0.2.0
Accounts or cloud sync (breaks the offline, no-accounts promise), a native iPhone app (costs $99/year), React Native
or Flutter rewrites, push notifications, custom domain.

### Decisions to confirm with the owner before starting
1. Ship web and the next desktop release together as v0.2.0? (Recommended yes.)
2. Include the postponed visual pass in M3? (Recommended yes.)
3. Later, an Android APK via Trusted Web Activity for the Play Store ($25 one-time)? (Not now.)

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
