# Phone acceptance and release readiness

Date: 2026-10-25

## Mobile layout coverage (M3)

The mobile Playwright journey now checks the Library, import report, question review, practice/mistake-bank, Stats, and Settings screens at 360, 390, and 430 CSS pixels wide. In addition to `documentElement.scrollWidth`, it checks `body.scrollWidth` and visible elements extending beyond the viewport, excluding intentional scroll containers.

Results: the journey passes in iPhone 14/WebKit and Pixel 7/Chromium emulation with no visible horizontal clipping or overflow at the checked widths. Touch controls retain the shared 44px minimum, the header navigation is a two-column grid on phones, the review screen stacks below desktop widths, and Stats switches to card rows on narrow screens. This is a usability baseline, not a visual redesign.

## PDF import performance baseline (M4, emulation only)

Measured from selecting the PDF file in the browser until the import report heading appeared. These are local desktop-hosted browser emulation results, not physical-device measurements.

| Browser project | Hospitality/Tourism sample | Hospitality District sample |
| --- | ---: | ---: |
| Pixel 7 / Chromium emulation | 1.6 seconds | 2.4 seconds |
| iPhone 14 / WebKit emulation | 5.2 seconds | 5.1 seconds |

Both PDFs are local licensed samples from the sibling `..\pdfs` folder. No PDF, exam wording, screenshots, or performance fixture containing exam material is committed. The temporary benchmark test was removed after the measurements.

The import flow already displays a busy state while reading. These emulated timings do not justify changing parser logic or moving it to another worker without physical-device evidence. M4 remains partial until the owner tests both PDFs on an actual iPhone and mid-range Android phone and records import time, responsiveness, and any browser memory issues.

## Security and build toolchain

The previous audit reported 21 vulnerabilities, including 3 critical, 14 high, and 4 moderate. The fixes required major toolchain updates, so the local branch now uses Electron 45, electron-builder 26, electron-vite 6, Vite 7, Vitest 5, `@vitejs/plugin-react` 5, `vite-plugin-pwa` 1.3, and Workbox 7.4. The Vitest configuration now uses named projects for Node and renderer tests because the old `environmentMatchGlobs` option was removed.

After those updates:

- `npm audit` reports 0 vulnerabilities.
- TypeScript typecheck passes.
- All 348 tests across 33 files pass, including tests against the two local sample PDFs.
- The production PWA build passes and precaches 26 entries. The PDF parser chunk is about 494 KB; the PDF worker is about 2.42 MB.
- Both mobile browser journeys pass.
- The Windows installer and portable ZIP build successfully with the updated Electron toolchain.

`npm run notices` regenerates third-party notices for 42 packages, including the Workbox packages shipped as part of the service worker. The notice generator reports that `lazy-val` and the optional Windows canvas package do not ship a license text file; their declared license identifiers are still included in the generated notice list. No GPL, LGPL, or AGPL license identifiers were found in the generated notices.

## Remaining acceptance gates

1. Physical iPhone and mid-range Android testing is still required. Browser emulation is not a substitute.
2. The updated source is local to `web/pwa`; the deployed Pages site has not been refreshed with these changes.
3. Do not create or push tag `v0.2.0` until the owner explicitly approves the release. That tag also triggers the desktop release workflow.
4. No exam PDFs are tracked, and `..\pdfs` remains outside the repository.
