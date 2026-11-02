// Non-blocking diagnostic; a reachable API is not proof of playable video.
const url = 'https://senshi.to/episode-embeds/52991/1';
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { origin: 'https://inkflow-gab.github.io', referer: 'https://inkflow-gab.github.io/', 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' } });
  const cors = response.headers.get('access-control-allow-origin') || 'not set';
  let entries = 'unknown';
  if (response.ok && (response.headers.get('content-type') || '').includes('json')) { const data = await response.json(); entries = Array.isArray(data) ? String(data.length) : 'non-array'; }
  else await response.body?.cancel();
  const ok = response.ok && (cors === '*' || cors === 'https://inkflow-gab.github.io');
  console.log(`::${ok ? 'notice' : 'warning'}::Senshi episode API HTTP ${response.status}, CORS=${cors}, entries=${entries}; video playback not verified.`);
} catch (e) { console.log(`::warning::Senshi live API check failed: ${String(e.message).replace(/[\r\n]/g, ' ')}.`); }
