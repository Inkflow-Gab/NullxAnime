// A release is an immutable app shell. Never revalidate individual cached modules:
// combining files from different releases can break JavaScript imports.
const VERSION = 'nx-v21';
const META = 'nullxanime-sw-meta';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/base.css', 'css/components.css', 'css/pages.css',
  'assets/astral-emblem.png', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/cover-placeholder.svg', 'assets/release-sigil.svg', 'assets/fonts/Cinzel.ttf',
  'js/main.js', 'js/profile.js', 'js/config.js', 'js/router.js', 'js/util.js', 'js/store.js', 'js/cache.js', 'js/sources.js', 'js/player.js',
  'js/api/anilist.js', 'js/api/mangaTransport.js', 'js/api/asura.js', 'js/api/scans.js', 'js/api/community.js', 'js/api/kitsune.js', 'js/api/mangadex.js', 'js/api/archive.js',
  'js/ui/levelUp.js', 'js/ui/browseLayout.js', 'js/ui/readerTools.js', 'js/ui/update.js', 'js/ui/comicDiscovery.js', 'js/ui/seasons.js', 'js/ui/device.js', 'js/ui/icons.js', 'js/ui/components.js', 'js/ui/palette.js', 'js/ui/tv.js',
  'js/pages/profile.js', 'js/pages/adult.js', 'js/pages/comic.js', 'js/pages/home.js', 'js/pages/asura.js', 'js/pages/scans.js', 'js/pages/anime.js', 'js/pages/watch.js', 'js/pages/free.js', 'js/pages/mangaHome.js', 'js/pages/mangaDetail.js',
  'js/pages/reader.js', 'js/pages/releases.js', 'js/pages/search.js', 'js/pages/schedule.js', 'js/pages/library.js', 'js/pages/discover.js', 'js/pages/settings.js', 'js/pages/about.js',
  'js/data/directory.js', 'js/data/release.js',
];
const metaURL = (name) => new URL(`__nx_sw_meta__/${name}`, self.registration.scope).href;
const clientURL = (id) => metaURL(`client/${encodeURIComponent(id)}`);
const isShellCache = (name) => /^nx-(?:v\d+|[a-f0-9]{7,40})$/i.test(name);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const meta = await caches.open(META);
    const active = await meta.match(metaURL('active'));
    // Cache-busting avoids an HTTP/CDN cache supplying an earlier release at install.
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL.map((path) => {
      const url = new URL(path, self.registration.scope);
      url.searchParams.set('nx_release', VERSION);
      return new Request(url, { cache: 'reload' });
    }));
    // The old worker updated individual files in place, so its cache can already be
    // inconsistent. Migrate legacy clients immediately, once, to the repaired shell.
    if (!active && names.some(isShellCache)) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const meta = await caches.open(META);
    const active = await meta.match(metaURL('active'));
    const names = await caches.keys();
    const previous = active ? await active.text() : names.filter((name) => isShellCache(name) && name !== VERSION).at(-1);
    const legacy = !active && !!previous;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
    if (!legacy && previous && previous !== VERSION) {
      // Tabs already running the previous release keep its complete shell until
      // they choose to reload, even after the new worker takes control.
      await Promise.all(windows.map((client) => meta.put(clientURL(client.id), new Response(previous))));
    }
    await meta.put(metaURL('active'), new Response(VERSION));
    await meta.put(metaURL(`owned/${encodeURIComponent(VERSION)}`), new Response(VERSION));
    await self.clients.claim();
    if (legacy) {
      // A previously broken ES module remains failed in the browser's module map;
      // a real navigation is required. Preserve the URL/hash and all local data.
      // Do not await navigation here: it needs activation to finish first.
      windows.forEach((client) => {
        if (typeof client.navigate === 'function') client.navigate(client.url).catch(() => {});
      });
    }
    // Remove only our own unused shells, never unrelated caches or user storage.
    const liveIds = new Set((await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).map((client) => client.id));
    const retained = new Set([VERSION]), owned = [];
    const ownedPrefix = new URL('__nx_sw_meta__/owned/', self.registration.scope).pathname;
    for (const request of await meta.keys()) {
      const url = new URL(request.url);
      if (url.pathname.startsWith(ownedPrefix)) { owned.push(request); continue; }
      const prefix = new URL('__nx_sw_meta__/client/', self.registration.scope).pathname;
      if (!url.pathname.startsWith(prefix)) continue;
      const id = decodeURIComponent(url.pathname.slice(prefix.length));
      if (liveIds.has(id)) retained.add(await (await meta.match(request)).text());
      else await meta.delete(request);
    }
    for (const request of owned) {
      const name = await (await meta.match(request)).text();
      if (isShellCache(name) && !retained.has(name)) { await caches.delete(name); await meta.delete(request); }
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url), scopePath = new URL(self.registration.scope).pathname;
  if (url.origin !== location.origin || !url.pathname.startsWith(scopePath) || url.pathname.slice(scopePath.length).startsWith('api/')) return;
  event.respondWith((async () => {
    const meta = await caches.open(META);
    const navigation = req.mode === 'navigate';
    if (navigation) {
      // Some browsers reuse a client ID on navigation. The new document must use
      // the new shell, not the version pinned to its previous document.
      if (event.clientId) await meta.delete(clientURL(event.clientId));
      if (event.resultingClientId) await meta.delete(clientURL(event.resultingClientId));
    }
    const pin = !navigation && event.clientId ? await meta.match(clientURL(event.clientId)) : null;
    const cache = await caches.open(pin ? await pin.text() : VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // Missing application code must not silently come from a different release.
    if (/^(?:js|css)\//.test(url.pathname.slice(scopePath.length))) return new Response('Application file unavailable. Reload after updating.', { status: 503 });
    return fetch(req);
  })());
});
