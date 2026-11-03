// Unified search & browse page for anime (AniList) and manga (MangaDex).

import { html, render, $, $$, on, hashQuery, currentSeason, titleCase, debounce } from '../util.js';
import { icon } from '../ui/icons.js';
import { searchMedia, genreList } from '../api/anilist.js';
import { listManga, tagList } from '../api/mangadex.js';
import { card, fromAnime, fromManga, skelGrid, errorBox, emptyBox, PLACEHOLDER } from '../ui/components.js';
import { pushSearch, getSettings } from '../store.js';
import { go } from '../router.js';

const ANIME_SORT = [['', 'Best match / popular'], ['TRENDING_DESC', 'Trending'], ['POPULARITY_DESC', 'Most popular'], ['SCORE_DESC', 'Top rated'], ['START_DATE_DESC', 'Newest'], ['START_DATE', 'Starting soonest'], ['FAVOURITES_DESC', 'Most favourited'], ['TITLE_ROMAJI', 'Title A–Z']];
const FORMATS = [['', 'Any format'], ['TV', 'TV'], ['MOVIE', 'Movie'], ['OVA', 'OVA'], ['ONA', 'ONA'], ['SPECIAL', 'Special'], ['TV_SHORT', 'TV short']];
const A_STATUS = [['', 'Any status'], ['RELEASING', 'Airing'], ['FINISHED', 'Finished'], ['NOT_YET_RELEASED', 'Upcoming'], ['HIATUS', 'Hiatus']];
const SEASONS = [['', 'Any season'], ['WINTER', 'Winter'], ['SPRING', 'Spring'], ['SUMMER', 'Summer'], ['FALL', 'Fall']];
const M_SORT = [['', 'Best match / popular'], ['popular', 'Most followed'], ['latest', 'Latest update'], ['new', 'Newly added'], ['rating', 'Top rated'], ['title', 'Title A–Z']];
const M_ORIGIN = [['', 'Manga, manhwa & manhua'], ['ja', 'Manga (Japan)'], ['ko', 'Manhwa (Korea)'], ['zh', 'Manhua (China)']];
const M_DEMO = [['', 'Any demographic'], ['shounen', 'Shounen'], ['shoujo', 'Shoujo'], ['seinen', 'Seinen'], ['josei', 'Josei']];
const M_STATUS = [['', 'Any status'], ['ongoing', 'Ongoing'], ['completed', 'Completed'], ['hiatus', 'Hiatus'], ['cancelled', 'Cancelled']];
const MD_ORDER = { popular: { followedCount: 'desc' }, latest: { latestUploadedChapter: 'desc' }, new: { createdAt: 'desc' }, rating: { rating: 'desc' }, relevance: { relevance: 'desc' }, title: { title: 'asc' } };

const opts = (list, val) => list.map(([v, l]) => html`<option value="${v}" ${String(val || '') === v ? 'selected' : ''}>${l}</option>`);

export default async function search(ctx) {
  const q = ctx.query;
  const type = q.type === 'manga' ? 'manga' : 'anime';
  const text = (q.q || '').trim();
  ctx.setTitle(text ? `Search: ${text}` : type === 'anime' ? 'Browse anime' : 'Browse manga');
  if (text) pushSearch(text);

  // filter option sources (best effort — page still works without them)
  let genres = [], tags = [];
  const optionsP = type === 'anime' ? genreList().then((g) => (genres = g)).catch(() => {}) : tagList().then((t) => (tags = t)).catch(() => {});
  ctx.render(html`<div class="container page"><div class="skel" style="height:96px;margin-bottom:24px"></div>${skelGrid(12)}</div>`);
  await optionsP;
  if (!ctx.alive()) return;

  const year = new Date().getFullYear();
  const years = Array.from({ length: year + 2 - 1960 }, (_, i) => year + 1 - i);
  const mk = (patch) => `/search${hashQuery({ ...q, ...patch })}`;
  const filters = type === 'anime' ? html`
    <select class="select" data-f="genre" aria-label="Genre"><option value="">Any genre</option>${genres.map((g) => html`<option ${q.genre === g ? 'selected' : ''}>${g}</option>`)}</select>
    <select class="select" data-f="format" aria-label="Format">${opts(FORMATS, q.format)}</select>
    <select class="select" data-f="status" aria-label="Status">${opts(A_STATUS, q.status)}</select>
    <select class="select" data-f="season" aria-label="Season">${opts(SEASONS, q.season)}</select>
    <select class="select" data-f="year" aria-label="Year"><option value="">Any year</option>${years.map((y) => html`<option ${String(q.year) === String(y) ? 'selected' : ''}>${y}</option>`)}</select>
    <select class="select" data-f="sort" aria-label="Sort">${opts(ANIME_SORT, q.sort)}</select>`
    : html`
    <select class="select" data-f="tag" aria-label="Genre or theme"><option value="">Any genre / theme</option>${['genre', 'theme', 'format'].map((g) => html`<optgroup label="${titleCase(g)}">${tags.filter((t) => t.group === g).map((t) => html`<option value="${t.id}" ${q.tag === t.id ? 'selected' : ''}>${t.name}</option>`)}</optgroup>`)}</select>
    <select class="select" data-f="origin" aria-label="Type">${opts(M_ORIGIN, q.origin)}</select>
    <select class="select" data-f="demo" aria-label="Demographic">${opts(M_DEMO, q.demo)}</select>
    <select class="select" data-f="status" aria-label="Status">${opts(M_STATUS, q.status)}</select>
    ${getSettings().adultManga === true ? html`<select class="select" data-f="rating" aria-label="Content rating">${opts([['', 'All enabled ratings'], ['adult', '18+ only']], q.rating)}</select>` : ''}
    <select class="select" data-f="sort" aria-label="Sort">${opts(M_SORT, q.sort)}</select>`;

  const activeTag = q.tag && type === 'manga' ? tags.find((t) => t.id === q.tag)?.name : q.tag;
  const heading = text ? html`Results for <span class="grad">“${text}”</span>` : type === 'anime' ? 'Browse anime' : 'Browse manga';
  ctx.render(html`<div class="container page">
    <div class="search-head">
      <h1 class="page-title">${heading}</h1>
      <div class="seg"><a class="${type === 'anime' ? 'on' : ''}" href="#${mk({ type: 'anime', genre: '', tag: '', format: '', status: '', season: '', year: '', sort: '', origin: '', demo: '' })}">${icon('tv')} Anime</a>
        <a class="${type === 'manga' ? 'on' : ''}" href="#${mk({ type: 'manga', genre: '', tag: '', format: '', status: '', season: '', year: '', sort: '', origin: '', demo: '' })}">${icon('book')} Manga</a></div>
    </div>
    <form class="filter-bar" id="sform">
      <div class="filter-search">${icon('search')}<input class="input" name="q" value="${text}" placeholder="Search ${type}…" aria-label="Search text" autocomplete="off" aria-controls="search-suggestions" aria-expanded="false"><div id="search-suggestions" class="search-suggestions" aria-live="polite" hidden></div></div>
      ${filters}
      <button class="btn primary">Search</button>
      ${(text || q.genre || q.tag || q.format || q.status || q.season || q.year || q.sort || q.origin || q.demo) ? html`<a class="btn ghost" href="#/search?type=${type}">Clear</a>` : ''}
    </form>
    ${activeTag ? html`<div class="chips" style="margin:-4px 0 14px"><span class="chip active">${activeTag}</span></div>` : ''}
    <div id="results"></div>
    <div class="load-more" id="more" hidden><button class="btn lg" id="morebtn">Load more</button></div>
  </div>`);

  const input = $('#sform input[name="q"]', ctx.el), suggestions = $('#search-suggestions', ctx.el);
  let suggestionSeq = 0;
  const hideSuggestions = () => { suggestions.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const suggest = debounce(async (term, seq) => {
    try {
      const items = type === 'anime'
        ? (await searchMedia({ q: term, perPage: 7 })).items.map(fromAnime)
        : (await listManga({ q: term, limit: 7, order: { relevance: 'desc' }, lang: getSettings().mangaLang })).items.map(fromManga);
      if (!ctx.alive() || seq !== suggestionSeq) return;
      render(suggestions, items.length ? html`${items.map((item) => html`<a class="pal-item" href="${item.href}"><img src="${item.cover || PLACEHOLDER}" alt="" referrerpolicy="no-referrer"><span><span class="t">${item.title}</span><span class="s">${item.sub}</span></span></a>`)}<button type="submit" class="suggest-all">See all results for “${term}”</button>` : html`<p class="suggest-message">No matching ${type} found. Press Search for full results.</p>`);
    } catch {
      if (!ctx.alive() || seq !== suggestionSeq) return;
      render(suggestions, type === 'manga' ? html`<p class="suggest-message">MangaDex unavailable. <a href="#/manga?q=${encodeURIComponent(term)}">Search other sources</a>.</p>` : html`<p class="suggest-message">Suggestions unavailable. Press Search to try again.</p>`);
    }
    suggestions.hidden = false; input.setAttribute('aria-expanded', 'true');
  }, 300);
  input.addEventListener('input', () => {
    const seq = ++suggestionSeq, term = input.value.trim();
    suggest.cancel(); hideSuggestions();
    if (term.length >= 2) suggest(term, seq);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ++suggestionSeq; suggest.cancel(); hideSuggestions(); } });
  ctx.el.addEventListener('focusout', (e) => { if (e.target.closest('.filter-search') && !e.currentTarget.querySelector('.filter-search').contains(e.relatedTarget)) { ++suggestionSeq; suggest.cancel(); hideSuggestions(); } });
  ctx.cleanup(() => { ++suggestionSeq; suggest.cancel(); });

  $('#sform').addEventListener('submit', (e) => { e.preventDefault(); go(mk({ q: new FormData(e.target).get('q') })); });
  on(ctx.el, 'change', '[data-f]', (e, t) => go(mk({ [t.dataset.f]: t.value })));

  const results = $('#results'), more = $('#more'), morebtn = $('#morebtn');
  let page = 1, offset = 0, total = 0, shown = 0;
  const fetchPage = async () => {
    if (type === 'anime') {
      const r = await searchMedia({ type: 'ANIME', q: text, page, perPage: 30, genre: q.genre, tag: q.tag, format: q.format, status: q.status, season: q.season, year: q.year, sort: q.sort });
      page += 1; return { items: r.items.map(fromAnime), hasNext: r.hasNext, total: r.total };
    }
    const order = MD_ORDER[q.sort] || (text ? MD_ORDER.relevance : MD_ORDER.popular);
    const r = await listManga({ q: text, order, offset, limit: 30, lang: getSettings().mangaLang, tags: q.tag ? [q.tag] : [], origin: q.origin ? (q.origin === 'zh' ? ['zh', 'zh-hk'] : [q.origin]) : undefined, status: q.status, demographic: q.demo, adultOnly: q.rating === 'adult' });
    offset += r.items.length; return { items: r.items.map(fromManga), hasNext: r.hasNext, total: r.total };
  };
  const load = async (first) => {
    morebtn.disabled = true;
    if (first) render(results, skelGrid(12));
    try {
      const r = await fetchPage();
      if (!ctx.alive()) return;
      total = r.total; shown += r.items.length;
      if (first) {
        if (!r.items.length) { render(results, emptyBox('search', 'No results', 'Try different keywords or loosen the filters.', html`<a class="btn primary" href="#/search?type=${type}">Reset filters</a>`)); more.hidden = true; return; }
        render(results, html`<div class="muted" style="margin:0 0 14px">${total ? `${total.toLocaleString()} results` : ''}</div><div class="grid" id="grid">${r.items.map((i) => card(i))}</div>`);
      } else $('#grid').insertAdjacentHTML('beforeend', r.items.map((i) => card(i)).join(''));
      more.hidden = !r.hasNext;
    } catch (e) { if (ctx.alive()) { if (first) render(results, type === 'manga' ? html`${errorBox(e, { title: 'MangaDex is unavailable' })}<div class="row" style="justify-content:center"><a class="btn" href="#/manga?q=${encodeURIComponent(text)}">Search other sources</a><a class="btn" href="#/asura?q=${encodeURIComponent(text)}">Search Asura instead</a><a class="btn" href="#/manga">Other manga sources</a></div>` : errorBox(e)); else morebtn.textContent = 'Retry'; } }
    morebtn.disabled = false;
  };
  morebtn.addEventListener('click', () => { morebtn.textContent = 'Load more'; load(false); });
  load(true);

  // infinite scroll
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((en) => { if (en[0].isIntersecting && !more.hidden && !morebtn.disabled) load(false); }, { rootMargin: '600px' }) : null;
  io?.observe(more);
  ctx.cleanup(() => io?.disconnect());
}
