// Clients for the AnimeGG streaming worker and AniPub catalogue.
import { safeUrl } from '../util.js';

export function baseUrl(value) {
  const url = safeUrl(String(value || '').trim());
  if (!url) throw new Error('Enter a valid HTTPS deployment URL.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Use an HTTPS deployment URL without credentials, a query or a fragment.');
  }
  return parsed.href.replace(/\/+$/, '');
}

async function json(url, signal) {
  let response;
  try { response = await fetch(url, { signal, credentials: 'omit' }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error('Could not reach the deployment. Check its URL, HTTPS and CORS settings.'); }
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(typeof detail?.error === 'string' ? detail.error : `Deployment returned HTTP ${response.status}.`);
  }
  const data = await response.json();
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export async function anipubSearch(base, query, signal) {
  const text = String(query || '').trim();
  if (text.length < 3) throw new Error('Search for at least three characters.');
  const data = await json(`${baseUrl(base)}/api/search/${encodeURIComponent(text)}`, signal);
  return (Array.isArray(data) ? data : [data]).filter((item) => /^\d+$/.test(String(item?.Id)) && item?.Name).slice(0, 50);
}

export function anipubPlayer(base, id, episode, audio = 'sub') {
  if (!/^\d+$/.test(String(id)) || !Number.isInteger(episode) || episode < 1 || !['sub', 'dub'].includes(audio)) throw new Error('Invalid AniPub title or episode.');
  return `${baseUrl(base)}/AniPlayer/${id}/${episode - 1}?type=${audio}`;
}

// The direct AniList/episode fallback used by Kitsune's watch player.
export const INSTANT_ORIGIN = 'https://megaplay.buzz';
export function instantEmbed(id, episode, audio = 'sub') {
  if (!/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id) < 1 || !Number.isSafeInteger(episode) || episode < 1 || !['sub', 'dub'].includes(audio)) throw new Error('Invalid title, episode or audio.');
  return `${INSTANT_ORIGIN}/stream/ani/${Number(id)}/${episode}/${audio}`;
}

// Aniweeb publishes an AniList-keyed episode-player embed, with numbered servers.
export function aniweebEmbed(id, episode, audio = 'sub', server = 1) {
  if (!/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id) < 1 || !Number.isSafeInteger(episode) || episode < 1 || !['sub', 'dub'].includes(audio) || ![1, 2].includes(server)) throw new Error('Invalid title, episode, audio or server.');
  return `https://api.aniweeb.net/embed/ani/${Number(id)}/${episode}?${new URLSearchParams({ track: audio, server: String(server) })}`;
}

// Separate, documented episode-player endpoints; providers control the streams.
export const EXTRA_PLAYERS = Object.freeze({
  supaplay: { label: 'SupaPlay', base: 'https://supaplay.fun' },
  aniembed: { label: 'AniEmbed', base: 'https://aniembed.se' },
  nexus: { label: 'Movies Nexus', base: 'https://www.moviesnexus.fun' },
});
export function extraEmbed(provider, id, episode, audio = 'sub') {
  if (!Object.hasOwn(EXTRA_PLAYERS, provider) || !/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id) < 1 || !Number.isSafeInteger(episode) || episode < 1 || !['sub', 'dub'].includes(audio)) throw new Error('Invalid player, title, episode or audio.');
  const base = EXTRA_PLAYERS[provider].base, title = Number(id);
  if (provider === 'supaplay') return `${base}/stream/ani/${title}/${episode}/${audio}`;
  if (provider === 'aniembed') return `${base}/e/${title}/${episode}?${new URLSearchParams({ lang: audio })}`;
  return `${base}/anime/${title}/${episode}/${audio}`;
}

/** Senshi embed mirrors exposed by the separately deployed worker. */
export function senshiWatch(base, mal, episode, audio, signal) {
  if (!Number.isSafeInteger(Number(mal)) || Number(mal) < 1 || !Number.isSafeInteger(episode) || episode < 1 || !['sub', 'dub'].includes(audio)) throw new Error('Invalid title, episode or audio.');
  return json(`${baseUrl(base)}/senshi?${new URLSearchParams({ mal: String(mal), episode: String(episode), audio })}`, signal);
}

/** Client for NullxAnime's own AnimeGG worker. */
export function animeggSearch(base, query, signal) {
  const q = String(query || '').trim();
  if (q.length < 3 || q.length > 150) throw new Error('Search for 3–150 characters.');
  return json(`${baseUrl(base)}/search?${new URLSearchParams({ q })}`, signal);
}
export function animeggEpisodes(base, slug, signal) {
  if (!/^[a-z\d][a-z\d-]{0,199}$/i.test(slug)) throw new Error('Invalid series.');
  return json(`${baseUrl(base)}/series?${new URLSearchParams({ slug })}`, signal);
}
export function animeggWatch(base, slug, episode, audio, signal) {
  if (!/^[a-z\d][a-z\d-]{0,199}$/i.test(slug) || !Number.isInteger(episode) || episode < 1 || !['sub', 'dub'].includes(audio)) throw new Error('Invalid episode.');
  return json(`${baseUrl(base)}/watch?${new URLSearchParams({ slug, episode: String(episode), audio })}`, signal);
}

/** Extract only the actual player source from AniPub's rendered episode page. */
export async function anipubSource(base, id, episode, audio, signal) {
  const pageUrl = anipubPlayer(base, id, episode, audio);
  let response;
  try { response = await fetch(pageUrl, { signal, credentials: 'omit' }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error('AniPub episode could not be read. Check CORS and availability.'); }
  if (!response.ok) throw new Error(`AniPub returned HTTP ${response.status}.`);
  const limit = 2 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) throw new Error('AniPub episode page is too large.');
  let page = '';
  if (response.body) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new Error('AniPub episode page is too large.'); }
        page += decoder.decode(value, { stream: true });
      }
      page += decoder.decode();
    } finally { reader.releaseLock(); }
  }
  const document = new DOMParser().parseFromString(page, 'text/html');
  const video = document.querySelector('.video-section .video-container video');
  const frame = document.querySelector('.video-section .video-container > iframe');
  const raw = video?.querySelector('source[src]')?.getAttribute('src') || video?.getAttribute('src') || frame?.getAttribute('src');
  if (!raw) throw new Error('AniPub did not provide a player source for this episode.');
  const url = new URL(raw, pageUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('AniPub returned an invalid or insecure player URL.');
  return { kind: video ? 'video' : 'embed', url: url.href, pageUrl };
}
