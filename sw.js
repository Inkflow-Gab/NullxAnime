// NullxAnime service worker: app-shell caching so the site opens instantly and works offline (cached pages only).
// API calls (AniList, MangaDex, Internet Archive) and media are never cached here.

const VERSION = 'nx-v11';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/base.css', 'css/components.css', 'css/pages.css',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/fonts/Cinzel.ttf',
  'js/main.js', 'js/config.js', 'js/router.js', 'js/util.js', 'js/store.js', 'js/cache.js', 'js/sources.js', 'js/player.js',
  'js/api/anilist.js', 'js/api/asura.js', 'js/api/scans.js', 'js/api/community.js', 'js/api/kitsune.js', 'js/api/mangadex.js', 'js/api/archive.js',
  'js/ui/device.js', 'js/ui/icons.js', 'js/ui/components.js', 'js/ui/palette.js', 'js/ui/tv.js',
  'js/pages/home.js', 'js/pages/asura.js', 'js/pages/scans.js', 'js/pages/anime.js', 'js/pages/watch.js', 'js/pages/free.js', 'js/pages/mangaHome.js', 'js/pages/mangaDetail.js',
  'js/pages/reader.js', 'js/pages/releases.js', 'js/pages/search.js', 'js/pages/schedule.js', 'js/pages/library.js', 'js/pages/discover.js', 'js/pages/settings.js', 'js/pages/about.js',
  'js/data/directory.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scopePath = new URL(self.registration.scope).pathname;
  if (url.origin !== location.origin || url.pathname.slice(scopePath.length).startsWith('api/')) return; // API responses and third-party assets go to the network
  // stale-while-revalidate for our own static files
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
