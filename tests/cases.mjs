// What each test PDF is and what should happen to it. Shared by test.mjs (PDFium, in the browser) and mupdf.mjs (comparison).
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

export const FIX = new URL('fixtures/', import.meta.url).pathname;

// Each PDF writer leaves a signature in the file's second line.
const MARKS = {
	qpdf: Buffer.from([0x25, 0xbf, 0xf7, 0xa2, 0xfe]),
	mupdf: Buffer.from([0x25, 0xc2, 0xb5, 0xc2, 0xb6]),
	pdfium: Buffer.from([0x25, 0xa1, 0xb3, 0xc5, 0xd7]),
};

// expect: 'unlocked' (needs the password), 'restrictions' (no password needed), 'not-locked', 'unsupported' (DRM/certificate), 'damaged'
function expectFor(name, password) {
	if (/^(drm|cert)-/.test(name)) return 'unsupported';
	if (name === 'plain.pdf') return 'not-locked';
	if (/owneronly/.test(name)) return 'restrictions';
	return password ? 'unlocked' : 'restrictions';
}

function passwordFor(name) {
	if (/unicode/.test(name)) return 'pässwörd-日本';
	return /-user/.test(name) ? 'user' : '';
}

/** The committed fixtures. maker is null for hand-made files (plain.pdf is made by ReportLab, broken/ by byte edits). */
export function committedCases() {
	const cases = [];
	for (const f of readdirSync(FIX).filter((f) => f.endsWith('.pdf'))) {
		cases.push({ name: f, path: join(FIX, f), password: passwordFor(f), maker: f === 'plain.pdf' ? null : 'qpdf' });
	}
	for (const f of readdirSync(join(FIX, 'mupdf'))) cases.push({ name: f, path: join(FIX, 'mupdf', f), password: passwordFor(f), maker: 'mupdf' });
	for (const f of readdirSync(join(FIX, 'broken'))) cases.push({ name: f, path: join(FIX, 'broken', f), password: '', maker: null, expect: /^(drm|cert)-/.test(f) ? 'unsupported' : 'damaged' });
	return cases.map((c) => ({ expect: expectFor(c.name, c.password), ...c }));
}

/** A fresh random set written by `make_fixtures.py --fresh dir`. */
export function freshCases(dir) {
	const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
	return Object.entries(manifest).map(([f, { password, maker }]) => ({ name: f, path: join(dir, f), password, maker, expect: expectFor(f, password) }));
}

/**
 * Test PDFs must never be written by PDFium, or a PDFium bug could cancel itself out (a file it writes wrongly, then reads the same wrong way).
 * Files with a maker must carry that maker's signature.
 */
export function originProblems(cases) {
	const problems = [];
	for (const c of cases) {
		const head = readFileSync(c.path).subarray(0, 32);
		if (head.includes(MARKS.pdfium)) problems.push(`${basename(c.path)} was written by PDFium`);
		else if (c.maker && !head.includes(MARKS[c.maker])) problems.push(`${basename(c.path)} wasn't written by ${c.maker}`);
	}
	return problems;
}
