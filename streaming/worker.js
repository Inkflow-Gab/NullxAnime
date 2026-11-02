// AnimeGG provider adapted from Kitsune (MIT), commit cd05752f01d3365fdd5a600445703084383f3c78.
// See LICENSE.kitsune. This is a separately deployed Cloudflare Worker, not a GitHub Pages script.
const PROVIDER = 'https://www.animegg.org';
const MAX_HTML = 2 * 1024 * 1024;
const MAX_PLAYLIST = 2 * 1024 * 1024;
const TOKEN_LIFETIME = 6 * 3600;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CORS_METHODS = 'GET, OPTIONS';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function headers(origin) {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': CORS_METHODS, 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges', 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
}
function json(value, origin, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...headers(origin), 'Content-Type': 'application/json; charset=utf-8' } });
}
function safeTarget(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  // Workers must never proxy literal IPs, local names, credentials, or non-standard ports.
  if (url.href.length > 4096 || url.protocol !== 'https:' || url.username || url.password || url.port || hostname.includes(':') || /^[\d.]+$/.test(hostname) || !hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(hostname)) throw new Error('Invalid upstream URL');
  return url;
}
async function upstream(url, options = {}) {
  for (let i = 0; i < 5; i++) {
    const target = safeTarget(url);
    const response = await fetch(target.href, { ...options, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url: target.href };
    const location = response.headers.get('location');
    if (!location) throw new Error('Invalid upstream redirect');
    await response.body?.cancel();
    url = new URL(location, target).href;
  }
  throw new Error('Too many upstream redirects');
}
async function boundedText(response, max) {
  if (Number(response.headers.get('content-length')) > max) throw new Error('Upstream response too large');
  if (!response.body) return '';
  const reader = response.body.getReader();
  let size = 0, chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new Error('Upstream response too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return decoder.decode(bytes);
}
async function html(url) {
  const { response } = await upstream(url, { headers: { 'Referer': `${PROVIDER}/`, 'Accept': 'text/html', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return boundedText(response, MAX_HTML);
}
function entities(text = '') {
  return text.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
const strip = (text = '') => entities(text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
  return match ? entities(match[1]) : '';
}
function slugValid(value) { return /^[a-z\d][a-z\d-]{0,199}$/i.test(value); }
function episodePathValid(value) { return /^[a-z\d][a-z\d/_-]{0,250}$/i.test(value) && !value.split('/').some((p) => p === '.' || p === '..'); }

export function parseSearch(page) {
  const results = [];
  for (const m of page.matchAll(/<a\b[^>]*class=["'][^"']*\bmse\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)) {
    const tag = m[0].match(/<a\b[^>]*>/i)?.[0] ?? '';
    const slug = attr(tag, 'href').match(/^\/series\/([^/?#]+)/)?.[1];
    if (!slugValid(slug || '')) continue;
    const title = strip(m[0].match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? slug.replace(/-/g, ' '));
    if (!results.some((r) => r.slug === slug)) results.push({ slug, title });
    if (results.length >= 50) break;
  }
  return results;
}
export function parseSeries(page) {
  const episodes = [];
  const seen = new Set();
  for (const match of page.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const block = match[1];
    if (!/\banm_det_pop\b/.test(block)) continue;
    const tag = block.match(/<a\b[^>]*class=["'][^"']*anm_det_pop[^"']*["'][^>]*>/i)?.[0] ?? '';
    const path = attr(tag, 'href').replace(/#.*$/, '').replace(/^\//, '');
    const label = strip(block.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? '');
    const number = Number((label.match(/(\d+)-(\d+)\s*$/) || label.match(/(\d+)\s*$/))?.[1]);
    if (!number || number > 10000 || !episodePathValid(path)) continue;
    const title = strip(block.match(/<i\b[^>]*class=["'][^"']*anititle[^"']*["'][^>]*>([\s\S]*?)<\/i>/i)?.[1] ?? '') || label;
    if (!seen.has(number)) {
      seen.add(number);
      episodes.push({ number, title, path, sub: /\bbtn-subbed\b/.test(block), dub: /\bbtn-dubbed\b/.test(block) });
    }
    if (episodes.length >= 10000) break;
  }
  return episodes.sort((a, b) => a.number - b.number);
}
export function parseTabs(page, audio) {
  const tabs = [];
  for (const match of page.matchAll(/<a\b[^>]*data-toggle=["']tab["'][^>]*>/gi)) {
    const tag = match[0], id = attr(tag, 'data-id'), version = attr(tag, 'data-version') || 'subbed';
    if (/^[\w-]{1,200}$/.test(id) && (version.startsWith('dub') ? 'dub' : 'sub') === audio) tabs.push({ id, server: attr(tag, 'data-mirror') || 'AnimeGG' });
    if (tabs.length >= 20) break;
  }
  return tabs;
}
export function parseSources(page) {
  const match = page.match(/var\s+videoSources\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return [];
  try {
    const raw = match[1].replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":').replace(/:\s*'([^']*)'/g, ': "$1"');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.slice(0, 30).flatMap((source) => {
      try {
        if (!source || typeof source.file !== 'string' || !source.file) return [];
        const url = safeTarget(new URL(source.file, PROVIDER).href).href;
        return [{ url, quality: String(source.label || 'Auto').slice(0, 100), type: /\.m3u8(?:[?#]|$)/i.test(url) ? 'hls' : 'mp4' }];
      } catch { return []; }
    });
  } catch { return []; }
}
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function decode64(text) {
  const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function key(secret) { return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
async function signUrl(url, secret) {
  safeTarget(url);
  const payload = base64url(encoder.encode(JSON.stringify({ url, exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME })));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload)));
  return `${payload}.${base64url(signature)}`;
}
async function verifyUrl(token, secret) {
  if (!token || token.length > 8192) throw new Error('Invalid stream token');
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0]) || !/^[\w-]+$/.test(parts[1])) throw new Error('Invalid stream token');
  if (!await crypto.subtle.verify('HMAC', await key(secret), decode64(parts[1]), encoder.encode(parts[0]))) throw new Error('Invalid stream token');
  const payload = JSON.parse(decoder.decode(decode64(parts[0])));
  if (!Number.isInteger(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Stream token expired');
  return safeTarget(payload.url).href;
}
async function mediaUrl(url, secret, origin) {
  return `${origin}/media?token=${encodeURIComponent(await signUrl(url, secret))}`;
}
async function rewritePlaylist(text, base, secret, origin) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const matches = [...lines[i].matchAll(/URI="([^"]+)"/g)];
      for (const match of matches) lines[i] = lines[i].replace(match[0], `URI="${await mediaUrl(new URL(match[1], base).href, secret, origin)}"`);
    } else lines[i] = await mediaUrl(new URL(line, base).href, secret, origin);
  }
  return lines.join('\n');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return new Response('Origin not allowed', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, origin, 405);
    if (typeof env.TOKEN_SECRET !== 'string' || env.TOKEN_SECRET.length < 32) return json({ error: 'Worker TOKEN_SECRET must be configured (at least 32 characters)' }, origin, 503);
    const url = new URL(request.url);
    try {
      // Senshi episode embeds are keyed by MAL ID. Return only validated public HTTPS URLs.
      if (url.pathname === '/senshi') {
        const mal = Number(url.searchParams.get('mal')), episode = Number(url.searchParams.get('episode')), audio = url.searchParams.get('audio');
        if (!Number.isSafeInteger(mal) || mal < 1 || !Number.isSafeInteger(episode) || episode < 1 || episode > 10000 || !['sub', 'dub'].includes(audio)) return json({ error: 'Invalid title, episode or audio' }, origin, 400);
        const { response } = await upstream(`https://senshi.to/episode-embeds/${mal}/${episode}`, { headers: { Referer: 'https://senshi.to/', Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Senshi returned HTTP ${response.status}`);
        const data = JSON.parse(await boundedText(response, MAX_HTML));
        const streams = [], seen = new Set();
        for (const entry of Array.isArray(data) ? data.slice(0, 50) : []) {
          if ((String(entry.status || '').toLowerCase() === 'dub' ? 'dub' : 'sub') !== audio) continue;
          for (const [name, value] of [['Senshi', entry.url], ['StreamNin', entry.server2], ['FileMoon', entry.serverFM]]) {
            try {
              const target = safeTarget(value).href;
              if (seen.has(target)) continue;
              seen.add(target);
              streams.push({ server: name, url: target, type: /\.m3u8(?:[?#]|$)/i.test(target) ? 'hls' : /\.(?:mp4|webm)(?:[?#]|$)/i.test(target) ? 'video' : 'embed' });
            } catch { /* ignore invalid upstream links */ }
          }
        }
        return json({ streams }, origin);
      }
      if (url.pathname === '/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (q.length < 3 || q.length > 150) return json({ error: 'Search must contain 3–150 characters' }, origin, 400);
        return json({ results: parseSearch(await html(`${PROVIDER}/search/?q=${encodeURIComponent(q)}`)) }, origin);
      }
      if (url.pathname === '/series' || url.pathname === '/watch') {
        const slug = url.searchParams.get('slug') || '';
        if (!slugValid(slug)) return json({ error: 'Invalid series' }, origin, 400);
        const episodes = parseSeries(await html(`${PROVIDER}/series/${slug}`));
        if (url.pathname === '/series') return json({ episodes: episodes.map(({ path, ...ep }) => ep) }, origin);
        const number = Number(url.searchParams.get('episode')), audio = url.searchParams.get('audio');
        if (!Number.isInteger(number) || number < 1 || number > 10000 || !['sub', 'dub'].includes(audio)) return json({ error: 'Invalid episode or audio' }, origin, 400);
        const ep = episodes.find((e) => e.number === number && e[audio]);
        if (!ep) return json({ error: 'Episode not found for this audio' }, origin, 404);
        const tabs = parseTabs(await html(`${PROVIDER}/${ep.path}`), audio);
        const resolved = await Promise.allSettled(tabs.map(async (tab) => {
          const sources = parseSources(await html(`${PROVIDER}/embed/${tab.id}`));
          return Promise.all(sources.map(async (s) => ({ ...s, url: await mediaUrl(s.url, env.TOKEN_SECRET, url.origin), server: tab.server })));
        }));
        const streams = resolved.flatMap((r) => r.status === 'fulfilled' ? r.value : []);
        return json({ streams }, origin);
      }
      if (url.pathname === '/media') {
        const target = await verifyUrl(url.searchParams.get('token'), env.TOKEN_SECRET);
        const requestHeaders = { Referer: `${PROVIDER}/`, Origin: PROVIDER, Accept: '*/*' };
        const range = request.headers.get('Range');
        if (range && /^bytes=\d*-\d*$/.test(range)) requestHeaders.Range = range;
        // Only time out waiting for headers: aborting after 30 seconds would cut off long videos.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        let fetched;
        try { fetched = await upstream(target, { headers: requestHeaders, signal: controller.signal }); }
        finally { clearTimeout(timeout); }
        const { response, url: finalUrl } = fetched;
        if (!response.ok && response.status !== 206) return json({ error: `Video host returned HTTP ${response.status}` }, origin, 502);
        const type = response.headers.get('content-type') || 'application/octet-stream';
        const playlist = /\.m3u8(?:[?#]|$)/i.test(finalUrl) || /(?:mpegurl)/i.test(type);
        if (playlist) {
          const text = await boundedText(response, MAX_PLAYLIST);
          if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('Invalid HLS playlist');
          return new Response(await rewritePlaylist(text, finalUrl, env.TOKEN_SECRET, url.origin), { headers: { ...headers(origin), 'Content-Type': 'application/vnd.apple.mpegurl' } });
        }
        const out = headers(origin);
        for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (response.headers.has(name)) out[name] = response.headers.get(name);
        return new Response(response.body, { status: response.status, headers: out });
      }
      return json({ error: 'Not found' }, origin, 404);
    } catch (error) { return json({ error: error.message || 'Provider error' }, origin, 502); }
  },
};
