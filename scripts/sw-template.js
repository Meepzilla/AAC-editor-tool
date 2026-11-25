// Service worker for AAC Profile Manager static PWA build.
// scripts/generate-service-worker.mjs fills in the version and precache URL list
// and writes the final script to out/sw.js.
//
// Zero network calls leave the origin. Every exported route, JS/CSS chunk, icon,
// manifest, and local WASM file is precached on install for 100% offline use.

const VERSION = __VERSION__;
const PRECACHE_URLS = __PRECACHE_URLS__;

const STATIC_CACHE = 'aac-pm-static';
const PAGES_CACHE = `aac-pm-pages-${VERSION}`;
const MATCH_OPTIONS = { ignoreSearch: true, ignoreVary: true };

const isStaticAsset = (pathname) =>
  pathname.startsWith('/_next/static/') || pathname.startsWith('/wasm/');

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      const pagesCache = await caches.open(PAGES_CACHE);

      const staticUrls = [];
      for (const url of PRECACHE_URLS.filter(isStaticAsset)) {
        if (!(await staticCache.match(url))) staticUrls.push(url);
      }
      if (staticUrls.length > 0) {
        await staticCache.addAll(staticUrls);
      }

      const pageRequests = PRECACHE_URLS.filter((url) => !isStaticAsset(url)).map(
        (url) => new Request(url, { cache: 'reload' })
      );
      if (pageRequests.length > 0) {
        await pagesCache.addAll(pageRequests);
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('aac-pm-pages-') && key !== PAGES_CACHE) {
          await caches.delete(key);
        }
      }
      const currentStatic = new Set(PRECACHE_URLS.filter(isStaticAsset));
      const staticCache = await caches.open(STATIC_CACHE);
      for (const request of await staticCache.keys()) {
        if (!currentStatic.has(new URL(request.url).pathname)) {
          await staticCache.delete(request);
        }
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      if (request.mode === 'navigate') {
        const pagesCache = await caches.open(PAGES_CACHE);
        const pathname =
          url.pathname.endsWith('/') || url.pathname.includes('.')
            ? url.pathname
            : `${url.pathname}/`;
        return (
          (await pagesCache.match(pathname, MATCH_OPTIONS)) ||
          fetch(request).catch(
            async () => (await pagesCache.match('/', MATCH_OPTIONS)) || Response.error()
          )
        );
      }

      if (isStaticAsset(url.pathname)) {
        const staticCache = await caches.open(STATIC_CACHE);
        const cached = await staticCache.match(request, MATCH_OPTIONS);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) staticCache.put(request, response.clone());
        return response;
      }

      const pagesCache = await caches.open(PAGES_CACHE);
      const cached = await pagesCache.match(request, MATCH_OPTIONS);
      if (cached) return cached;
      return fetch(request);
    })()
  );
});
