// Command-palette style search (Ctrl/Cmd+K or "/"). Searches anime (AniList) or manga (MangaDex) as you type.

import { html, render, $, $$, debounce, hashQuery } from '../util.js';
import { icon } from './icons.js';
import { titleOf, fromAnime, fromManga, PLACEHOLDER } from './components.js';
import { searchMedia } from '../api/anilist.js';
import { listManga } from '../api/mangadex.js';
import { getSearches, pushSearch, clearSearches, getSettings } from '../store.js';
import { go } from '../router.js';

let open = false;
let type = 'anime';
let results = [];
let sel = -1;
let seq = 0;

export function setPaletteType(t) { type = t; }

export function openPalette(initialType) {
  if (open) return;
  if (initialType) type = initialType;
  open = true; sel = -1; results = [];
  document.body.classList.add('no-scroll');
  const root = $('#overlay-root');
  const el = document.createElement('div');
  el.className = 'scrim'; el.id = 'palette';
  el.innerHTML = html`<div class="modal palette" role="dialog" aria-modal="true" aria-label="Search">
    <div class="palette-top">${icon('search')}<input id="pal-input" type="search" autocomplete="off" spellcheck="false" placeholder="Search anime or manga…" aria-label="Search">
      <div class="seg" id="pal-seg"><button data-t="anime">Anime</button><button data-t="manga">Manga</button></div></div>
    <div class="palette-list" id="pal-list"></div>
    <div class="pal-foot"><span><span class="kbd">↑</span> <span class="kbd">↓</span> navigate · <span class="kbd">Enter</span> open · <span class="kbd">Esc</span> close</span><span>Full results: type then press Enter</span></div>
  </div>`.toString();
  root.appendChild(el);
  const input = $('#pal-input', el);
  const paint = () => {
    $$('#pal-seg button', el).forEach((b) => b.classList.toggle('on', b.dataset.t === type));
    input.placeholder = type === 'anime' ? 'Search anime…' : 'Search manga, manhwa, manhua…';
  };
  const list = $('#pal-list', el);

  const drawIdle = () => {
    const recent = getSearches();
    render(list, recent.length ? html`<div class="popover-head muted" style="padding:6px 10px;font-size:12px;display:flex;justify-content:space-between"><span>RECENT</span><button data-clear style="color:var(--muted)">Clear</button></div>
      ${recent.map((r) => html`<div class="pal-item" data-q="${r}">${icon('clock')}<div class="t">${r}</div></div>`)}`
      : html`<div class="empty" style="padding:34px 10px"><p>Type to search. Try “Frieren”, “One Piece” or “Solo Leveling”.</p></div>`);
  };
  const draw = () => {
    if (!results.length) return;
    render(list, results.map((r, i) => html`<a class="pal-item ${i === sel ? 'sel' : ''}" href="${r.href}" data-i="${i}">
      <img src="${r.cover || PLACEHOLDER}" alt="" referrerpolicy="no-referrer"><div><div class="t">${r.title}</div><div class="s">${r.sub}</div></div></a>`));
  };
  const run = debounce(async () => {
    const q = input.value.trim();
    const my = seq;
    if (q.length < 2) { results = []; drawIdle(); return; }
    render(list, html`<div class="center-load" style="padding:30px"><div class="spinner"></div></div>`);
    try {
      let items;
      if (type === 'anime') items = (await searchMedia({ q, perPage: 7 })).items.map(fromAnime);
      else items = (await listManga({ q, limit: 7, order: { relevance: 'desc' }, lang: getSettings().mangaLang })).items.map(fromManga);
      if (my !== seq) return;
      results = items; sel = -1;
      if (!items.length) render(list, html`<div class="empty" style="padding:34px 10px"><p>No ${type} found for “${q}”. Press Enter to search everywhere.</p></div>`);
      else draw();
    } catch (e) {
      if (my === seq) render(list, type === 'manga' ? html`<div class="empty" style="padding:30px 10px"><p>MangaDex is unavailable. Try another source.</p><a class="btn" href="#/asura?q=${encodeURIComponent(q)}">Search Asura</a><a class="btn" href="#/manga">Manga sources</a></div>` : html`<div class="empty" style="padding:30px 10px"><p>${e.message}</p></div>`);
    }
  }, 280);

  const schedule = () => {
    ++seq; results = []; sel = -1; run.cancel();
    if (input.value.trim().length < 2) drawIdle();
    else { render(list, html`<div class="center-load" style="padding:30px"><div class="spinner"></div></div>`); run(); }
  };

  const close = () => {
    ++seq; run.cancel(); open = false; el.remove(); document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey, true);
  };
  const submit = () => {
    const q = input.value.trim();
    if (sel >= 0 && results[sel]) { pushSearch(q); close(); go(results[sel].href.slice(1)); return; }
    if (q) { pushSearch(q); close(); go(`/search${hashQuery({ type, q })}`); }
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); sel = (sel + 1) % results.length; draw(); $('.pal-item.sel', el)?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); sel = (sel - 1 + results.length) % results.length; draw(); $('.pal-item.sel', el)?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Tab' && e.shiftKey === false && document.activeElement === input) { e.preventDefault(); type = type === 'anime' ? 'manga' : 'anime'; paint(); schedule(); }
  };
  document.addEventListener('keydown', onKey, true);
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
  el.addEventListener('click', (e) => {
    const seg = e.target.closest('#pal-seg button');
    if (seg) { type = seg.dataset.t; paint(); schedule(); input.focus(); return; }
    if (e.target.closest('[data-clear]')) { clearSearches(); drawIdle(); return; }
    const rec = e.target.closest('[data-q]');
    if (rec) { input.value = rec.dataset.q; schedule(); input.focus(); return; }
    if (e.target.closest('a[href^="#/"]')) { pushSearch(input.value); close(); }
  });
  input.addEventListener('input', schedule);
  paint(); drawIdle(); input.focus();
}
