// Browser-origin probes for additional reading providers. Metadata alone is not playback proof.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const BASE = 'https://manga-scrape-api.vercel.app/api/scrape/';
const PROBE = 'https://inkflow-gab.github.io/__nx_manhwa_candidates__';
const note = (level, text) => console.log(`::${level}::${text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
let browser;
try {
  browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args.filter((arg) => arg !== '--disable-web-security'), '--no-sandbox'] });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => req.url() === PROBE ? req.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Provider probe</title>' }) : req.continue());
  await page.goto(PROBE, { waitUntil: 'domcontentloaded' });
  const providers = [['MangaTaro', 'mangataro', 'solo-leveling'], ['WeebCentral', 'weebcentral', '01J76XYCPSY3C4BNPBRY8JMCBE']];
  await Promise.all(providers.map(async ([label, provider, id]) => {
    try {
      const result = await page.evaluate(async ({ base, provider, id }) => {
        const get = async (endpoint, params) => {
          const url = base + endpoint + '?' + new URLSearchParams({ ...params, provider });
          const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(22000) });
          if (!response.ok) throw new Error(endpoint + ' HTTP ' + response.status);
          return response.json();
        };
        const search = await get('search', { query: 'Solo Leveling' });
        if (!search.results?.some((r) => r.id === id)) throw new Error('sample title not found in search');
        const info = await get('info', { id });
        if (info.id !== id) throw new Error('sample title details mismatch');
        const chapters = await get('chapters', { id });
        if (!chapters.chapters?.some((c) => Number(c.number) === 1)) throw new Error('sample chapter missing');
        const pages = await get('pages', { id, chapterNumber: '1' });
        const src = pages.pages?.[0]?.url;
        if (!src) throw new Error('no page URLs');
        const loaded = await new Promise((resolve) => {
          const img = new Image(); img.referrerPolicy = 'no-referrer';
          const timer = setTimeout(() => resolve(false), 15000);
          img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0); };
          img.onerror = () => { clearTimeout(timer); resolve(false); }; img.src = src;
        });
        return { chapterCount: chapters.chapters.length, image: loaded, imageHost: new URL(src).hostname, ratingField: 'contentRating' in info || 'isAdult' in info || 'adult' in info, accessField: chapters.chapters.some((c) => 'isLocked' in c || 'price' in c || 'isAccessible' in c) };
      }, { base: BASE, provider, id });
      note(result.image ? 'notice' : 'warning', `${label}: Pages-origin sample search/details/chapters/pages returned; first image ${result.image ? 'loaded' : 'did not load'} from ${result.imageHost}; explicit rating field=${result.ratingField}; chapter access field=${result.accessField}. This does not establish permission or broader availability.`);
    } catch (err) { note('warning', `${label}: Pages-origin browser probe failed: ${err.message}.`); }
  }));
} catch (err) { note('warning', `Additional provider probe could not run: ${err.message}`); }
finally { await browser?.close(); }
