// Restricted, credential-free JSON relay for public Asura/Vortex endpoints.
// Deploy separately; GitHub Pages cannot execute server-side code.
const ORIGINS = new Set(['https://inkflow-gab.github.io']);
const TARGETS = {
  asura: 'https://api.asurascans.com/api',
  vortex: 'https://api.vortexscans.org',
};
const SLUG = '[a-z0-9][a-z0-9-]{0,199}';
const routes = [
  ['asura', /^\/series$/, new Set(['limit', 'offset', 'sort', 'search'])],
  ['asura', new RegExp(`^/series/${SLUG}(?:/chapters(?:/\\d{1,6}(?:\\.\\d{1,4})?)?)?$`), new Set()],
  ['vortex', /^\/api\/query$/, new Set(['searchTerm', 'orderBy', 'page', 'perPage'])],
  ['vortex', /^\/api\/post$/, new Set(['postSlug'])],
  ['vortex', /^\/api\/chapters$/, new Set(['postId'])],
  ['vortex', /^\/api\/chapter$/, new Set(['chapterId'])],
];
const MAX_BYTES = 3 * 1024 * 1024;
function validParams(params) {
  const integer = (value, min, max) => /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
  for (const [key, value] of params) {
    if (['limit', 'perPage'].includes(key) && !integer(value, 1, 100)) return false;
    if (key === 'offset' && !integer(value, 0, 10000)) return false;
    if (key === 'page' && !integer(value, 1, 500)) return false;
    if (['postId', 'chapterId'].includes(key) && !integer(value, 1, 9999999999)) return false;
    if (key === 'postSlug' && !new RegExp(`^${SLUG}$`).test(value)) return false;
    if (key === 'sort' && !['popular', 'latest'].includes(value)) return false;
    if (key === 'orderBy' && !['latestChapter', 'totalViews'].includes(value)) return false;
  }
  return true;
}
function headers(origin) { return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/json; charset=utf-8' }; }
function json(data, status, origin) { return new Response(JSON.stringify(data), { status, headers: headers(origin) }); }
export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (!ORIGINS.has(origin)) return new Response('Forbidden', { status: 403 });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, origin);
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/(asura|vortex)(\/.*)$/);
    if (!match || url.href.length > 2048) return json({ error: 'Not found' }, 404, origin);
    const [, source, path] = match;
    const route = routes.find(([name, pattern]) => name === source && pattern.test(path));
    if (!route || [...url.searchParams].some(([k, v]) => !route[2].has(k) || v.length > 150) || [...new Set(url.searchParams.keys())].some((k) => url.searchParams.getAll(k).length !== 1) || !validParams(url.searchParams)) return json({ error: 'Invalid request' }, 400, origin);
    const target = new URL(TARGETS[source] + path);
    target.search = url.search;
    try {
      // No cookies, authorization, client headers, or upstream redirects are forwarded.
      const response = await fetch(target.href, { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(12000) });
      if (!response.ok) return json({ error: `Provider returned HTTP ${response.status}` }, response.status >= 400 && response.status <= 599 ? response.status : 502, origin);
      if (Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) return json({ error: 'Invalid provider response' }, 502, origin);
      const reader = response.body.getReader();
      let size = 0, chunks = [];
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > MAX_BYTES) { await reader.cancel(); return json({ error: 'Provider response too large' }, 502, origin); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (!body || typeof body !== 'object') throw new Error('Invalid JSON');
      return json(body, 200, origin);
    } catch { return json({ error: 'Provider unavailable' }, 502, origin); }
  },
};
