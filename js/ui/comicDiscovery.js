// Browse source catalogues without requiring a provider choice first.
import { html, render, $, timeAgo, hashQuery, requestTimeout } from '../util.js';
import { asuraSearch } from '../api/asura.js';
import { scansSearch } from '../api/scans.js';
import { listManga } from '../api/mangadex.js';
import { getSettings } from '../store.js';
import { PROVIDER_ENDPOINTS } from '../config.js';
import { icon } from './icons.js';
import { PLACEHOLDER, skelGrid } from './components.js';
import { go } from '../router.js';

// A manual, read-only check. These are public sample endpoints, not a test of
// every title. No title searches or reading history are sent to a third party.
const CHECKS = [
  { label: 'Asura direct catalogue', type: 'json', key: 'data', url: 'https://api.asurascans.com/api/series?limit=1&offset=0' },
  { label: 'Vortex direct catalogue', type: 'json', key: 'posts', url: 'https://api.vortexscans.org/api/query?perPage=1&page=1' },
  { label: 'MangaDex catalogue', type: 'json', key: 'data', url: 'https://api.mangadex.org/manga?limit=1' },
  { label: 'Asura sample page image', type: 'image', url: 'https://cdn.asurascans.com/asura-images/chapters/martial-god-regressed-to-level-2/1/001.webp?v=1770499638' },
  { label: 'Vortex sample page image', type: 'image', url: 'https://storage.vortexscans.org/upload/series/the-northern-grand-dukes-mad-son-in-law/6f3d5d84-f363-4167-bbd4-bd2aac7fd05d/page-0001_01_1793624791524-376132.webp' },
];
if (PROVIDER_ENDPOINTS.mangaGateway) {
  const base = PROVIDER_ENDPOINTS.mangaGateway.replace(/\/$/, '');
  CHECKS.splice(2, 0,
    { label: 'Asura through relay', type: 'json', key: 'data', url: `${base}/asura/series?limit=1&offset=0` },
    { label: 'Vortex through relay', type: 'json', key: 'posts', url: `${base}/vortex/api/query?perPage=1&page=1` });
}

async function checkConnection(test) {
  if (test.type === 'image') return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    const finish = (message) => { clearTimeout(timer); img.onload = img.onerror = null; resolve(message); };
    const timer = setTimeout(() => finish('Timed out'), 8000);
    img.onload = () => finish(img.naturalWidth ? 'Loaded' : 'Could not load');
    img.onerror = () => finish('Could not load');
    img.src = test.url;
  });
  try {
    const response = await fetch(test.url, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' }, signal: requestTimeout(8000) });
    if (!response.ok) return `HTTP ${response.status}`;
    try { const body = await response.json(); return Array.isArray(body[test.key]) ? 'Connected' : 'Invalid response or provider check'; } catch { return 'Invalid response or provider check'; }
  } catch { return 'Blocked, timed out, or offline'; }
}

export async function mountComicDiscovery(ctx) {
  const box = $('#comic-discovery', ctx.el);
  if (!box) return;
  const q = String(ctx.query.q || '').trim().slice(0, 150);
  const sort = ctx.query.sort === 'popular' ? 'popular' : 'latest';
  const link = (s) => `#/manga${hashQuery({ q, sort: s === 'latest' ? '' : s })}`;
  render(box, html`<section class="section comic-discovery">
    <div class="search-head"><div><h1 class="page-title">Manga &amp; manhwa</h1><p class="muted">Explore available catalogues together. Open a title, then find its chapters by provider.</p></div></div>
    <form id="comic-search" class="filter-bar"><label class="sr-only" for="comic-query">Search manga and manhwa</label><input class="input" id="comic-query" value="${q}" placeholder="Search manga, manhwa or manhua…" style="max-width:500px;flex:1"><button class="btn primary">${icon('search')} Search</button>${q ? html`<a class="btn" href="#/manga${hashQuery({ sort: sort === 'popular' ? sort : '' })}">Clear</a>` : ''}</form>
    <nav class="seg comic-sort" id="comic-sort" aria-label="Manga sorting"><a href="${link('latest')}" class="${sort === 'latest' ? 'on' : ''}" ${sort === 'latest' ? html`aria-current="page"` : ''}>Latest</a><a href="${link('popular')}" class="${sort === 'popular' ? 'on' : ''}" ${sort === 'popular' ? html`aria-current="page"` : ''}>Popular</a></nav>
    <h2>${q ? `Matches for “${q}”` : sort === 'popular' ? 'Popular manga & manhwa' : 'Recently updated'}</h2>
    <p class="muted comic-help">${sort === 'popular' ? 'Popular results from each source, mixed together; not a single global ranking.' : 'Recent results from each source; ordering is limited to the titles returned.'} Chapter access can change.</p>
    <div id="comic-results">${skelGrid(8)}</div><div id="comic-status" class="muted" role="status"></div>
    <details class="comic-diagnostic"><summary>Having trouble connecting?</summary><p class="muted">Check direct and relay catalogue connections and sample page images from this device. Manga searches and chapter requests may go through the relay. This does not test every title. A failure may be caused by the provider, browser, network, or region.</p><button class="btn sm" id="comic-check" type="button">Check connections</button><div id="comic-check-results" role="status" aria-live="polite"></div></details>
  </section>`);
  $('#comic-search', box).addEventListener('submit', (e) => {
    e.preventDefault();
    const term = $('#comic-query', box).value.trim().slice(0, 150);
    go(`/manga${hashQuery({ q: term, sort: sort === 'popular' ? sort : '' })}`);
  });
  $('#comic-check', box).addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const out = $('#comic-check-results', box), state = CHECKS.map(() => 'Checking…');
    const paintChecks = () => {
      if (!ctx.alive()) return;
      render(out, html`<ul class="comic-check-list">${CHECKS.map((test, i) => html`<li><span>${test.label}</span><b>${state[i]}</b></li>`)}</ul><p class="muted">You can share a screenshot of these results for troubleshooting.</p>`);
    };
    paintChecks();
    await Promise.all(CHECKS.map(async (test, i) => { state[i] = await checkConnection(test); paintChecks(); }));
    if (ctx.alive()) button.disabled = false;
  });
  const requests = [
    { name: 'Asura', source: 'asura', promise: asuraSearch(q, 1, sort) },
    { name: 'Vortex', source: 'vortex', promise: scansSearch('vortex', q, 1, sort) },
    { name: 'MangaDex', source: 'mangadex', promise: listManga({ q, limit: 20, lang: getSettings().mangaLang, order: sort === 'popular' ? { followedCount: 'desc' } : { latestUploadedChapter: 'desc' } }) },
  ];
  const results = Array(requests.length).fill(null);
  const paint = () => {
    if (!ctx.alive()) return;
    const lists = results.map((r, i) => r?.status === 'fulfilled' ? r.value.items.map((item) => ({ ...item, slug: item.slug || item.id, type: item.type === 'manga' ? 'Manga' : item.type, updatedAt: typeof item.updatedAt === 'string' ? Date.parse(item.updatedAt) || 0 : item.updatedAt, source: requests[i].source, sourceName: requests[i].name })) : []);
    let entries;
    if (sort === 'popular') {
      entries = [];
      for (let i = 0; i < Math.max(0, ...lists.map((list) => list.length)); i++) for (const list of lists) if (list[i]) entries.push(list[i]);
    } else entries = lists.flat().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const failed = results.flatMap((r, i) => r?.status === 'rejected' ? [requests[i].name] : []);
    const seen = new Set();
    const unique = entries.filter((it) => { const key = it.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); if (seen.has(key)) return false; seen.add(key); return true; });
    if (unique.length || results.every(Boolean)) render($('#comic-results', box), unique.length ? html`<div class="grid" id="comic-grid">${unique.map((it) => html`<article class="card"><a class="poster" href="#/comic/${it.source}/${encodeURIComponent(it.slug)}?title=${encodeURIComponent(it.title)}" aria-label="${it.title}"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${it.cover || PLACEHOLDER}" alt=""><span class="shade"></span><span class="tl"><span class="badge accent">${it.type}</span></span><span class="play">${icon('book')}</span></a><a class="meta" href="#/comic/${it.source}/${encodeURIComponent(it.slug)}?title=${encodeURIComponent(it.title)}"><div class="title">${it.title}</div><div class="sub">${it.updatedAt ? `Updated ${timeAgo(it.updatedAt)}` : 'Open to find chapters'}</div></a></article>`)}</div>` : html`<p class="notice">${failed.length ? 'No results were returned and some catalogues could not be reached. Try again or use the connection check below.' : q ? 'No matches were returned. Try another title or spelling.' : 'No catalogue results are available right now. Try the connection check below.'}</p>`);
    const pending = results.filter((r) => !r).length;
    render($('#comic-status', box), html`${pending ? html`<p>Checking ${pending} more source${pending === 1 ? '' : 's'}…</p>` : ''}${failed.length ? html`<p>${failed.join(', ')} could not be reached. Other catalogues may still work.</p><button class="btn sm" data-action="retry">Try again</button>` : ''}`);
  };
  await Promise.all(requests.map(async (request, i) => {
    try { results[i] = { status: 'fulfilled', value: await request.promise }; }
    catch { results[i] = { status: 'rejected' }; }
    paint();
  }));
}
