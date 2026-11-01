// My List — the built-in tracker (stored in your browser). Anime + manga, stats, backup & MAL export.

import { html, render, $, $$, on, download, fmtNum, timeAgo, titleCase } from '../util.js';
import { icon } from '../ui/icons.js';
import { allEntries, saveEntry, removeEntry, STATUSES, statusLabel, subscribe, getHistory, removeHistory, exportAll, importAll } from '../store.js';
import { continueCard, rail, toast, emptyBox, PLACEHOLDER } from '../ui/components.js';
import { mediaByIds } from '../api/anilist.js';

const SORTS = [['updated', 'Recently updated'], ['title', 'Title'], ['score', 'My score'], ['progress', 'Progress']];

export default async function library(ctx) {
  ctx.setTitle('My list');
  let type = ctx.query.type === 'manga' ? 'manga' : 'anime';
  let status = ctx.query.status || 'all';
  let sort = 'updated';
  let q = '';

  const draw = () => {
    const all = allEntries(type);
    const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((e) => e.status === s).length]));
    let list = all.filter((e) => (status === 'all' || e.status === status) && (!q || e.title.toLowerCase().includes(q.toLowerCase())));
    list.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'score' ? (b.score || 0) - (a.score || 0) : sort === 'progress' ? (b.progress || 0) - (a.progress || 0) : b.updatedAt - a.updatedAt);
    const hist = getHistory(type).slice(0, 12);
    const eps = allEntries('anime').reduce((n, e) => n + (e.progress || 0), 0);
    const chs = allEntries('manga').reduce((n, e) => n + (e.progress || 0), 0);
    const scored = all.filter((e) => e.score);
    const mean = scored.length ? (scored.reduce((n, e) => n + e.score, 0) / scored.length).toFixed(1) : '–';

    ctx.render(html`<div class="container page">
      <div class="search-head"><div><h1 class="page-title">My list</h1><p class="muted">Saved in this browser — no account needed. Back it up from Settings.</p></div>
        <div class="seg"><button class="${type === 'anime' ? 'on' : ''}" data-type="anime">${icon('tv')} Anime</button><button class="${type === 'manga' ? 'on' : ''}" data-type="manga">${icon('book')} Manga</button></div></div>

      <div class="stats">
        <div class="stat"><b>${allEntries('anime').length}</b><span>Anime tracked</span></div>
        <div class="stat"><b>${fmtNum(eps)}</b><span>Episodes watched</span></div>
        <div class="stat"><b>${(eps * 24 / 60).toFixed(0)}h</b><span>Approx. watch time</span></div>
        <div class="stat"><b>${allEntries('manga').length}</b><span>Manga tracked</span></div>
        <div class="stat"><b>${fmtNum(chs)}</b><span>Chapters read</span></div>
        <div class="stat"><b>${mean}</b><span>Mean score (${type})</span></div>
      </div>

      ${hist.length ? rail({ title: type === 'anime' ? 'Continue watching' : 'Continue reading', items: hist.map(continueCard), land: true }) : ''}

      <div class="section">
        <div class="filter-bar" style="margin-bottom:14px">
          <div class="tabs-scroll" style="flex:1">
            <button class="chip ${status === 'all' ? 'active' : ''}" data-status="all">All <b>${all.length}</b></button>
            ${STATUSES.map((s) => html`<button class="chip ${status === s ? 'active' : ''}" data-status="${s}">${statusLabel(s, type)} <b>${counts[s]}</b></button>`)}
          </div>
          <div class="filter-search" style="max-width:220px">${icon('search')}<input class="input" id="lq" placeholder="Filter…" value="${q}"></div>
          <select class="select" id="lsort" style="width:auto">${SORTS.map(([v, l]) => html`<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`)}</select>
        </div>
        ${list.length ? html`<div class="lib-cards">${list.map((e) => entryCard(e))}</div>`
          : emptyBox(type === 'anime' ? 'tv' : 'book', all.length ? 'Nothing here' : `Your ${type} list is empty`, all.length ? 'No entries match this filter.' : `Tap the + on any ${type} card to start tracking.`, html`<a class="btn primary" href="${type === 'anime' ? '#/' : '#/manga'}">Discover ${type}</a>`)}
      </div>
    </div>`);
  };

  const entryCard = (e) => {
    const href = e.type === 'anime' ? `#/anime/${e.id}` : `#/manga/${e.id}`;
    const pct = e.total ? Math.min(100, (e.progress / e.total) * 100) : 0;
    return html`<div class="lib-card" data-id="${e.id}">
      <a class="lc-poster" href="${href}"><img loading="lazy" src="${e.cover || PLACEHOLDER}" alt="" referrerpolicy="no-referrer"></a>
      <div class="lc-body">
        <a class="lc-title clamp-2" href="${href}">${e.title}</a>
        <div class="muted lc-sub">${statusLabel(e.status, e.type)} · updated ${timeAgo(e.updatedAt)}</div>
        <div class="progress" style="margin:8px 0 6px"><i style="width:${pct}%"></i></div>
        <div class="row" style="gap:8px">
          <button class="icon-btn sm" data-step="-1" aria-label="Minus one">${icon('minus')}</button>
          <b>${e.progress}</b><span class="muted">/ ${e.total || '?'} ${e.type === 'anime' ? 'ep' : 'ch'}</span>
          <button class="icon-btn sm" data-step="1" aria-label="Plus one">${icon('plus')}</button>
          <span class="spacer"></span>
          <select class="select sm" data-score aria-label="Score" style="width:auto"><option value="0">–</option>${Array.from({ length: 10 }, (_, i) => 10 - i).map((s) => html`<option value="${s}" ${e.score === s ? 'selected' : ''}>★ ${s}</option>`)}</select>
          <select class="select sm" data-st aria-label="Status" style="width:auto">${STATUSES.map((s) => html`<option value="${s}" ${e.status === s ? 'selected' : ''}>${statusLabel(s, e.type)}</option>`)}<option value="__rm">Remove</option></select>
        </div>
      </div></div>`;
  };

  draw();
  on(ctx.el, 'click', '[data-type]', (e, t) => { type = t.dataset.type; status = 'all'; draw(); });
  on(ctx.el, 'click', '[data-status]', (e, t) => { status = t.dataset.status; draw(); });
  on(ctx.el, 'change', '#lsort', (e, t) => { sort = t.value; draw(); });
  on(ctx.el, 'input', '#lq', (e, t) => { q = t.value; const pos = t.selectionStart; draw(); const n = $('#lq'); n.focus(); n.setSelectionRange(pos, pos); });
  const entryOf = (t) => { const id = t.closest('.lib-card').dataset.id; return { id, e: allEntries(type).find((x) => x.id === id) }; };
  on(ctx.el, 'click', '[data-step]', (ev, t) => { const { id, e } = entryOf(t); const p = Math.max(0, Math.min(e.progress + Number(t.dataset.step), e.total || 99999)); saveEntry(type, id, { progress: p }); });
  on(ctx.el, 'change', '[data-score]', (ev, t) => { const { id } = entryOf(t); saveEntry(type, id, { score: Number(t.value) }); });
  on(ctx.el, 'change', '[data-st]', (ev, t) => {
    const { id } = entryOf(t);
    if (t.value === '__rm') { removeEntry(type, id); toast('Removed from list'); } else saveEntry(type, id, { status: t.value });
  });
  ctx.cleanup(subscribe((k) => { if (ctx.alive() && ['library', 'history', 'import'].includes(k) && !document.activeElement?.matches?.('#lq')) { const y = window.scrollY; draw(); window.scrollTo(0, y); } }));
}

/** Build a MyAnimeList-compatible XML export (also importable by AniList). */
export async function exportMalXml() {
  const entries = allEntries('anime');
  const mal = new Map();
  for (let i = 0; i < entries.length; i += 50) {
    const chunk = entries.slice(i, i + 50);
    const media = await mediaByIds(chunk.map((e) => e.id));
    media.forEach((m) => m.idMal && mal.set(String(m.id), m.idMal));
  }
  const st = { current: 'Watching', planning: 'Plan to Watch', completed: 'Completed', paused: 'On-Hold', dropped: 'Dropped' };
  const rows = entries.filter((e) => mal.has(e.id)).map((e) => `  <anime>
    <series_animedb_id>${mal.get(e.id)}</series_animedb_id>
    <series_title><![CDATA[${e.title.replace(/]]>/g, '')}]]></series_title>
    <my_watched_episodes>${e.progress || 0}</my_watched_episodes>
    <my_score>${e.score || 0}</my_score>
    <my_status>${st[e.status] || 'Plan to Watch'}</my_status>
    <update_on_import>1</update_on_import>
  </anime>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8" ?>\n<myanimelist>\n  <myinfo><user_export_type>1</user_export_type></myinfo>\n${rows}\n</myanimelist>\n`;
  return { xml, exported: mal.size, skipped: entries.length - mal.size };
}
