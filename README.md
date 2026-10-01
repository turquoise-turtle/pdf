# pdf

Save a copy of a password-protected or restricted PDF without the password: https://turquoise-turtle.github.io/pdf/

If the PDF has an open password, you type it once and the downloaded copy won't need it. Restrictions on printing, copying or editing (set with an owner or permissions password) are removed without asking for a password.

The unlocked copy is the original file with the encryption removed, so text, links, bookmarks and form fields are kept. The previous version printed each page as an image instead.

You can add several PDFs at once. Each one gets its own download button, and the file is saved as `name-unlocked.pdf`. On phones and tablets there's also a Share button, which opens the device's usual share menu (Files, Books, Print, Mail and so on).

The password field is a plain text field, shown by default with a Hide button. It never uses `type="password"`, so browsers and password managers don't offer to save a password that's only needed once.

## Privacy

Everything runs in your browser. Files are read into memory in the page and are never uploaded. The page's Content-Security-Policy (`connect-src 'self'`) stops it sending data to any other server. After the first visit it works offline, and it can be installed as an app.

## Limitations

PDFs protected with DRM (FileOpen, Locklizard, Adobe rights management) or with certificate (public-key) encryption can't be unlocked, because the key isn't in the file. The page tells you when this is the case.

## Engine and files

Unlocking is done by [PDFium](https://pdfium.googlesource.com/pdfium/) (the PDF engine in Chrome), compiled to WebAssembly by [EmbedPDF](https://github.com/embedpdf/embed-pdf-viewer) as [`@embedpdf/pdfium`](https://www.npmjs.com/package/@embedpdf/pdfium). There's no build step: the files are served as they are by GitHub Pages.

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | The page |
| `app.js` | File list, password prompts, downloads |
| `engine.js` | Calls PDFium: open with password, remove encryption, save a copy, render a thumbnail |
| `service-worker.js` | Offline cache. **Bump `VERSION` whenever any cached file changes.** |
| `vendor/pdfium/` | `@embedpdf/pdfium` 2.15.1 (`dist/index.browser.js` renamed to `pdfium.js`, plus `pdfium.wasm` and licences) |

### Updating PDFium

```sh
npm pack @embedpdf/pdfium && tar xzf embedpdf-pdfium-*.tgz
cp package/dist/index.browser.js vendor/pdfium/pdfium.js
cp package/dist/pdfium.wasm vendor/pdfium/
cp package/LICENSE vendor/pdfium/LICENSE && cp package/LICENSE.pdfium vendor/pdfium/LICENSE.pdfium
```

Then update the version in the table above and bump `VERSION` in `service-worker.js`.

## Licence

This project is GPLv3. `@embedpdf/pdfium` is MIT and PDFium is BSD-3-Clause/Apache-2.0; see `vendor/pdfium/`.
