// Optional external smoke test: load the real iframe with the Pages origin in headless Chrome.
// Passing requires measurable video progress; failure can also mean a bot challenge or unsupported title.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const note = (level, message) => console.log(`::${level}::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
let browser;
try {
  browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args, '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const probeUrl = 'https://inkflow-gab.github.io/__nullx_live_probe__';
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url() === probeUrl) return request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><iframe src="https://megaplay.buzz/stream/ani/154587/1/sub" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="width:1000px;height:600px"></iframe>' });
    return request.continue();
  });
  await page.goto(probeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise((resolve) => setTimeout(resolve, 8000));
  for (const frame of page.frames()) {
    await frame.evaluate(() => {
      document.querySelector('[aria-label="Play"], [title="Play"]')?.click();
      document.querySelectorAll('video').forEach((video) => { video.muted = true; video.play().catch(() => {}); });
    }).catch(() => {});
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
  const frames = page.frames();
  const videos = (await Promise.all(frames.map((frame) => frame.evaluate(() => Array.from(document.querySelectorAll('video'), (v) => ({ ready: v.readyState, time: v.currentTime, error: v.error?.code || 0 }))).catch(() => [])))).flat();
  const details = await Promise.all(frames.slice(1).map((frame) => frame.evaluate(() => ({ title: document.title, text: document.body?.innerText?.replace(/\s+/g, ' ').slice(0, 200) || '' })).catch(() => ({ title: '', text: 'frame unavailable' }))));
  note('notice', `Instant playback frame details: ${JSON.stringify(details)}`);
  const playing = videos.some((v) => v.ready >= 2 && v.time > 1 && !v.error);
  note(playing ? 'notice' : 'warning', `Instant playback smoke test ${playing ? 'observed video progress' : 'did not observe video progress'} for sample AniList 154587 episode 1 (headless browser; ${frames.length} frames, ${videos.length} video elements). Provider availability and other titles may differ.`);
} catch (error) {
  note('warning', `Instant playback smoke test could not run: ${error.message}.`);
} finally { await browser?.close(); }
