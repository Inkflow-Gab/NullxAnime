// Minimal hash router with lazy-loaded pages, cancellation and scroll restoration.
// Using the hash keeps GitHub Pages happy (no server rewrites needed) and makes every page deep-linkable.

import { render, $ } from './util.js';
import { errorBox } from './ui/components.js';

const routes = [
  ['/', () => import('./pages/home.js'), 'anime'],
  ['/anime/:id', () => import('./pages/anime.js'), 'anime'],
  ['/watch/:id/:ep', () => import('./pages/watch.js'), 'anime'],
  ['/free', () => import('./pages/free.js'), 'anime'],
  ['/manga', () => import('./pages/mangaHome.js'), 'manga'],
  ['/asura', () => import('./pages/asura.js'), 'manga'],
  ['/asura/:slug', () => import('./pages/asura.js'), 'manga'],
  ['/asura/:slug/:chapter', () => import('./pages/asura.js'), 'manga'],
  ['/scans/:source', () => import('./pages/scans.js'), 'manga'],
  ['/scans/:source/:slug', () => import('./pages/scans.js'), 'manga'],
  ['/scans/:source/:slug/:chapter', () => import('./pages/scans.js'), 'manga'],
  ['/comic/:source/:slug', () => import('./pages/comic.js'), 'manga'],
  ['/manga/:id', () => import('./pages/mangaDetail.js'), 'manga'],
  ['/read/:id/:chapter', () => import('./pages/reader.js'), 'manga'],
  ['/search', () => import('./pages/search.js'), null],
  ['/releases', () => import('./pages/releases.js'), 'anime'],
  ['/schedule', () => import('./pages/schedule.js'), 'schedule'],
  ['/library', () => import('./pages/library.js'), 'library'],
  ['/discover', () => import('./pages/discover.js'), 'discover'],
  ['/settings', () => import('./pages/settings.js'), 'settings'],
  ['/about', () => import('./pages/about.js'), 'discover'],
].map(([pattern, load, nav]) => ({
  pattern, load, nav,
  re: new RegExp('^' + pattern.replace(/:[a-z]+/gi, '([^/]+)') + '/?$'),
  keys: (pattern.match(/:[a-z]+/gi) || []).map((k) => k.slice(1)),
}));

let current = { cleanups: [], token: 0, hash: '' };
const scrollMemo = new Map();
let freshNav = false;
const listeners = new Set();
export const onRoute = (fn) => listeners.add(fn);

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(query)) };
}
export const go = (to, { replace = false } = {}) => {
  if (replace) location.replace(`#${to}`); else location.hash = to;
};
export const reload = () => resolve(true);

export function setTitle(t) { document.title = t ? `${t} · NullxAnime` : 'NullxAnime — Anime & Manga, sleek and simple'; }

async function resolve(force = false) {
  const { path, query } = parseHash();
  const hash = location.hash || '#/';
  if (!force && hash === current.hash) return;
  scrollMemo.set(current.hash, window.scrollY);
  const token = ++current.token;
  current.cleanups.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  current.cleanups = [];
  current.hash = hash;

  const app = $('#app');
  // A fresh route root disposes delegated listeners from the previous page.
  const routeRoot = document.createElement('div');
  routeRoot.className = 'route-root';
  app.replaceChildren(routeRoot);
  let match = null, params = {};
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) { match = r; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]))); break; }
  }
  document.body.classList.remove('no-scroll');
  if (!match) {
    setTitle('Not found');
    render(routeRoot, (await import('./ui/components.js')).emptyBox('compass', 'Page not found', 'That page does not exist. Let’s get you back home.',
      (await import('./util.js')).html`<a class="btn primary" href="#/">Go home</a>`));
    notify(null, path);
    return;
  }

  const ctx = {
    params, query, path, el: routeRoot, token,
    alive: () => token === current.token,
    cleanup: (fn) => { if (token === current.token) current.cleanups.push(fn); else fn(); },
    render: (safe) => { if (token === current.token) render(routeRoot, safe); },
    setTitle,
  };
  notify(match.nav, path);
  try {
    const mod = await match.load();
    if (!ctx.alive()) return;
    await mod.default(ctx);
  } catch (err) {
    console.error(err);
    if (ctx.alive()) ctx.render(errorBox(err));
  }
  if (!ctx.alive()) return;
  // restore scroll for back/forward, otherwise go to top
  const y = !freshNav && scrollMemo.has(hash) ? scrollMemo.get(hash) : 0;
  freshNav = false;
  requestAnimationFrame(() => { if (ctx.alive()) window.scrollTo(0, y); });
  app.focus({ preventScroll: true });
}

function notify(nav, path) { listeners.forEach((fn) => fn(nav, path)); }

export function startRouter() {
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href^="#/"]') : null;
    if (a) freshNav = true;
  });
  window.addEventListener('hashchange', () => resolve());
  resolve(true);
}
