# PWA spike notes

Date: 2026-10-25. Worktree: `web/pwa`, based on `origin/main` at `b22aba0`.

## What the first web build proved

- A separate Vite build compiles the existing React renderer for the GitHub Pages base path `/PetePrep/` without changing the Electron build command.
- The browser bundle includes the existing pdf.js worker and lazy-loaded PDF parser. The production build completes, but Vite warns that the PDF worker and parser chunks are large; phone import performance needs a real-device measurement.
- The native PDF dialog already falls back to the existing file input when the Electron bridge is absent.

## Phone issues found by source inspection

- The header renders four navigation buttons in one horizontal row. On a 360px screen they compete with the PetePrep brand and leave little room for content.
- The import review UI is designed around a list, PDF page and edit form side by side. It needs a stacked narrow-screen layout.
- Library exam actions use a five-button row plus secondary actions. They wrap, but need spacing and touch-target checks on small screens.
- Stats tables and settings need a narrow-screen pass.
- Backup and update screens currently describe native desktop dialogs and the Documents folder. Browser downloads/file picking and web-specific wording are needed.

## Verification limitation

The initial web production build passed, `npm run typecheck` passed, and all 341 existing Vitest tests passed, including tests that parse the licensed PDFs from the sibling `pdfs` folder. This session has no interactive browser control, so a visual phone viewport, real browser PDF import and real-device/offline checks are not claimed as manually verified. Automated browser coverage will be added in M6.
