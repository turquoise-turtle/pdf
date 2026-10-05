# pdf

Save a copy of a password-protected or restricted PDF without the password: https://turquoise-turtle.github.io/pdf/

If a PDF has an open password, you type it once and the downloaded copy won't need it. Restrictions on printing, copying or editing are removed without a password. The download is the original file with the encryption removed, so text, links, bookmarks and form fields are kept. Several PDFs can be added at once; each gets a Download button (`name-unlocked.pdf`), plus Share on phones and tablets.

Everything runs in the browser and nothing is uploaded. The page's Content-Security-Policy (`connect-src 'self'`) stops it sending data to any other server. After the first visit it works offline and can be installed as an app.

PDFs protected with DRM (FileOpen, Locklizard, Adobe rights management) or certificate encryption can't be unlocked, because the key isn't in the file. The page says so.

## Maintaining

```sh
npm run setup   # once: installs Playwright, its browsers and MuPDF (tests only; the site has no dependencies)
npm test        # Chromium, WebKit, Firefox. Prints one line per browser, plus any failures
```

After changing any file, bump `VERSION` in `service-worker.js` (otherwise returning visitors keep the old cached copy), then run `npm test`. GitHub Pages serves the repo as it is, so committing to the default branch deploys it.

### Updating PDFium

The only dependency. Check for a new version roughly once a year.

```sh
npm pack @embedpdf/pdfium && tar xzf embedpdf-pdfium-*.tgz
cp package/dist/index.browser.js vendor/pdfium/pdfium.js && cp package/dist/pdfium.wasm vendor/pdfium/
cp package/LICENSE vendor/pdfium/LICENSE && cp package/LICENSE.pdfium vendor/pdfium/LICENSE.pdfium
```

Then update the version in the Files table below, bump `VERSION` and run `npm test`. If the tests fail, a PDFium function used in `engine.js` has probably been renamed; `package/dist/index.d.ts` lists the current names. Delete `package/` and the `.tgz` once the tests pass.

### Tests

The tests use the committed PDFs in `tests/fixtures/`: every encryption type written by both qpdf and MuPDF (in `mupdf/`), damaged files, non-PDFs and imitation DRM. If [uv](https://docs.astral.sh/uv/) is installed, each run also makes a fresh random set (random passwords, encryption types and maker), so the page isn't only tested on files it has seen before. A failure prints `SEED=n`; rerun with `SEED=n npm test` to get the same files.

No test PDF is ever made by PDFium, so a PDFium bug can't cancel itself out by writing a file wrongly and reading it back the same wrong way. The tests refuse to run if a test PDF has PDFium's signature or lacks its maker's.

Each run also prints a `mupdf (comparison only)` line: MuPDF's result on every test PDF it didn't make, against what the page should do. It doesn't affect the exit code; it's there for when the engine choice is revisited.

`tests/cases.mjs` describes each test PDF (password, expected result, maker). To add a case, edit `tests/make_fixtures.py`, run `uv run tests/make_fixtures.py`, and extend `cases.mjs` if the file name doesn't already say what to expect.

Not covered by the tests: real iOS and Android share menus, password-manager prompts, real DRM or certificate-encrypted files, and very large files (100 MB or more).

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | The page |
| `app.js` | File list, password prompts, download and share buttons |
| `engine.js` | Calls PDFium: open with password, remove encryption, save a copy, render a thumbnail |
| `service-worker.js` | Offline cache (cache first, versioned) |
| `vendor/pdfium/` | `@embedpdf/pdfium` 2.15.1 (`dist/index.browser.js` renamed to `pdfium.js`, plus `pdfium.wasm` and licences) |
| `tests/` | `test.mjs` (site, in browsers), `mupdf.mjs` (comparison), `cases.mjs` (what each test PDF is), `make_fixtures.py`, `fixtures/` |

## Decisions

Made in October 2026 when this replaced the pdf.js 2.2 version, which printed pages as 150 DPI images (losing text and links) and was affected by CVE-2024-4367.

- PDFium for unlocking, over MuPDF. The deciding reason was that PDFium's errors separate a wrong password, a damaged file and an unsupported security handler (DRM or certificates), which drives the page's different messages. Later testing showed MuPDF can make the same distinction through its error messages (`unknown encryption handler`), as text rather than PDFium's numeric codes, and it now matches the page's expected result on every test PDF. So the choice is close and worth revisiting; the `mupdf (comparison only)` line in `npm test` shows the current state. MuPDF's AGPL licence would be fine. qpdf isn't an option because it can't render pages, so thumbnails would need a second engine. Any engine considered later, including ones that don't exist yet, needs to decrypt, render and report why a file failed.
- No build step, dependency copied into `vendor/`. Nothing to install to edit the site, and nothing loads from a CDN, which keeps the privacy claim simple.
- Unlocking runs on the page, not in a Web Worker. The CSP is a `<meta>` tag, which only covers the page; a worker would have none, because GitHub Pages can't set headers. The cost is that a very large file can freeze the page briefly.
- The engine (2.1 MB compressed) starts downloading when the page loads, so the first unlock is instant.
- The password field is `type="text"`, masked with `-webkit-text-security` when hidden. A `type="password"` field makes browsers and password managers offer to save a password that's only needed once. It's visible by default because mistyping a hidden password is the easiest way to get stuck.
- Share appears only on touch devices (`pointer: coarse` plus `navigator.canShare`). On computers, Download is what people expect.
- Written for people who find reading hard: one heading, one large button, icons on every status, 18px text, 48px buttons. The full filename on the Download button, the status wording and multi-file selection were kept on purpose.
- DRM and certificate-encrypted files get an explanation rather than an attempt. The keys aren't in the file, and getting around DRM is out of scope.
- Australian English, `lang="en-AU"`.

## Licence

GPLv3. `@embedpdf/pdfium` is MIT and PDFium is BSD-3-Clause/Apache-2.0; see `vendor/pdfium/`.
