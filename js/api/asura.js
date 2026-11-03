// Asura's JSON catalogue and chapter endpoints. Requests are direct, not a proxy.
// The API and its availability can change independently of NullxAnime.
import { cached, MIN } from '../cache.js';
import { sleep } from '../util.js';

const API = 'https://api.asurascans.com/api';
const CDN = 'https://cdn.asurascans.com';
let nextRequest = 0;
const slugOf = (v) => {
  if (!/^[a-z0-9][a-z0-9-]{0,199}$/.test(String(v))) throw new Error('Invalid Asura series.');
  return String(v);
};
const chapterOf = (v) => {
  if (!/^\d{1,6}(?:\.\d{1,4})?$/.test(String(v))) throw new Error('Invalid chapter number.');
  return String(v);
};
function imageUrl(value) {
  try {
    const url = new URL(value, CDN);
    if (url.protocol !== 'https:' || url.origin !== CDN || url.username || url.password || !url.pathname.startsWith('/asura-images/')) return '';
    return url.href;
  } catch { return ''; }
}
async function request(path) {
  const wait = Math.max(0, nextRequest - Date.now());
  nextRequest = Date.now() + wait + 1000; // extension's limit: two requests per two seconds
  if (wait) await sleep(wait);
  let response;
  try { response = await fetch(`${API}${path}`, { credentials: 'omit', headers: { Accept: 'application/json' } }); }
  catch { throw new Error('Asura is unavailable in this browser or region. Try again later.'); }
  if (!response.ok) throw new Error(`Asura returned HTTP ${response.status}. Try again later.`);
  return response.json();
}
function series(item) {
  return {
    slug: slugOf(item.slug), title: String(item.title || 'Untitled'),
    cover: imageUrl(item.cover || item.cover_url || ''),
    description: String(item.description || ''),
    type: String(item.type || 'comic'), status: String(item.status || ''),
    author: String(item.author || ''), count: Number(item.chapter_count) || 0,
  };
}
export function asuraSearch(query = '', page = 1) {
  const q = String(query).trim().slice(0, 150);
  if (!Number.isInteger(page) || page < 1 || page > 500) throw new Error('Invalid page.');
  const offset = (page - 1) * 20;
  const params = new URLSearchParams({ limit: '20', offset: String(offset), sort: 'popular' });
  if (q) params.set('search', q);
  return cached(`asura:search:${params}`, 5 * MIN, async () => {
    const body = await request(`/series?${params}`);
    const data = Array.isArray(body.data) ? body.data : [];
    return { items: data.flatMap((x) => { try { return [series(x)]; } catch { return []; } }), hasNext: offset + data.length < Number(body.meta?.total || 0) };
  });
}
export function asuraDetails(slug) {
  const id = slugOf(slug);
  return cached(`asura:detail:${id}`, 10 * MIN, async () => {
    const body = await request(`/series/${id}`);
    if (!body.series || body.series.slug !== id) throw new Error('Asura could not find this series.');
    return series(body.series);
  });
}
export function asuraChapters(slug) {
  const id = slugOf(slug);
  return cached(`asura:chapters:${id}`, 5 * MIN, async () => {
    const body = await request(`/series/${id}/chapters`);
    if (!Array.isArray(body.data)) throw new Error('Asura returned an invalid chapter list.');
    return body.data.filter((c) => !c.is_premium && (!c.early_access_until || Date.parse(c.early_access_until) <= Date.now()))
      .flatMap((c) => { try { return [{ number: chapterOf(c.number), title: String(c.title || ''), pages: Number(c.page_count) || 0 }]; } catch { return []; } })
      .sort((a, b) => Number(a.number) - Number(b.number));
  });
}
export async function asuraPages(slug, chapter) {
  const id = slugOf(slug), number = chapterOf(chapter);
  const body = await request(`/series/${id}/chapters/${number}`);
  if (body.data?.is_locked || body.data?.access_gate) throw new Error('This chapter is locked by Asura.');
  const chapterData = body.data?.chapter;
  if (!chapterData || String(chapterData.number) !== number || (chapterData.series_slug && chapterData.series_slug !== id)) throw new Error('Asura returned a different chapter.');
  const pages = (Array.isArray(chapterData.pages) ? chapterData.pages : []).map((p) => imageUrl(p.url)).filter(Boolean).slice(0, 500);
  if (!pages.length) throw new Error('No readable pages were returned.');
  return pages;
}
