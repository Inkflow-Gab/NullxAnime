// Only report counts/status, not adult titles or imagery. This probe is non-blocking.
try {
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://inkflow-gab.github.io' },
    body: JSON.stringify({ query: '{ Page(page: 1, perPage: 2) { media(type: ANIME, isAdult: true, sort: POPULARITY_DESC) { id isAdult } } }' }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  const items = data.data?.Page?.media || [];
  const cors = response.headers.get('access-control-allow-origin');
  if (!response.ok || items.length === 0 || items.some((x) => x.isAdult !== true) || !['*', 'https://inkflow-gab.github.io'].includes(cors)) throw new Error(`HTTP ${response.status}; adult results ${items.length}; CORS ${cors || 'missing'}`);
  console.log(`::notice::Adult AniList metadata: ${items.length} results; browser CORS allowed.`);
} catch (error) { console.log(`::warning::Adult metadata probe did not pass: ${error.message}`); process.exitCode = 1; }
