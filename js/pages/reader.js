// Manga reader: vertical (webtoon), paged left-to-right, paged right-to-left.

import { html, render, $, $$, on, clamp, esc } from '../util.js';
import { icon } from '../ui/icons.js';
import { chapterInfo, chapterFeed, chapterPages, mangaDetail } from '../api/mangadex.js';
import { fromManga, toast, errorBox, popover, closePopover } from '../ui/components.js';
import { getSettings, setSetting, pushHistory, toggleMark, getEntry, saveEntry, getPos, setPos, getMarks, isAdultRating } from '../store.js';
import { go } from '../router.js';

const chLabel = (c) => (c?.chapter != null ? `${c.volume ? `Vol. ${c.volume} ` : ''}Ch. ${c.chapter}` : 'Oneshot');

export default async function reader(ctx) {
  const { id, chapter: chapterId } = ctx.params;
  document.body.classList.add('reading');
  ctx.cleanup(() => document.body.classList.remove('reading'));
  ctx.render(html`<div class="reader-loading"><div class="spinner"></div><p>Loading chapter…</p></div>`);

  let info, manga, feed, pages;
  try {
    [info, manga] = await Promise.all([chapterInfo(chapterId), mangaDetail(id)]);
    if (!ctx.alive()) return;
    if (String(info.mangaId) !== String(id)) throw new Error('This chapter does not belong to that manga.');
    if (isAdultRating(manga.contentRating) && getSettings().adultManga !== true) {
      ctx.render(html`<div class="container page"><div class="empty"><h3>18+ manga is off</h3><p>Adults can opt in from Settings before reading.</p><a class="btn primary" href="#/settings">Open Settings</a></div></div>`);
      return;
    }
    feed = await chapterFeed(id, info.lang || getSettings().mangaLang);
    pages = await chapterPages(chapterId, getSettings().readerDataSaver);
  } catch (e) { ctx.render(html`<div class="container page">${errorBox(e)}<p style="text-align:center"><a class="btn" href="#/manga/${id}">Back to manga</a></p></div>`); return; }
  if (!ctx.alive()) return;

  const item = fromManga(manga);
  const idx = feed.findIndex((c) => c.id === chapterId || c.alts?.some((a) => a.id === chapterId));
  const cur = feed[idx] || info;
  const prev = idx > 0 ? feed[idx - 1] : null;
  const next = idx >= 0 && idx < feed.length - 1 ? feed[idx + 1] : null;
  ctx.setTitle(`${item.title} — ${chLabel(cur)}`);
  pushHistory({ type: 'manga', id, title: item.title, cover: item.cover, contentRating: manga.contentRating, chapterId, label: chLabel(cur) });

  let s = getSettings();
  let page = clamp(Number(getPos(`m:${chapterId}`)?.pos) || 0, 0, pages.length - 1);
  if (page >= pages.length - 1) page = 0;
  let finished = false;
  const cleanups = [];

  ctx.render(html`<div class="reader" id="reader">
    <header class="reader-bar" id="rbar">
      <a class="icon-btn" href="#/manga/${id}" aria-label="Back to manga">${icon('chevL')}</a>
      <div class="reader-title"><b class="clamp-2">${item.title}</b><small>${chLabel(cur)}${cur.title ? ` — ${cur.title}` : ''}</small></div>
      <div class="spacer"></div>
      <a class="icon-btn ${prev ? '' : 'disabled'}" href="${prev ? `#/read/${id}/${prev.id}` : '#'}" aria-label="Previous chapter" title="Previous chapter (P)">${icon('skipP')}</a>
      <select class="select reader-select" id="chsel" aria-label="Chapter">${feed.map((c) => html`<option value="${c.id}" ${c.id === cur.id ? 'selected' : ''}>${chLabel(c)}${c.title ? ` · ${c.title.slice(0, 28)}` : ''}</option>`)}</select>
      <a class="icon-btn ${next ? '' : 'disabled'}" href="${next ? `#/read/${id}/${next.id}` : '#'}" aria-label="Next chapter" title="Next chapter (N)">${icon('skipN')}</a>
      <div class="seg reader-mode" id="modes">
        <button data-mode="vertical" title="Vertical scroll">${icon('scroll')}</button>
        <button data-mode="ltr" title="Left to right">${icon('ltr')}</button>
        <button data-mode="rtl" title="Right to left (manga)">${icon('rtl')}</button>
      </div>
      <button class="icon-btn" id="rset" aria-label="Reader settings" data-pop>${icon('settings')}</button>
      <button class="icon-btn" id="rfull" aria-label="Fullscreen">${icon('fullscreen')}</button>
    </header>
    <div class="reader-view" id="rv"></div>
    <div class="reader-count" id="rcount" hidden></div>
    <div class="reader-progress"><i id="rprog"></i></div>
  </div>`);

  const rd = $('#reader'), rv = $('#rv'), bar = $('#rbar'), count = $('#rcount'), prog = $('#rprog');
  const endCard = () => html`<div class="reader-end">
    <div class="chips" style="justify-content:center"><span class="chip active">${icon('check')} ${chLabel(cur)} finished</span></div>
    <h3>${next ? `Up next: ${chLabel(next)}` : 'You are all caught up'}</h3>
    <div class="row" style="justify-content:center">
      ${prev ? html`<a class="btn" href="#/read/${id}/${prev.id}">${icon('chevL')} Previous</a>` : ''}
      <a class="btn" href="#/manga/${id}">${icon('list')} Chapters</a>
      ${next ? html`<a class="btn primary lg" href="#/read/${id}/${next.id}" id="nextbtn">Next chapter ${icon('chevR')}</a>` : html`<a class="btn primary" href="#/manga/${id}">Back to ${item.title}</a>`}
    </div></div>`;

  const markRead = () => {
    if (finished) return; finished = true;
    toggleMark('manga', id, chapterId, true);
    if (cur.id !== chapterId) toggleMark('manga', id, cur.id, true);
    const e = getEntry('manga', id);
    const n = Math.floor(parseFloat(cur.chapter));
    const readCount = getMarks('manga', id).size;
    const progress = isNaN(n) ? readCount : Math.max(n, e?.progress || 0);
    if (e) saveEntry('manga', id, { progress, status: e.status === 'planning' ? 'current' : e.status });
  };

  /* ---------- rendering by mode ---------- */
  function paintModes() {
    $$('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.readerMode));
    rd.dataset.mode = s.readerMode; rd.dataset.fit = s.readerFit;
  }
  let io = null;
  function mount() {
    io?.disconnect(); io = null;
    s = getSettings(); paintModes();
    window.scrollTo(0, 0);
    if (s.readerMode === 'vertical') mountVertical(); else mountPaged();
  }
  const imgTag = (src, i, extra = '') => `<img class="rpage loading" data-i="${i}" ${extra} src="${esc(src)}" alt="Page ${i + 1}" referrerpolicy="no-referrer" decoding="async">`;

  function mountVertical() {
    count.hidden = false;
    rv.className = 'reader-view vertical';
    rv.innerHTML = pages.map((p, i) => `<div class="rwrap" data-i="${i}">${imgTag(p, i, i < 3 ? '' : 'loading="lazy"')}</div>`).join('') + endCard().toString();
    const upd = (i) => {
      count.textContent = `${i + 1} / ${pages.length}`;
      prog.style.width = `${((i + 1) / pages.length) * 100}%`;
    };
    upd(0);
    io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          const i = Number(en.target.dataset.i);
          if (!isNaN(i)) { upd(i); setPos(`m:${chapterId}`, i, pages.length); if (i >= pages.length - 2) { markRead(); prefetchNext(); } }
        }
      }
    }, { threshold: 0.5 });
    $$('.rwrap', rv).forEach((w) => io.observe(w));
    const end = $('.reader-end', rv);
    if (end) { end.dataset.i = String(pages.length - 1); io.observe(end); }
  }

  function mountPaged() {
    count.hidden = false;
    rv.className = `reader-view paged ${s.readerMode}`;
    show(page);
  }
  function show(i) {
    page = clamp(i, 0, pages.length);
    if (page >= pages.length) {
      rv.innerHTML = endCard().toString(); markRead(); prog.style.width = '100%'; count.textContent = 'End'; prefetchNext(); return;
    }
    rv.innerHTML = `<div class="rwrap paged-wrap" data-i="${page}">${imgTag(pages[page], page)}</div><div class="zone zone-l" data-zone="l"></div><div class="zone zone-c" data-zone="c"></div><div class="zone zone-r" data-zone="r"></div>`;
    count.textContent = `${page + 1} / ${pages.length}`;
    prog.style.width = `${((page + 1) / pages.length) * 100}%`;
    setPos(`m:${chapterId}`, page, pages.length);
    for (const k of [1, 2]) if (pages[page + k]) { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = pages[page + k]; }
    if (page >= pages.length - 1) markRead();
    if (page >= pages.length - 3) prefetchNext();
    window.scrollTo(0, 0);
  }
  const step = (dir) => {
    // dir: +1 = forward in reading order
    const n = page + dir;
    if (n < 0) { if (prev) go(`/read/${id}/${prev.id}`); return; }
    if (n > pages.length) { if (next) go(`/read/${id}/${next.id}`); return; }
    show(n);
  };

  let prefetched = false;
  function prefetchNext() {
    if (prefetched || !next) return; prefetched = true;
    chapterPages(next.id, s.readerDataSaver).then((p) => { if (p[0]) { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = p[0]; } }).catch(() => {});
  }

  /* ---------- events ---------- */
  rv.addEventListener('load', (e) => { if (e.target.classList?.contains('rpage')) e.target.classList.remove('loading'); }, true);
  const retries = new WeakMap();
  rv.addEventListener('error', (e) => {
    const t = e.target;
    if (!t.classList?.contains('rpage')) return;
    const n = retries.get(t) || 0;
    if (n < 2) { retries.set(t, n + 1); setTimeout(() => { const src = t.src; t.src = ''; t.src = src; }, 900 * (n + 1)); }
    else { t.classList.add('failed'); t.classList.remove('loading'); t.alt = 'Failed to load. Click to retry.'; }
  }, true);
  rv.addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList?.contains('failed')) { t.classList.remove('failed'); t.classList.add('loading'); retries.set(t, 0); const src = t.src; t.src = ''; t.src = src; return; }
    const z = t.closest?.('[data-zone]')?.dataset.zone;
    if (z) {
      if (z === 'c') bar.classList.toggle('hide');
      else step((z === 'r') === (s.readerMode !== 'rtl') ? 1 : -1);
    } else if (s.readerMode === 'vertical' && t.closest('.rwrap')) bar.classList.toggle('hide');
  });
  // auto-hide the bar while scrolling down in vertical mode
  let lastY = 0;
  const onScroll = () => {
    const y = window.scrollY;
    if (s.readerMode === 'vertical') {
      if (y > lastY + 12 && y > 120) bar.classList.add('hide');
      else if (y < lastY - 12 || y < 80) bar.classList.remove('hide');
    }
    lastY = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  cleanups.push(() => window.removeEventListener('scroll', onScroll));

  const onKey = (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.getElementById('palette') || document.getElementById('shortcuts')) return;
    const k = e.key;
    const rtl = s.readerMode === 'rtl';
    if (s.readerMode !== 'vertical') {
      if (k === 'ArrowRight') { step(rtl ? -1 : 1); e.preventDefault(); }
      else if (k === 'ArrowLeft') { step(rtl ? 1 : -1); e.preventDefault(); }
      else if (k === ' ' || k === 'PageDown') { step(1); e.preventDefault(); }
      else if (k === 'PageUp') { step(-1); e.preventDefault(); }
      else if (k === 'Home') { show(0); } else if (k === 'End') { show(pages.length - 1); }
    }
    if (k.toLowerCase() === 'n' && next) go(`/read/${id}/${next.id}`);
    else if (k.toLowerCase() === 'p' && prev) go(`/read/${id}/${prev.id}`);
    else if (k.toLowerCase() === 'f') toggleFull();
    else if (k.toLowerCase() === 'h') bar.classList.toggle('hide');
    else if (k === 'Escape' && !document.fullscreenElement) go(`/manga/${id}`);
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen(); else rd.requestFullscreen?.().catch(() => {}); };
  $('#rfull').addEventListener('click', toggleFull);
  $('#chsel').addEventListener('change', (e) => go(`/read/${id}/${e.target.value}`));
  $('#modes').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) { setSetting('readerMode', b.dataset.mode); mount(); } });
  $('#rset').addEventListener('click', (e) => {
    const cur_ = getSettings();
    const el = popover(e.currentTarget, html`<div class="ph">Fit</div>
      ${[['width', 'Fit width'], ['height', 'Fit height'], ['original', 'Original size']].map(([v, l]) => html`<button data-fit="${v}" class="${cur_.readerFit === v ? 'on' : ''}">${icon(cur_.readerFit === v ? 'check' : 'eye')} ${l}</button>`)}
      <hr><button data-saver class="${cur_.readerDataSaver ? 'on' : ''}">${icon(cur_.readerDataSaver ? 'check' : 'download')} Data saver (smaller images)</button>`);
    el.addEventListener('click', async (ev) => {
      const f = ev.target.closest('[data-fit]'), d = ev.target.closest('[data-saver]');
      if (f) { setSetting('readerFit', f.dataset.fit); mount(); closePopover(); }
      if (d) {
        setSetting('readerDataSaver', !getSettings().readerDataSaver); closePopover();
        try { pages = await chapterPages(chapterId, getSettings().readerDataSaver); mount(); toast(getSettings().readerDataSaver ? 'Data saver on' : 'Data saver off'); } catch (err) { toast(err.message, 'err'); }
      }
    });
  });
  ctx.cleanup(() => cleanups.forEach((fn) => fn()));
  ctx.cleanup(() => io?.disconnect());
  mount();
}
