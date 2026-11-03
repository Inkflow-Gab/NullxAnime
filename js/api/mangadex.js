// MangaDex public API client — manga search, chapters and the page reader.
// Docs: https://api.mangadex.org/docs/
// Adult ratings are requested only after the viewer opts in locally.

import { cached, MIN, HOUR } from '../cache.js';
import { qs, sleep } from '../util.js';
import { getSettings } from '../store.js';

const API = 'https://api.mangadex.org';
const COVERS = 'https://uploads.mangadex.org/covers';
const SAFE_RATINGS = ['safe', 'suggestive'];
const ADULT_RATINGS = ['erotica', 'pornographic'];
export const mangaRatings = (adultOnly = false) => getSettings().adultManga === true ? (adultOnly ? ADULT_RATINGS.slice() : [...SAFE_RATINGS, ...ADULT_RATINGS]) : SAFE_RATINGS.slice();

let lastAt = 0;
async function call(path, params = {}, attempt = 0) {
  const wait = lastAt + 220 - Date.now(); // stay far below the 5 req/s limit
  lastAt = Date.now() + Math.max(0, wait);
  if (wait > 0) await sleep(wait);
  const q = qs(params);
  const res = await fetch(`${API}${path}${q ? `?${q}` : ''}`, { headers: { Accept: 'application/json' } });
  if (res.status === 429 && attempt < 2) {
    await sleep(((Number(res.headers.get('Retry-After')) || 3) + 0.5) * 1000);
    return call(path, params, attempt + 1);
  }
  if (!res.ok) {
    let msg = `MangaDex error ${res.status}`;
    try { const j = await res.json(); if (j.errors?.[0]?.detail) msg = j.errors[0].detail; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

/* ---------- Normalisers ---------------------------------------------------------- */
const pickLang = (obj) => {
  if (!obj) return '';
  return obj.en || obj['ja-ro'] || obj['ko-ro'] || obj['zh-ro'] || Object.values(obj)[0] || '';
};
export function normManga(m) {
  const a = m.attributes || {};
  const rel = (t) => (m.relationships || []).filter((r) => r.type === t);
  const cover = rel('cover_art')[0]?.attributes?.fileName;
  const authors = [...new Set(rel('author').map((r) => r.attributes?.name).filter(Boolean))];
  const artists = [...new Set(rel('artist').map((r) => r.attributes?.name).filter(Boolean))];
  return {
    id: m.id, type: 'manga',
    title: pickLang(a.title),
    altTitles: (a.altTitles || []).map(pickLang).filter(Boolean),
    description: pickLang(a.description),
    cover: cover ? `${COVERS}/${m.id}/${cover}.512.jpg` : '',
    coverLarge: cover ? `${COVERS}/${m.id}/${cover}` : '',
    status: a.status, year: a.year, demographic: a.publicationDemographic, contentRating: a.contentRating,
    originalLanguage: a.originalLanguage, lastChapter: a.lastChapter, lastVolume: a.lastVolume,
    langs: a.availableTranslatedLanguages || [],
    tags: (a.tags || []).map((t) => ({ id: t.id, name: t.attributes?.name?.en, group: t.attributes?.group })).filter((t) => t.name),
    authors, artists,
    links: a.links || {},
    updatedAt: a.updatedAt,
  };
}
export function normChapter(c) {
  const a = c.attributes || {};
  const groups = (c.relationships || []).filter((r) => r.type === 'scanlation_group').map((r) => r.attributes?.name).filter(Boolean);
  return {
    id: c.id, chapter: a.chapter, volume: a.volume, title: a.title || '', lang: a.translatedLanguage, pages: a.pages || 0,
    publishAt: a.publishAt ? new Date(a.publishAt).getTime() : 0, groups, externalUrl: a.externalUrl || '',
    mangaId: (c.relationships || []).find((r) => r.type === 'manga')?.id,
  };
}

/* ---------- Lists --------------------------------------------------------------- */
const LIST_BASE = (lang) => ({
  limit: 24,
  'includes[]': ['cover_art', 'author', 'artist'],
  'contentRating[]': mangaRatings(),
  'availableTranslatedLanguage[]': lang ? [lang] : undefined,
  hasAvailableChapters: 'true',
});

export function listManga({ q, order = { followedCount: 'desc' }, offset = 0, limit = 24, lang = 'en', tags, excludeTags, origin, status, demographic, year, adultOnly = false } = {}) {
  const params = { ...LIST_BASE(lang), limit, offset, 'contentRating[]': mangaRatings(adultOnly) };
  if (q) params.title = q;
  for (const [k, v] of Object.entries(order)) params[`order[${k}]`] = v;
  if (tags?.length) { params['includedTags[]'] = tags; params.includedTagsMode = 'AND'; }
  if (excludeTags?.length) params['excludedTags[]'] = excludeTags;
  if (origin?.length) params['originalLanguage[]'] = origin;
  if (status) params['status[]'] = [status];
  if (demographic) params['publicationDemographic[]'] = [demographic];
  if (year) params.year = year;
  const key = `md:list:${JSON.stringify(params)}`;
  return cached(key, 10 * MIN, async () => {
    const j = await call('/manga', params);
    return { items: j.data.map(normManga).filter((m) => params['contentRating[]'].includes(m.contentRating)), total: j.total, offset: j.offset, hasNext: j.offset + j.data.length < j.total };
  });
}

export async function mangaHome(lang = 'en') {
  const [popular, latest, top, manhwa, manhua, fresh] = await Promise.all([
    listManga({ lang, order: { followedCount: 'desc' }, limit: 20 }),
    listManga({ lang, order: { latestUploadedChapter: 'desc' }, limit: 20 }),
    listManga({ lang, order: { rating: 'desc' }, limit: 20 }),
    listManga({ lang, order: { followedCount: 'desc' }, origin: ['ko'], limit: 20 }),
    listManga({ lang, order: { followedCount: 'desc' }, origin: ['zh', 'zh-hk'], limit: 20 }),
    listManga({ lang, order: { createdAt: 'desc' }, limit: 20 }),
  ]);
  return { popular: popular.items, latest: latest.items, top: top.items, manhwa: manhwa.items, manhua: manhua.items, fresh: fresh.items };
}

export function mangaDetail(id) {
  return cached(`md:m:${id}`, 30 * MIN, async () => {
    const j = await call(`/manga/${id}`, { 'includes[]': ['cover_art', 'author', 'artist'] });
    const m = normManga(j.data);
    try {
      const st = await call(`/statistics/manga/${id}`);
      const s = st.statistics?.[id];
      if (s) { m.rating = s.rating?.bayesian || null; m.follows = s.follows || 0; }
    } catch { /* stats are optional */ }
    return m;
  });
}

/** All chapters for a language, oldest → newest, plus alternates for the same chapter number. */
export function chapterFeed(id, lang = 'en') {
  const ratings = mangaRatings();
  return cached(`md:feed:${id}:${lang}:${ratings.join(',')}`, 10 * MIN, async () => {
    const all = [];
    for (let offset = 0; offset < 2000; offset += 500) {
      const j = await call(`/manga/${id}/feed`, {
        limit: 500, offset, 'translatedLanguage[]': [lang],
        'order[volume]': 'asc', 'order[chapter]': 'asc',
        'contentRating[]': ratings,
        'includes[]': ['scanlation_group'],
        includeExternalUrl: 0,
        includeFuturePublishAt: 0,
        includeEmptyPages: 0,
      });
      all.push(...j.data.map(normChapter));
      if (offset + j.data.length >= j.total) break;
    }
    return dedupeChapters(all);
  });
}
function dedupeChapters(list) {
  const map = new Map();
  for (const c of list) {
    const key = `${c.volume ?? ''}|${c.chapter ?? c.title ?? c.id}`;
    const k = c.chapter != null ? `ch:${c.chapter}` : key;
    if (!map.has(k)) map.set(k, { ...c, alts: [] });
    else {
      const base = map.get(k);
      // prefer the version with more pages as the primary
      if (c.pages > base.pages) { const alts = base.alts; map.set(k, { ...c, alts: [...alts, { ...base, alts: undefined }] }); }
      else base.alts.push(c);
    }
  }
  const out = Array.from(map.values());
  out.sort((a, b) => {
    const x = parseFloat(a.chapter), y = parseFloat(b.chapter);
    if (isNaN(x) && isNaN(y)) return a.publishAt - b.publishAt;
    if (isNaN(x)) return 1; if (isNaN(y)) return -1;
    return x - y;
  });
  return out;
}

/** Page URLs for the reader. `dataSaver` swaps in the compressed images. */
export async function chapterPages(chapterId, dataSaver = false) {
  const j = await cached(`md:pages:${chapterId}`, 8 * MIN, () => call(`/at-home/server/${chapterId}`), { persist: false });
  const { baseUrl, chapter } = j;
  const files = dataSaver && chapter.dataSaver?.length ? chapter.dataSaver : chapter.data;
  const folder = dataSaver && chapter.dataSaver?.length ? 'data-saver' : 'data';
  return files.map((f) => `${baseUrl}/${folder}/${chapter.hash}/${f}`);
}

export async function chapterInfo(chapterId) {
  return cached(`md:ch:${chapterId}`, 30 * MIN, async () => {
    const j = await call(`/chapter/${chapterId}`, { 'includes[]': ['manga', 'scanlation_group'] });
    return normChapter(j.data);
  });
}

export function tagList() {
  return cached('md:tags', 24 * HOUR, async () => {
    const j = await call('/manga/tag');
    return j.data
      .map((t) => ({ id: t.id, name: t.attributes.name.en, group: t.attributes.group }))
      .filter((t) => t.name && !/^(Sexual Violence)$/i.test(t.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function randomManga() {
  const j = await call('/manga/random', { 'includes[]': ['cover_art', 'author', 'artist'], 'contentRating[]': mangaRatings() });
  return normManga(j.data);
}

export const LANGS = [
  ['en', 'English'], ['es', 'Spanish'], ['es-la', 'Spanish (LATAM)'], ['pt-br', 'Portuguese (BR)'], ['fr', 'French'], ['de', 'German'],
  ['it', 'Italian'], ['id', 'Indonesian'], ['vi', 'Vietnamese'], ['th', 'Thai'], ['ru', 'Russian'], ['tr', 'Turkish'], ['ar', 'Arabic'],
  ['pl', 'Polish'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese (Simplified)'], ['zh-hk', 'Chinese (Traditional)'],
];
