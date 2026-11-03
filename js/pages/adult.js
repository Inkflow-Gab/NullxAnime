// Opt-in catalogue only. AniList provides metadata, not a guarantee of playable streams.
import { html, render, $ } from '../util.js';
import { getSettings } from '../store.js';
import { searchMedia } from '../api/anilist.js';
import { card, fromAnime, errorBox, skelGrid, emptyBox } from '../ui/components.js';
import { layoutControls, layoutClass, bindBrowseLayout } from '../ui/browseLayout.js';
import { go } from '../router.js';

export default function adult(ctx) {
  ctx.setTitle('Hentai');
  if (getSettings().adultManga !== true) {
    ctx.render(html`<div class="container page"><div class="empty"><h1>18+ content is off</h1><p>Adults can opt in from Settings. This is not age verification.</p><a class="btn primary" href="#/settings">Open Settings</a></div></div>`); return;
  }
  const q = (ctx.query.q || '').slice(0, 150);
  ctx.render(html`<div class="container page adult-page"><div class="adult-heading"><span class="chip active">18+ · OPT-IN</span><h1 class="page-title">Hentai</h1><p class="muted">Adult anime metadata from AniList. Existing player options are experimental and adult playback is not verified; availability varies by title and region.</p></div>
    <nav class="row adult-links" aria-label="Adult catalogues"><a class="btn" href="#/search?type=manga&amp;rating=adult">18+ manga on MangaDex</a><a class="btn" href="#/scans/omega">Omega Scans</a><a class="btn ghost" href="#/settings">18+ settings</a></nav>
    <form id="adult-search" class="row"><label for="adult-query">Search adult anime</label><input id="adult-query" class="input" value="${q}" placeholder="Title" maxlength="150"><button class="btn primary">Search</button></form>
    <div class="browse-head"><h2>${q ? `Results for “${q}”` : 'Popular adult anime'}</h2>${layoutControls()}</div>
    <div id="adult-results">${skelGrid(12)}</div><div class="row" style="justify-content:center;margin-top:24px"><button id="adult-more" class="btn" hidden>Load more</button></div></div>`);
  bindBrowseLayout(ctx.el);
  $('#adult-search', ctx.el).addEventListener('submit', (e) => { e.preventDefault(); const term = $('#adult-query', ctx.el).value.trim(); go(`/adult${term ? `?q=${encodeURIComponent(term)}` : ''}`); });
  const out = $('#adult-results', ctx.el), more = $('#adult-more', ctx.el);
  let page = 1, busy = false;
  async function load() {
    if (busy || getSettings().adultManga !== true) return;
    busy = true; more.disabled = true;
    try {
      const result = await searchMedia({ q, page, adultOnly: true });
      if (!ctx.alive() || getSettings().adultManga !== true) return;
      if (page === 1) render(out, result.items.length ? html`<div class="grid layout-grid ${layoutClass()}" id="adult-grid">${result.items.map((m) => card(fromAnime(m)))}</div>` : emptyBox('search', 'No results', 'Try another title.'));
      else $('#adult-grid', ctx.el)?.insertAdjacentHTML('beforeend', result.items.map((m) => card(fromAnime(m)).toString()).join(''));
      page++; more.hidden = !result.hasNext; more.textContent = 'Load more';
    } catch (e) { if (ctx.alive()) { if (page === 1) render(out, errorBox(e)); more.hidden = false; more.textContent = 'Retry'; } }
    finally { busy = false; more.disabled = false; }
  }
  more.addEventListener('click', load); load();
}
