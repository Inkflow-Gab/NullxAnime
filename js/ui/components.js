// Shared UI building blocks: cards, rails, skeletons, toasts, popovers, error states.

import { html, raw, $, $$, on, fmtCountdown, fmtNum, titleCase, seasonLabel, esc } from '../util.js';
import { icon } from './icons.js';
import { getSettings, getEntry, saveEntry, removeEntry, STATUSES, statusLabel, subscribe, getPos } from '../store.js';

export const PLACEHOLDER = new URL('../../assets/cover-placeholder.svg', import.meta.url).href;

/* ---------- Normalised "items" ----------------------------------------------------- */
const registry = new Map();
export const register = (item) => { registry.set(`${item.type}:${item.id}`, item); return item; };
export const lookup = (key) => registry.get(key);

export function titleOf(m, lang = getSettings().titleLang) {
  const t = m?.title || {};
  if (typeof t === 'string') return t;
  return (lang === 'english' ? t.english || t.romaji : lang === 'native' ? t.native || t.romaji : t.romaji || t.english) || t.native || 'Untitled';
}

const FORMAT = { TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music', MANGA: 'Manga', NOVEL: 'Novel', ONE_SHOT: 'One-shot' };
export const fmtFormat = (f) => FORMAT[f] || titleCase(f || '');
const STATUS_TXT = { FINISHED: 'Finished', RELEASING: 'Airing', NOT_YET_RELEASED: 'Upcoming', CANCELLED: 'Cancelled', HIATUS: 'Hiatus' };
export const fmtStatus = (s) => STATUS_TXT[s] || titleCase(s || '');

export function fromAnime(m) {
  const year = m.seasonYear || m.startDate?.year;
  const bits = [fmtFormat(m.format), year, m.episodes ? `${m.episodes} ep` : null].filter(Boolean);
  return register({
    type: 'anime', id: String(m.id), title: titleOf(m), cover: m.coverImage?.extraLarge || m.coverImage?.large || '',
    color: m.coverImage?.color, banner: m.bannerImage, score: m.averageScore ? (m.averageScore / 10).toFixed(1) : null,
    sub: bits.join(' · '), total: m.episodes || null, format: m.format, status: m.status, next: m.nextAiringEpisode,
    href: `#/anime/${m.id}`, raw: m,
  });
}
const ORIGIN = { ja: 'Manga', ko: 'Manhwa', zh: 'Manhua', 'zh-hk': 'Manhua' };
export function fromManga(m) {
  const origin = ORIGIN[m.originalLanguage] || 'Manga';
  const bits = [origin, m.year, m.status ? titleCase(m.status) : null].filter(Boolean);
  return register({
    type: 'manga', id: m.id, title: m.title, cover: m.cover, score: null, sub: bits.join(' · '),
    total: m.lastChapter && /^\d+$/.test(m.lastChapter) ? Number(m.lastChapter) : null, format: origin, status: m.status,
    href: `#/manga/${m.id}`, raw: m, origin, contentRating: m.contentRating,
  });
}

/* ---------- Cards ------------------------------------------------------------------- */
export function card(item, opts = {}) {
  const e = getEntry(item.type, item.id);
  const s = getSettings();
  const next = item.next;
  const badges = [];
  if (item.type === 'manga' && ['erotica', 'pornographic'].includes(item.contentRating)) badges.push(html`<span class="badge">18+</span>`);
  if (item.score) badges.push(html`<span class="badge score">${icon('star')}${item.score}</span>`);
  if (item.type === 'manga' && item.origin && item.origin !== 'Manga') badges.push(html`<span class="badge accent">${item.origin}</span>`);
  const bl = [];
  if (opts.badge) bl.push(html`<span class="badge accent">${opts.badge}</span>`);
  else if (item.type === 'anime' && next && s.showCountdown) bl.push(html`<span class="badge accent">EP ${next.episode} · ${fmtCountdown(next.timeUntilAiring)}</span>`);
  else if (item.status === 'NOT_YET_RELEASED') bl.push(html`<span class="badge">Upcoming</span>`);
  const prog = opts.progress != null ? html`<div class="bar"><i style="width:${Math.round(opts.progress * 100)}%"></i></div>` : '';
  return html`<article class="card" data-key="${item.type}:${item.id}">
    <a class="poster" href="${opts.href || item.href}" style="${item.color ? `background:${item.color}22` : ''}" aria-label="${item.title}">
      <img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${item.cover || PLACEHOLDER}" alt="">
      <span class="shade"></span>
      <span class="tl">${badges}</span>
      <span class="play">${icon(item.type === 'manga' ? 'book' : 'play')}</span>
      <span class="bl">${bl}</span>
      ${prog}
    </a>
    ${opts.noQuick ? '' : html`<button class="quick ${e ? 'on' : ''}" data-action="lib-menu" data-key="${item.type}:${item.id}" aria-label="Add to my list" title="Add to my list">${icon(e ? 'check' : 'plus')}</button>`}
    <a class="meta" href="${opts.href || item.href}">
      <div class="title">${item.title}</div>
      <div class="sub">${opts.sub ?? item.sub}</div>
    </a>
  </article>`;
}

/** Landscape "continue" card built from a history entry. */
export function continueCard(h) {
  const type = h.type;
  const scanSource = ['omega', 'vortex', 'hive'].includes(h.source);
  const href = type === 'anime' ? `#/watch/${h.id}/${h.ep}` : h.source === 'asura' ? `#/asura/${encodeURIComponent(h.sourceSlug)}/${encodeURIComponent(h.chapterId)}` : scanSource ? `#/scans/${h.source}/${encodeURIComponent(h.sourceSlug)}/${encodeURIComponent(h.chapterId)}` : `#/read/${h.id}/${h.chapterId}`;
  const posKey = type === 'anime' ? `a:${h.id}:${h.ep}` : null;
  const p = posKey ? getPos(posKey) : null;
  const frac = p && p.dur ? Math.min(1, p.pos / p.dur) : null;
  return html`<article class="card land" data-key="${type}:${h.id}">
    <a class="poster" href="${href}">
      <img loading="lazy" referrerpolicy="no-referrer" src="${h.cover || PLACEHOLDER}" alt="" style="object-position:center 25%">
      <span class="shade"></span>
      <span class="play">${icon('play')}</span>
      <span class="bl"><span class="badge accent">${h.label}</span></span>
      ${frac != null ? html`<div class="bar"><i style="width:${Math.round(frac * 100)}%"></i></div>` : ''}
    </a>
    <a class="meta" href="${href}"><div class="title">${h.title}</div><div class="sub">${type === 'anime' ? 'Continue watching' : 'Continue reading'}</div></a>
  </article>`;
}

export function rail({ title, sub, href, items, land = false, id }) {
  if (!items?.length) return html``;
  return html`<section class="section" ${id ? raw(`id="${esc(id)}"`) : ''}>
    <div class="section-head">
      <div><h2>${title}</h2>${sub ? html`<div class="sub">${sub}</div>` : ''}</div>
      ${href ? html`<a class="see-all" href="${href}">See all ${icon('chevR')}</a>` : ''}
    </div>
    <div class="rail">
      <button class="rail-btn prev" data-rail="-1" aria-label="Scroll left">${icon('chevL')}</button>
      <div class="rail-track ${land ? 'land' : ''}">${items}</div>
      <button class="rail-btn next" data-rail="1" aria-label="Scroll right">${icon('chevR')}</button>
    </div>
  </section>`;
}

/* ---------- Skeletons / states ----------------------------------------------------------- */
export const skelCard = () => html`<div><div class="skel poster"></div><div class="skel line"></div><div class="skel line s"></div></div>`;
export const skelRail = (n = 8) => html`<section class="section"><div class="section-head"><div class="skel line" style="width:180px;height:22px"></div></div><div class="rail-track">${Array.from({ length: n }, skelCard)}</div></section>`;
export const skelGrid = (n = 18) => html`<div class="grid">${Array.from({ length: n }, skelCard)}</div>`;
export const loading = () => html`<div class="center-load"><div class="spinner"></div></div>`;

export function errorBox(err, { title = 'Something went wrong' } = {}) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const msg = offline ? 'You appear to be offline. Check your connection and try again.' : (err?.message || String(err || 'Unknown error'));
  return html`<div class="empty">${icon(offline ? 'wifiOff' : 'alert')}<h3>${offline ? 'You are offline' : title}</h3><p>${msg}</p>
    <button class="btn primary" data-action="retry">${icon('refresh')} Try again</button></div>`;
}
export const emptyBox = (iconName, title, text, action = '') => html`<div class="empty">${icon(iconName)}<h3>${title}</h3><p>${text}</p>${action}</div>`;

/* ---------- Toasts -------------------------------------------------------------------------- */
export function toast(message, kind = 'ok') {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${kind === 'err' ? 'err' : ''}`;
  el.innerHTML = `${icon(kind === 'err' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 2600);
}

/* ---------- Popover ---------------------------------------------------------------------------- */
let openPop = null;
export function closePopover() { openPop?.remove(); openPop = null; }
export function popover(anchor, content) {
  closePopover();
  const el = document.createElement('div');
  el.className = 'popover';
  el.innerHTML = content.toString();
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
  el.style.left = `${left}px`; el.style.top = `${top}px`;
  openPop = el;
  return el;
}

/** Add-to-list menu used by cards and detail pages. */
export function openLibraryMenu(anchor, key) {
  const item = lookup(key);
  if (!item) return;
  const e = getEntry(item.type, item.id);
  const el = popover(anchor, html`
    <div class="ph">${item.type === 'manga' ? 'Reading list' : 'Watch list'}</div>
    ${STATUSES.map((s) => html`<button data-status="${s}" class="${e?.status === s ? 'on' : ''}">${icon(e?.status === s ? 'check' : 'bookmark')} ${statusLabel(s, item.type)}</button>`)}
    ${e ? html`<hr><button data-status="__remove">${icon('trash')} Remove from list</button>` : ''}`);
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-status]');
    if (!b) return;
    setStatus(item, b.dataset.status);
    closePopover();
  });
}
export function setStatus(item, status) {
  if (status === '__remove') { removeEntry(item.type, item.id); toast('Removed from your list'); return; }
  const patch = { status };
  if (status === 'completed' && item.total) patch.progress = item.total;
  saveEntry(item.type, item.id, patch, { title: item.title, cover: item.cover, total: item.total, format: item.format, contentRating: item.contentRating });
  toast(`Added to “${statusLabel(status, item.type)}”`);
}

/** Keep every visible quick-add button in sync with the library. */
function syncQuick() {
  $$('.quick[data-key]').forEach((b) => {
    const [type, ...rest] = b.dataset.key.split(':');
    const e = getEntry(type, rest.join(':'));
    b.classList.toggle('on', !!e);
    b.innerHTML = icon(e ? 'check' : 'plus').toString();
  });
}

/** One-time global delegated listeners. */
export function bindGlobalUi() {
  on(document, 'click', '[data-action="lib-menu"]', (ev, t) => { ev.preventDefault(); ev.stopPropagation(); openLibraryMenu(t, t.dataset.key); });
  on(document, 'click', '[data-rail]', (ev, t) => {
    const track = t.parentElement.querySelector('.rail-track');
    track.scrollBy({ left: Number(t.dataset.rail) * track.clientWidth * 0.85, behavior: 'smooth' });
  });
  document.addEventListener('click', (e) => { if (openPop && !openPop.contains(e.target) && !e.target.closest('[data-action="lib-menu"], [data-pop]')) closePopover(); }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopover(); });
  window.addEventListener('scroll', closePopover, { passive: true });
  // broken images fall back to a placeholder instead of a broken icon
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement && !t.classList.contains('rpage') && !t.dataset.failed) { t.dataset.failed = '1'; t.src = PLACEHOLDER; }
  }, true);
  subscribe((kind) => { if (kind === 'library' || kind === 'import') syncQuick(); });
}

/* ---------- Misc view helpers ------------------------------------------------------------------- */
export const chips = (list, hrefFn, cls = '') => html`<div class="chips ${cls}">${list.map((g) => html`<a class="chip" href="${hrefFn(g)}">${g}</a>`)}</div>`;
export { fmtNum, seasonLabel };
