Static site on GitHub Pages that unlocks PDFs in the browser with PDFium (WebAssembly). Before changing behaviour, read the "Decisions" section of README.md; those choices are deliberate.

- No build step, bundler or CDN. The only dependency is copied into `vendor/pdfium/` (update steps in README.md).
- After changing any site file, bump `VERSION` in `service-worker.js`.
- Test with `npm test` (first time: `npm run setup`). It prints one line per browser plus failures; don't open the PDFs in `tests/fixtures/`, they're binary and described in `tests/make_fixtures.py`. Test PDFs must only ever be made by that script (qpdf or MuPDF), never by PDFium or the page; the tests check this. The `mupdf (comparison only)` line is informational.
- Keep the password input `type="text"` (see README) and the CSP free of external hosts.
- Australian English, `lang="en-AU"`. Avoid the AI writing tropes at https://tropes.fyi/tropes-md. Don't hard-wrap lines.
- Leave changes uncommitted unless asked.
