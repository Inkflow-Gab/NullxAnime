// Optional Pages-origin/CORS and image probes; never log chapter content.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const sources = [
  ['Asura', 'https://api.asurascans.com/api/series?limit=1&offset=0', (b) => b.data?.[0]?.cover, 'https://api.asurascans.com/api/series/martial-god-regressed-to-level-2/chapters/1', (b) => b.data?.chapter?.pages?.[0]?.url],
  ['Vortex', 'https://api.vortexscans.org/api/query?perPage=1&page=1', (b) => b.posts?.[0]?.featuredImage, 'https://api.vortexscans.org/api/chapter?chapterId=34639', (b) => b.chapter?.images?.[0]?.url],
  ['Hivetoons', 'https://api.hivetoons.org/api/query?perPage=1&page=1', (b) => b.posts?.[0]?.featuredImage, 'https://api.hivetoons.org/api/chapter?chapterId=21752', (b) => b.chapter?.images?.[0]?.url],
  ['Omega', 'https://api.omegascans.org/series/love-quest', (b) => b.thumbnail, 'https://api.omegascans.org/chapter/love-quest/chapter-1', (b) => b.chapter?.chapter_data?.images?.[0]],
];
const note = (level, text) => console.log(`::${level}::${text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
let browser;
try {
  browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args, '--no-sandbox'] });
  const page = await browser.newPage();
  const probe = 'https://inkflow-gab.github.io/__nx_reader_probe__';
  await page.setRequestInterception(true);
  page.on('request', (req) => req.url() === probe ? req.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Reader probe</title>' }) : req.continue());
  await page.goto(probe, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const fetchJSON = (url) => page.evaluate(async (u) => {
    const response = await fetch(u, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, url);
  const loadImage = (url) => page.evaluate((u) => new Promise((resolve) => {
    if (!u) return resolve(false);
    const img = new Image(); img.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => resolve(false), 10000);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(timer); resolve(false); }; img.src = u;
  }), url);
  await Promise.all(sources.map(async ([name, catalogue, coverOf, chapter, pageOf]) => {
    try {
      const body = await fetchJSON(catalogue);
      const cover = await loadImage(coverOf(body));
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const chapterBody = await fetchJSON(chapter);
      const chapterImage = await loadImage(pageOf(chapterBody));
      note(cover && chapterImage ? 'notice' : 'warning', `${name}: Pages-origin JSON loaded; sample cover ${cover ? 'loaded' : 'failed'}; sample chapter image ${chapterImage ? 'loaded' : 'failed'}.`);
    } catch (e) { note('warning', `${name}: Pages-origin probe failed (${e.message}); a provider check, CORS policy, or outage may prevent use.`); }
  }));
} catch (e) { note('warning', `Reader live probes could not run: ${e.message}`); }
finally { await browser?.close(); }
