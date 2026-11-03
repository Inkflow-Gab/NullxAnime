// JSON-based community catalogues. These services control access and may change.
import { cached, MIN } from '../cache.js';
import { sleep } from '../util.js';
import { mangaJSON } from './mangaTransport.js';
import { getSettings } from '../store.js';

export const SCANS = Object.freeze({
  omega: { label: 'Omega Scans', origin: 'https://api.omegascans.org', image: 'https://media.omegascans.org', adult: true },
  vortex: { label: 'Vortex Scans', origin: 'https://api.vortexscans.org', image: 'https://storage.vortexscans.org' },
  hive: { label: 'Hivetoons', origin: 'https://api.hivetoons.org', image: 'https://storage.hivetoon.com' },
});
const nextRequest = new Map();
export function sourceOf(key) {
  if (!Object.hasOwn(SCANS, key)) throw new Error('Unknown reading source.');
  return SCANS[key];
}
function id(value) {
  const s = String(value);
  if (!/^[a-z0-9][a-z0-9-]{0,199}$/.test(s)) throw new Error('Invalid source identifier.');
  return s;
}
function numeric(value) {
  const s = String(value);
  if (!/^[1-9]\d{0,9}$/.test(s)) throw new Error('Invalid source ID.');
  return s;
}
function image(src, config) {
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && u.origin === config.image && !u.username && !u.password ? u.href : '';
  } catch { return ''; }
}
async function request(source, path) {
  const config = sourceOf(source);
  const wait = Math.max(0, (nextRequest.get(source) || 0) - Date.now());
  nextRequest.set(source, Date.now() + wait + 1100);
  if (wait) await sleep(wait);
  if (config.adult && getSettings().adultManga !== true) throw new Error('Enable 18+ manga in Settings to access this source.');
  try { return await mangaJSON(source, config.origin + path, path); }
  catch (error) { if (/^HTTP \d+$/.test(error.message)) throw new Error(`${config.label} returned ${error.message}. Try again later.`); throw new Error(`${config.label} could not be reached. Browser cross-origin restrictions, a provider check or regional blocking may prevent access.`); }
}
function omegaSeries(item, config) {
  return { id: numeric(item.id), slug: id(item.series_slug), title: String(item.title || 'Untitled'), cover: image(item.thumbnail, config), description: String(item.description || ''), status: String(item.status || ''), type: 'Comic', author: String(item.author || '') };
}
function ikenSeries(item, config) {
  if (item.isNovel || String(item.seriesType).toUpperCase() === 'NOVEL') return null;
  return { id: numeric(item.id), slug: id(item.slug), title: String(item.postTitle || 'Untitled'), cover: image(item.featuredImage, config), description: String(item.postContent || ''), status: String(item.seriesStatus || ''), type: String(item.seriesType || 'Comic'), author: String(item.author || ''), updatedAt: Math.max(0, ...(Array.isArray(item.chapters) ? item.chapters : []).filter((c) => !c.isLocked && !c.isTimeLocked && !c.isPermanentlyLocked && !c.isShortLinkLocked && c.isAccessible !== false && Number(c.price || 0) === 0).map((c) => Date.parse(c.createdAt || '') || 0)) };
}
export function scansSearch(source, query = '', page = 1, sort = 'popular') {
  const config = sourceOf(source);
  if (config.adult && getSettings().adultManga !== true) throw new Error('Enable 18+ manga in Settings to access this source.');
  if (!Number.isInteger(page) || page < 1 || page > 500) throw new Error('Invalid page.');
  const q = String(query).trim().slice(0, 150);
  if (!['popular', 'latest'].includes(sort)) throw new Error('Invalid sort.');
  const params = source === 'omega'
    ? new URLSearchParams({ query_string: q, status: 'All', order: 'desc', orderBy: 'total_views', series_type: 'Comic', page: String(page), perPage: '18', tags_ids: '[]', adult: 'true' })
    : new URLSearchParams({ searchTerm: q, orderBy: sort === 'latest' ? 'latestChapter' : 'totalViews', page: String(page), perPage: '18' });
  return cached(`scans:${source}:search:${params}`, 5 * MIN, async () => {
    const body = await request(source, `${source === 'omega' ? '/query' : '/api/query'}?${params}`);
    const data = source === 'omega' ? body.data : body.posts;
    if (!Array.isArray(data)) throw new Error(`${config.label} returned an invalid catalogue.`);
    const items = data.flatMap((x) => { try { const item = source === 'omega' ? omegaSeries(x, config) : ikenSeries(x, config); return item ? [item] : []; } catch { return []; } });
    const hasNext = source === 'omega' ? Number(body.meta?.current_page) < Number(body.meta?.last_page) : page * 18 < Number(body.totalCount || 0);
    return { items, hasNext };
  });
}
export function scansDetails(source, slug) {
  const config = sourceOf(source), key = id(slug);
  if (config.adult && getSettings().adultManga !== true) throw new Error('Enable 18+ manga in Settings to access this source.');
  return cached(`scans:${source}:detail:${key}`, 10 * MIN, async () => {
    const body = await request(source, source === 'omega' ? `/series/${key}` : `/api/post?postSlug=${encodeURIComponent(key)}`);
    const result = source === 'omega' ? omegaSeries(body, config) : ikenSeries(body.post || {}, config);
    if (!result || result.slug !== key) throw new Error('This series was not found.');
    return result;
  });
}
export async function scansChapters(source, slug, seriesId) {
  sourceOf(source); id(slug); const series = numeric(seriesId);
  // Do not use stale cached access flags: paid and newly locked chapters must stay locked.
  const body = await request(source, source === 'omega' ? `/chapter/query?page=1&perPage=1000&series_id=${series}` : `/api/chapters?postId=${series}`);
  const data = source === 'omega' ? body.data : body.post?.chapters;
  if (!Array.isArray(data)) throw new Error('The source returned an invalid chapter list.');
  const available = source === 'omega'
    ? data.filter((c) => c.price === 0 && (!c.created_at || Date.parse(c.created_at) <= Date.now()))
    : data.filter((c) => !c.isLocked && !c.isTimeLocked && !c.isPermanentlyLocked && !c.isShortLinkLocked && c.isAccessible !== false && Number(c.price || 0) === 0);
  return available.flatMap((c) => {
    try {
      const chapter = source === 'omega' ? id(c.chapter_slug) : numeric(c.id);
      const number = source === 'omega' ? Number(String(c.chapter_name || '').match(/[\d.]+/)?.[0]) : Number(c.number);
      return [{ id: chapter, number: Number.isFinite(number) ? number : 0, label: source === 'omega' ? String(c.chapter_name || chapter) : `Chapter ${c.number}`, title: String(source === 'omega' ? c.chapter_title || '' : c.title || '') }];
    } catch { return []; }
  }).sort((a, b) => a.number - b.number);
}
export async function scansPages(source, slug, chapter, seriesId) {
  const config = sourceOf(source), key = id(slug), series = numeric(seriesId);
  const chapterId = source === 'omega' ? id(chapter) : numeric(chapter);
  const body = await request(source, source === 'omega' ? `/chapter/${key}/${chapterId}` : `/api/chapter?chapterId=${chapterId}`);
  const c = body.chapter;
  if (!c || body.paywall || c.isLockedByCoins || c.isPermanentlyLocked || c.isShortLinkLocked || c.isLocked || c.isTimeLocked || c.isAccessible === false || Number(c.price || 0) > 0) throw new Error('This chapter is locked or unavailable.');
  if (String(source === 'omega' ? c.series_id : c.mangaPostId) !== series || (source === 'omega' ? c.chapter_slug !== chapterId : String(c.id) !== chapterId)) throw new Error('The source returned a different chapter.');
  const raw = source === 'omega' ? c.chapter_data?.images : c.images;
  if (!Array.isArray(raw)) throw new Error('No readable pages were returned.');
  const pages = (source === 'omega' ? raw : raw.slice().sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)).map((p) => p.url)).map((p) => image(p, config)).filter(Boolean).slice(0, 500);
  if (!pages.length) throw new Error('No readable pages were returned.');
  return pages;
}
