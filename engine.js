// Thin wrapper around PDFium (via EmbedPDF's WebAssembly build) for unlocking PDFs.
import { init } from './vendor/pdfium/pdfium.js';

// FPDF_GetLastError codes
const FPDF_ERR_FILE = 2;
const FPDF_ERR_FORMAT = 3;
const FPDF_ERR_PASSWORD = 4;
const FPDF_ERR_SECURITY = 5;

// FPDF_RenderPageBitmap flags
const FPDF_ANNOT = 0x01;
const FPDF_REVERSE_BYTE_ORDER = 0x10; // RGBA instead of BGRA, ready for ImageData

let ready;

export function loadEngine() {
	if (!ready) {
		ready = (async () => {
			const res = await fetch(new URL('vendor/pdfium/pdfium.wasm', import.meta.url));
			if (!res.ok) throw new Error(`Couldn't download the PDF engine (${res.status})`);
			const pdfium = await init({ wasmBinary: await res.arrayBuffer() });
			pdfium.PDFiumExt_Init();
			return pdfium;
		})();
		// Let a later call try again, e.g. after coming back online.
		ready.catch(() => { ready = undefined; });
	}
	return ready;
}

/**
 * Try to unlock a PDF.
 * @returns {{result: 'unlocked'|'not-locked'|'needs-password'|'unsupported'|'damaged', ownerOnly?: boolean, pages?: number, data?: Uint8Array, thumbnail?: ImageData}}
 */
export function unlock(pdfium, bytes, password, thumbWidth) {
	const heap = () => pdfium.pdfium.HEAPU8; // re-read: memory growth replaces the buffer
	const { malloc, free } = pdfium.pdfium.wasmExports;
	const ptr = malloc(bytes.length);
	heap().set(bytes, ptr);
	const doc = pdfium.FPDF_LoadMemDocument(ptr, bytes.length, password);
	if (!doc) {
		const err = pdfium.FPDF_GetLastError();
		free(ptr);
		if (err === FPDF_ERR_PASSWORD) return { result: 'needs-password' };
		if (err === FPDF_ERR_SECURITY) return { result: 'unsupported' };
		if (err === FPDF_ERR_FILE || err === FPDF_ERR_FORMAT) return { result: 'damaged' };
		return { result: 'damaged' };
	}
	try {
		const pages = pdfium.FPDF_GetPageCount(doc);
		let thumbnail;
		try {
			if (thumbWidth && pages > 0) thumbnail = renderThumbnail(pdfium, heap, doc, thumbWidth);
		} catch {
			// A thumbnail is nice to have; never let it stop the unlock.
		}
		if (!pdfium.EPDF_IsEncrypted(doc)) return { result: 'not-locked', pages, thumbnail };
		if (!pdfium.EPDF_RemoveEncryption(doc)) return { result: 'unsupported', pages, thumbnail };
		return { result: 'unlocked', ownerOnly: password === '', pages, thumbnail, data: save(pdfium, heap, doc) };
	} finally {
		pdfium.FPDF_CloseDocument(doc);
		free(ptr);
	}
}

function save(pdfium, heap, doc) {
	const { malloc, free } = pdfium.pdfium.wasmExports;
	const writer = pdfium.PDFiumExt_OpenFileWriter();
	try {
		pdfium.PDFiumExt_SaveAsCopy(doc, writer);
		const size = pdfium.PDFiumExt_GetFileWriterSize(writer);
		const out = malloc(size);
		try {
			pdfium.PDFiumExt_GetFileWriterData(writer, out, size);
			return heap().slice(out, out + size);
		} finally {
			free(out);
		}
	} finally {
		pdfium.PDFiumExt_CloseFileWriter(writer);
	}
}

function renderThumbnail(pdfium, heap, doc, width) {
	const page = pdfium.FPDF_LoadPage(doc, 0);
	if (!page) return undefined;
	try {
		const ratio = pdfium.FPDF_GetPageHeightF(page) / pdfium.FPDF_GetPageWidthF(page);
		const w = Math.round(width);
		const h = Math.max(1, Math.min(w * 3, Math.round(w * ratio)));
		const bitmap = pdfium.FPDFBitmap_Create(w, h, 1);
		try {
			pdfium.FPDFBitmap_FillRect(bitmap, 0, 0, w, h, 0xffffffff);
			pdfium.FPDF_RenderPageBitmap(bitmap, page, 0, 0, w, h, 0, FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER);
			const buf = pdfium.FPDFBitmap_GetBuffer(bitmap);
			const stride = pdfium.FPDFBitmap_GetStride(bitmap);
			const rgba = new Uint8ClampedArray(w * h * 4);
			for (let y = 0; y < h; y++) rgba.set(heap().subarray(buf + y * stride, buf + y * stride + w * 4), y * w * 4);
			return new ImageData(rgba, w, h);
		} finally {
			pdfium.FPDFBitmap_Destroy(bitmap);
		}
	} finally {
		pdfium.FPDF_ClosePage(page);
	}
}
