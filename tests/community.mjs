import assert from 'node:assert/strict';
import { baseUrl, animeggSearch, animeggEpisodes, animeggWatch, anipubSearch, anipubPlayer } from '../js/api/community.js';

assert.equal(baseUrl('https://example.org/root/'), 'https://example.org/root');
for (const bad of ['http://example.org', 'https://a:b@example.org', 'javascript:alert(1)', 'https://example.org/?secret=x']) assert.throws(() => baseUrl(bad));
assert.throws(() => animeggEpisodes('https://example.org', '../private'));
assert.throws(() => animeggWatch('https://example.org', 'series', 0, 'sub'));
assert.equal(anipubPlayer('https://example.org', 12, 2, 'dub'), 'https://example.org/AniPlayer/12/1?type=dub');
assert.throws(() => anipubPlayer('https://example.org', '../../x', 1));
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ Name: 'Test', Id: 3 }), { status: 200 });
assert.equal((await anipubSearch('https://example.org', 'Test'))[0].Id, 3);
assert.equal((await animeggSearch('https://example.org', 'Test')).Id, 3);
globalThis.fetch = oldFetch;
console.log('Community provider client checks passed');
