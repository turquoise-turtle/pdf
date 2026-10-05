// Tests the site (PDFium) in Chromium, WebKit and Firefox, and compares MuPDF on the same files. Run: npm test
// Prints one summary line per engine/browser plus any failures. Exit code 1 if the site fails anything.
// BROWSERS=webkit npm test runs a single browser.
// If uv is installed it also makes a fresh random set of PDFs with qpdf and MuPDF each run (FRESH=0 skips, SEED=n repeats a run).
import { chromium, webkit, firefox } from 'playwright';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { FIX, committedCases, freshCases, originProblems } from './cases.mjs';
import { compareMupdf } from './mupdf.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const fx = (name) => join(FIX, name);
const TMP = mkdtempSync(join(tmpdir(), 'pdf-test-'));
const committed = committedCases();

// Fresh random PDFs, so the page isn't only ever tested against files it has seen before.
const SEED = process.env.SEED ?? String(Math.floor(Math.random() * 1e9));
let fresh = null;
if (process.env.FRESH !== '0') {
	const dir = join(TMP, 'fresh');
	const r = spawnSync('uv', ['run', '-q', join(ROOT, 'tests', 'make_fixtures.py'), '--fresh', dir, '--seed', SEED], { encoding: 'utf8' });
	if (r.status === 0) fresh = freshCases(dir);
	else console.log(`fresh PDFs skipped: ${r.error?.code === 'ENOENT' ? 'uv not installed' : r.stderr.trim().split('\n').pop()}`);
}

// Static server for the repo. `down` simulates going offline (Playwright's setOffline breaks WebKit service workers).
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
let down = false;
const server = createServer((req, res) => {
	if (down) return req.socket.destroy();
	let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	if (p.endsWith('/')) p += 'index.html';
	try {
		const body = readFileSync(join(ROOT, p));
		res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
		res.end(body);
	} catch {
		res.writeHead(404).end();
	}
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/`;

// Test PDFs must come from tests/make_fixtures.py (qpdf or MuPDF), never PDFium, or a PDFium bug could cancel itself out.
const badOrigins = originProblems([...committed, ...(fresh ?? [])]);
if (badOrigins.length) {
	console.log('Test PDFs must be made by tests/make_fixtures.py (qpdf or MuPDF), never by PDFium or the page itself:');
	for (const b of badOrigins) console.log(`  FAIL ${b}`);
	process.exit(1);
}

// MuPDF comparison: informational only, it doesn't affect the exit code.
{
	const { compared, differences } = compareMupdf([...committed, ...(fresh ?? [])]);
	console.log(`mupdf (comparison only): ${compared - differences.length} of ${compared} as expected`);
	for (const d of differences) console.log(`  DIFF ${d}${fresh ? ` (SEED=${SEED})` : ''}`);
}

let failures = 0;
async function run(browserName, browserType) {
	const fails = [];
	let passed = 0;
	const check = (ok, msg) => (ok ? passed++ : fails.push(msg));
	const browser = await browserType.launch();
	const ctx = await browser.newContext({ acceptDownloads: true });
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy/.test(m.text())) errors.push(m.text()); });

	const rows = page.locator('.file');
	const row = (name) => rows.filter({ has: page.locator('.name', { hasText: new RegExp(`^${name.replace(/[.]/g, '\\.')}$`) }) });
	const status = async (name) => ({ kind: await row(name).locator('.status').getAttribute('data-kind'), text: await row(name).locator('.status-text').textContent() });
	const settled = () => page.waitForFunction(() => [...document.querySelectorAll('.file .status')].every((s) => s.dataset.kind !== 'wait'), null, { timeout: 30000 });
	const clearList = () => page.evaluate(() => { for (const b of document.querySelectorAll('.file .remove')) b.click(); });

	await page.goto(URL_);

	// Checks what each file shows straight after being added, before any password is typed.
	async function checkInitial(cases, note = '') {
		for (const c of cases) {
			const st = await status(c.name);
			const visible = await row(c.name).locator('.download:visible, .password:visible, canvas.has-image').count();
			if (c.expect === 'not-locked') check(st.kind === 'info' && /isn't locked/.test(st.text), `${c.name}${note}: ${st.text}`);
			if (c.expect === 'restrictions') check(st.kind === 'done' && st.text === 'Restrictions removed.' && await row(c.name).locator('canvas.has-image').count() === 1, `${c.name}${note}: ${st.text}`);
			if (c.expect === 'unlocked') check(st.kind === 'lock', `${c.name}${note}: ${st.text}`);
			if (c.expect === 'unsupported') check(st.kind === 'error' && /DRM or certificate/.test(st.text) && visible === 0, `${c.name}${note}: ${st.text}`);
			if (c.expect === 'damaged') check(st.kind === 'error' && /couldn't be read/.test(st.text) && visible === 0, `${c.name}${note}: ${st.text}`);
		}
	}
	// Types each password and checks the file unlocks.
	async function unlockAll(cases, note = '') {
		for (const c of cases.filter((c) => c.expect === 'unlocked')) {
			await row(c.name).locator('input').fill(c.password);
			await row(c.name).locator('input').press('Enter');
			await row(c.name).locator('.download').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
			const st = await status(c.name);
			check(st.kind === 'done' && st.text === 'Unlocked.', `${c.name}${note} (password ${JSON.stringify(c.password)}): ${st.text}`);
		}
	}

	// 1. Every committed test PDF at once (qpdf- and MuPDF-made, damaged, broken, imitation DRM).
	await page.setInputFiles('#fileElem', committed.map((c) => c.path));
	await settled();
	await checkInitial(committed);

	// 2. Password field: visible by default, Hide masks with CSS, never type=password (so no "save password?" prompt).
	const r6 = row('r6-aes256-user.pdf');
	check((await status('r6-aes256-user.pdf')).kind === 'lock', 'r6-aes256-user.pdf: not asking for password');
	check(await page.evaluate(() => document.activeElement?.matches('.password input')), 'first password field not focused');
	check(await r6.locator('.toggle').textContent() === 'Hide', 'password not visible by default');
	await r6.locator('.toggle').click();
	check(await r6.locator('input').evaluate((i) => getComputedStyle(i).getPropertyValue('-webkit-text-security')) === 'disc', 'Hide does not mask the password');
	check(await page.locator('input[type=password]').count() === 0, 'a type=password field exists');

	// 3. Wrong password, then the right ones.
	await r6.locator('input').fill('wrong');
	await r6.locator('input').press('Enter');
	const wrong = await r6.locator('.status-text', { hasText: "didn't work" }).waitFor({ timeout: 10000 }).then(() => true, () => false);
	check(wrong, 'wrong password message missing');
	await unlockAll(committed);

	// 4. Downloads are named name-unlocked.pdf and are really decrypted (re-adding one says "isn't locked").
	const [dl] = await Promise.all([page.waitForEvent('download'), row('r6-aes256-user.pdf').locator('.download').click()]);
	check(dl.suggestedFilename() === 'r6-aes256-user-unlocked.pdf', `download name: ${dl.suggestedFilename()}`);
	const saved = join(TMP, `${browserName}.pdf`);
	await dl.saveAs(saved);
	const bytes = readFileSync(saved);
	check(bytes.subarray(0, 5).toString() === '%PDF-' && !bytes.includes('/Encrypt'), 'download is not a decrypted PDF');
	await clearList();
	await page.setInputFiles('#fileElem', [saved]);
	await settled();
	check(/isn't locked/.test(await rows.first().locator('.status-text').textContent()) && /^3 pages/.test(await rows.first().locator('.meta').textContent()), 'downloaded copy did not reopen as an unlocked 3-page PDF');

	// 5. Remove buttons: removing a row moves focus to the next one, then back to the file picker.
	await clearList();
	await page.setInputFiles('#fileElem', [fx('plain.pdf'), fx('r6-aes256-owneronly.pdf')]);
	await settled();
	await rows.first().locator('.remove').click();
	check(await rows.count() === 1, 'remove did not remove the row');
	check(await page.evaluate(() => document.activeElement?.classList.contains('remove')), 'focus did not move to the next remove button');
	await rows.first().locator('.remove').click();
	check(await page.evaluate(() => document.activeElement?.id) === 'fileElem', 'focus did not return to the file picker');

	// 6. Fresh random PDFs (see top of file).
	if (fresh) {
		await clearList();
		await page.setInputFiles('#fileElem', fresh.map((c) => c.path));
		await settled();
		await checkInitial(fresh, ` (SEED=${SEED})`);
		await unlockAll(fresh, ` (SEED=${SEED})`);
		await clearList();
	}

	// 7. Offline: after the service worker takes over, the page and engine load with the server down.
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await page.waitForFunction(() => !!navigator.serviceWorker.controller);
	const errorsBeforeOffline = errors.length;
	down = true;
	await page.reload();
	await page.setInputFiles('#fileElem', [fx('r6-aes256-owneronly.pdf')]);
	await settled().catch(() => {});
	check(await rows.first().locator('.status-text').textContent().catch(() => '') === 'Restrictions removed.', 'does not work offline');
	down = false;
	errors.length = errorsBeforeOffline; // failed update checks while "offline" are expected

	check(errors.length === 0, `console errors or CSP violations: ${errors.slice(0, 3).join(' | ')}`);

	// 8. Share: shown only on touch devices, shares the unlocked file. navigator.share is stubbed (test browsers have no share sheet).
	if (browserName !== 'firefox') { // Playwright can't emulate a touch pointer in Firefox
		for (const touch of [false, true]) {
			const c = await browser.newContext({ hasTouch: touch, isMobile: touch && browserName === 'chromium', serviceWorkers: 'block' });
			await c.addInitScript(() => { window.__shared = []; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared.push(d.files.map((f) => f.name)); }; });
			const p = await c.newPage();
			await p.goto(URL_);
			await p.setInputFiles('#fileElem', [fx('r6-aes256-owneronly.pdf')]);
			await p.locator('.download').waitFor({ state: 'visible' });
			const shown = await p.locator('.share').isVisible();
			check(shown === touch, `Share button ${shown ? 'shown' : 'hidden'} with touch=${touch}`);
			check(await p.locator('.drag-hint').isVisible() === !touch, `"or drag it here" wrong with touch=${touch}`);
			if (shown) {
				await p.locator('.share').click();
				check((await p.evaluate(() => window.__shared))[0]?.[0] === 'r6-aes256-owneronly-unlocked.pdf', 'Share did not pass the unlocked file');
			}
			await c.close();
		}
	}

	await browser.close();
	failures += fails.length;
	console.log(`${browserName}: ${passed} passed, ${fails.length} failed`);
	for (const f of fails) console.log(`  FAIL ${f}`);
}

const all = { chromium, webkit, firefox };
for (const name of (process.env.BROWSERS ?? 'chromium,webkit,firefox').split(',')) {
	try {
		await run(name, all[name]);
	} catch (e) {
		failures++;
		console.log(`${name}: crashed: ${e.message.split('\n')[0]}`);
	}
}
server.close();
if (fresh) console.log(`fresh PDFs used SEED=${SEED}`);
process.exit(failures ? 1 : 0);
