import { loadEngine, unlock } from './engine.js';

const THUMB_CSS_WIDTH = 64;

const dropbox = document.querySelector('#dropbox');
const fileInput = document.querySelector('#fileElem');
const list = document.querySelector('#files');
const rowTemplate = document.querySelector('#fileRow');

const sizeFormat = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 });
function formatSize(bytes) {
	if (bytes === 0) return '0 KB';
	if (bytes < 1024 * 1024) return `${sizeFormat.format(Math.max(1, bytes / 1024))} KB`;
	return `${sizeFormat.format(bytes / (1024 * 1024))} MB`;
}

function unlockedName(name) {
	return `${name.replace(/\.pdf$/i, '')}-unlocked.pdf`;
}

// Offer Share only on phones and tablets, where the share sheet is the usual way to save or send a file.
let canShareFiles;
function shareSupported() {
	if (canShareFiles === undefined) {
		const touch = window.matchMedia('(pointer: coarse)').matches;
		const probe = new File([''], 'test.pdf', { type: 'application/pdf' });
		canShareFiles = touch && typeof navigator.share === 'function' && navigator.canShare?.({ files: [probe] }) === true;
	}
	return canShareFiles;
}

// Start downloading the engine straight away so the first unlock is instant.
window.addEventListener('load', () => loadEngine().catch(() => {}));

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('service-worker.js').catch((error) => console.log('Service worker registration failed:', error));
	});
}

let rowCount = 0;

// Files are unlocked one at a time so a big batch doesn't freeze the page.
let queue = Promise.resolve();
function enqueue(task) {
	queue = queue.then(task, task);
	return queue;
}

function handleFiles(files) {
	for (const file of files) addFile(file);
	fileInput.value = '';
}

function addFile(file) {
	const row = rowTemplate.content.firstElementChild.cloneNode(true);
	const el = {
		thumb: row.querySelector('.thumb'),
		meta: row.querySelector('.meta'),
		status: row.querySelector('.status'),
		statusText: row.querySelector('.status-text'),
		form: row.querySelector('.password'),
		input: row.querySelector('input'),
		toggle: row.querySelector('.toggle'),
		submit: row.querySelector('button[type=submit]'),
		download: row.querySelector('.download'),
		share: row.querySelector('.share'),
		remove: row.querySelector('.remove'),
		removed: false,
	};
	row.querySelector('.name').textContent = file.name;
	el.meta.textContent = formatSize(file.size);
	el.remove.setAttribute('aria-label', `Remove ${file.name} from the list`);
	el.input.id = `password-${++rowCount}`;
	row.querySelector('.password-label').htmlFor = el.input.id;
	list.append(row);

	el.remove.addEventListener('click', () => {
		el.removed = true;
		if (el.download.href) URL.revokeObjectURL(el.download.href);
		// Keep keyboard focus nearby instead of dropping it back to the top of the page.
		const neighbour = row.nextElementSibling ?? row.previousElementSibling;
		row.remove();
		(neighbour?.querySelector('.remove') ?? fileInput).focus();
	});

	// The password is visible by default, because mistyping one you can't see is the easiest way to get stuck.
	// Hiding uses CSS rather than type="password", so browsers and password managers never offer to save a one-off PDF password.
	const setPasswordVisible = (visible) => {
		el.input.classList.toggle('masked', !visible);
		el.toggle.textContent = visible ? 'Hide' : 'Show';
		el.toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
	};
	setPasswordVisible(true);
	if (CSS.supports('-webkit-text-security', 'disc')) {
		el.toggle.addEventListener('click', () => setPasswordVisible(el.input.classList.contains('masked')));
	} else {
		el.toggle.hidden = true;
	}

	el.form.addEventListener('submit', (e) => {
		e.preventDefault();
		el.submit.disabled = true;
		enqueue(() => process(file, el, el.input.value)).finally(() => { el.submit.disabled = false; });
	});

	setStatus(el, 'Waiting...', 'wait');
	enqueue(() => process(file, el, ''));
}

// kind: 'wait' | 'lock' | 'done' | 'info' | 'error' (sets the icon and colour)
function setStatus(el, text, kind) {
	el.statusText.textContent = text;
	el.status.dataset.kind = kind;
}

async function process(file, el, password) {
	if (el.removed) return;
	setStatus(el, 'Unlocking...', 'wait');
	let pdfium;
	try {
		pdfium = await loadEngine();
	} catch {
		setStatus(el, "Couldn't load the PDF engine. Check your internet connection and reload the page.", 'error');
		return;
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	// Give the browser a frame to show "Unlocking..." before the (synchronous) work starts.
	await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
	if (el.removed) return;

	let r;
	try {
		r = unlock(pdfium, bytes, password, THUMB_CSS_WIDTH * Math.min(window.devicePixelRatio || 1, 3));
	} catch (error) {
		console.error(error);
		r = { result: 'damaged' };
	}

	if (r.pages !== undefined) el.meta.textContent = `${r.pages} ${r.pages === 1 ? 'page' : 'pages'}, ${formatSize(file.size)}`;
	if (r.thumbnail) drawThumbnail(el.thumb, r.thumbnail);

	switch (r.result) {
		case 'needs-password': {
			const firstTry = el.form.hidden;
			el.form.hidden = false;
			setStatus(el, firstTry ? 'This PDF needs its password to open.' : "That password didn't work. Try again.", firstTry ? 'lock' : 'error');
			if (!firstTry) el.input.select();
			// Don't steal focus from a password the person is already typing.
			const active = document.activeElement;
			if (!active || active === document.body || active === fileInput || active === el.input) el.input.focus();
			break;
		}
		case 'unlocked': {
			el.form.hidden = true;
			const unlocked = new File([r.data], unlockedName(file.name), { type: 'application/pdf' });
			el.download.href = URL.createObjectURL(unlocked);
			el.download.download = unlocked.name;
			el.download.textContent = `Download ${unlocked.name}`;
			el.download.hidden = false;
			if (shareSupported()) {
				el.share.hidden = false;
				el.share.onclick = async () => {
					try {
						await navigator.share({ files: [unlocked] });
					} catch (error) {
						// AbortError just means the share sheet was closed.
						if (error.name !== 'AbortError') setStatus(el, "Sharing didn't work. Use the Download button instead.", 'error');
					}
				};
			}
			setStatus(el, r.ownerOnly ? 'Restrictions removed.' : 'Unlocked.', 'done');
			break;
		}
		case 'not-locked':
			setStatus(el, "This PDF isn't locked, so there's nothing to remove.", 'info');
			break;
		case 'unsupported':
			setStatus(el, "This PDF uses DRM or certificate-based protection, which can't be removed here. Ask whoever sent it for an unlocked copy.", 'error');
			break;
		default:
			setStatus(el, "This file couldn't be read. It may be damaged, or not a PDF.", 'error');
	}
}

function drawThumbnail(canvas, image) {
	canvas.width = image.width;
	canvas.height = image.height;
	canvas.getContext('2d').putImageData(image, 0, 0);
	canvas.classList.add('has-image');
}

fileInput.addEventListener('change', () => handleFiles(fileInput.files));

// Drag and drop onto the box, as before.
dropbox.addEventListener('dragenter', (e) => { e.preventDefault(); });
dropbox.addEventListener('dragover', (e) => {
	e.preventDefault();
	dropbox.classList.add('animated');
});
dropbox.addEventListener('dragleave', (e) => {
	if (!dropbox.contains(e.relatedTarget)) dropbox.classList.remove('animated');
});
dropbox.addEventListener('drop', (e) => {
	e.preventDefault();
	dropbox.classList.remove('animated');
	handleFiles(e.dataTransfer.files);
});
// A PDF dropped just outside the box shouldn't navigate away from the page.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
