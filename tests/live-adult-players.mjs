// Non-blocking research probe. Does not download, log titles, screenshots, or media.
// A player is a candidate only if it proves both identity and actual playback;
// playing an arbitrary nested ad is not enough.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const note = (level, message) => console.log(`::${level}::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
let browser;
try {
  const query = `{ Page(page: 1, perPage: 5) { media(type: ANIME, isAdult: true, tag: "Adult Cast", status: FINISHED, sort: POPULARITY_DESC) { id episodes title { romaji english } } } }`;
  const response = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(15000) });
  const json = await response.json();
  const sample = json.data?.Page?.media?.find((m) => m.id && m.episodes > 0 && (m.title?.romaji || m.title?.english));
  if (!sample) throw new Error('No eligible adult-cast AniList sample returned.');
  const id = sample.id;
  const candidates = [
    ['MegaPlay', `https://megaplay.buzz/stream/ani/${id}/1/sub`],
    ['MegaVid', `https://megavid.buzz/ani/${id}/1/sub`],
    ['SupaPlay', `https://supaplay.fun/stream/ani/${id}/1/sub`],
    ['Zokoanime', `https://zokoanime.video/stream/anilist/${id}/1/sub`],
    ['VidNest', `https://vidnest.fun/anime/${id}/1/sub`],
    ['VidNest Pahe', `https://vidnest.fun/animepahe/${id}/1/sub`],
    ['VidBolt', `https://vidbolt.xyz/anime/${id}/1`],
    ['EmbedHeaven', `https://player.embedheaven.st/anime/${id}/1`],
  ];
  browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args.filter((a) => a !== '--disable-web-security'), '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  await Promise.all(candidates.map(async ([name, src], index) => {
    const page = await browser.newPage();
    try {
      const probe = `https://inkflow-gab.github.io/__nx_adult_probe_${index}__`;
      const isMegaPlay = name === 'MegaPlay'; // Matches its existing opt-out sandbox default.
      const sandbox = isMegaPlay ? '' : 'sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"';
      await page.setRequestInterception(true);
      page.on('request', (request) => request.url() === probe ? request.respond({ status: 200, contentType: 'text/html', body: `<!doctype html><iframe src="${src}" ${sandbox} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="width:1000px;height:600px"></iframe>` }) : request.continue());
      await page.goto(probe, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise((resolve) => setTimeout(resolve, 12000));
      const root = page.frames().find((frame) => frame.parentFrame() === page.mainFrame());
      if (!root) throw new Error('Embedded frame did not load');
      await root.evaluate(() => {
        document.querySelector('[aria-label="Play"], [title="Play"], .vjs-big-play-button, .art-control-playAndPause')?.click();
        document.querySelectorAll('video').forEach((v) => { v.muted = true; v.play().catch(() => {}); });
      }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 12000));
      const result = await root.evaluate((titles) => {
        const clean = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const body = clean(document.body?.innerText || ''), title = clean(document.title);
        const identity = titles.some((name) => { const n = clean(name); return n.length >= 8 && (body.includes(n) || title.includes(n)); });
        const progress = [...document.querySelectorAll('video')].some((v) => v.readyState >= 2 && v.currentTime > 1 && !v.error);
        return { identity, progress };
      }, [sample.title.romaji, sample.title.english]).catch(() => ({ identity: false, progress: false }));
      const verified = result.identity && result.progress;
      note(verified ? 'notice' : 'warning', `${name} adult sample: ${verified ? 'observed title and video progress' : 'not verified'} (identity ${result.identity}, root-frame video progress ${result.progress}). This sample does not establish availability for other titles.`);
    } catch (error) { note('warning', `${name} adult sample could not be tested: ${error.message}`); }
    finally { await page.close(); }
  }));
} catch (error) { note('warning', `Adult player research probe could not run: ${error.message}`); }
finally { await browser?.close(); }
