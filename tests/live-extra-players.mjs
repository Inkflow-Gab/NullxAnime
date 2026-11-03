// Non-blocking live smoke tests. Check the actual sandbox configuration, not just a URL response.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const players = [
  ['Aniweeb', 'https://api.aniweeb.net/embed/ani/154587/1?track=sub&server=1'],
  ['SupaPlay', 'https://supaplay.fun/stream/ani/154587/1/sub'],
  ['AniEmbed', 'https://aniembed.se/e/154587/1?lang=sub'],
  ['Movies Nexus', 'https://www.moviesnexus.fun/anime/154587/1/sub'],
];
const note = (level, text) => console.log(`::${level}::${text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
let browser;
try {
  browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args, '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  await Promise.all(players.map(async ([name, src], i) => {
    const page = await browser.newPage();
    try {
      const probe = `https://inkflow-gab.github.io/__nx_extra_${i}__`;
      await page.setRequestInterception(true);
      page.on('request', (req) => req.url() === probe ? req.respond({ status: 200, contentType: 'text/html', body: `<!doctype html><iframe src="${src}" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="width:1000px;height:600px"></iframe>` }) : req.continue());
      await page.goto(probe, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise((resolve) => setTimeout(resolve, 12000));
      for (const frame of page.frames()) await frame.evaluate(() => { document.querySelector('[aria-label="Play"], [title="Play"], .vjs-big-play-button, .art-control-playAndPause')?.click(); document.querySelectorAll('video').forEach((v) => { v.muted = true; v.play().catch(() => {}); }); }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 12000));
      const frames = page.frames();
      const videos = (await Promise.all(frames.map((f) => f.evaluate(() => Array.from(document.querySelectorAll('video'), (v) => ({ ready: v.readyState, time: v.currentTime, error: v.error?.code || 0 }))).catch(() => [])))).flat();
      const playing = videos.some((v) => v.ready >= 2 && v.time > 1 && !v.error);
      note(playing ? 'notice' : 'warning', `${name} sandboxed sample ${playing ? 'observed video progress' : 'did not observe video progress'} for AniList 154587 episode 1 (${frames.length} frames, ${videos.length} video elements). Availability varies.`);
    } catch (e) { note('warning', `${name} live probe failed: ${e.message}`); }
    finally { await page.close(); }
  }));
} catch (e) { note('warning', `Extra player live probes could not run: ${e.message}`); }
finally { await browser?.close(); }
