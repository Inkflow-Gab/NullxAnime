// Optional browser-origin/CORS and image probes for reading providers; no page contents are logged.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const sources = [
  ['Asura', 'https://api.asurascans.com/api/series?limit=1&offset=0', (body) => body.data?.[0]?.cover],
  ['Vortex', 'https://api.vortexscans.org/api/query?perPage=1&page=1', (body) => body.posts?.[0]?.featuredImage],
  ['Hivetoons', 'https://api.hivetoons.org/api/query?perPage=1&page=1', (body) => body.posts?.[0]?.featuredImage],
  ['Omega', 'https://api.omegascans.org/series/love-quest', (body) => body.thumbnail],
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
  await Promise.all(sources.map(async ([name, url, select]) => {
    try {
      const body = await page.evaluate(async (u) => {
        const response = await fetch(u, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }, url);
      const cover = select(body);
      if (!cover) throw new Error('No cover image returned');
      const loaded = await page.evaluate((u) => new Promise((resolve) => {
        const img = new Image(); img.referrerPolicy = 'no-referrer';
        const timer = setTimeout(() => resolve(false), 10000);
        img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0); };
        img.onerror = () => { clearTimeout(timer); resolve(false); }; img.src = u;
      }), cover);
      note(loaded ? 'notice' : 'warning', `${name}: Pages-origin JSON request ${loaded ? 'and sample image loaded' : 'succeeded but sample image failed'}.`);
    } catch (e) { note('warning', `${name}: Pages-origin JSON request failed (${e.message}); a provider check, CORS policy, or outage may prevent use.`); }
  }));
} catch (e) { note('warning', `Reader live probes could not run: ${e.message}`); }
finally { await browser?.close(); }
