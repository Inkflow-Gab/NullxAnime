import assert from 'node:assert/strict';
import worker, { parseSearch, parseSeries, parseTabs, parseSources } from '../streaming/worker.js';

const search = `<a href="/series/mock-series" class="mse"><strong>Mock &amp; Friends</strong></a>`;
const series = `<li><a class="anm_det_pop" href="/mock-series-episode-1"><strong>Episode 1</strong></a><i class="anititle">Pilot</i><span class="btn-subbed"></span></li>`;
const episode = `<a data-toggle="tab" data-id="123" data-version="subbed" data-mirror="Main"></a>`;
const embed = `var videoSources = [{file:'https://cdn.example/stream.m3u8',label:'720p'}];`;
assert.deepEqual(parseSearch(search), [{ slug: 'mock-series', title: 'Mock & Friends' }]);
assert.equal(parseSeries(series)[0].number, 1);
assert.equal(parseSeries(series)[0].sub, true);
assert.deepEqual(parseTabs(episode, 'dub'), []);
assert.equal(parseSources(embed)[0].type, 'hls');
assert.deepEqual(parseSources("var videoSources = [{file:'http://127.0.0.1/secret'}];"), []);
assert.deepEqual(parseSources('var videoSources = [{label:"bad"}];'), []);
const env = { TOKEN_SECRET: 'this-test-secret-is-more-than-32-characters', ALLOWED_ORIGINS: 'https://site.example' };
const request = (path, extra = {}) => new Request(`https://worker.example${path}`, { headers: { Origin: 'https://site.example', ...extra } });
const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (input, options) => {
  const url = new URL(input); calls.push([url.href, options]);
  if (url.href === 'https://senshi.to/episode-embeds/5000/1') return new Response(JSON.stringify([
    { status: 'sub', url: 'https://embed.example/a', server2: 'https://embed.example/b', serverFM: 'http://127.0.0.1/private' },
    { status: 'dub', url: 'https://embed.example/dub' },
    { status: 'sub', url: 'https://embed.example/a', server2: 'https://user:pass@embed.example/a' },
  ]));
  if (url.pathname === '/search/') return new Response(search);
  if (url.pathname === '/series/mock-series') return new Response(series);
  if (url.pathname === '/mock-series-episode-1') return new Response(episode);
  if (url.pathname === '/embed/123') return new Response(embed);
  if (url.href === 'https://cdn.example/stream.m3u8') return new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.key"\nsegment.ts\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
  if (url.href === 'https://cdn.example/segment.ts') return new Response('video', { status: 206, headers: { 'content-range': 'bytes 0-4/5' } });
  if (url.href === 'https://cdn.example/key.key') return new Response('key');
  throw new Error(`Unexpected upstream ${url.href}`);
};
try {
  assert.equal((await worker.fetch(new Request('https://worker.example/search?q=mock', { headers: { Origin: 'https://evil.example' } }), env)).status, 403);
  assert.equal((await worker.fetch(request('/search?q=mock'), {})).status, 403);
  assert.equal((await worker.fetch(request('/series?slug=..%2Fprivate'), env)).status, 400);
  assert.equal((await worker.fetch(request('/senshi?mal=0&episode=1&audio=sub'), env)).status, 400);
  assert.equal((await worker.fetch(request('/senshi?mal=5000&episode=1&audio=raw'), env)).status, 400);
  const senshi = await (await worker.fetch(request('/senshi?mal=5000&episode=1&audio=sub'), env)).json();
  assert.deepEqual(senshi.streams.map((s) => s.server), ['Senshi', 'StreamNin']);
  const dub = await (await worker.fetch(request('/senshi?mal=5000&episode=1&audio=dub'), env)).json();
  assert.equal(dub.streams[0].url, 'https://embed.example/dub');
  assert.equal((await (await worker.fetch(request('/search?q=mock'), env)).json()).results[0].slug, 'mock-series');
  assert.equal((await (await worker.fetch(request('/series?slug=mock-series'), env)).json()).episodes[0].number, 1);
  assert.equal((await worker.fetch(request('/watch?slug=mock-series&episode=1&audio=dub'), env)).status, 404);
  const result = await (await worker.fetch(request('/watch?slug=mock-series&episode=1&audio=sub'), env)).json();
  assert.equal(result.streams.length, 1);
  const stream = new URL(result.streams[0].url);
  assert.equal(stream.hostname, 'worker.example');
  const manifest = await (await worker.fetch(request(`${stream.pathname}${stream.search}`), env)).text();
  const keyUrl = new URL(manifest.match(/URI="([^"]+)"/)[1]);
  const segment = new URL(manifest.trim().split('\n').at(-1));
  assert.equal(await (await worker.fetch(request(`${keyUrl.pathname}${keyUrl.search}`), env)).text(), 'key');
  const segmentResponse = await worker.fetch(request(`${segment.pathname}${segment.search}`, { Range: 'bytes=0-4' }), env);
  assert.equal(segmentResponse.status, 206);
  assert.equal(segmentResponse.headers.get('content-range'), 'bytes 0-4/5');
  assert.equal(calls.at(-1)[1].headers.Range, 'bytes=0-4');
  stream.searchParams.set('token', stream.searchParams.get('token') + 'x');
  assert.equal((await worker.fetch(request(`${stream.pathname}${stream.search}`), env)).status, 502);
} finally { globalThis.fetch = originalFetch; }
console.log('Streaming worker checks passed');
