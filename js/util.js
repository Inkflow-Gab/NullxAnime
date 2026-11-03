// Small, dependency-free helpers shared by the whole app.

/* ---------- Safe HTML templating ---------------------------------------
 * `html` is a tagged template that escapes every interpolated value unless it
 * is itself the result of `html` (or `raw()`).  Arrays are flattened.  This keeps
 * API data (titles, descriptions, ...) from ever becoming markup.
 */
class SafeHTML {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => new SafeHTML(String(s ?? ''));
function part(v) {
  if (v == null || v === false) return '';
  if (v instanceof SafeHTML) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new SafeHTML(out);
}
export const render = (el, safe) => { el.innerHTML = part(safe); return el; };

/* ---------- DOM ---------------------------------------------------------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function on(root, type, selector, handler, opts) {
  root.addEventListener(type, (e) => {
    const t = e.target instanceof Element ? e.target.closest(selector) : null;
    if (t && root.contains(t)) handler(e, t);
  }, opts);
}

/* ---------- Functions ------------------------------------------------------ */
// AbortSignal.timeout is missing on some older browsers, but AbortController is common.
export function requestTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  if (typeof AbortController === 'undefined') return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export function debounce(fn, ms = 250) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/* ---------- Text -------------------------------------------------------------- */
/** AniList descriptions contain a little HTML. Keep a tiny allow-list, drop everything else. */
export function cleanAniHtml(s) {
  if (!s) return raw('');
  let t = String(s).replace(/<(?!\/?(br|i|b|em|strong)\b)[^>]*>/gi, '');
  t = esc(t)
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;(\/?)(i|b|em|strong)&gt;/gi, '<$1$2>');
  // unbalanced tags would leak formatting – close anything left open
  for (const tag of ['i', 'b', 'em', 'strong']) {
    const open = (t.match(new RegExp(`<${tag}>`, 'gi')) || []).length;
    const close = (t.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    if (open > close) t += `</${tag}>`.repeat(open - close);
    if (close > open) t = t.replace(new RegExp(`</${tag}>`, 'gi'), '');
  }
  return raw(t);
}
/** MangaDex descriptions are Markdown: keep the synopsis, drop link sections. */
export function cleanMarkdown(s) {
  if (!s) return raw('');
  let t = String(s).split(/\n\s*(?:---+|___+|\*\*\*+)\s*\n/)[0];
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#>]+/g, '').trim();
  return raw(esc(t).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>'));
}
export function mdPlain(s) {
  if (!s) return '';
  return String(s).split(/\n\s*(?:---+|___+|\*\*\*+)\s*\n/)[0].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
}
export const plain = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s_-])\w/g, (m) => m.toUpperCase()).replace(/_/g, ' ');
export const pad = (n, l = 2) => String(n).padStart(l, '0');

/* ---------- Numbers / time -------------------------------------------------- */
export const fmtNum = (n) => (n == null ? '–' : new Intl.NumberFormat('en', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n));
export function fmtClock(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export function fmtCountdown(sec) {
  if (sec <= 0) return 'now';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}
export function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
export const fmtLocalDateTime = (unix) => new Date(unix * 1000).toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
// Calendar arithmetic preserves local midnights through daylight-saving transitions.
export function localDayStarts(count, now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d.getTime(); });
}
export const fmtTime = (unix) => new Date(unix * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtDateShort = (unix) => new Date(unix * 1000).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
export function fmtFuzzyDate(d) {
  if (!d || !d.year) return '?';
  const m = d.month ? new Date(2000, d.month - 1, 1).toLocaleString('en', { month: 'short' }) : '';
  return [m, d.day, d.year].filter(Boolean).join(' ');
}

/* ---------- URL / query -------------------------------------------------------- */
/** Build a query string, supporting arrays as repeated `key[]`-style params (MangaDex). */
export function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.append(k, v);
  }
  return u.toString();
}
export const hashQuery = (params) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '' && v !== false) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
};
export const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/* ---------- Dates / seasons ------------------------------------------------------ */
export function currentSeason(date = new Date()) {
  const m = date.getMonth();
  const season = ['WINTER', 'WINTER', 'WINTER', 'SPRING', 'SPRING', 'SPRING', 'SUMMER', 'SUMMER', 'SUMMER', 'FALL', 'FALL', 'FALL'][m];
  return { season, year: date.getFullYear() };
}
export function nextSeason(date = new Date()) {
  const order = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  const c = currentSeason(date);
  const i = order.indexOf(c.season);
  return i === 3 ? { season: 'WINTER', year: c.year + 1 } : { season: order[i + 1], year: c.year };
}
export const seasonLabel = (s, y) => (s ? `${titleCase(s)} ${y || ''}`.trim() : y ? String(y) : '');
export function startOfDay(ts = Date.now()) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

/* ---------- Misc ----------------------------------------------------------------- */
export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } finally { ta.remove(); }
  return Promise.resolve();
}
export function download(filename, text, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export const uid = () => Math.random().toString(36).slice(2, 10);
export function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
