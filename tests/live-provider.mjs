// Non-blocking network diagnostic. A reachable page is not proof of playable media.
const url = 'https://megaplay.buzz/stream/ani/154587/1/sub';
const origin = 'https://inkflow-gab.github.io';
const annotate = (level, text) => console.log(`::${level}::${text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
try {
  const response = await fetch(url, {
    redirect: 'follow', signal: AbortSignal.timeout(15000),
    headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', referer: `${origin}/` },
  });
  const xfo = response.headers.get('x-frame-options') || '';
  const csp = response.headers.get('content-security-policy') || '';
  const ancestors = csp.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i)?.[1] || '';
  const restricted = /deny|sameorigin/i.test(xfo) || /'none'/.test(ancestors) || (ancestors && !ancestors.includes('*') && !ancestors.includes(origin));
  const message = `Instant provider: HTTP ${response.status}; final host ${new URL(response.url).hostname}; X-Frame-Options=${xfo || 'not set'}; frame-ancestors=${ancestors || 'not set'}. This does not verify video playback.`;
  annotate(response.ok && !restricted ? 'notice' : 'warning', message);
  await response.body?.cancel();
} catch (error) { annotate('warning', `Instant provider network check failed: ${error.message}. Playback has not been verified.`); }
