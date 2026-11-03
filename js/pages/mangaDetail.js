// Manga detail page with chapter list.

import { html, render, $, $$, on, debounce, cleanMarkdown, titleCase, copyText, timeAgo, fmtNum, hashQuery, safeUrl } from '../util.js';
import { icon } from '../ui/icons.js';
import { mangaDetail, chapterFeed, LANGS } from '../api/mangadex.js';
import { fromManga, toast, errorBox, setStatus, PLACEHOLDER } from '../ui/components.js';
import { getEntry, saveEntry, getMarks, toggleMark, setMarks, lastHistory, subscribe, statusLabel, STATUSES, getSettings, isAdultRating } from '../store.js';

const chLabel = (c) => (c.chapter != null ? `${c.volume ? `Vol. ${c.volume} ` : ''}Ch. ${c.chapter}` : 'Oneshot');

export default async function mangaDetailPage(ctx) {
  const id = ctx.params.id;
  ctx.render(html`<div class="container page"><div class="skel" style="height:320px"></div></div>`);
  let m;
  try { m = await mangaDetail(id); } catch (e) { ctx.render(html`<div class="container page">${errorBox(e)}</div>`); return; }
  if (!ctx.alive()) return;
  if (isAdultRating(m.contentRating) && getSettings().adultManga !== true) {
    ctx.render(html`<div class="container page"><div class="empty"><h3>18+ manga is off</h3><p>Adult-rated titles are hidden. Adults can opt in from Settings.</p><a class="btn primary" href="#/settings">Open Settings</a></div></div>`);
    return;
  }
  const item = fromManga(m);
  ctx.setTitle(item.title);

  const pref = getSettings().mangaLang;
  let lang = ctx.query.lang || (m.langs.includes(pref) ? pref : m.langs.includes('en') ? 'en' : m.langs[0] || 'en');
  let chapters = null, chError = null, sortDesc = true, filter = '', showAlts = false;

  const langName = (c) => LANGS.find((l) => l[0] === c)?.[1] || c.toUpperCase();
  const links = linkList(m.links);

  const head = () => {
    const entry = getEntry('manga', id);
    const last = lastHistory('manga', id);
    const first = chapters?.[0];
    const next = (() => {
      if (!chapters?.length) return null;
      const read = getMarks('manga', id);
      if (last) { const i = chapters.findIndex((c) => c.id === last.chapterId); if (i >= 0) return read.has(chapters[i].id) ? chapters[i + 1] || chapters[i] : chapters[i]; }
      return chapters.find((c) => !read.has(c.id)) || chapters[0];
    })();
    return html`
      <div class="detail-banner"><img src="${item.cover}" alt="" class="blur-cover" referrerpolicy="no-referrer"><div class="detail-banner-shade"></div></div>
      <div class="container detail">
        <div class="detail-top">
          <div class="detail-poster"><img src="${item.cover || PLACEHOLDER}" alt="${item.title} cover" referrerpolicy="no-referrer"></div>
          <div class="detail-main">
            <div class="chips">
              <span class="chip active">${titleCase(m.status || 'unknown')}</span>
              <span class="chip">${item.origin}</span>
              ${m.demographic ? html`<span class="chip">${titleCase(m.demographic)}</span>` : ''}
              ${m.rating ? html`<span class="chip">${icon('star')} ${m.rating.toFixed(2)}</span>` : ''}
              ${m.contentRating === 'suggestive' ? html`<span class="chip">Suggestive</span>` : ''}${isAdultRating(m.contentRating) ? html`<span class="chip">18+</span>` : ''}
            </div>
            <h1 class="detail-title">${item.title}</h1>
            ${m.altTitles.length ? html`<div class="detail-alt">${m.altTitles.slice(0, 3).join(' · ')}</div>` : ''}
            <div class="detail-meta">
              ${m.authors.length ? html`<span>${icon('user')} ${m.authors.join(', ')}</span>` : ''}
              ${m.artists.length && m.artists.join() !== m.authors.join() ? html`<span>${icon('sparkles')} Art: ${m.artists.join(', ')}</span>` : ''}
              ${m.year ? html`<span>${icon('calendar')} ${m.year}</span>` : ''}
              ${m.follows ? html`<span>${icon('heart')} ${fmtNum(m.follows)} follows</span>` : ''}
              ${m.lastChapter ? html`<span>${icon('book')} ${m.lastChapter} chapters</span>` : ''}
            </div>
            <div class="chips">${m.tags.slice(0, 12).map((t) => html`<a class="chip" href="#/search?type=manga&tag=${t.id}">${t.name}</a>`)}</div>
            <div class="detail-actions">
              ${next ? html`<a class="btn primary lg" href="#/read/${id}/${next.id}">${icon('book')} ${last ? 'Continue' : 'Start reading'} · ${chLabel(next)}</a>` : html`<span class="btn lg disabled">${chapters ? 'No chapters in this language' : 'Loading chapters…'}</span>`}
              <a class="btn lg ghost" href="#/comic/mangadex/${id}?title=${encodeURIComponent(item.title)}">${icon('search')} Find other providers</a>
              <button class="btn lg" data-action="lib-menu" data-key="manga:${id}">${icon(entry ? 'check' : 'plus')} ${entry ? statusLabel(entry.status, 'manga') : 'Add to list'}</button>
              ${first && chapters.length > 1 ? html`<a class="btn lg ghost" href="#/read/${id}/${chapters[chapters.length - 1].id}">${icon('forward')} Latest</a>` : ''}
              <button class="btn lg ghost" data-share>${icon('share')}</button>
            </div>
            <div class="detail-desc ${(m.description || '').length > 420 ? 'collapsed' : ''}" id="desc"><p>${m.description ? cleanMarkdown(m.description) : 'No synopsis available.'}</p></div>
            ${(m.description || '').length > 420 ? html`<button class="link-btn" data-more>Read more</button>` : ''}
          </div>
        </div>
        <div class="detail-grid">
          <div class="detail-col">
            <section class="section" id="chapters">
              <div class="section-head"><div><h2>Chapters</h2><div class="sub" id="chsub">${chapters ? `${chapters.length} chapters · ${getMarks('manga', id).size} read` : ''}</div></div>
                <div class="row">
                  <select class="select" id="lang" aria-label="Language" style="width:auto">${(m.langs.length ? m.langs : [lang]).map((c) => html`<option value="${c}" ${c === lang ? 'selected' : ''}>${langName(c)}</option>`)}</select>
                  <button class="btn sm" id="sort">${icon('list')} ${sortDesc ? 'Newest first' : 'Oldest first'}</button>
                  <button class="btn sm" id="markall" title="Mark everything as read">${icon('check')} Mark all read</button>
                </div></div>
              <input class="input" id="chfilter" placeholder="Jump to chapter number…" inputmode="decimal" style="margin-bottom:12px;max-width:260px" value="${filter}">
              <div id="chlist">${chapterList()}</div>
            </section>
          </div>
          <aside class="detail-side">
            ${trackerPanel(item, entry)}
            <div class="glass side-card"><h3>Information</h3><dl class="kv">
              <dt>Type</dt><dd>${item.origin}</dd><dt>Status</dt><dd>${titleCase(m.status || '–')}</dd>
              <dt>Year</dt><dd>${m.year || '–'}</dd><dt>Authors</dt><dd>${m.authors.join(', ') || '–'}</dd>
              <dt>Languages</dt><dd>${m.langs.length} available</dd></dl></div>
            ${links.length ? html`<div class="glass side-card"><h3>Links</h3><div class="chips">${links.map((l) => html`<a class="chip ${l.official ? 'active' : ''}" href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label} ${icon('ext')}</a>`)}</div>
              ${links.some((l) => l.official) ? html`<p class="muted" style="font-size:12.5px;margin-top:10px">Highlighted links are official releases — please support the author when you can.</p>` : ''}</div>` : ''}
          </aside>
        </div>
      </div>`;
  };

  function chapterList() {
    if (chError) return errorBox(chError);
    if (!chapters) return html`<div class="center-load"><div class="spinner"></div></div>`;
    if (!chapters.length) return html`<div class="empty" style="padding:30px"><h3>No chapters in ${langName(lang)}</h3><p>Try another language from the selector above, or check the official links.</p></div>`;
    const read = getMarks('manga', id);
    let list = chapters;
    if (filter) list = list.filter((c) => String(c.chapter ?? '').startsWith(filter.trim()));
    list = sortDesc ? list.slice().reverse() : list;
    if (!list.length) return html`<p class="muted">No chapter matches “${filter}”.</p>`;
    return html`<div class="ch-list">${list.slice(0, 600).map((c) => html`<a class="ch ${read.has(c.id) ? 'read' : ''}" href="#/read/${id}/${c.id}">
      <span class="ch-main"><b>${chLabel(c)}</b>${c.title ? html`<span class="ch-title">${c.title}</span>` : ''}</span>
      <span class="ch-meta">${c.groups[0] ? html`<span>${c.groups[0]}</span>` : ''}${c.pages ? html`<span>${c.pages}p</span>` : ''}<span>${c.publishAt ? timeAgo(c.publishAt) : ''}</span></span>
      <button class="ep-check" data-read="${c.id}" aria-label="${read.has(c.id) ? 'Mark unread' : 'Mark read'}">${icon(read.has(c.id) ? 'check' : 'eye')}</button></a>`)}</div>
      ${list.length > 600 ? html`<p class="muted" style="margin-top:12px">Showing 600 of ${list.length}. Use the filter to jump to a chapter.</p>` : ''}`;
  }

  const updateChapters = debounce(() => { const list = $('#chlist', ctx.el); if (ctx.alive() && list) render(list, chapterList()); }, 120);
  let bindController;
  ctx.cleanup(() => { bindController?.abort(); updateChapters.cancel(); });
  const draw = () => { ctx.render(head()); bind(); };
  function bind() {
    bindController?.abort();
    bindController = new AbortController();
    const signal = bindController.signal;
    const root = ctx.el;
    $('[data-more]', root)?.addEventListener('click', (e) => { $('#desc', root).classList.remove('collapsed'); e.target.remove(); });
    $('[data-share]', root)?.addEventListener('click', () => copyText(location.href).then(() => toast('Link copied')));
    $('#lang', root)?.addEventListener('change', (e) => { lang = e.target.value; loadChapters(); });
    $('#sort', root)?.addEventListener('click', () => { sortDesc = !sortDesc; draw(); });
    $('#markall', root)?.addEventListener('click', () => { if (!chapters?.length) return; setMarks('manga', id, chapters.map((c) => c.id)); toast('Marked all chapters as read'); });
    $('#chfilter', root)?.addEventListener('input', (e) => { filter = e.target.value; updateChapters(); });
    on(root, 'click', '[data-read]', (e, t) => { e.preventDefault(); e.stopPropagation(); toggleMark('manga', id, t.dataset.read); }, { signal });
    on(root, 'change', '[data-track]', (e, t) => {
      const base = { title: item.title, cover: item.cover, total: item.total, format: item.origin, contentRating: m.contentRating };
      if (t.dataset.track === 'status') setStatus(item, t.value);
      if (t.dataset.track === 'score') saveEntry('manga', id, { score: Number(t.value) }, base);
      if (t.dataset.track === 'progress') saveEntry('manga', id, { progress: Math.max(0, Number(t.value) || 0) }, base);
    }, { signal });
  }
  async function loadChapters() {
    chapters = null; chError = null; draw();
    try { chapters = await chapterFeed(id, lang); } catch (e) { chError = e; }
    if (!ctx.alive()) return;
    const y = window.scrollY; draw(); window.scrollTo(0, y);
  }
  loadChapters();
  ctx.cleanup(subscribe((k, d) => {
    if (!ctx.alive()) return;
    if (['library', 'marks', 'history'].includes(k) && (!d || String(d.id) === String(id))) { const y = window.scrollY; draw(); window.scrollTo(0, y); }
  }));
}

function linkList(links) {
  const out = [];
  const add = (label, url, official = false) => { const u = safeUrl(url); if (u) out.push({ label, url: u, official }); };
  if (links.engtl) add('Official English', links.engtl, true);
  if (links.raw) add('Official raw', links.raw, true);
  if (links.amz) add('Amazon', links.amz, true);
  if (links.ebj) add('eBookJapan', links.ebj, true);
  if (links.bw) add('BookWalker', /^https?:/.test(links.bw) ? links.bw : `https://global.bookwalker.jp/${links.bw}`, true);
  if (links.al) add('AniList', `https://anilist.co/manga/${links.al}`);
  if (links.mal) add('MyAnimeList', `https://myanimelist.net/manga/${links.mal}`);
  if (links.mu) add('MangaUpdates', `https://www.mangaupdates.com/series/${links.mu}`);
  if (links.kt) add('Kitsu', `https://kitsu.io/manga/${links.kt}`);
  return out;
}

function trackerPanel(item, entry) {
  return html`<div class="glass side-card tracker"><h3>My tracker</h3>
    <label class="field">Status<select class="select" data-track="status">
      <option value="__remove" ${entry ? '' : 'selected'} ${entry ? '' : 'disabled'}>Not on my list</option>
      ${STATUSES.map((s) => html`<option value="${s}" ${entry?.status === s ? 'selected' : ''}>${statusLabel(s, 'manga')}</option>`)}
      ${entry ? html`<option value="__remove">— Remove from list —</option>` : ''}</select></label>
    <label class="field" style="margin-top:12px">Chapters read<input class="input" type="number" min="0" value="${entry?.progress || 0}" data-track="progress"></label>
    <label class="field" style="margin-top:12px">Score<select class="select" data-track="score"><option value="0">No score</option>
      ${Array.from({ length: 10 }, (_, i) => 10 - i).map((s) => html`<option value="${s}" ${entry?.score === s ? 'selected' : ''}>${s} / 10</option>`)}</select></label></div>`;
}
