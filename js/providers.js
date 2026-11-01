// Streaming provider layer.
//
// The watch page no longer hard-codes any website. A *provider* turns
// (anime + episode) into playable media, and the UI just lists whatever the
// registry returns. Two providers ship by default:
//
//   1. `direct`  — a video / HLS URL, or a URL *template*, that you own or are
//                  allowed to use (your own media server, a CDN, a friend's box…)
//   2. `archive` — the Internet Archive's public-domain / Creative-Commons library
//
// Adding more is a few lines: see docs/PROVIDERS.md. Please only register
// sources you have the right to distribute — see the notice in About.

import { searchOpenVideo, itemFiles, archiveUrl } from './api/archive.js';
import { safeUrl, hostOf } from './util.js';

/* ---------- storage ---------------------------------------------------------
 * Configs live in localStorage next to everything else:
 *   nx:src = { "direct:<anilistId>": { template, subtitle, label }, "direct:*": {...} }
 * `direct:*` is the default used for every title when a title-specific entry
 * is missing. This is why the user can set one template and browse everything.
 */
const STORE = 'nx:src';
export const DEFAULT_TITLE = '*';

function loadConfigs() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function saveConfigs(all) {
  try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) { console.warn('storage full?', e); }
}
export function getSourceConfig(providerId, id) {
  const all = loadConfigs();
  return all[`${providerId}:${id}`] || all[`${providerId}:${DEFAULT_TITLE}`] || null;
}
export function setSourceConfig(providerId, id, cfg) {
  const all = loadConfigs();
  const key = `${providerId}:${id || DEFAULT_TITLE}`;
  if (cfg) all[key] = cfg; else delete all[key];
  saveConfigs(all);
}

/* ---------- template helpers ------------------------------------------------ */
export const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Replace {id} {idMal} {ep} {ep0} {title} {slug} in a URL template. */
export function expandTemplate(tpl, ctx) {
  const ep = Number(ctx.ep) || 1;
  return String(tpl)
    .replace(/\{idMal\}/g, String(ctx.idMal || ctx.id || ''))
    .replace(/\{id\}/g, String(ctx.id ?? ''))
    .replace(/\{ep0\}/g, String(ep).padStart(2, '0'))
    .replace(/\{ep\}/g, String(ep))
    .replace(/\{title\}/g, encodeURIComponent(ctx.title || ''))
    .replace(/\{slug\}/g, slugify(ctx.title));
}

const isHlsUrl = (u) => /\.m3u8(\?|#|$)/i.test(u);
const isVideoUrl = (u) => /\.(mp4|m4v|webm|ogv|mkv|mov)(\?|#|$)/i.test(u);

/** Make one provider result safe + uniform. Returns null for anything unusable. */
export function normalizeItem(raw, provider) {
  const src = safeUrl(raw?.src || raw?.url || '');
  if (!src) return null;
  const typeRaw = String(raw.type || '').toLowerCase();
  const type = typeRaw === 'hls' || typeRaw === 'video' ? typeRaw : isHlsUrl(src) ? 'hls' : 'video';
  const subtitles = (Array.isArray(raw.subtitles) ? raw.subtitles : [])
    .map((s) => (typeof s === 'string' ? { url: safeUrl(s), label: 'Subtitles' } : { url: safeUrl(s?.url), label: s?.label || s?.lang || 'Subtitles', lang: s?.lang }))
    .filter((s) => s.url);
  return {
    label: raw.label || hostOf(src) || provider.label,
    note: raw.note || '',
    src, type,
    poster: safeUrl(raw.poster || '') || '',
    page: safeUrl(raw.page || '') || '',
    quality: raw.quality || '',
    subtitles,
    provider: provider.label,
  };
}

/* ---------- registry -------------------------------------------------------- */
export const providers = [];

export function registerProvider(p) {
  if (!p || typeof p.id !== 'string' || typeof p.resolve !== 'function') {
    throw new Error('A provider needs a string `id` and a `resolve(ctx)` function.');
  }
  const existing = providers.findIndex((x) => x.id === p.id);
  const entry = { label: p.id, note: '', ...p };
  if (existing >= 0) providers[existing] = entry; else providers.push(entry);
  return entry;
}
export const providerList = () => providers.slice();

/** Ask every provider for playable sources. Never throws: failures are reported per provider. */
export async function resolveSources(ctx) {
  const groups = await Promise.all(providers.map(async (p, order) => {
    try {
      const items = await p.resolve(ctx);
      const list = (Array.isArray(items) ? items : items ? [items] : []).map((x) => normalizeItem(x, p)).filter(Boolean);
      return { order, provider: p, items: list };
    } catch (e) {
      return { order, provider: p, items: [], error: e?.message || 'Could not reach this provider' };
    }
  }));
  return groups.filter((g) => g.items.length || g.error).sort((a, b) => a.order - b.order);
}

/* ---------- provider 1: your own stream / template -------------------------- */
registerProvider({
  id: 'direct',
  label: 'My stream',
  note: 'A video or HLS link (or URL template) you are allowed to use',
  async resolve(ctx) {
    const cfg = getSourceConfig('direct', ctx.id);
    if (!cfg?.template) return [];
    const src = safeUrl(expandTemplate(cfg.template, ctx));
    if (!src) return [];
    const sub = cfg.subtitle ? safeUrl(expandTemplate(cfg.subtitle, ctx)) : '';
    return [{
      label: cfg.label?.trim() || hostOf(src) || 'My stream',
      src,
      note: sub ? 'With subtitles' : '',
      quality: cfg.quality || '',
      subtitles: sub ? [{ url: sub, label: 'Subtitles' }] : [],
    }];
  },
});

/* ---------- provider 2: the open library ------------------------------------ */
registerProvider({
  id: 'archive',
  label: 'Internet Archive',
  note: 'Public-domain & Creative-Commons video',
  async resolve(ctx) {
    const hits = await searchOpenVideo(ctx.title, 4);
    if (!hits.length) return [];
    const info = await itemFiles(hits[0].id);
    return info.files.slice(0, 3).map((f) => ({
      label: (info.title || hits[0].title) + (info.files.length > 1 ? ` · ${f.name}` : ''),
      note: 'Open licence',
      src: f.url,
      poster: info.cover,
      page: archiveUrl(info.id),
    }));
  },
});
