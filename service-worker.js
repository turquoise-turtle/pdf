// Offline support. Bump VERSION whenever any file below changes, so visitors get the new copy.
const VERSION = '2026-10-01';
const CACHE = `unlock-pdf-${VERSION}`;
const FILES = [
	'./',
	'index.html',
	'style.css',
	'app.js',
	'engine.js',
	'vendor/pdfium/pdfium.js',
	'vendor/pdfium/pdfium.wasm',
	'manifest.webmanifest',
	'favicon.ico',
	'favicon-16x16.png',
	'favicon-32x32.png',
	'apple-touch-icon.png',
	'icon-192.png',
	'icon-512.png',
	'icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE)
			.then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
			.then(() => self.skipWaiting()),
	);
});

// Remove every other cache, including the ~400-file 'cache-and-update-pdf' from the old pdf.js version.
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

// Cache first, so it works offline; fall back to the network for anything not cached.
self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
	event.respondWith(
		caches.open(CACHE)
			.then((cache) => cache.match(event.request, { ignoreSearch: true }))
			.then((cached) => cached || fetch(event.request)),
	);
});
