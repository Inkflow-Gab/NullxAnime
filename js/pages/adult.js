// Opt-in catalogue only. AniList provides metadata, not playable streams or edition information.
import { html, render, $, hashQuery } from '../util.js';
import { getSettings } from '../store.js';
import { searchMedia } from '../api/anilist.js';
import { card, fromAnime, errorBox, skelGrid, emptyBox } from '../ui/components.js';
import { layoutControls, layoutClass, bindBrowseLayout } from '../ui/browseLayout.js';
import { go } from '../router.js';

const SORTS = { popular: ['Popular', 'POPULARITY_DESC'], latest: ['Latest', 'START_DATE_DESC'], trending: ['Trending', 'TRENDING_DESC'], rated: ['Top rated', 'SCORE_DESC'] };
const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Supernatural'];
const FORMATS = [['OVA', 'OVA'], ['ONA', 'ONA'], ['MOVIE', 'Movie'], ['TV', 'TV'], ['SPECIAL', 'Special']];
const STATUSES = [['RELEASING', 'Releasing'], ['FINISHED', 'Finished'], ['NOT_YET_RELEASED', 'Upcoming']];
const options = (items, selected) => items.map(([value, label]) => html`<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`);

export default function adult(ctx) {
  ctx.setTitle('Hentai');
  if (getSettings().adultManga !== true) {
    ctx.render(html`<div class="container page"><div class="empty"><h1>18+ content is off</h1><p>Adults can opt in from Settings. This is not age verification.</p><a class="btn primary" href="#/settings">Open Settings</a></div></div>`); return;
  }
  const q = String(ctx.query.q || '').trim().slice(0, 150);
  const sort = Object.hasOwn(SORTS, ctx.query.sort) ? ctx.query.sort : 'popular';
  const genre = GENRES.includes(ctx.query.genre) ? ctx.query.genre : '';
  const format = FORMATS.some(([value]) => value === ctx.query.format) ? ctx.query.format : '';
  const status = STATUSES.some(([value]) => value === ctx.query.status) ? ctx.query.status : '';
  const state = { q, sort: sort === 'popular' ? '' : sort, genre, format, status };
  const link = (patch = {}) => `/adult${hashQuery({ ...state, ...patch })}`;
  const filtered = !!(q || genre || format || status || sort !== 'popular');
  ctx.render(html`<div class="container page adult-page"><div class="adult-heading"><span class="chip active">18+ · OPT-IN</span><h1 class="page-title">Hentai</h1><p class="muted">Explore adult anime metadata from AniList. Playback depends on third-party players and has not been verified for adult titles.</p></div>
    <nav class="row adult-links" aria-label="Adult catalogues"><a class="btn" href="#/search?type=manga&amp;rating=adult">18+ manga on MangaDex</a><a class="btn" href="#/scans/omega">Omega Scans</a><a class="btn ghost" href="#/settings">18+ settings</a></nav>
    <details class="adult-sources"><summary>External adult sites &amp; uncensored category</summary>
      <p class="muted">These links open third-party sites, not an integrated player. Their content, ads, availability and edition labels are controlled by each site. Check the title and episode there.</p>
      <div class="row"><a class="btn sm" href="https://hentaihaven.xxx/" target="_blank" rel="noopener noreferrer">Hentai Haven ↗</a><a class="btn sm" href="https://hanime.tv/" target="_blank" rel="noopener noreferrer">Hanime ↗</a><a class="btn sm" href="https://hentaigasm.com/" target="_blank" rel="noopener noreferrer">Hentaigasm ↗</a><a class="btn sm" href="https://hentaigasm.com/genre/uncensored/" target="_blank" rel="noopener noreferrer">Hentaigasm · Uncensored ↗</a></div>
    </details>
    <section class="adult-explore" aria-label="Adult anime search and filters">
      <form id="adult-search" class="adult-search"><label for="adult-query">Search adult anime</label><div class="adult-search-row"><input id="adult-query" class="input" value="${q}" placeholder="Search by title" maxlength="150"><button class="btn primary">Search</button></div></form>
      <nav class="adult-sort" aria-label="Sort adult anime">${Object.entries(SORTS).map(([key, [label]]) => html`<a href="#${link({ sort: key === 'popular' ? '' : key })}" class="${sort === key ? 'on' : ''}" ${sort === key ? html`aria-current="page"` : ''}>${label}</a>`)}</nav>
      <div class="adult-filters"><label>Theme / genre<select id="adult-genre" class="select" data-filter="genre"><option value="">All genres</option>${options(GENRES.map((g) => [g, g]), genre)}</select></label><label>Format<select class="select" data-filter="format"><option value="">All formats</option>${options(FORMATS, format)}</select></label><label>Status<select class="select" data-filter="status"><option value="">All statuses</option>${options(STATUSES, status)}</select></label>${filtered ? html`<a class="btn ghost" href="#/adult">Clear filters</a>` : ''}</div>
      <p class="muted adult-filter-note">${sort === 'latest' ? 'Latest sorts by AniList start date, not episode upload date; upcoming titles may appear. ' : ''}AniList does not report censored or uncensored editions. Check the actual provider and episode version; an uncensored filter cannot be verified here.</p>
    </section>
    <div class="browse-head"><div><h2>${q ? `Results for “${q}”` : `${SORTS[sort][0]} adult anime`}</h2><p id="adult-count" class="muted" role="status" aria-live="polite"></p></div>${layoutControls()}</div>
    <div id="adult-results" aria-live="polite">${skelGrid(12)}</div><div class="row" style="justify-content:center;margin-top:24px"><button id="adult-more" class="btn" hidden>Load more</button></div></div>`);
  bindBrowseLayout(ctx.el);
  $('#adult-search', ctx.el).addEventListener('submit', (e) => { e.preventDefault(); go(link({ q: $('#adult-query', ctx.el).value.trim().slice(0, 150) })); });
  ctx.el.querySelectorAll('[data-filter]').forEach((select) => select.addEventListener('change', () => go(link({ [select.dataset.filter]: select.value }))));
  const out = $('#adult-results', ctx.el), more = $('#adult-more', ctx.el), count = $('#adult-count', ctx.el);
  let page = 1, shown = 0, busy = false;
  async function load() {
    if (busy || getSettings().adultManga !== true) return;
    busy = true; more.disabled = true;
    try {
      const result = await searchMedia({ q, page, adultOnly: true, sort: SORTS[sort][1], genre, format, status });
      if (!ctx.alive() || getSettings().adultManga !== true) return;
      if (page === 1) render(out, result.items.length ? html`<div class="grid layout-grid ${layoutClass()}" id="adult-grid">${result.items.map((m) => card(fromAnime(m)))}</div>` : emptyBox('search', 'No results', 'Try another title or clear a filter.', html`<a class="btn" href="#/adult">Clear filters</a>`));
      else $('#adult-grid', ctx.el)?.insertAdjacentHTML('beforeend', result.items.map((m) => card(fromAnime(m)).toString()).join(''));
      shown += result.items.length;
      count.textContent = result.items.length || shown ? `${shown} shown${result.total ? ` · ${result.total.toLocaleString()} results` : ''}` : '';
      page++; more.hidden = !result.hasNext || !shown; more.textContent = 'Load more';
    } catch (e) { if (ctx.alive()) { if (page === 1) render(out, errorBox(e)); more.hidden = false; more.textContent = 'Retry'; } }
    finally { busy = false; more.disabled = false; }
  }
  more.addEventListener('click', load); load();
}
