// A title-centric provider picker. Matches are suggested, never silently merged.
import { html, render, $, cleanAniHtml } from '../util.js';
import { icon } from '../ui/icons.js';
import { asuraDetails, asuraSearch, asuraChapters } from '../api/asura.js';
import { scansDetails, scansSearch, scansChapters } from '../api/scans.js';
import { listManga, chapterFeed, mangaDetail } from '../api/mangadex.js';
import { getSettings } from '../store.js';
import { PLACEHOLDER, errorBox, skelGrid } from '../ui/components.js';

const labels = { asura: 'Asura Scans', vortex: 'Vortex Scans', mangadex: 'MangaDex', hive: 'Hivetoons' };
const key = (s) => String(s || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function rank(title, candidate) {
  const a = key(title), b = key(candidate);
  if (a === b && a) return 3;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return 2;
  const words = a.split(' ').filter((w) => w.length > 2), bw = new Set(b.split(' '));
  return words.length && words.filter((w) => bw.has(w)).length / words.length >= .7 ? 1 : 0;
}
export default async function comic(ctx) {
  const { source, slug } = ctx.params;
  if (source === 'mangadex' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) { ctx.render(errorBox(new Error('Invalid MangaDex title.'))); return; }
  if (!['asura', 'vortex', 'mangadex'].includes(source)) { ctx.render(errorBox(new Error('Unknown catalogue.'))); return; }
  ctx.render(html`<div class="container page">${skelGrid(3)}</div>`);
  let item;
  try { item = source === 'asura' ? await asuraDetails(slug) : source === 'mangadex' ? await mangaDetail(slug) : await scansDetails(source, slug);
    if (source === 'mangadex' && ['erotica', 'pornographic'].includes(item.contentRating) && getSettings().adultManga !== true) throw new Error('Enable 18+ manga in Settings to view this title.'); }
  catch (e) {
    if (source === 'mangadex' && /18\+/.test(e.message)) { if (ctx.alive()) ctx.render(html`<div class="container page">${errorBox(e)}</div>`); return; }
    const title = String(ctx.query.title || '').trim().slice(0, 150);
    if (!title) { if (ctx.alive()) ctx.render(html`<div class="container page">${errorBox(e)}<a class="btn" href="#/manga">Back to manga</a></div>`); return; }
    item = { slug, id: slug, title, cover: '', description: '', type: 'Comic', status: '' };
  }
  if (!ctx.alive()) return;
  ctx.setTitle(item.title);
  ctx.render(html`<div class="container page"><a class="btn sm ghost" href="#/manga">${icon('chevL')} Manga &amp; manhwa</a><div class="asura-detail"><img class="asura-poster" src="${item.cover || PLACEHOLDER}" referrerpolicy="no-referrer" alt=""><div><div class="chips"><span class="badge accent">${item.type}</span>${item.status ? html`<span class="badge">${item.status}</span>` : ''}</div><h1 class="page-title">${item.title}</h1><div class="detail-desc">${cleanAniHtml(item.description)}</div></div></div><section class="section"><h2>Find chapters</h2><p class="muted">Choose a provider. Confirm the matching title before reading; chapter availability varies.</p><div class="chips comic-providers" id="comic-providers">${['asura', 'vortex', 'mangadex', 'hive'].map((p) => html`<button class="chip ${source === p ? 'active' : ''}" data-provider="${p}">${labels[p]}${p === 'hive' ? ' · experimental' : ''}</button>`)}<span class="chip" title="A browser-compatible chapter source is not available" aria-label="MangaFire unavailable">MangaFire · unavailable</span></div><p class="muted comic-help">MangaFire needs a compatible service; Hivetoons images may be blocked. No website is embedded.</p><form id="comic-match-search" class="filter-bar" hidden><label class="sr-only" for="comic-match-query">Provider search title</label><input class="input" id="comic-match-query" style="max-width:500px;flex:1" maxlength="150" placeholder="Try another title or spelling"><button class="btn">${icon('search')} Search provider</button></form><div id="comic-provider-results" aria-live="polite"></div></section></div>`);
  const results = $('#comic-provider-results', ctx.el);
  let serial = 0, activeProvider = source;
  async function showChapters(provider, match, task) {
    render(results, html`<p class="muted">Checking chapters on ${labels[provider]}…</p>`);
    try {
      let chapters, href;
      if (provider === 'asura') { chapters = await asuraChapters(match.slug); href = (c) => `#/asura/${encodeURIComponent(match.slug)}/${c.number}`; }
      else if (provider === 'mangadex') { chapters = await chapterFeed(match.id, getSettings().mangaLang); href = (c) => `#/read/${match.id}/${c.id}`; }
      else { chapters = await scansChapters(provider, match.slug, match.id); href = (c) => `#/scans/${provider}/${encodeURIComponent(match.slug)}/${c.id}`; }
      if (!ctx.alive() || task !== serial) return;
      render(results, html`<div class="section-head"><div><h3>${match.title}</h3><p class="muted">${labels[provider]} · ${chapters.length} unlocked chapters${provider === 'mangadex' ? ` · ${getSettings().mangaLang.toUpperCase()}` : ''}</p></div>${chapters.length ? html`<a class="btn primary" href="${href(chapters[0])}">${icon('book')} Read first chapter</a>` : ''}</div>${chapters.length ? html`<div class="ch-list">${chapters.slice().reverse().map((c) => html`<a class="ch" href="${href(c)}"><span class="ch-main"><b>${provider === 'mangadex' ? `Chapter ${c.chapter || '?'}` : provider === 'asura' ? `Chapter ${c.number}` : c.label}</b>${c.title ? html`<span class="ch-title">${c.title}</span>` : ''}</span></a>`)}</div>` : html`<p class="muted">No unlocked chapters were returned for this title and language.</p>`}`);
    } catch (e) { if (ctx.alive() && task === serial) render(results, html`<p class="notice">${labels[provider]} could not load chapters: ${e.message}</p>`); }
  }
  async function select(provider, query = item.title) {
    activeProvider = provider;
    const searchForm = $('#comic-match-search', ctx.el);
    searchForm.hidden = provider === source;
    $('#comic-match-query', ctx.el).value = query;
    const task = ++serial;
    ctx.el.querySelectorAll('[data-provider]').forEach((b) => b.classList.toggle('active', b.dataset.provider === provider));
    if (provider === source) { await showChapters(provider, item, task); return; }
    render(results, html`<p class="muted">Searching ${labels[provider]} for “${query}”…</p>`);
    try {
      const r = provider === 'asura' ? await asuraSearch(query) : provider === 'mangadex' ? await listManga({ q: query, limit: 20, order: { relevance: 'desc' }, lang: getSettings().mangaLang }) : await scansSearch(provider, query);
      if (!ctx.alive() || task !== serial) return;
      const matches = r.items.map((m) => ({ ...m, score: rank(query, m.title) })).filter((m) => m.score).sort((a, b) => b.score - a.score).slice(0, 8);
      if (!matches.length) { render(results, html`<p class="notice">No matching titles found on ${labels[provider]}. Try another provider.</p>`); return; }
      render(results, html`<p class="muted">Choose the correct title on ${labels[provider]}:</p><div class="comic-matches">${matches.map((m, i) => html`<button class="comic-match" data-match="${i}"><img src="${m.cover || PLACEHOLDER}" alt="" referrerpolicy="no-referrer"><span><b>${m.title}</b><small>${m.type || 'Manga'} · Check chapters</small></span>${icon('chevR')}</button>`)}</div>`);
      results.querySelectorAll('[data-match]').forEach((b) => b.addEventListener('click', () => showChapters(provider, matches[Number(b.dataset.match)], ++serial)));
    } catch (e) { if (ctx.alive() && task === serial) render(results, html`<p class="notice">${labels[provider]} could not be searched: ${e.message}</p>`); }
  }
  $('#comic-providers', ctx.el).addEventListener('click', (e) => { const button = e.target.closest('[data-provider]'); if (button) select(button.dataset.provider); });
  $('#comic-match-search', ctx.el).addEventListener('submit', (e) => { e.preventDefault(); const term = $('#comic-match-query', ctx.el).value.trim().slice(0, 150); if (term) select(activeProvider, term); });
  await select(source);
}
