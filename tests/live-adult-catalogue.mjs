// Only report counts/status, not adult titles or imagery. This probe is non-blocking.
try {
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://inkflow-gab.github.io' },
    body: JSON.stringify({ query: `{
      popular: Page(page: 1, perPage: 2) { media(type: ANIME, isAdult: true, sort: POPULARITY_DESC) { id isAdult } }
      latest: Page(page: 1, perPage: 2) { media(type: ANIME, isAdult: true, sort: START_DATE_DESC, genre: "Fantasy") { id isAdult genres } }
    }` }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  const popular = data.data?.popular?.media || [], latest = data.data?.latest?.media || [];
  const cors = response.headers.get('access-control-allow-origin');
  if (!response.ok || !popular.length || !latest.length || [...popular, ...latest].some((x) => x.isAdult !== true) || latest.some((x) => !x.genres.includes('Fantasy')) || !['*', 'https://inkflow-gab.github.io'].includes(cors)) throw new Error(`HTTP ${response.status}; popular ${popular.length}; latest fantasy ${latest.length}; CORS ${cors || 'missing'}`);
  console.log(`::notice::Adult AniList metadata: ${popular.length} popular and ${latest.length} latest fantasy results; browser CORS allowed.`);
} catch (error) { console.log(`::warning::Adult metadata probe did not pass: ${error.message}`); process.exitCode = 1; }
