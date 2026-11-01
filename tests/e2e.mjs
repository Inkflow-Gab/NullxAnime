// End-to-end smoke test with a real headless Chrome and fully mocked APIs (no internet needed).
//   npm test                     → runs all checks
//   SHOTS=1 npm test             → also writes screenshots to tests/__screens__/
// Chrome: set CHROME_PATH, otherwise @sparticuz/chromium is used.

import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { anilist, mangadex, archive, imageFor } from './mock.mjs';

const PORT = 8123;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = !!process.env.SHOTS;
if (SHOTS) mkdirSync(new URL('./__screens__/', import.meta.url), { recursive: true });

async function launch() {
  let executablePath = process.env.CHROME_PATH, args = [];
  if (!executablePath) {
    const { default: chromium } = await import('@sparticuz/chromium');
    executablePath = await chromium.executablePath(); args = chromium.args;
  }
  return puppeteer.launch({ executablePath, headless: 'shell', args: [...args, '--no-sandbox', '--disable-web-security', '--autoplay-policy=no-user-gesture-required'] });
}

const json = (obj) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(obj) });

async function mockNetwork(page) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const u = new URL(url);
    if (u.origin === new URL(BASE).origin) return req.continue();
    if (u.hostname === 'graphql.anilist.co') return req.respond(json(anilist(req.postData() || '{}')));
    if (u.hostname === 'api.mangadex.org') return req.respond(json(mangadex(url)));
    if (u.hostname === 'archive.org' && !u.pathname.startsWith('/download') && !u.pathname.startsWith('/services')) return req.respond(json(archive(url)));
    if (/\.(jpg|jpeg|png|webp)(\?|$)|services\/img|\/uploads\.mangadex/i.test(url) || /anilist|mangadex|archive\.org\/services/.test(u.hostname + u.pathname)) {
      return req.respond({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: imageFor(url) });
    }
    if (u.hostname.includes('youtube')) return req.respond({ status: 200, contentType: 'text/html', body: '<html><body style="background:#111;color:#fff;font:20px sans-serif;display:grid;place-items:center;height:100vh">YouTube player (mock)</body></html>' });
    return req.abort();
  });
}

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ` ${extra}`}`); };

const server = await serve(PORT);
const browser = await launch();
let failed = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await mockNetwork(page);

  const visit = async (hash, selector, { timeout = 8000, shot } = {}) => {
    await page.goto(`${BASE}?nosw#${hash}`, { waitUntil: 'domcontentloaded' });
    if (hash !== '/') await page.reload({ waitUntil: 'domcontentloaded' });
    try { await page.waitForSelector(selector, { timeout }); } catch { /* checked below */ }
    await new Promise((r) => setTimeout(r, 450));
    const ok = !!(await page.$(selector));
    if (SHOTS && shot) await page.screenshot({ path: new URL(`./__screens__/${shot}.png`, import.meta.url).pathname });
    return ok;
  };
  const text = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => '');
  const count = (sel) => page.$$eval(sel, (e) => e.length).catch(() => 0);

  console.log('Anime');
  check('home renders hero + rails', await visit('/', '.hero-slide.active', { shot: 'home' }) && (await count('.rail .card')) > 30);
  check('hero title is plain text (XSS-safe)', !(await page.$eval('.hero', (e) => e.innerHTML)).includes('<script'));
  check('genres filtered (no adult genre)', !(await page.content()).includes('Hentai'));
  check('detail page', await visit('/anime/1000', '.detail-title', { shot: 'anime' }) && (await text('.detail-title')).length > 2);
  check('detail strips <script> from synopsis', !(await page.$eval('#desc', (e) => e.innerHTML)).includes('<script') && (await page.$eval('#desc', (e) => e.innerHTML)).includes('<i>unforgettable</i>'));
  check('detail lists episodes', (await count('.ep')) >= 5);
  check('detail has official stream links', (await count('.stream-link')) >= 2);
  check('watch page (official youtube embed)', await visit('/watch/1000/1', '#stage iframe', { shot: 'watch' }));
  check('watch page has episode list', (await count('.ep-row')) >= 5);
  check('watch → official services tab', await (async () => { await page.click('[data-src="official"]'); await page.waitForSelector('.launchpad'); return true; })());
  await page.screenshot({ path: SHOTS ? new URL('./__screens__/watch-official.png', import.meta.url).pathname : '/dev/null' }).catch(() => {});
  check('watch → free library tab lists results', await (async () => { await page.click('[data-src="library"]'); await page.waitForSelector('.lib-item', { timeout: 6000 }); return true; })());
  check('watch → library item plays in custom player', await (async () => { await page.click('.lib-item'); await page.waitForSelector('.vp video', { timeout: 6000 }); return true; })());
  check('mark watched updates tracker', await (async () => { await visit('/watch/1000/2', '#markbtn'); await page.click('#markbtn'); await new Promise((r) => setTimeout(r, 300)); const s = JSON.parse(await page.evaluate(() => localStorage.getItem('nx:marks'))); return s['anime:1000']?.includes(2); })());
  check('search page', await visit('/search?type=anime&q=frieren', '.grid .card', { shot: 'search' }));
  check('browse by genre', await visit('/search?type=anime&genre=Action', '.grid .card'));
  check('schedule', await visit('/schedule', '.sched-row', { shot: 'schedule' }));

  console.log('Manga');
  check('manga home', await visit('/manga', '.mhero-slide.active', { shot: 'manga' }) && (await count('.rail .card')) > 30);
  check('manga detail with chapters', await visit('/manga/00000000-0000-4000-8000-000000000000', '.ch', { shot: 'manga-detail' }) && (await count('.ch')) === 30);
  check('manga search (type filter)', await visit('/search?type=manga&origin=ko', '.grid .card'));
  check('reader (vertical)', await visit('/read/00000000-0000-4000-8000-000000000000/11111111-0000-4000-8000-000000000005', '.reader .rwrap', { shot: 'reader' }) && (await count('.rwrap')) === 8);
  await page.evaluate(() => localStorage.setItem('nx:settings', JSON.stringify({ readerMode: 'rtl' })));
  check('reader (paged RTL) + keyboard', await (async () => {
    await visit('/read/00000000-0000-4000-8000-000000000000/11111111-0000-4000-8000-000000000005', '.paged-wrap');
    const a = await text('#rcount'); await page.keyboard.press('ArrowLeft'); await new Promise((r) => setTimeout(r, 250)); const b = await text('#rcount');
    return a === '1 / 8' && b === '2 / 8';
  })());
  await page.evaluate(() => localStorage.removeItem('nx:settings'));

  console.log('Tracker, discover, settings');
  check('add to list from card menu', await (async () => {
    await visit('/', '.rail .card .quick');
    await page.evaluate(() => document.querySelector('.rail .card .quick').click());
    await page.waitForSelector('.popover button[data-status="current"]'); await page.evaluate(() => document.querySelector('.popover button[data-status="current"]').click());
    await new Promise((r) => setTimeout(r, 200));
    return Object.keys(JSON.parse(await page.evaluate(() => localStorage.getItem('nx:library')))).length >= 2;
  })());
  check('library shows the entry', await visit('/library', '.lib-card', { shot: 'library' }));
  check('library +1 progress', await (async () => { await page.click('[data-step="1"]'); await new Promise((r) => setTimeout(r, 250)); return (await text('.lib-card b')) === '1'; })());
  check('discover directory', await visit('/discover', '.dir-card', { shot: 'discover' }) && (await count('.dir-card')) > 30);
  check('free library page', await visit('/free', '.lib-item', { shot: 'free' }));
  check('settings', await visit('/settings', '.set-card', { shot: 'settings' }));
  check('settings: change accent', await (async () => { await page.click('[data-set="accent"][data-v="rose"]'); return (await page.$eval('html', (e) => e.dataset.accent)) === 'rose'; })());
  check('about', await visit('/about', '.prose'));
  check('404 route', await visit('/nope', '.empty'));

  console.log('Search palette');
  check('Ctrl+K opens palette and finds results', await (async () => {
    await visit('/', '.hero-slide.active');
    await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
    await page.waitForSelector('#pal-input'); await page.type('#pal-input', 'bocchi');
    await page.waitForSelector('.pal-item[href]', { timeout: 6000 });
    if (SHOTS) await page.screenshot({ path: new URL('./__screens__/palette.png', import.meta.url).pathname });
    return true;
  })());

  console.log('Mobile');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  check('mobile home + tab bar', await visit('/', '.hero-slide.active', { shot: 'mobile-home' }) && (await page.$eval('.tabbar', (e) => getComputedStyle(e).display)) === 'flex');
  check('mobile detail', await visit('/anime/1002', '.detail-title', { shot: 'mobile-anime' }));
  check('no horizontal overflow on mobile', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  check('no uncaught JS / console errors', errors.length === 0, `\n    ${errors.slice(0, 6).join('\n    ')}`);
  failed = results.filter((r) => !r.ok).length;
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
