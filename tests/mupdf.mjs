// MuPDF comparison. The site uses PDFium; this shows how MuPDF would handle the same files, for when the engine choice is revisited (README, Decisions).
// Runs in Node, not the browser. MuPDF-made files are skipped, so MuPDF is never tested on its own output.
import * as mupdf from 'mupdf';
import { readFileSync } from 'node:fs';

// MuPDF prints repair warnings to the console; keep test output to the summary.
function quietly(fn) {
	const saved = [console.log, console.warn, console.error, process.stderr.write];
	console.log = console.warn = console.error = () => {};
	process.stderr.write = () => true;
	try {
		return fn();
	} finally {
		[console.log, console.warn, console.error, process.stderr.write] = saved;
	}
}

/** Same outcomes as the page: 'unlocked' | 'restrictions' | 'not-locked' | 'unsupported' | 'damaged' | 'wrong-password'. */
export function mupdfOutcome(bytes, password) {
	return quietly(() => {
		let doc;
		try {
			doc = mupdf.Document.openDocument(bytes, 'application/pdf');
		} catch (e) {
			return /unknown encryption handler/i.test(e.message) ? 'unsupported' : 'damaged';
		}
		try {
			const pdf = doc.asPDF();
			if (!pdf) return 'damaged'; // e.g. a PNG renamed to .pdf, which MuPDF opens as an image
			if (doc.needsPassword() && !doc.authenticatePassword(password)) return 'wrong-password';
			if (doc.countPages() === 0) return 'damaged';
			if (pdf.getTrailer().get('Encrypt').isNull()) return 'not-locked';
			const out = pdf.saveToBuffer('encrypt=none').asUint8Array();
			const check = mupdf.Document.openDocument(out, 'application/pdf');
			const ok = !check.needsPassword() && check.asPDF().getTrailer().get('Encrypt').isNull() && check.countPages() === doc.countPages();
			check.destroy();
			if (!ok) return 'save-failed';
			return password ? 'unlocked' : 'restrictions';
		} catch {
			return 'damaged';
		} finally {
			doc.destroy();
		}
	});
}

/** Returns lines describing every case where MuPDF differs from what the page should do. */
export function compareMupdf(cases) {
	const differences = [];
	let compared = 0;
	for (const c of cases.filter((c) => c.maker !== 'mupdf')) {
		const bytes = readFileSync(c.path);
		const got = mupdfOutcome(bytes, c.password);
		compared++;
		if (got !== c.expect) differences.push(`${c.name}: expected ${c.expect}, got ${got}`);
		if (c.expect === 'unlocked' && c.name === 'r6-aes256-user.pdf' && mupdfOutcome(bytes, 'wrong') !== 'wrong-password') differences.push(`${c.name}: wrong password not detected`);
	}
	return { compared, differences };
}
