// Live verification through the exact Pages origin, not a simulated CORS header.
// We fetch one known public catalogue, unlocked chapter and page image per source.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const BASE = 'https://nullxanime-manga-gateway.gabtestmails.workers.dev';
const PROBE = 'https://inkflow-gab.github.io/__nx_gateway_probe__';
const note = (level, text) => console.log(`::${level}::${text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
try {
  browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args.filter((arg) => arg !== '--disable-web-security'), '--no-sandbox'] });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => req.url() === PROBE ? req.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Gateway probe</title>' }) : req.continue());
  await page.goto(PROBE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (await page.evaluate(() => location.origin) !== 'https://inkflow-gab.github.io') throw new Error('Unexpected probe origin');
  const get = (path) => page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: 'omit', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(18000) });
    if (!res.ok) { const text = (await res.text()).slice(0, 200); throw new Error(`HTTP ${res.status}: ${text}`); }
    return res.json();
  }, BASE + path);
  const image = (url, expectedOrigin) => page.evaluate(([u, allowed]) => new Promise((resolve) => {
    try { if (new URL(u).origin !== allowed) return resolve(false); } catch { return resolve(false); }
    const img = new Image(); img.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => resolve(false), 12000);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(timer); resolve(false); }; img.src = u;
  }), [url, expectedOrigin]);
  const probes = [
    ['Asura', async () => {
      const catalogue = await get('/asura/series?limit=1&offset=0&sort=popular');
      if (!catalogue.data?.length) throw new Error('Empty catalogue');
      await wait(1100);
      const details = await get('/asura/series/martial-god-regressed-to-level-2');
      if (details.series?.slug !== 'martial-god-regressed-to-level-2') throw new Error('Invalid series details');
      await wait(1100);
      const chapters = await get('/asura/series/martial-god-regressed-to-level-2/chapters');
      if (!chapters.data?.some((c) => String(c.number) === '1' && !c.is_premium && (!c.early_access_until || Date.parse(c.early_access_until) <= Date.now()))) throw new Error('Sample chapter is locked or missing');
      await wait(1100);
      const body = await get('/asura/series/martial-god-regressed-to-level-2/chapters/1');
      if (body.data?.is_locked || body.data?.access_gate || String(body.data?.chapter?.number) !== '1') throw new Error('Sample chapter is locked or invalid');
      if (!(await image(body.data?.chapter?.pages?.[0]?.url, 'https://cdn.asurascans.com'))) throw new Error('Sample image did not load');
    }],
    ['Vortex', async () => {
      const catalogue = await get('/vortex/api/query?perPage=1&page=1&orderBy=totalViews');
      if (!catalogue.posts?.length) throw new Error('Empty catalogue');
      await wait(1100);
      const details = await get('/vortex/api/post?postSlug=the-northern-grand-dukes-mad-son-in-law');
      if (String(details.post?.id) !== '709') throw new Error('Invalid series details');
      await wait(1100);
      const chapters = await get('/vortex/api/chapters?postId=709');
      if (!chapters.post?.chapters?.some((c) => String(c.id) === '34639' && !c.isLocked && !c.isTimeLocked && !c.isPermanentlyLocked && !c.isShortLinkLocked && c.isAccessible !== false && Number(c.price || 0) === 0)) throw new Error('Sample chapter is locked or missing');
      await wait(1100);
      const body = await get('/vortex/api/chapter?chapterId=34639');
      const c = body.chapter;
      if (!c || body.paywall || c.isLocked || c.isTimeLocked || c.isPermanentlyLocked || c.isShortLinkLocked || c.isAccessible === false || Number(c.price || 0) > 0 || String(c.mangaPostId) !== '709') throw new Error('Sample chapter is locked or invalid');
      if (!(await image(c.images?.[0]?.url, 'https://storage.vortexscans.org'))) throw new Error('Sample image did not load');
    }],
  ];
  let failed = false;
  for (const [name, probe] of probes) {
    try { await probe(); note('notice', `${name} relay: catalogue, series details, unlocked chapter metadata and sample page image loaded from the Pages origin.`); }
    catch (e) { failed = true; note('warning', `${name} relay live probe failed: ${e.message}.`); }
  }
  if (failed) process.exitCode = 1;
} catch (e) { note('warning', `Relay browser probe could not run: ${e.message}`); process.exitCode = 1; }
finally { await browser?.close(); }
