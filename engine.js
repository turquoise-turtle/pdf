// Thin wrapper around PDFium (EmbedPDF Runtime, EmbedPDF's WebAssembly build of its PDFium fork) for unlocking PDFs.
import { init } from './vendor/pdfium/pdfium.js';

// FPDF_GetLastError codes
const FPDF_ERR_FILE = 2;
const FPDF_ERR_FORMAT = 3;
const FPDF_ERR_PASSWORD = 4;
const FPDF_ERR_SECURITY = 5;

// FPDF_RenderPageBitmap flags
const FPDF_ANNOT = 0x01;
const FPDF_REVERSE_BYTE_ORDER = 0x10; // RGBA instead of BGRA, ready for ImageData

// Write the whole file again; an incremental save would append to the original encrypted file.
const FPDF_NO_INCREMENTAL = 2;

let ready;

export function loadEngine() {
	if (!ready) {
		ready = (async () => {
			const res = await fetch(new URL('vendor/pdfium/pdfium.wasm', import.meta.url));
			if (!res.ok) throw new Error(`Couldn't download the PDF engine (${res.status})`);
			const rt = await init({ wasmBinary: await res.arrayBuffer() });
			rt.fn.EPDF_InitThread();
			return rt;
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
export function unlock(rt, bytes, password, thumbWidth) {
	const { fn, mem } = rt;
	const ptr = mem.alloc(bytes.length);
	mem.writeBytes(ptr, bytes);
	const doc = fn.FPDF_LoadMemDocument64(ptr, bytes.length, password);
	if (!doc) {
		const err = fn.FPDF_GetLastError();
		mem.free(ptr);
		if (err === FPDF_ERR_PASSWORD) return { result: 'needs-password' };
		if (err === FPDF_ERR_SECURITY) return { result: 'unsupported' };
		if (err === FPDF_ERR_FILE || err === FPDF_ERR_FORMAT) return { result: 'damaged' };
		return { result: 'damaged' };
	}
	try {
		const pages = fn.FPDF_GetPageCount(doc);
		let thumbnail;
		try {
			if (thumbWidth && pages > 0) thumbnail = renderThumbnail(rt, doc, thumbWidth);
		} catch {
			// A thumbnail is nice to have; never let it stop the unlock.
		}
		if (!fn.EPDF_IsEncrypted(doc)) return { result: 'not-locked', pages, thumbnail };
		if (!fn.EPDF_RemoveEncryption(doc)) return { result: 'unsupported', pages, thumbnail };
		return { result: 'unlocked', ownerOnly: password === '', pages, thumbnail, data: save(rt, doc) };
	} finally {
		fn.FPDF_CloseDocument(doc);
		mem.free(ptr);
	}
}

function save({ fn, mem }, doc) {
	const sizePtr = mem.alloc(8);
	let out;
	try {
		mem.poke(sizePtr, 'i32', 0);
		mem.poke(sizePtr, 'i32', 0, 4);
		out = fn.EPDF_SaveDocumentToOwnedBuffer(doc, FPDF_NO_INCREMENTAL, sizePtr);
		const size = Number(mem.peek(sizePtr, 'i32'));
		if (!out || size <= 0) throw new Error('save failed');
		return mem.readBytes(out, size);
	} finally {
		if (out) fn.EPDF_FreeBuffer(out);
		mem.free(sizePtr);
	}
}

function renderThumbnail({ fn, mem }, doc, width) {
	const page = fn.FPDF_LoadPage(doc, 0);
	if (!page) return undefined;
	try {
		const ratio = fn.FPDF_GetPageHeightF(page) / fn.FPDF_GetPageWidthF(page);
		const w = Math.round(width);
		const h = Math.max(1, Math.min(w * 3, Math.round(w * ratio)));
		const bitmap = fn.FPDFBitmap_Create(w, h, 1);
		try {
			fn.FPDFBitmap_FillRect(bitmap, 0, 0, w, h, 0xffffffff);
			fn.FPDF_RenderPageBitmap(bitmap, page, 0, 0, w, h, 0, FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER);
			const stride = fn.FPDFBitmap_GetStride(bitmap);
			const src = mem.readBytes(fn.FPDFBitmap_GetBuffer(bitmap), stride * h);
			const rgba = new Uint8ClampedArray(w * h * 4);
			for (let y = 0; y < h; y++) rgba.set(src.subarray(y * stride, y * stride + w * 4), y * w * 4);
			return new ImageData(rgba, w, h);
		} finally {
			fn.FPDFBitmap_Destroy(bitmap);
		}
	} finally {
		fn.FPDF_ClosePage(page);
	}
}
