import assert from 'node:assert/strict';
import { KITSUNE_PROVIDERS, publicMediaUrl, kitsuneEpisodes, kitsuneChoices, kitsuneWatch, kitsuneStreams, kitsuneProxy } from '../js/api/kitsune.js';
assert.equal(KITSUNE_PROVIDERS.length, 12);
const providers = Object.fromEntries(KITSUNE_PROVIDERS.map((p) => [p, { episodes: { sub: [{ id: `watch/${p}/154587/sub/${p}-1`, number: 1 }], dub: [] } }]));
assert.equal(kitsuneChoices({ providers }, 154587, 1, 'sub').length, 12);
assert.equal(kitsuneChoices({ providers }, 154587, 1, 'dub').length, 0);
providers.senshi.episodes.sub[0].id = 'watch/senshi/154587/sub/senshi-1/../../bad';
assert.equal(kitsuneChoices({ providers }, 154587, 1, 'sub').length, 11);
assert.throws(() => kitsuneChoices({ providers }, 1, 1, 'raw'));
assert.throws(() => kitsuneWatch('https://api.example/api', 'watch/../admin'));
assert.throws(() => kitsuneWatch('https://api.example/api', 'watch/senshi/1/sub/kaa-1'));
for (const bad of ['http://example.org/a', 'https://127.0.0.1/a', 'https://a.local/a', 'https://u:p@example.org', 'https://example.org:1234/']) assert.equal(publicMediaUrl(bad), '');
const streams = kitsuneStreams({ streams: [{ url: 'https://video.example/a.m3u8', type: 'hls', server: 'One', referer: 'https://host.example/', playlist_key: 'abc', subtitles: [{ url: 'https://video.example/en.vtt', label: 'English' }] }, { url: 'https://video.example/embed', type: 'embed', server: 'Two' }, { url: 'http://localhost/x', type: 'hls' }] });
assert.equal(streams.length, 2);
assert.equal(streams[0].subtitle, 'https://video.example/en.vtt');
const proxied = new URL(kitsuneProxy('https://api.example/api', streams[0]));
assert.equal(proxied.pathname, '/api/proxy');
assert.equal(proxied.searchParams.get('url'), 'https://video.example/a.m3u8');
assert.equal(proxied.searchParams.get('referer'), 'https://host.example/');
assert.equal(proxied.searchParams.get('playlist_key'), 'abc');
const oldFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url) => { calls.push(url); return new Response(JSON.stringify({ providers })); };
try {
  await kitsuneEpisodes('https://api.example/api', 154587);
  await kitsuneWatch('https://api.example/api', 'watch/aniwaves/154587/sub/aniwaves-1');
  assert.deepEqual(calls, ['https://api.example/api/episodes/154587', 'https://api.example/api/watch/aniwaves/154587/sub/aniwaves-1']);
} finally { globalThis.fetch = oldFetch; }
console.log('Kitsune provider API client checks passed');

// Upstream MKissa returns sources, not streams; preserve extraction and mirror metadata.
const mkissa = kitsuneStreams({ streams: [], sources: [
  { name: 'Ok', url: 'https://embed.example/one', type: 'iframe', extractedUrl: 'https://cdn.example/master.m3u8', extractedType: 'hls', headers: { Referer: 'https://mkissa.to/' } },
  { name: 'Mp4', extractedUrl: 'https://cdn.example/file.mp4', extractedType: 'mp4' },
  { name: 'Invalid', extractedUrl: 'https://localhost/file.mp4', extractedType: 'mp4' },
  { name: 'Duplicate', extractedUrl: 'https://cdn.example/master.m3u8', extractedType: 'hls' },
] });
assert.deepEqual(mkissa.map(({ format, server }) => ({ format, server })), [{ format: 'hls', server: 'Ok' }, { format: 'embed', server: 'Ok' }, { format: 'video', server: 'Mp4' }]);
assert.equal(mkissa[0].referer, 'https://mkissa.to/');
assert.equal(kitsuneStreams({ sources: [{ extractedUrl: 'https://cdn.example/resource', extractedType: 'direct' }] })[0].format, 'video');
assert.equal(kitsuneStreams({ sources: [{ url: 'https://player.example/id', type: 'player', extractedUrl: 'https://player.example/id', extractedType: 'direct' }] })[0].format, 'embed');
assert.equal(kitsuneStreams({ sources: [{ url: 'https://mkissa.to/manga', type: 'iframe' }] }).length, 0);
const priorFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (url.includes('/episodes/mkissa/')) { assert.equal(url, 'https://api.example/api/episodes/mkissa/154587?map=false'); return new Response('{}'); }
  return new Response(JSON.stringify({ code: 'NEED_CAPTCHA', error: 'verification required' }), { status: 403 });
};
try {
  await kitsuneEpisodes('https://api.example/api', 154587, undefined, 'mkissa');
  assert.throws(() => kitsuneEpisodes('https://api.example/api', 154587, undefined, '../admin'));
  await assert.rejects(kitsuneWatch('https://api.example/api', 'watch/mkissa/154587/sub/mkissa-1'), /requires a security check/);
} finally { globalThis.fetch = priorFetch; }
