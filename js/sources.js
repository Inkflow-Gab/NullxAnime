// Official and user-supplied source helpers (other player integrations live in watch.js):
//   1. Official links AniList lists for a title (Crunchyroll, Netflix, Muse Asia, ... — YouTube ones play inline)
//   2. Official trailers / PVs
//   3. The Internet Archive's public-domain / Creative-Commons library
//   4. Your own files and links (stored only in your browser)
// Add a new provider by returning another descriptor from `buildSources()` and teaching pages/watch.js to render its `kind`.

import { safeUrl, hostOf } from './util.js';

/* ---------- YouTube / Dailymotion helpers ----------------------------------------- */
export function youtubeInfo(url) {
  const u = safeUrl(url);
  if (!u) return null;
  const x = new URL(u);
  const h = x.hostname.replace(/^(www|m|music)\./, '');
  if (h === 'youtu.be') return { kind: 'video', id: x.pathname.slice(1).split('/')[0], start: Number(x.searchParams.get('t')) || 0 };
  if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    const list = x.searchParams.get('list');
    if (x.pathname === '/watch' && x.searchParams.get('v')) return { kind: 'video', id: x.searchParams.get('v'), list, start: Number(x.searchParams.get('t')) || 0 };
    if (x.pathname === '/playlist' && list) return { kind: 'playlist', id: list };
    const m = x.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/);
    if (m) return { kind: 'video', id: m[1] };
  }
  return null;
}
export function youtubeEmbed(info, { autoplay = false } = {}) {
  if (!info) return '';
  const base = 'https://www.youtube-nocookie.com/embed/';
  const p = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' });
  if (autoplay) p.set('autoplay', '1');
  if (info.kind === 'playlist') { p.set('list', info.id); return `${base}videoseries?${p}`; }
  if (info.list) p.set('list', info.list);
  if (info.start) p.set('start', String(info.start));
  return `${base}${encodeURIComponent(info.id)}?${p}`;
}
export function trailerEmbed(trailer, autoplay = true) {
  if (!trailer?.id) return '';
  if (trailer.site === 'youtube') return youtubeEmbed({ kind: 'video', id: trailer.id }, { autoplay });
  if (trailer.site === 'dailymotion') return `https://www.dailymotion.com/embed/video/${encodeURIComponent(trailer.id)}${autoplay ? '?autoplay=1' : ''}`;
  return '';
}

/* ---------- Official links ------------------------------------------------------------ */
export function streamLinks(media) {
  return (media.externalLinks || [])
    .filter((l) => l.type === 'STREAMING' && !l.isDisabled && safeUrl(l.url))
    .map((l) => ({ site: l.site, url: safeUrl(l.url), color: l.color, language: l.language, yt: youtubeInfo(l.url) }));
}
export function infoLinks(media) {
  return (media.externalLinks || [])
    .filter((l) => l.type !== 'STREAMING' && !l.isDisabled && safeUrl(l.url))
    .map((l) => ({ site: l.site, url: safeUrl(l.url), color: l.color, type: l.type }));
}

/** AniList lists official per-episode pages (usually Crunchyroll). Map them by episode number. */
export function episodeLinkMap(media) {
  const map = new Map();
  for (const e of media.streamingEpisodes || []) {
    const m = (e.title || '').match(/(?:episode|ep\.?)\s*(\d+)/i);
    if (m && !map.has(Number(m[1]))) map.set(Number(m[1]), { ...e, ep: Number(m[1]), name: (e.title || '').replace(/^.*?(?:episode|ep\.?)\s*\d+\s*[-–:]?\s*/i, '') });
  }
  return map;
}

export function episodeCount(m) {
  if (m.format === 'MOVIE' || m.format === 'MUSIC') return 1;
  if (m.episodes) return m.episodes;
  if (m.nextAiringEpisode) return Math.max(1, m.nextAiringEpisode.episode - 1);
  const map = episodeLinkMap(m);
  if (map.size) return Math.max(...map.keys());
  return m.status === 'NOT_YET_RELEASED' ? 0 : 1;
}

function region() {
  const r = (navigator.language || 'en-US').split('-')[1];
  return (r || 'US').toLowerCase();
}
/** Search links on official services (we never scrape or proxy any of them). */
export function officialSearchLinks(title) {
  const q = encodeURIComponent(title);
  return [
    { site: 'Crunchyroll', url: `https://www.crunchyroll.com/search?q=${q}`, color: '#f47521' },
    { site: 'Muse Asia (YouTube)', url: `https://www.youtube.com/@MuseAsia/search?query=${q}`, color: '#e11d48' },
    { site: 'Ani-One Asia (YouTube)', url: `https://www.youtube.com/@AniOneAsia/search?query=${q}`, color: '#ef4444' },
    { site: 'HIDIVE', url: `https://www.hidive.com/search?q=${q}`, color: '#00aeef' },
    { site: 'Netflix', url: `https://www.netflix.com/search?q=${q}`, color: '#e50914' },
    { site: 'Bilibili', url: `https://www.bilibili.tv/en/search-result?q=${q}`, color: '#00a1d6' },
    { site: 'JustWatch', url: `https://www.justwatch.com/${region()}/search?q=${q}`, color: '#fbc800' },
  ];
}

/** Playable-in-page source descriptors for the watch page. */
export function buildSources(media, ep) {
  const out = [];
  const links = streamLinks(media);
  const ytLinks = links.filter((l) => l.yt);
  for (const l of ytLinks) out.push({ id: `yt-${out.length}`, kind: 'embed', label: `${l.site} (official)`, note: 'Official free stream on YouTube', src: youtubeEmbed(l.yt), url: l.url });
  const t = trailerEmbed(media.trailer, false);
  if (t) out.push({ id: 'trailer', kind: 'embed', label: 'Official trailer / PV', note: 'Official promotional video', src: t, url: media.trailer.site === 'youtube' ? `https://youtu.be/${media.trailer.id}` : '' });
  return out;
}
export { hostOf };
