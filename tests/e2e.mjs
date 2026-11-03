// End-to-end smoke test with a real headless Chrome and fully mocked APIs (no internet needed).
//   npm test                     → runs all checks
//   SHOTS=1 npm test             → also writes screenshots to tests/__screens__/
// Chrome: set CHROME_PATH, otherwise @sparticuz/chromium is used.

import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { anilist, mangadex, archive, imageFor } from './mock.mjs';

// Publish unexpected browser-test failures as actionable GitHub annotations.
if (process.env.GITHUB_ACTIONS) {
  const report = (error) => {
    const message = String(error?.stack || error).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.error(`::error::${message}`);
    process.exitCode = 1;
  };
  process.on('uncaughtException', report);
  process.on('unhandledRejection', report);
}

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
  return puppeteer.launch({ executablePath, headless: 'shell', args: [...args, '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
}

const json = (obj) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(obj) });

let mockProviderEndpoints = false;
let mockMangaGateway = false;
let useLiveGateway = false;
let mockNextRelease = false;
let blockMangaDex = false;
let blockAllManga = false;
let blockSampleImage = false;
let blockReaderImages = false;
const networkRequests = [];
const releaseQueries = [];
async function mockNetwork(page) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    let u = new URL(url);
    const gatewayRequest = u.hostname === 'manga-gateway.test';
    if (gatewayRequest) { const parts = u.pathname.match(/^\/(asura|vortex)(\/.*)$/); if (parts) u = new URL((parts[1] === 'asura' ? 'https://api.asurascans.com/api' : 'https://api.vortexscans.org') + parts[2] + u.search); }
    networkRequests.push(url);
    if (u.origin === new URL(BASE).origin && u.pathname === '/js/data/release.js' && mockNextRelease) return req.respond({ status: 200, contentType: 'text/javascript', body: "export const RELEASE = { id: 'test-next-release', title: 'Future update', changes: ['New future feature'] };" });
    if (u.origin === new URL(BASE).origin && u.pathname === '/js/config.js' && (!useLiveGateway || mockProviderEndpoints || mockMangaGateway)) return req.respond({ status: 200, contentType: 'text/javascript', body: `export const PROVIDER_ENDPOINTS = Object.freeze({ kitsuneApi: '${mockProviderEndpoints ? 'https://kitsune-api.test/api' : ''}', streamWorker: '${mockProviderEndpoints ? 'https://stream.test' : ''}', aniPub: '${mockProviderEndpoints ? 'https://anipub.test' : ''}', mangaGateway: '${mockMangaGateway ? 'https://manga-gateway.test' : ''}' });` });
    if (u.origin === new URL(BASE).origin) return req.continue();
    if (['supaplay.fun', 'aniembed.se', 'www.moviesnexus.fun', 'megavid.buzz', 'shonen.to'].includes(u.hostname)) return req.respond({ status: 200, contentType: 'text/html', body: '<html><body>Episode player mock</body></html>' });
    if (u.hostname === 'api.aniweeb.net') return req.respond({ status: 200, contentType: 'text/html', body: '<html><body>Aniweeb episode mock</body></html>' });
    if (u.hostname === 'megaplay.buzz') return req.respond({ status: 200, contentType: 'text/html', body: '<html><body>Episode player mock</body></html>' });
    if (u.hostname === 'kitsune-api.test' && u.pathname === '/api/episodes/mkissa/1000') return req.respond(json({ providers: { mkissa: { episodes: { sub: [{ id: 'watch/mkissa/1000/sub/mkissa-1', number: 1 }] } } } }));
    if (u.hostname === 'kitsune-api.test' && u.pathname.startsWith('/api/watch/mkissa/')) return req.respond(json({ sources: [{ name: 'Ok', type: 'iframe', url: 'https://senshi-embed.test/one', extractedUrl: 'https://media.test/mkissa.mp4', extractedType: 'mp4' }] }));
    if (u.hostname === 'kitsune-api.test' && u.pathname === '/api/episodes/1000') return req.respond(json({ providers: { aniwaves: { episodes: { sub: [{ id: 'watch/aniwaves/1000/sub/aniwaves-1', number: 1 }] } }, senshi: { episodes: { sub: [{ id: 'watch/senshi/1000/sub/senshi-1', number: 1 }] } } } }));
    if (u.hostname === 'kitsune-api.test' && u.pathname.startsWith('/api/watch/')) return req.respond(json({ streams: [{ server: 'First', type: 'embed', url: 'https://senshi-embed.test/one' }, { server: 'Second', type: 'embed', url: 'https://senshi-embed.test/two' }] }));
    if (u.hostname === 'stream.test' && u.pathname === '/senshi') return req.respond(json({ streams: [{ server: 'Senshi', type: 'embed', url: 'https://senshi-embed.test/one' }, { server: 'FileMoon', type: 'embed', url: 'https://senshi-embed.test/two' }] }));
    if (u.hostname === 'senshi-embed.test') return req.respond({ status: 200, contentType: 'text/html', body: 'Mirror mock' });
    if (u.hostname === 'stream.test' && u.pathname === '/search') return req.respond(json({ results: [{ slug: 'mock-series', title: 'Mock anime' }] }));
    if (u.hostname === 'stream.test' && u.pathname === '/series') return req.respond(json({ episodes: [{ number: 1, sub: true, dub: false }] }));
    if (u.hostname === 'stream.test' && u.pathname === '/watch') return req.respond(json({ streams: [{ url: 'https://stream.test/media?token=mock', type: 'mp4', server: 'test' }] }));
    if (u.hostname === 'anipub.test' && u.pathname.startsWith('/api/search/')) return req.respond(json([{ Name: 'Mock anime', Id: 42 }]));
    if (u.hostname === 'anipub.test' && u.pathname === '/AniPlayer/42/1') return req.respond({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<section class="video-section"><div class="video-container"><video><source src="/videos/episode.mp4"></video></div></section>' });
    if (u.hostname === 'anipub.test' && u.pathname.startsWith('/AniPlayer/')) return req.respond({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<section class="video-section"><div class="video-container"><iframe src="https://anipub.test/video-embed"></iframe></div></section>' });
    if (u.hostname === 'anipub.test' && u.pathname === '/video-embed') return req.respond({ status: 200, contentType: 'text/html', body: 'Episode player mock' });
    if (u.hostname === 'graphql.anilist.co') { const body = req.postData() || '{}'; if (body.includes('RecentEpisodes')) releaseQueries.push(JSON.parse(body)); return req.respond(json(anilist(body))); }
    if (blockAllManga && !gatewayRequest && ['api.asurascans.com', 'api.vortexscans.org', 'api.mangadex.org'].includes(u.hostname)) return req.respond({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
    if (u.hostname === 'api.asurascans.com') {
      const comic = { slug: 'mock-series', title: 'Mock Asura Manhwa', type: 'manhwa', status: 'ongoing', cover: 'https://cdn.asurascans.com/asura-images/covers/mock.webp', description: '<p>A mock series.</p>', chapter_count: 2 };
      const chapters = [{ number: 2, is_premium: true, page_count: 2 }, { number: 1, is_premium: false, page_count: 3 }];
      if (u.pathname === '/api/series') return req.respond(json({ data: [comic], meta: { total: 1 } }));
      if (u.pathname === '/api/series/mock-series') return req.respond(json({ series: comic }));
      if (u.pathname === '/api/series/mock-series/chapters') return req.respond(json({ data: chapters }));
      if (u.pathname === '/api/series/mock-series/chapters/1') return req.respond(json({ data: { is_locked: false, chapter: { number: 1, series_slug: 'mock-series', pages: [1, 2, 3].map((i) => ({ url: `https://cdn.asurascans.com/asura-images/chapters/mock-series/1/${i}.webp` })) } } }));
      return req.respond({ status: 404, body: '' });
    }
    if (u.hostname === 'api.vortexscans.org' || u.hostname === 'api.hivetoons.org') {
      const host = u.hostname === 'api.vortexscans.org' ? 'storage.vortexscans.org' : 'storage.hivetoon.com';
      const comic = { id: 709, slug: 'mock-iken', postTitle: 'Mock Iken', seriesType: 'MANHWA', seriesStatus: 'ONGOING', featuredImage: `https://${host}/upload/cover.webp`, postContent: 'A series' };
      const chapters = [{ id: 2, number: 2, isLocked: true, isAccessible: false, price: 100 }, { id: 3, number: 3, isShortLinkLocked: true, isAccessible: true, price: 0 }, { id: 1, number: 1, isLocked: false, isAccessible: true, price: 0 }];
      if (u.pathname === '/api/query') return req.respond(json({ posts: [u.searchParams.get('searchTerm') ? { ...comic, postTitle: 'Mock Asura Manhwa' } : comic], totalCount: 1 }));
      if (u.pathname === '/api/post') return req.respond(json({ post: comic }));
      if (u.pathname === '/api/chapters') return req.respond(json({ post: { chapters } }));
      if (u.pathname === '/api/chapter') return req.respond(json({ chapter: { id: 1, mangaPostId: 709, price: 0, images: [{ order: 1, url: `https://${host}/upload/2.webp` }, { order: 0, url: `https://${host}/upload/1.webp` }, { order: 2, url: 'https://evil.example/page.webp' }] } }));
      return req.respond({ status: 404, body: '' });
    }
    if (u.hostname === 'api.omegascans.org') {
      const comic = { id: 758, series_slug: 'mock-omega', title: 'Mock Omega', series_type: 'Comic', status: 'Ongoing', thumbnail: 'https://media.omegascans.org/file/cover.webp', description: 'Adult catalogue' };
      const chapters = [{ chapter_slug: 'chapter-2', chapter_name: 'Chapter 2', price: 10 }, { chapter_slug: 'chapter-1', chapter_name: 'Chapter 1', price: 0 }];
      if (u.pathname === '/query') return req.respond(json({ data: [comic], meta: { current_page: 1, last_page: 1 } }));
      if (u.pathname === '/series/mock-omega') return req.respond(json(comic));
      if (u.pathname === '/chapter/query') return req.respond(json({ data: chapters }));
      if (u.pathname === '/chapter/mock-omega/chapter-1') return req.respond(json({ chapter: { series_id: 758, chapter_slug: 'chapter-1', price: 0, chapter_data: { images: ['https://media.omegascans.org/file/1.webp', 'https://evil.example/2.webp'] } } }));
      return req.respond({ status: 404, body: '' });
    }
    if (blockSampleImage && u.hostname === 'cdn.asurascans.com' && u.pathname.includes('martial-god-regressed')) return req.abort();
    if (blockReaderImages && u.hostname === 'uploads.mangadex.org' && u.pathname.startsWith('/data/')) return req.abort();
    if (u.hostname === 'api.mangadex.org') return req.respond(blockMangaDex ? { status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' } : json(mangadex(url)));
    if (u.hostname === 'archive.org' && !u.pathname.startsWith('/download') && !u.pathname.startsWith('/services')) return req.respond(json(archive(url)));
    if (/\.(jpg|jpeg|png|webp)(\?|$)|services\/img|\/uploads\.mangadex/i.test(url) || /anilist|mangadex|archive\.org\/services/.test(u.hostname + u.pathname)) {
      return req.respond({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: imageFor(url) });
    }
    if (u.hostname.includes('youtube')) return req.respond({ status: 200, contentType: 'text/html', body: '<html><body style="background:#111;color:#fff;font:20px sans-serif;display:grid;place-items:center;height:100vh">YouTube player (mock)</body></html>' });
    return req.abort();
  });
}

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ` ${extra}`}`); if (!ok && process.env.GITHUB_ACTIONS) console.error(`::error::Check failed: ${name}`); };

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

  console.log('Update notices');
  check('new release opens an accessible violet status window and traps keyboard focus', await (async () => {
    await visit('/', '#update-notice');
    await page.keyboard.press('Tab');
    return await page.$eval('#update-notice', (el) => {
      const dialog = el.querySelector('[role="dialog"]'), button = el.querySelector('.update-ok');
      const bg = getComputedStyle(dialog).backgroundColor;
      return dialog.getAttribute('aria-modal') === 'true' && dialog.textContent.includes('More ways to browse') &&
        dialog.textContent.includes('not age verification') && document.activeElement === button && bg.startsWith('rgba(22, 12, 48,');
    });
  })());
  check('system window animates and respects reduced motion', await (async () => {
    await page.evaluate(async () => (await import('./js/store.js')).setSetting('performanceMode', 'off'));
    const animated = await page.$eval('.update-sigil', (el) => getComputedStyle(el).animationName === 'update-glow');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const reduced = await page.$eval('.update-sigil', (el) => getComputedStyle(el).animationName === 'none');
    await page.emulateMediaFeatures([]);
    await page.evaluate(async () => (await import('./js/store.js')).setSetting('performanceMode', 'on'));
    const lightweight = await page.$eval('.update-sigil', (el) => getComputedStyle(el).animationName === 'update-soft-glow');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const lightweightReduced = await page.$eval('.update-sigil', (el) => getComputedStyle(el).animationName === 'none');
    await page.emulateMediaFeatures([]);
    await page.evaluate(async () => (await import('./js/store.js')).setSetting('performanceMode', 'auto'));
    return animated && reduced && lightweight && lightweightReduced;
  })());
  check('shattering intro is decorative, lightweight and respects reduced motion', await (async () => {
    await page.evaluate(async () => (await import('./js/store.js')).setSetting('performanceMode', 'off'));
    const normal = await page.$eval('.update-rupture', (el) => el.getAttribute('aria-hidden') === 'true' && getComputedStyle(el).pointerEvents === 'none' && getComputedStyle(el.querySelector('.glass-cracks path')).animationName === 'crack-draw' && el.querySelectorAll('.shard').length === 6);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const reduced = await page.$eval('.update-rupture', (el) => getComputedStyle(el).display === 'none');
    await page.emulateMediaFeatures([]);
    await page.evaluate(async () => (await import('./js/store.js')).setSetting('performanceMode', 'on'));
    const light = await page.$eval('.update-rupture', (el) => getComputedStyle(el.querySelector('.glass-shards')).display === 'none' && getComputedStyle(el).display !== 'none');
    await page.evaluate(async () => { const s = await import('./js/store.js'); s.setSetting('reduceMotion', true); });
    const manual = await page.$eval('.update-rupture', (el) => getComputedStyle(el).display === 'none');
    await page.evaluate(async () => { const s = await import('./js/store.js'); s.setSetting('reduceMotion', false); s.setSetting('performanceMode', 'auto'); });
    return normal && reduced && light && manual;
  })());
  check('release stays visible until acknowledged, then stays dismissed', await (async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#update-notice');
    const wasVisible = !!(await page.$('#update-notice'));
    await page.click('#update-notice .update-ok');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app .route-root');
    return wasVisible && !(await page.$('#update-notice'));
  })());
  check('a new release displays new notes and can be acknowledged', await (async () => {
    mockNextRelease = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#update-notice');
    const changed = (await text('#update-notice')).includes('New future feature');
    await page.click('#update-notice .update-ok');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app .route-root');
    const dismissed = !(await page.$('#update-notice'));
    mockNextRelease = false;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#update-notice .update-ok');
    await page.click('#update-notice .update-ok'); // restore the actual release after simulating a rollback
    return changed && dismissed;
  })());
  check('release notes can be reopened from the footer', await (async () => {
    await page.$eval('[data-action="whats-new"]', (el) => el.click());
    const exists = !!(await page.$('#update-notice'));
    await page.keyboard.press('Escape');
    return exists && !(await page.$('#update-notice'));
  })());

  console.log('Anime');
  check('home renders hero + rails', await visit('/', '.hero-slide.active', { shot: 'home' }) && (await count('.rail .card')) > 30);
  check('hero watch action links to the episode', (await page.$eval('.hero-slide.active .hero-actions a', (e) => e.getAttribute('href'))).startsWith('#/watch/'));
  check('hero tabs support keyboard navigation', await (async () => {
    await page.focus('#hero [data-dot="0"]'); await page.keyboard.press('ArrowRight');
    return (await page.$eval('#hero [data-dot="1"]', (e) => e.getAttribute('aria-selected'))) === 'true' && (await page.$eval('.hero-slide.active', (e) => e.dataset.i)) === '1';
  })());
  check('ranking: top 10 with big numerals right under the hero', (await count('#rank-track .rank-item')) === 10 && (await page.$eval('.hero + .container > .ranking', () => true).catch(() => false)));
  check('ranking tabs switch lists', await (async () => { const a = await text('#rank-track .card .title'); await page.click('[data-rank="top"]'); await new Promise((r) => setTimeout(r, 200)); return (await count('#rank-track .rank-item')) === 10 && a.length > 0; })());
  check('recently updated links straight to the episode', await (async () => { await page.waitForSelector('#recent .card', { timeout: 5000 }); return (await page.$eval('#recent .card .poster', (e) => e.getAttribute('href'))).startsWith('#/watch/'); })());
  check('new releases, airing soon, upcoming-with-dates rails', (await page.$$eval('.section-head h2', (h) => h.map((x) => x.textContent))).filter((t) => ['New releases', 'Airing soon', 'Upcoming anime'].includes(t)).length === 3 && (await page.content()).includes('Premieres Jan'));
  check('hero title is plain text (XSS-safe)', !(await page.$eval('.hero', (e) => e.innerHTML)).includes('<script'));
  check('genres filtered (no adult genre)', !(await page.content()).includes('Hentai'));
  check('detail page', await visit('/anime/1000', '.detail-title', { shot: 'anime' }) && (await text('.detail-title')).length > 2);
  check('detail strips <script> from synopsis', !(await page.$eval('#desc', (e) => e.innerHTML)).includes('<script') && (await page.$eval('#desc', (e) => e.innerHTML)).includes('<i>unforgettable</i>'));
  check('detail lists episodes', (await count('.ep')) >= 5);
  check('detail omits official streams and trailers', (await count('.stream-link, [data-trailer]')) === 0);
  check('season picker follows related seasons and displays only aired episodes', await (async () => {
    await page.waitForFunction(() => document.querySelectorAll('#season-select option').length >= 3, { timeout: 10000 });
    const eps = await count('.ep');
    const options = await page.$$eval('#season-select option', (nodes) => nodes.map((o) => o.value));
    const local = (await text('.notice')).includes('Episode 6') && (await text('.notice')).includes('Provider release times may differ');
    return eps === 5 && options.includes('1001') && options.includes('1002') && local;
  })());
  check('next-airing time uses the viewer timezone', await (async () => {
    await page.emulateTimezone('Asia/Manila');
    await visit('/anime/1000', '.notice time');
    const ok = await page.$eval('.notice', (el) => el.textContent.includes('Asia/Manila') && !!el.querySelector('time')?.dateTime);
    await page.emulateTimezone('UTC');
    return ok;
  })());
  check('unreleased episodes cannot open a player', await (async () => {
    await visit('/watch/1004/1', '.empty h3');
    const ok = (await text('.empty')).includes('No aired episodes listed yet') && !(await page.$('#stage iframe'));
    await visit('/anime/1000', '.ep');
    return ok;
  })());
  check('anime mark toggles once after repeated redraws', await (async () => {
    for (let i = 0; i < 3; i++) { await page.$eval('[data-mark="1"]', (e) => e.click()); }
    const marked = (await page.$eval('[data-mark="1"]', (e) => e.getAttribute('aria-label'))) === 'Mark unwatched';
    await page.$eval('[data-mark="1"]', (e) => e.click());
    return marked;
  })());
  check('mark all batches anime updates', await page.evaluate(async () => {
    const { setMarks } = await import('./js/store.js');
    const root = document.querySelector('.route-root');
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true });
    document.querySelector('[data-markall]').click();
    const renders = observer.takeRecords().length;
    observer.disconnect();
    setMarks('anime', '1000', []);
    return renders > 0 && renders <= 2;
  }));
  check('watch page defaults to the episode player without setup', await visit('/watch/1000/1', '#stage iframe', { shot: 'watch' }) && await page.$eval('#stage iframe', (e) => e.src === 'https://megaplay.buzz/stream/ani/1000/1/sub' && !e.hasAttribute('sandbox')) && !(await page.$('#deployment-url')));
  check('unavailable MKissa is not presented as a playable provider', !(await page.$('[data-src="mkissa"]')));
  check('instant player remembers audio and episode', await (async () => {
    await page.click('[data-instant-audio="dub"]');
    const switched = await page.$eval('#stage iframe', (e) => e.src.endsWith('/1000/1/dub'));
    await page.click('#next');
    await page.waitForFunction(() => document.querySelector('#stage iframe')?.src.endsWith('/1000/2/dub'));
    const ok = switched && (await page.$eval('[data-instant-audio="dub"]', (e) => e.getAttribute('aria-pressed') === 'true'));
    await visit('/watch/1000/1', '#stage iframe'); await page.click('[data-instant-audio="sub"]');
    return ok && await page.$eval('#stage iframe', (e) => e.src.endsWith('/1000/1/sub'));
  })());
  check('optional popup protection constrains the instant player', await (async () => {
    await page.$eval('[data-instant-protect]', (e) => e.click());
    const sandbox = await page.$eval('#stage iframe', (f) => f.getAttribute('sandbox'));
    const on = await page.$eval('[data-instant-protect]', (e) => e.getAttribute('aria-pressed') === 'true');
    await page.$eval('[data-instant-protect]', (e) => e.click());
    return on && sandbox && !sandbox.includes('allow-popups') && !sandbox.includes('allow-top-navigation') && !(await page.$eval('#stage iframe', (f) => f.hasAttribute('sandbox')));
  })());
  check('instant player ignores messages from other windows', await (async () => {
    await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://megaplay.buzz', source: window, data: { event: 'complete', currentTime: 60, duration: 60 } })));
    return !(await page.$eval('#markbtn', (e) => e.classList.contains('on')));
  })());
  check('watch page has episode list', (await count('.ep-row')) >= 5);
  check('watch season switch opens that season and its episodes', await (async () => {
    await page.waitForSelector('#watch-seasons #season-select', { timeout: 10000 });
    await page.select('#watch-seasons #season-select', '1001');
    await page.waitForFunction(() => location.hash.startsWith('#/watch/1001/1'), { timeout: 10000 });
    await page.waitForSelector('.ep-row');
    const ok = (await count('.ep-row')) === 24;
    await visit('/watch/1000/1', '#stage');
    return ok;
  })());
  check('episode filter finds episode number', await (async () => {
    await page.type('#episode-search', '3');
    const ok = await page.$eval('.ep-row[data-ep="3"]', (e) => !e.hidden) && await page.$eval('.ep-row[data-ep="2"]', (e) => e.hidden);
    await page.$eval('#episode-search', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
    return ok;
  })());
  check('instant player retry remains on the episode', await (async () => {
    await page.click('[data-instant-retry]');
    return await page.$eval('#stage iframe', (e) => e.src.endsWith('/1000/1/sub'));
  })());
  check('unwanted watch tabs are removed', await (async () => !(await page.$('[data-src="yt-0"]')) && !(await page.$('[data-src="trailer"]')) && !(await page.$('[data-src="mine"]')) && !(await page.$('[data-src="official"]')))());
  check('Aniweeb offers built-in episode servers', await (async () => {
    await page.$eval('[data-src="aniweeb"]', (e) => e.click());
    const first = await page.$eval('#stage iframe', (e) => e.src === 'https://api.aniweeb.net/embed/ani/1000/1?track=sub&server=1');
    await page.$eval('[data-aniweeb-server="2"]', (e) => e.click());
    await page.$eval('[data-aniweeb-audio="dub"]', (e) => e.click());
    return first && await page.$eval('#stage iframe', (e) => e.src === 'https://api.aniweeb.net/embed/ani/1000/1?track=dub&server=2') && !(await page.$('#panel input[type="url"]'));
  })());
  check('additional episode players use sandboxed embeds and audio choices', await (async () => {
    for (const [id, host] of [['supaplay', 'supaplay.fun'], ['aniembed', 'aniembed.se'], ['nexus', 'www.moviesnexus.fun'], ['megavid', 'megavid.buzz'], ['shonen', 'shonen.to']]) {
      await page.$eval(`[data-src="${id}"]`, (e) => e.click());
      const first = await page.$eval('#stage iframe', (f) => ({ host: new URL(f.src).hostname, sandbox: f.getAttribute('sandbox') }));
      if (first.host !== host || !first.sandbox || first.sandbox.includes('allow-popups')) return false;
      if (id === 'shonen' && !await page.$eval('#stage iframe', (f) => new URL(f.src).searchParams.get('parentOrigin') === location.origin)) return false;
      if ((id === 'shonen' || id === 'megavid') && !(await page.$eval('#panel', (p) => p.textContent.includes('not been verified')))) return false;
      await page.$eval('[data-extra-audio="dub"]', (e) => e.click());
      const src = await page.$eval('#stage iframe', (f) => f.src);
      if (!src.includes('dub')) return false;
      await page.$eval('[data-extra-audio="sub"]', (e) => e.click());
    }
    return true;
  })());
  check('watch source tabs support keyboard navigation', await (async () => {
    await page.focus('#tabs [role="tab"][aria-selected="true"]'); await page.keyboard.press('End');
    return (await page.$eval('#tabs [data-src="library"]', (e) => e.getAttribute('aria-selected'))) === 'true';
  })());
  mockProviderEndpoints = true;
  await visit('/watch/1000/1', '#stage iframe');
  check('watch → AnimeGG worker episode and stream', await (async () => {
    await page.click('[data-src="animegg"]');
    await page.waitForSelector('#animegg-play');
    await page.click('#animegg-play');
    await page.waitForSelector('#animegg-stream');
    return !!(await page.$('#stage video')) && (await page.$eval('#stage video', (v) => v.src)).startsWith('https://stream.test/media?');
  })());
  check('watch → compatible API discovers providers and mirrors', await (async () => {
    await page.$eval('[data-src="kitsune"]', (e) => e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    await page.click('[data-src="kitsune"]');
    await page.waitForSelector('#kitsune-mirror');
    const providers = await page.$$eval('#kitsune-provider option', (o) => o.map((v) => v.textContent));
    await page.select('#kitsune-provider', '1');
    await page.waitForSelector('#kitsune-mirror');
    await page.select('#kitsune-mirror', '1');
    return providers.includes('aniwaves') && providers.includes('senshi') && await page.$eval('#stage iframe', (e) => e.src === 'https://senshi-embed.test/two');
  })());
  check('watch → MKissa sources are selectable', await (async () => {
    await page.$eval('[data-src="mkissa"]', (e) => e.click());
    try { await page.waitForSelector('#kitsune-mirror', { timeout: 4000 }); } catch { throw new Error(`MKissa: ${await text('#panel')}; errors: ${errors.join(' | ')}`); }
    const options = await page.$$eval('#kitsune-mirror option', (o) => o.map((v) => v.textContent));
    const proxy = await page.$eval('#stage video', (v) => v.src);
    await page.select('#kitsune-mirror', '1');
    const embed = await page.$eval('#stage iframe', (e) => e.src);
    return options.length === 2 && proxy.includes('url=https%3A%2F%2Fmedia.test%2Fmkissa.mp4') && embed === 'https://senshi-embed.test/one';
  })());
  check('watch → Senshi switches retrieved mirrors', await (async () => {
    await page.$eval('[data-src="senshi"]', (e) => e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    await page.click('[data-src="senshi"]');
    await page.waitForSelector('#senshi-server');
    await page.select('#senshi-server', '1');
    return await page.$eval('#stage iframe', (e) => e.src === 'https://senshi-embed.test/two');
  })());
  check('watch → AniPub search, title and episode', await (async () => {
    await page.$eval('[data-src="anipub"]', (e) => e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    await page.click('[data-src="anipub"]');
    try { await page.waitForSelector('#anipub-search', { timeout: 2000 }); }
    catch { throw new Error(`AniPub tab did not open; active=${await page.$eval('#tabs [aria-selected="true"]', (e) => e.dataset.src)}; page errors=${errors.join(' | ')}`); }
    await page.click('#anipub-search button');
    await page.waitForSelector('#anipub-play');
    await page.click('#anipub-play');
    await page.waitForFunction(() => document.querySelector('#stage iframe')?.src.endsWith('/video-embed'));
    return (await page.$eval('#stage iframe', (f) => f.src)).endsWith('/video-embed') && !!(await page.$('#anipub-link a'));
  })());
  check('AniPub direct video source is extracted', await page.evaluate(async () => {
    const { anipubSource } = await import('./js/api/community.js');
    const source = await anipubSource('https://anipub.test', 42, 2, 'sub');
    return source.kind === 'video' && source.url === 'https://anipub.test/videos/episode.mp4';
  }));
  mockProviderEndpoints = false;
  check('watch → free library tab lists results', await (async () => { await page.click('[data-src="library"]'); await page.waitForSelector('.lib-item', { timeout: 6000 }); return true; })());
  check('watch → library item plays in custom player', await (async () => { await page.click('.lib-item'); await page.waitForSelector('.vp video', { timeout: 6000 }); return true; })());
  check('player shortcuts do not steal arrows from other controls', await page.evaluate(() => {
    const range = document.querySelector('.vp-range'), mark = document.querySelector('#markbtn');
    const event = () => new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    const a = event(), b = event(); range.dispatchEvent(a); mark.dispatchEvent(b);
    return !a.defaultPrevented && !b.defaultPrevented;
  }));
  check('mark watched updates tracker', await (async () => { await visit('/watch/1000/2', '#markbtn'); await page.click('#markbtn'); await new Promise((r) => setTimeout(r, 300)); const s = JSON.parse(await page.evaluate(() => localStorage.getItem('nx:marks'))); return s['anime:1000']?.includes(2); })());
  check('search page', await visit('/search?type=anime&q=frieren', '.grid .card', { shot: 'search' }));
  check('browse by genre', await visit('/search?type=anime&genre=Action', '.grid .card'));
  check('search previews matching anime while typing', await (async () => {
    await visit('/search?type=anime', '#sform input');
    await page.type('#sform input', 'frieren');
    await page.waitForSelector('#search-suggestions a.pal-item', { visible: true, timeout: 8000 });
    const preview = await page.$eval('#search-suggestions a.pal-item', (a) => ({ text: a.textContent, href: a.getAttribute('href'), img: !!a.querySelector('img') }));
    await page.$eval('#sform input', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
    return /frieren/i.test(preview.text) && preview.href === '#/anime/1000' && preview.img && await page.$eval('#search-suggestions', (e) => e.hidden);
  })());
  check('recent episodes are paginated and link to the episode', await (async () => {
    if (!(await visit('/releases', '#release-grid .card'))) return false;
    const href = await page.$eval('#release-grid .poster', (e) => e.getAttribute('href'));
    const banner = await page.$eval('#release-grid .poster img', (e) => e.src.includes('/banner/'));
    if (await count('#release-grid .card') < 12) await page.$eval('#release-load', (e) => e.click());
    await page.waitForFunction(() => document.querySelectorAll('#release-grid .card').length === 12);
    return href === '#/watch/1000/1' && banner && releaseQueries.some((r) => r.variables.from === 0 && r.query.includes('sort: TIME_DESC')) && await page.$eval('#release-more', (e) => e.hidden);
  })());
  check('schedule', await visit('/schedule', '.sched-row', { shot: 'schedule' }));

  console.log('Manga');
  check('manga remains usable when MangaDex returns 403', await (async () => {
    blockMangaDex = true;
    await page.evaluate(() => sessionStorage.clear());
    const shown = await visit('/manga', '#asura-fallback .card', { timeout: 12000 });
    const sources = await page.$$('a[href="#/scans/vortex"]');
    const message = (await page.$eval('#manga-loading', (el) => el.textContent)).includes('MangaDex is unavailable');
    const href = await page.$eval('#asura-fallback .poster', (a) => a.getAttribute('href'));
    await visit('/search?type=manga&q=mock', '#results .empty', { timeout: 12000 });
    const fallbackLink = await page.$eval('#results a[href^="#/asura"]', (a) => a.getAttribute('href'));
    blockMangaDex = false;
    return shown && sources.length > 0 && message && href === '#/asura/mock-series' && fallbackLink === '#/asura?q=mock';
  })());
  check('manga Popular and Latest use provider sorts and keep the search', await (async () => {
    await page.evaluate(() => sessionStorage.clear());
    await visit('/manga', '#comic-grid');
    if (!(await page.$('#comic-sort a.on[aria-current="page"]'))) return false;
    const requestStart = networkRequests.length;
    await page.click('#comic-sort a[href*="popular"]');
    await page.waitForFunction(() => location.hash.includes('sort=popular') && document.querySelector('#comic-sort .on')?.textContent === 'Popular' && !!document.querySelector('#comic-grid') && !document.querySelector('#comic-status').textContent.includes('Checking'));
    const requests = networkRequests.slice(requestStart).map((url) => new URL(url));
    const order = await page.$$eval('#comic-grid .poster', (links) => links.slice(0, 3).map((link) => link.getAttribute('href').split('/')[2]));
    const mixedSources = order.join(',') === 'asura,vortex,mangadex';
    const correctSorts = requests.some((u) => u.hostname === 'api.asurascans.com' && u.searchParams.get('sort') === 'popular') &&
      requests.some((u) => u.hostname === 'api.vortexscans.org' && u.searchParams.get('orderBy') === 'totalViews') &&
      requests.some((u) => u.hostname === 'api.mangadex.org' && u.searchParams.get('order[followedCount]') === 'desc');
    await page.type('#comic-query', 'Mock');
    await page.click('#comic-search button');
    await page.waitForFunction(() => location.hash.includes('q=Mock') && document.querySelector('#comic-discovery h2')?.textContent.includes('Mock') && !!document.querySelector('#comic-grid') && !document.querySelector('#comic-status').textContent.includes('Checking'));
    const keptPopular = await page.evaluate(() => location.hash.includes('sort=popular'));
    const latestStart = networkRequests.length;
    await page.click('#comic-sort a:not(.on)');
    await page.waitForFunction(() => location.hash.includes('q=Mock') && !location.hash.includes('sort=popular') && document.querySelector('#comic-sort .on')?.textContent === 'Latest' && !!document.querySelector('#comic-grid') && !document.querySelector('#comic-status').textContent.includes('Checking'));
    const latestRequests = networkRequests.slice(latestStart).map((url) => new URL(url));
    return mixedSources && correctSorts && keptPopular && latestRequests.some((u) => u.hostname === 'api.asurascans.com' && u.searchParams.get('sort') === 'latest') &&
      latestRequests.some((u) => u.hostname === 'api.vortexscans.org' && u.searchParams.get('orderBy') === 'latestChapter') &&
      latestRequests.some((u) => u.hostname === 'api.mangadex.org' && u.searchParams.get('order[latestUploadedChapter]') === 'desc');
  })());

  check('manga connection check distinguishes blocked catalogues and sample images', await (async () => {
    blockAllManga = true;
    blockSampleImage = true;
    await page.evaluate(() => sessionStorage.clear());
    await visit('/manga?q=connectiontest', '#comic-check');
    await page.waitForFunction(() => document.querySelector('#comic-status')?.textContent.includes('Asura, Vortex, MangaDex'));
    const failure = await page.$('[data-action="retry"]');
    await page.click('.comic-diagnostic summary');
    await page.click('#comic-check');
    await page.waitForFunction(() => document.querySelectorAll('#comic-check-results li').length === 5 && !document.querySelector('#comic-check-results').textContent.includes('Checking…'));
    const lines = await page.$$eval('#comic-check-results li', (items) => items.map((it) => it.textContent));
    blockAllManga = false;
    blockSampleImage = false;
    return !!failure && lines.slice(0, 3).every((line) => line.includes('HTTP 403')) && lines[3].includes('Could not load') && lines[4].includes('Loaded') && await page.$eval('#comic-check', (button) => !button.disabled);
  })());

  check('configured manga gateway recovers blocked catalogues and unlocked readers', await (async () => {
    mockMangaGateway = true;
    blockAllManga = true;
    await page.evaluate(() => sessionStorage.clear());
    const start = networkRequests.length;
    await visit('/manga', '#comic-grid .card', { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('#comic-grid a[href^="#/comic/vortex/"]'), { timeout: 20000 });
    await page.click('.comic-diagnostic summary');
    await page.click('#comic-check');
    await page.waitForFunction(() => document.querySelectorAll('#comic-check-results li').length === 7 && !document.querySelector('#comic-check-results').textContent.includes('Checking…'));
    const relayChecks = await page.$$eval('#comic-check-results li', (lines) => lines.filter((line) => line.textContent.includes('through relay')).every((line) => line.textContent.includes('Connected')));
    const hasAsura = await page.$('#comic-grid a[href^="#/comic/asura/"]');
    const hasVortex = await page.$('#comic-grid a[href^="#/comic/vortex/"]');
    await visit('/asura/mock-series/1', '.reader .rpage', { timeout: 20000 });
    const asuraPages = await count('.reader .rpage');
    await visit('/scans/vortex/mock-iken/1', '.reader .rpage', { timeout: 20000 });
    const vortexPages = await count('.reader .rpage');
    const gatewayCalls = networkRequests.slice(start).filter((url) => url.startsWith('https://manga-gateway.test/'));
    mockMangaGateway = false;
    blockAllManga = false;
    return relayChecks && !!hasAsura && !!hasVortex && asuraPages === 3 && vortexPages === 2 && gatewayCalls.some((url) => url.includes('/asura/series/mock-series/chapters/1')) && gatewayCalls.some((url) => url.includes('/vortex/api/chapter?'));
  })());

  check('unified manga discovery survives MangaDex 403 and searches providers after opening a title', await (async () => {
    blockMangaDex = true;
    await page.evaluate(() => sessionStorage.clear());
    await visit('/manga', '#comic-grid .card', { timeout: 15000 });
    const hasAsura = await page.$('#comic-grid a[href^="#/comic/asura/"]');
    await page.$eval('#comic-grid a[href^="#/comic/asura/"]', (a) => a.click());
    await page.waitForSelector('#comic-provider-results .ch-list .ch', { timeout: 15000 });
    const original = await page.$$eval('#comic-provider-results .ch', (links) => links.map((a) => a.getAttribute('href')));
    await page.$eval('[data-provider="vortex"]', (button) => button.click());
    await page.waitForSelector('#comic-provider-results [data-match]', { timeout: 15000 });
    await page.$eval('#comic-provider-results [data-match]', (button) => button.click());
    await page.waitForSelector('#comic-provider-results .ch-list .ch', { timeout: 15000 });
    const chapters = await page.$$eval('#comic-provider-results .ch', (links) => links.map((a) => a.getAttribute('href')));
    const noFire = (await text('#comic-providers')).includes('MangaFire · unavailable');
    blockMangaDex = false;
    return !!hasAsura && original.length === 1 && original[0] === '#/asura/mock-series/1' && chapters.length === 1 && chapters[0] === '#/scans/vortex/mock-iken/1' && noFire;
  })());
  check('manga home', await visit('/manga', '.mhero-slide.active', { shot: 'manga' }) && (await count('.rail .card')) > 30);
  check('manga carousel loads other slides on demand', await (async () => {
    const before = await page.$$eval('.mhero-slide:not(.active) img[data-hero-src]', (imgs) => imgs.length);
    await page.$eval('#mhero [data-dot="1"]', (e) => e.click());
    const slides = await count('.mhero-slide');
    return before === 2 * (slides - 1) && await page.$eval('.mhero-slide.active .mhero-bg', (img) => !!img.getAttribute('src'));
  })());
  check('Asura catalogue, unlocked chapters and reader', await (async () => {
    await page.$eval('a[href="#/asura"]', (e) => e.click());
    await page.waitForSelector('#asura-grid .card', { timeout: 10000 });
    await page.$eval('#asura-grid .poster', (e) => e.click());
    await page.waitForSelector('.asura-detail', { timeout: 10000 });
    const chapterLinks = await page.$$eval('.ch-list .ch', (links) => links.map((a) => a.getAttribute('href')));
    await page.$eval('.ch-list .ch', (e) => e.click());
    await page.waitForSelector('.reader .rpage', { timeout: 10000 });
    const images = await page.$$eval('.reader .rpage', (imgs) => imgs.map((img) => img.getAttribute('src')));
    const lazy = await page.$$eval('.reader .rpage', (imgs) => imgs.at(-1)?.getAttribute('loading'));
    return chapterLinks.length === 1 && chapterLinks[0] === '#/asura/mock-series/1' && images.length === 3 && images[0].startsWith('https://cdn.asurascans.com/asura-images/') && lazy === 'lazy';
  })());
  check('scan reader history works even when MangaDex is blocked', await (async () => {
    blockMangaDex = true;
    await visit('/manga', '#comic-discovery');
    const found = !!(await page.$('a[href="#/asura/mock-series/1"]'));
    blockMangaDex = false;
    return found;
  })());
  for (const source of ['vortex', 'hive']) {
    check(`${source} catalogue and free chapter reader`, await (async () => {
      await visit(`/scans/${source}`, '#scans-grid .card', { timeout: 10000 });
      await page.$eval('#scans-grid .poster', (e) => e.click());
      await page.waitForSelector('.ch-list .ch', { timeout: 10000 });
      const chapters = await page.$$eval('.ch-list .ch', (links) => links.map((a) => a.getAttribute('href')));
      await page.$eval('.ch-list .ch', (e) => e.click());
      await page.waitForSelector('.reader .rpage', { timeout: 10000 });
      const images = await page.$$eval('.reader .rpage', (imgs) => imgs.map((img) => img.getAttribute('src')));
      return chapters.length === 1 && chapters[0].endsWith('/mock-iken/1') && images.length === 2 && images[0].endsWith('/1.webp');
    })());
  }
  check('locked Vortex chapter is not requested directly', await (async () => {
    const before = networkRequests.filter((u) => u.includes('/api/chapter?chapterId=2')).length;
    await visit('/scans/vortex/mock-iken/2', '.page');
    await page.waitForFunction(() => document.querySelector('.page')?.textContent.includes('unavailable or locked'), { timeout: 10000 });
    const after = networkRequests.filter((u) => u.includes('/api/chapter?chapterId=2')).length;
    return before === after;
  })());
  check('Omega is blocked by default without network requests', await (async () => {
    const before = networkRequests.filter((u) => u.includes('api.omegascans.org')).length;
    await visit('/scans/omega/mock-omega/chapter-1', '.page h1');
    const after = networkRequests.filter((u) => u.includes('api.omegascans.org')).length;
    return before === after && (await text('.page h1')).includes('Adults only');
  })());
  check('manga detail with chapters', await visit('/manga/00000000-0000-4000-8000-000000000000', '.ch', { shot: 'manga-detail' }) && (await count('.ch')) === 30);
  check('manga read mark toggles once after repeated redraws', await (async () => {
    for (let i = 0; i < 3; i++) await page.$eval('.ch [data-read]', (e) => e.click());
    return (await page.$eval('.ch [data-read]', (e) => e.getAttribute('aria-label'))) === 'Mark unread';
  })());
  check('manga search (type filter)', await visit('/search?type=manga&origin=ko', '.grid .card'));
  check('reader (vertical)', await visit('/read/00000000-0000-4000-8000-000000000000/11111111-0000-4000-8000-000000000005', '.reader .rwrap', { shot: 'reader' }) && (await count('.rwrap')) === 8);
  check('failed reader pages keep the original URL and retry', await (async () => {
    blockReaderImages = true;
    await visit('/read/00000000-0000-4000-8000-000000000000/11111111-0000-4000-8000-000000000006', '.reader .rpage');
    await page.waitForSelector('.reader img.rpage.failed', { timeout: 10000 });
    const src = await page.$eval('.reader img.rpage.failed', (img) => img.src);
    blockReaderImages = false;
    await page.$eval('.reader img.rpage.failed', (img) => img.click());
    await page.waitForFunction(() => { const img = document.querySelector('.reader img.rpage'); return img && img.complete && img.naturalWidth > 0; }, { timeout: 10000 });
    return src.startsWith('https://uploads.mangadex.org/data/') && !src.includes('cover-placeholder');
  })());
  await page.evaluate(() => localStorage.setItem('nx:settings', JSON.stringify({ readerMode: 'rtl' })));
  check('reader (paged RTL) + keyboard', await (async () => {
    await visit('/read/00000000-0000-4000-8000-000000000000/11111111-0000-4000-8000-000000000005', '.paged-wrap');
    const a = await text('#rcount'); await page.keyboard.press('ArrowLeft'); await new Promise((r) => setTimeout(r, 250)); const b = await text('#rcount');
    return a === '1 / 8' && b === '2 / 8';
  })());
  await page.evaluate(() => localStorage.removeItem('nx:settings'));

  check('adult manga is blocked by default, including direct reader links', await (async () => {
    const adultId = '00000000-0000-4000-8000-000000000009';
    const chapter = '11111111-0000-4000-8000-000000009001';
    await visit(`/manga/${adultId}`, '.empty');
    const detailBlocked = (await text('.empty')).includes('18+ manga is off');
    const before = networkRequests.filter((u) => u.includes(`/at-home/server/${chapter}`)).length;
    await visit(`/read/${adultId}/${chapter}`, '.empty');
    const after = networkRequests.filter((u) => u.includes(`/at-home/server/${chapter}`)).length;
    return detailBlocked && (await text('.empty')).includes('18+ manga is off') && before === after;
  })());
  check('adult section and anime direct routes are gated by default', await (async () => {
    await visit('/adult', '.empty');
    const gated = (await text('.empty')).includes('off') && await count('[data-nav="adult"]') === 0;
    await visit('/anime/1099', '.empty');
    const detailGated = (await text('.empty')).includes('Not available');
    await visit('/watch/1099/1', '.hero-slide.active');
    return gated && detailGated && !(await page.$('#stage'));
  })());
  check('adult confirmation rejects wrong answers and supports cancellation', await (async () => {
    await visit('/settings', '[data-tg="adultManga"]');
    await page.$eval('[data-tg="adultManga"]', (e) => e.click());
    const answer = await page.$eval('#adult-question', (e) => { const [a, b, c] = e.textContent.match(/\d+/g).map(Number); return a * b - c; });
    await page.$eval('#adult-answer', (e, n) => { e.value = n; }, answer);
    await page.$eval('#adult-gate', (e) => e.requestSubmit());
    const noDeclaration = (await text('#adult-error')).includes('confirm') && await count('[data-nav="adult"]') === 0;
    await page.$eval('#adult-declare', (e) => e.click());
    await page.$eval('#adult-answer', (e) => { e.value = '-1'; });
    await page.$eval('#adult-gate', (e) => e.requestSubmit());
    const denied = (await text('#adult-error')).includes('correct') && await count('[data-nav="adult"]') === 0;
    await page.$eval('#adult-cancel', (e) => e.click());
    return noDeclaration && denied && await page.$eval('#adult-gate', (e) => e.hidden) && !(await page.$eval('[data-tg="adultManga"]', (e) => e.checked));
  })());
  check('18+ opt-in enables adult search and reader; turning it off hides history', await (async () => {
    await visit('/settings', '[data-tg="adultManga"]');
    await page.$eval('[data-tg="adultManga"]', (e) => e.click());
    await page.$eval('#adult-declare', (e) => e.click());
    const answer = await page.$eval('#adult-question', (e) => { const [a, b, c] = e.textContent.match(/\d+/g).map(Number); return a * b - c; });
    await page.$eval('#adult-answer', (e, n) => { e.value = n; }, answer);
    await page.$eval('#adult-gate', (e) => e.requestSubmit());
    await visit('/adult', '#adult-grid .card');
    const nav = await count('[data-nav="adult"]') === 2;
    const adultBadge = (await text('#adult-grid .card')).includes('18+');
    await page.setViewport({ width: 320, height: 640, isMobile: true, hasTouch: true });
    await page.waitForSelector('#tabbar [data-nav="adult"]', { timeout: 10000 });
    const mobileNav = await page.$eval('#tabbar [data-nav="adult"]', (el) => { const r = el.getBoundingClientRect(); return getComputedStyle(el.parentElement).display === 'flex' && r.left >= 0 && r.right <= innerWidth; });
    await page.setViewport({ width: 1440, height: 900 });
    await visit('/watch/1099/1', '#markbtn');
    await page.$eval('#markbtn', (e) => e.click());
    await visit('/search?type=manga&rating=adult', '.grid .card');
    const badge = (await text('.grid .card')).includes('18+');
    await visit('/scans/omega', '#scans-grid .card', { timeout: 10000 });
    await page.$eval('#scans-grid .poster', (e) => e.click());
    await page.waitForSelector('.ch-list .ch', { timeout: 10000 });
    const omegaChapters = await page.$$eval('.ch-list .ch', (links) => links.map((a) => a.getAttribute('href')));
    await page.$eval('.ch-list .ch', (e) => e.click());
    await page.waitForSelector('.reader .rpage', { timeout: 10000 });
    const omegaPages = await page.$$eval('.reader .rpage', (imgs) => imgs.map((img) => img.getAttribute('src')));
    const omegaOk = omegaChapters.length === 1 && omegaChapters[0].endsWith('/chapter-1') && omegaPages.length === 1 && omegaPages[0].startsWith('https://media.omegascans.org/');
    const adultId = '00000000-0000-4000-8000-000000000009';
    const chapter = '11111111-0000-4000-8000-000000009001';
    const requested = networkRequests.some((u) => u.includes('/manga?') && new URL(u).searchParams.getAll('contentRating[]').includes('pornographic'));
    await visit(`/read/${adultId}/${chapter}`, '.reader .rwrap');
    const pages = (await count('.rwrap')) === 8;
    await visit('/settings', '[data-tg="adultManga"]');
    await page.$eval('[data-tg="adultManga"]', (e) => e.click());
    const hidden = await page.evaluate(async () => !(await import('./js/store.js')).getHistory('manga').some((h) => h.contentRating === 'erotica'));
    const animeHidden = await page.evaluate(async () => !(await import('./js/store.js')).getHistory('anime').some((h) => h.id === '1099') && !(await import('./js/store.js')).allEntries('anime').some((e) => e.id === '1099'));
    return badge && requested && pages && hidden && omegaOk && nav && mobileNav && adultBadge && animeHidden;
  })());

  check('backup import never enables adult mode', await (async () => {
    return page.evaluate(async () => {
      const store = await import('./js/store.js');
      store.importAll({ app: 'NullxAnime', settings: { adultManga: true, adultConfirmation: true } });
      return !store.getSettings().adultManga && !store.getSettings().adultConfirmation && !document.querySelector('[data-nav="adult"]');
    });
  })());
  check('listing view persists across anime and manga', await (async () => {
    await visit('/search?type=anime', '#grid .card');
    await page.$eval('[data-layout="list"]', (e) => e.click());
    const list = await page.$eval('#grid', (e) => e.classList.contains('list-view'));
    await visit('/manga', '#comic-grid .card', { timeout: 10000 });
    const persisted = await page.$eval('#comic-grid', (e) => e.classList.contains('list-view'));
    await page.$eval('[data-layout="grid"]', (e) => e.click());
    return list && persisted && !(await page.$eval('#comic-grid', (e) => e.classList.contains('list-view')));
  })());
  check('reader tools change width and jump to a page', await (async () => {
    await visit('/read/00000000-0000-4000-8000-000000000000/11111111-0000-4000-8000-000000000001', '.reader .rwrap');
    await page.$eval('.reader-tools summary', (e) => e.click());
    await page.$eval('#reader-width', (e) => { e.value = '70'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#reader-page', (e) => { e.value = '3'; });
    await page.$eval('#reader-jump', (e) => e.requestSubmit());
    const width = await page.$eval('.reader', (e) => e.style.getPropertyValue('--reader-page-width') === '70%') && await page.evaluate(async () => (await import('./js/store.js')).getSettings().readerWidth === 70);
    await page.$eval('#modes [data-mode="rtl"]', (e) => e.click());
    await page.$eval('.reader-tools summary', (e) => e.click());
    await page.$eval('#reader-page', (e) => { e.value = '3'; });
    await page.$eval('#reader-jump', (e) => e.requestSubmit());
    const paged = await page.$eval('#rcount', (e) => e.textContent.startsWith('3 /'));
    await visit('/scans/vortex/mock-iken/1', '.reader-tools', { timeout: 10000 });
    const scan = await page.$eval('.reader', (e) => e.style.getPropertyValue('--reader-page-width') === '70%');
    await visit('/asura/mock-series/1', '.reader', { timeout: 10000 });
    const asura = !!(await page.$('.reader-tools'));
    return width && paged && scan && asura;
  })());

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
  check('route navigation replaces the delegated-listener root', await (async () => {
    await page.evaluate(() => { window.oldRouteRoot = document.querySelector('.route-root'); location.hash = '#/discover'; });
    await page.waitForSelector('.dir-card');
    return await page.evaluate(() => !window.oldRouteRoot.isConnected && window.oldRouteRoot !== document.querySelector('.route-root'));
  })());
  await visit('/settings', '.set-card');
  check('lightweight effects can be manually overridden', await (async () => {
    await page.$eval('[data-set="performanceMode"][data-v="on"]', (e) => e.click());
    const on = await page.$eval('html', (e) => e.dataset.performance === 'on');
    const noBlur = await page.$eval('.set-card', (e) => getComputedStyle(e).backdropFilter === 'none');
    await page.$eval('[data-set="performanceMode"][data-v="off"]', (e) => e.click());
    const off = await page.$eval('html', (e) => e.dataset.performance === 'off');
    await page.$eval('[data-set="performanceMode"][data-v="auto"]', (e) => e.click());
    return on && noBlur && off;
  })());
  check('settings: change accent', await (async () => { await page.click('[data-set="accent"][data-v="rose"]'); return (await page.$eval('html', (e) => e.dataset.accent)) === 'rose'; })());
  check('TV mode enables directional navigation', await (async () => {
    await page.$eval('[data-tv="on"]', (e) => e.click());
    if (!(await page.$eval('html', (e) => e.dataset.tvMode === 'on'))) return false;
    await visit('/', '.nav a[data-nav="anime"]');
    await page.focus('.nav a[data-nav="anime"]'); await page.keyboard.press('ArrowRight');
    const moved = await page.evaluate(() => document.activeElement?.dataset.nav === 'manga');
    await visit('/settings', '[data-tv="off"]');
    await page.$eval('[data-tv="off"]', (e) => e.click());
    return moved && (await page.$eval('html', (e) => e.dataset.tvMode === 'off'));
  })());
  check('TV auto detection can be manually overridden', await (async () => {
    const ua = await page.evaluate(() => navigator.userAgent);
    await page.$eval('[data-tv="auto"]', (e) => e.click());
    await page.setUserAgent('Mozilla/5.0 (SMART-TV; Tizen 7.0)');
    await visit('/settings', '[data-tv="off"]');
    const automatic = await page.$eval('html', (e) => e.dataset.device === 'tv' && e.dataset.tvMode === 'on');
    await page.$eval('[data-tv="off"]', (e) => e.click());
    const overridden = await page.$eval('html', (e) => e.dataset.tvMode === 'off');
    await page.$eval('[data-tv="auto"]', (e) => e.click());
    await page.setUserAgent(ua);
    await visit('/settings', '[data-tv="auto"]');
    return automatic && overridden;
  })());
  check('brand animation respects reduced motion and lightweight mode', await (async () => {
    await page.evaluate(async () => { const s = await import('./js/store.js'); s.setSetting('performanceMode', 'off'); s.setSetting('reduceMotion', false); });
    const normal = await page.$eval('.topbar .brand img', (e) => getComputedStyle(e).animationName);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const reduced = await page.$eval('.topbar .brand img', (e) => getComputedStyle(e).animationName);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.evaluate(async () => (await import('./js/store.js')).setSetting('performanceMode', 'on'));
    const light = await page.$eval('.topbar .brand img', (e) => getComputedStyle(e).animationName);
    await page.evaluate(async () => (await import('./js/store.js')).setSetting('performanceMode', 'auto'));
    return normal === 'brand-flourish' && reduced === 'none' && light === 'none';
  })());
  check('footer glitch respects reduced motion', await (async () => {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const result = await page.$eval('.dev-name', (e) => getComputedStyle(e, '::before').animationName === 'none');
    await page.emulateMediaFeatures([]); return result;
  })());
  check('footer credits Gab accessibly', await page.$eval('.dev-signature', (e) => e.getAttribute('aria-label') === 'Developed by Gab' && e.querySelector('.dev-name')?.textContent === 'Gab'));
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
  check('mobile device hint is automatic', await page.$eval('html', (e) => e.dataset.device === 'phone'));
  check('mobile release blocks have two columns and visible titles', await (async () => {
    await visit('/releases', '#release-grid .card');
    return await page.$eval('#release-grid', (grid) => { const a = grid.querySelectorAll('.card'); return a.length >= 2 && a[0].getBoundingClientRect().top === a[1].getBoundingClientRect().top && !!a[0].querySelector('.title').textContent && document.documentElement.scrollWidth <= window.innerWidth + 1; });
  })());
  check('mobile detail', await visit('/anime/1002', '.detail-title', { shot: 'mobile-anime' }));
  check('no horizontal overflow on mobile', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewport({ width: 320, height: 640, isMobile: true, hasTouch: true });
  check('update window fits a small phone and closes with OK', await (async () => {
    await page.$eval('[data-action="whats-new"]', (el) => el.click());
    const fits = await page.$eval('.update-window', (el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
    await page.click('.update-ok');
    return fits && !(await page.$('#update-notice'));
  })());
  check('small phone home stays within viewport', await visit('/', '.hero-slide.active') && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('small phone watch page stays within viewport', await visit('/watch/1000/1', '#stage') && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('small phone manga sorting and connection check fit the screen', await (async () => {
    await visit('/manga?q=Mock', '#comic-grid');
    await page.click('.comic-diagnostic summary');
    await page.$eval('#comic-check', (el) => el.scrollIntoView({ block: 'center' }));
    await new Promise((r) => setTimeout(r, 500));
    await page.click('#comic-check');
    try { await page.waitForFunction(() => document.querySelectorAll('#comic-check-results li').length >= 5 && !document.querySelector('#comic-check-results').textContent.includes('Checking…'), { timeout: 12000 }); } catch (error) { console.error('Diagnostic state:', await page.$eval('#comic-check-results', (el) => el.textContent)); throw error; }
    return await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && !!document.querySelector('#comic-sort a.on') && !document.querySelector('#comic-check').disabled);
  })());
  check('small phone scan reader stays within viewport', await visit('/scans/vortex/mock-iken/1', '.reader .rpage', { timeout: 10000 }) && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  check('no uncaught JS / console errors', errors.length === 0, `\n    ${errors.slice(0, 6).join('\n    ')}`);
  failed = results.filter((r) => !r.ok).length;
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
