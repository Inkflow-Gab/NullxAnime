// Clients for user-configured Kitsune and AniPub deployments.
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
  if (!response.ok) throw new Error(`Deployment returned HTTP ${response.status}.`);
  const data = await response.json();
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export function kitsuneEpisodes(base, id, signal) {
  if (!/^\d+$/.test(String(id))) throw new Error('Invalid AniList ID.');
  return json(`${baseUrl(base)}/api/episodes/${id}`, signal);
}

export function episodeOptions(data, number) {
  const choices = [];
  const providers = { ...data, ...(data?.providers || {}) };
  for (const [provider, entry] of Object.entries(providers)) {
    if (!/^[\w-]+$/.test(provider) || entry?.error) continue;
    for (const audio of ['sub', 'dub']) {
      const episodes = entry?.episodes?.[audio];
      if (!Array.isArray(episodes)) continue;
      const match = episodes.find((e) => Number(e.number) === Number(number));
      const path = String(match?.id || '').replace(/^\/+/, '');
      if (/^watch\/[\w/-]+$/.test(path)) choices.push({ provider, audio, path });
    }
  }
  return choices;
}

export function kitsuneWatch(base, path, signal) {
  if (!/^watch\/[\w/-]+$/.test(path)) throw new Error('Invalid episode path.');
  return json(`${baseUrl(base)}/api/${path}`, signal);
}

export function kitsuneStreams(data) {
  return (Array.isArray(data?.streams) ? data.streams : []).filter((s) => {
    const url = safeUrl(s?.url);
    return url && s.isActive !== false && (/^(hls|m3u8|mp4)$/i.test(s.type || '') || /\.m3u8(?:[?#]|$)/i.test(url));
  }).sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

export function kitsuneProxy(base, url, source = {}) {
  const target = safeUrl(url);
  if (!target) return '';
  const params = new URLSearchParams({ url: target });
  const referer = safeUrl(source.referer || source.headers?.Referer || source.headers?.referer);
  if (referer) params.set('referer', referer);
  if (source.headers && typeof source.headers === 'object') params.set('headers', JSON.stringify(source.headers));
  if (source.playlist_key || source.key) params.set('playlist_key', String(source.playlist_key || source.key));
  return `${baseUrl(base)}/api/proxy?${params}`;
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
