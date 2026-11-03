// Browse source catalogues without requiring a provider choice first.
import { html, render, $, timeAgo } from '../util.js';
import { asuraSearch } from '../api/asura.js';
import { scansSearch } from '../api/scans.js';
import { listManga } from '../api/mangadex.js';
import { getSettings } from '../store.js';
import { icon } from './icons.js';
import { PLACEHOLDER, skelGrid } from './components.js';
import { go } from '../router.js';

export async function mountComicDiscovery(ctx) {
  const box = $('#comic-discovery', ctx.el);
  if (!box) return;
  const q = String(ctx.query.q || '').trim().slice(0, 150);
  render(box, html`<section class="section comic-discovery"><div class="search-head"><div><h1 class="page-title">Manga &amp; manhwa</h1><p class="muted">Recent updates from available catalogues. Open a title, then find its chapters by provider.</p></div></div><form id="comic-search" class="filter-bar"><label class="sr-only" for="comic-query">Search manga and manhwa</label><input class="input" id="comic-query" value="${q}" placeholder="Search manga, manhwa or manhua…" style="max-width:500px;flex:1"><button class="btn primary">${icon('search')} Search</button>${q ? html`<a class="btn" href="#/manga">Clear</a>` : ''}</form><h2>${q ? `Matches for “${q}”` : 'Recently updated'}</h2><p class="muted comic-help">Showing the latest results from each reachable source; chapter access can change.</p><div id="comic-results">${skelGrid(8)}</div><div id="comic-status" class="muted" role="status"></div></section>`);
  $('#comic-search', box).addEventListener('submit', (e) => { e.preventDefault(); const term = $('#comic-query', box).value.trim().slice(0, 150); go(term ? `/manga?q=${encodeURIComponent(term)}` : '/manga'); });
  const requests = [
    { name: 'Asura', source: 'asura', promise: asuraSearch(q, 1, q ? 'popular' : 'latest') },
    { name: 'Vortex', source: 'vortex', promise: scansSearch('vortex', q, 1, q ? 'popular' : 'latest') },
    { name: 'MangaDex', source: 'mangadex', promise: listManga({ q, limit: 20, lang: getSettings().mangaLang, order: q ? { relevance: 'desc' } : { latestUploadedChapter: 'desc' } }) },
  ];
  const results = Array(requests.length).fill(null);
  const paint = () => {
    if (!ctx.alive()) return;
    const entries = results.flatMap((r, i) => r?.status === 'fulfilled' ? r.value.items.map((item) => ({ ...item, slug: item.slug || item.id, type: item.type === 'manga' ? 'Manga' : item.type, updatedAt: typeof item.updatedAt === 'string' ? Date.parse(item.updatedAt) || 0 : item.updatedAt, source: requests[i].source, sourceName: requests[i].name })) : []);
    if (!q) entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const seen = new Set();
    const unique = entries.filter((it) => { const key = it.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); if (seen.has(key)) return false; seen.add(key); return true; });
    if (unique.length || results.every(Boolean)) render($('#comic-results', box), unique.length ? html`<div class="grid" id="comic-grid">${unique.map((it) => html`<article class="card"><a class="poster" href="#/comic/${it.source}/${encodeURIComponent(it.slug)}?title=${encodeURIComponent(it.title)}" aria-label="${it.title}"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${it.cover || PLACEHOLDER}" alt=""><span class="shade"></span><span class="tl"><span class="badge accent">${it.type}</span></span><span class="play">${icon('book')}</span></a><a class="meta" href="#/comic/${it.source}/${encodeURIComponent(it.slug)}?title=${encodeURIComponent(it.title)}"><div class="title">${it.title}</div><div class="sub">${it.updatedAt ? `Updated ${timeAgo(it.updatedAt)}` : 'Open to find chapters'}</div></a></article>`)}</div>` : html`<p class="notice">${q ? 'No matches were returned. Try another title or spelling.' : 'No catalogue results are available right now. Try the sources below.'}</p>`);
    const failed = results.flatMap((r, i) => r?.status === 'rejected' ? [requests[i].name] : []);
    const pending = results.filter((r) => !r).length;
    render($('#comic-status', box), html`<p>${pending ? `Checking ${pending} more source${pending === 1 ? '' : 's'}… ` : ''}${failed.length ? `${failed.join(', ')} could not be reached. Other catalogues may still work.` : ''}</p>`);
  };
  await Promise.all(requests.map(async (request, i) => {
    try { results[i] = { status: 'fulfilled', value: await request.promise }; }
    catch { results[i] = { status: 'rejected' }; }
    paint();
  }));
}
