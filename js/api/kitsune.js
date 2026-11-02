// Client for a compatible, separately hosted provider API. No upstream website is embedded.
import { baseUrl } from './community.js';

export const KITSUNE_PROVIDERS = Object.freeze(['mkissa', 'reanime', 'anikoto', 'animegg', 'animenosub', 'anizone', 'aniwaves', 'senshi', 'kaa', 'animedunya', 'animeonsen', 'anipm']);
const validId = (v) => /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const validEpisode = (v) => Number.isSafeInteger(v) && v > 0 && v <= 10000;
const validAudio = (v) => v === 'sub' || v === 'dub';

// Only accept public-looking HTTPS destinations; the backend must also enforce egress controls.
export function publicMediaUrl(value) {
  try {
    const u = new URL(value), host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || u.port || host.includes(':') || /^[\d.]+$/.test(host) || !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(host)) return '';
    return u.href;
  } catch { return ''; }
}
async function getJson(url, signal) {
  let response;
  try { response = await fetch(url, { signal, credentials: 'omit' }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error('Provider API unavailable. Check its HTTPS URL, CORS and deployment.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    if (data?.code === 'NEED_CAPTCHA' || /\bcaptcha\b/i.test(String(data?.error || ''))) throw new Error('MKissa requires a security check. Complete it with the provider and try again, or use another source.');
    throw new Error(typeof data?.error === 'string' ? data.error.slice(0, 200) : `Provider API returned HTTP ${response.status}.`);
  }
  if (!data || typeof data !== 'object') throw new Error('Invalid provider API response.');
  return data;
}
export function kitsuneEpisodes(base, id, signal, provider = '') {
  if (!validId(id) || (provider && !KITSUNE_PROVIDERS.includes(provider))) throw new Error('Invalid anime ID or provider.');
  const path = provider ? `episodes/${provider}/${Number(id)}?map=false` : `episodes/${Number(id)}`;
  return getJson(`${baseUrl(base)}/${path}`, signal);
}
export function kitsuneChoices(data, id, episode, audio) {
  if (!validId(id) || !validEpisode(episode) || !validAudio(audio)) throw new Error('Invalid title, episode or audio.');
  const providers = data?.providers || {};
  return KITSUNE_PROVIDERS.flatMap((name) => {
    const entries = providers[name]?.episodes?.[audio];
    if (!Array.isArray(entries)) return [];
    const expected = `watch/${name}/${Number(id)}/${audio}/${name}-${episode}`;
    const entry = entries.find((item) => Number(item?.number) === episode && String(item?.id || '').replace(/^\//, '') === expected);
    return entry ? [{ name, path: expected }] : [];
  });
}
export function kitsuneWatch(base, path, signal) {
  const match = String(path).match(/^watch\/([a-z]+)\/(\d+)\/(sub|dub)\/([a-z]+)-(\d+)$/);
  if (!match || !KITSUNE_PROVIDERS.includes(match[1]) || match[1] !== match[4] || !validId(match[2]) || !validEpisode(Number(match[5]))) throw new Error('Invalid provider episode.');
  return getJson(`${baseUrl(base)}/${path}`, signal);
}
export function kitsuneStreams(data) {
  // MKissa uses `sources` with extractedUrl/extractedType; other providers use `streams`.
  const rawStreams = Array.isArray(data?.streams) ? data.streams : [];
  const rawSources = Array.isArray(data?.sources) ? data.sources : [];
  const candidates = [
    ...rawStreams,
    ...rawSources.flatMap((s) => [
      ...(s?.extractedUrl && !(String(s.type).toLowerCase() === 'player' && s.extractedType === 'direct' && s.extractedUrl === s.url) ? [{ ...s, url: s.extractedUrl, type: s.extractedType, server: s.name }] : []),
      ...(['player', 'embed', 'iframe'].includes(String(s?.type || '').toLowerCase()) ? [{ ...s, type: 'embed', server: s.name }] : []),
    ]),
  ].slice(0, 100);
  const seen = new Set();
  return candidates.flatMap((s) => {
    const url = publicMediaUrl(s?.url);
    if (!url) return [];
    const type = String(s.type || '').toLowerCase();
    const format = type === 'embed' ? 'embed' : type === 'hls' || type === 'm3u8' || /\.m3u8(?:[?#]|$)/i.test(url) ? 'hls' : type === 'mp4' || type === 'video' || type === 'direct' || /\.(mp4|webm)(?:[?#]|$)/i.test(url) ? 'video' : '';
    // An upstream site page is not a player; never embed the whole MKissa site.
    if (format === 'embed' && /(^|\.)mkissa\.to$/i.test(new URL(url).hostname)) return [];
    if (!format || seen.has(`${format}:${url}`)) return [];
    seen.add(`${format}:${url}`);
    const referer = publicMediaUrl(s.referer || s.headers?.Referer || s.headers?.referer || data.headers?.Referer || data.headers?.referer || '');
    const playlistKey = typeof (s.playlist_key || s.key) === 'string' ? (s.playlist_key || s.key).slice(0, 2048) : '';
    const tracks = [...(Array.isArray(s.subtitles) ? s.subtitles : []), ...(Array.isArray(data.subtitles) ? data.subtitles : [])];
    const english = tracks.find((track) => /^(en|eng|english)(?:\b|[-_])/i.test(String(track?.srclang || track?.language || track?.label || track?.lang || '')) && /\.vtt(?:[?#]|$)/i.test(track?.url || track?.file || ''));
    const subtitle = publicMediaUrl(english?.url || english?.file || '');
    return [{ url, format, referer, playlistKey, subtitle, server: String(s.server || s.name || 'Mirror').slice(0, 100), quality: String(s.quality || 'Auto').slice(0, 40) }];
  });
}
// Compatible upstream proxy supports playlist rewriting and referer. Do not forward arbitrary headers.
export function kitsuneProxy(base, stream) {
  const target = publicMediaUrl(stream.url);
  if (!target) throw new Error('Invalid stream URL.');
  const params = new URLSearchParams({ url: target });
  if (stream.referer) {
    const referer = publicMediaUrl(stream.referer);
    if (referer) params.set('referer', referer);
  }
  if (stream.playlistKey) params.set('playlist_key', stream.playlistKey);
  return `${baseUrl(base)}/proxy?${params}`;
}
