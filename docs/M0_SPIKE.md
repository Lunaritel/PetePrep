# M0 web spike findings

Date: 2026-10-25

## Setup and checks

- Built the existing web target with `npm run build:web`.
- Ran the production preview at `http://127.0.0.1:4173/PetePrep/`.
- Ran the mobile Playwright journey at a 360 x 800 viewport in both iPhone 14/WebKit and Pixel 7/Chromium emulation.
- The journey imported an invented test PDF through the browser file input, reviewed and saved it, practiced, used the mistake bank, exported and restored a backup, and reloaded offline.
- `npm run typecheck` passed. After aligning this worktree to `origin/main`, the full test suite passed (346 tests across 33 files).

## What broke

No blocking layout or runtime failure was reproduced in the phone-sized browser journey. The tested screens had no horizontal overflow, the file-input import flow worked, and offline reload succeeded in both browser projects.

The production build does emit a bundle-size warning. The PDF.js worker is about 2.42 MB and the PDF.js code chunk is about 541 KB, both uncompressed. This is a performance follow-up, not a build failure. Measure import time on real iPhone and mid-range Android hardware during M4 before deciding whether code splitting, progress feedback, or worker changes are needed.

## Limits of this spike

- Phone checks are browser emulation, not physical-device verification.
- The end-to-end import uses an invented synthetic PDF. Real exam parsing is covered by the existing local test suite, but this run does not measure the real PDFs on a phone.
- This is a baseline check, not the detailed 360-430 px layout pass assigned to M3.

## Outcome

M0's web build and mobile-browser spike checks are green. Continue in milestone order; keep M3 layout work and M4 real-device performance measurement as separate tasks. No exam PDFs or exam wording were added to the repository.
