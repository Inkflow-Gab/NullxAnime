// Real-browser regression for the mixed-version service-worker failure and later updates.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png' };
let release = 'legacy', breakSchedule = false, breakMain = false;
const legacyWorker = `
self.addEventListener('install', e => e.waitUntil(caches.open('nx-v10').then(c => c.addAll(['./js/util.js','./js/main.js'])).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => { if (e.request.method === 'GET' && new URL(e.request.url).origin === location.origin) e.respondWith(caches.open('nx-v10').then(async c => (await c.match(e.request)) || fetch(e.request))); });`;
const legacyMain = `
import { html } from './util.js';
navigator.serviceWorker.register('sw.js');
import('./api/mangadex.js').catch(e => { document.querySelector('#app').innerHTML = '<p id="legacy-error"></p>'; document.querySelector('#legacy-error').textContent = e.message; });`;

const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path === '/' ? '/index.html' : path;
    if (!resolve(join(ROOT, file)).startsWith(ROOT + '/')) throw new Error('bad path');
    if (breakSchedule && file === '/js/pages/schedule.js') return res.writeHead(503).end('temporary failure');
    let contents = await readFile(join(ROOT, file));
    if (breakMain && file === '/js/main.js') contents = Buffer.from("import { missingExport } from './util.js';");
    if (file === '/sw.js') contents = Buffer.from(release === 'legacy' ? legacyWorker : contents.toString().replace("const VERSION = 'nx-v15';", `const VERSION = '${release === 'fixed' ? 'nx-v15' : 'nx-v16'}';`));
    if (release === 'legacy' && file === '/js/main.js') contents = Buffer.from(legacyMain);
    if (release === 'legacy' && file === '/js/util.js') contents = Buffer.from(contents.toString().replace('export function requestTimeout(', 'function requestTimeout('));
    if (release !== 'legacy' && file === '/js/data/release.js') contents = Buffer.from(`${contents}\nexport const TEST_MARKER = ${JSON.stringify(release)};\n`);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(contents);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(8131, '127.0.0.1', resolve));
const BASE = 'http://127.0.0.1:8131/';
let executablePath = process.env.CHROME_PATH, args = [];
if (!executablePath) { const { default: chromium } = await import('@sparticuz/chromium'); executablePath = await chromium.executablePath(); args = chromium.args; }
const browser = await puppeteer.launch({ executablePath, headless: 'shell', args: [...args, '--no-sandbox'] });
async function mockExternal(page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => new URL(request.url()).origin === new URL(BASE).origin ? request.continue() : request.respond({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
}
const marker = (page) => page.evaluate(() => fetch('js/data/release.js').then((r) => r.text()));
try {
  const first = await browser.newPage();
  await mockExternal(first);
  await first.goto(`${BASE}#/manga`, { waitUntil: 'load' });
  await first.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 15000 });
  await first.reload({ waitUntil: 'load' });
  await first.waitForSelector('#legacy-error');
  assert.match(await first.$eval('#legacy-error', (e) => e.textContent), /requestTimeout/);
  await first.evaluate(async () => { localStorage.setItem('nx:history', '[{"id":"keep-me"}]'); localStorage.setItem('nx:settings', '{"theme":"oled"}'); await caches.open('other-app-cache'); await caches.open('nx-deadbee'); });
  release = 'fixed';
  await first.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await first.waitForSelector('#comic-discovery', { timeout: 25000 });
  assert.equal(await first.evaluate(() => localStorage.getItem('nx:history')), '[{"id":"keep-me"}]');
  assert.equal(await first.evaluate(() => JSON.parse(localStorage.getItem('nx:settings')).theme), 'oled');
  assert.match(await marker(first), /TEST_MARKER = "fixed"/);
  const cacheNames = await first.evaluate(() => caches.keys());
  assert.ok(cacheNames.includes('other-app-cache') && cacheNames.includes('nx-deadbee'), 'unrelated caches must not be deleted');
  if (await first.$('#update-notice .update-ok')) await first.click('#update-notice .update-ok');
  console.log('✓ legacy mixed-module cache repaired without clearing user data');

  const second = await browser.newPage();
  await mockExternal(second);
  await second.goto(`${BASE}#/manga`, { waitUntil: 'load' });
  await second.waitForSelector('#comic-discovery', { timeout: 10000 });
  await first.evaluate(() => { document.body.dataset.testSession = 'first'; });
  await second.evaluate(() => { document.body.dataset.testSession = 'second'; });
  release = 'next';
  assert.match(await marker(first), /TEST_MARKER = "fixed"/, 'cached shell must not revalidate individual modules');
  await first.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await first.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting, { polling: 100, timeout: 15000 });
  await first.waitForSelector('#update-ready', { timeout: 5000 });
  assert.equal(await first.evaluate(() => document.body.dataset.testSession), 'first', 'ordinary updates must not force reloads');
  const navigation = first.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await first.click('#update-ready button');
  await navigation;
  assert.equal(await first.evaluate(() => document.body.dataset.testSession), undefined);
  await first.waitForSelector('#comic-discovery', { timeout: 10000 });
  assert.match(await marker(first), /TEST_MARKER = "next"/);
  assert.equal(await second.evaluate(() => document.body.dataset.testSession), 'second', 'other open tabs must not be reloaded');
  assert.match(await marker(second), /TEST_MARKER = "fixed"/, 'other tabs stay pinned to their original shell');
  await second.reload({ waitUntil: 'load' });
  await second.waitForSelector('#comic-discovery', { timeout: 10000 });
  assert.match(await marker(second), /TEST_MARKER = "next"/);
  console.log('✓ future update waits for consent and preserves coherent versions across tabs');

  await second.setOfflineMode(true);
  await second.reload({ waitUntil: 'load' });
  await second.waitForSelector('#comic-discovery', { timeout: 10000 });
  assert.match(await marker(second), /TEST_MARKER = "next"/);
  console.log('✓ cached shell opens offline');

  await second.setOfflineMode(false);
  await first.evaluate(async () => (await navigator.serviceWorker.getRegistration()).unregister());
  const third = await browser.newPage();
  await mockExternal(third);
  breakSchedule = true;
  await third.goto(`${BASE}?nosw#/schedule`, { waitUntil: 'load' });
  if (await third.$('#update-notice .update-ok')) await third.click('#update-notice .update-ok');
  await third.waitForSelector('[data-action="reload-app"]', { timeout: 10000 });
  breakSchedule = false;
  await third.click('[data-action="reload-app"]');
  await third.waitForSelector('#days', { timeout: 10000 });
  console.log('✓ a failed module import offers a real page reload');
  await third.close();

  const fourth = await browser.newPage();
  await mockExternal(fourth);
  breakMain = true;
  await fourth.goto(`${BASE}?nosw#/manga`, { waitUntil: 'load' });
  await fourth.waitForSelector('#bootstrap-retry', { timeout: 10000 });
  breakMain = false;
  await fourth.click('#bootstrap-retry');
  await fourth.waitForSelector('#comic-discovery', { timeout: 10000 });
  console.log('✓ a broken app bootstrap still provides a working reload button');
  await fourth.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
