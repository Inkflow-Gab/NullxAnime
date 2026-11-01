// DOM smoke test with jsdom — runs the real router + page modules against mocked APIs.
// Catches runtime/template errors in the watch page that `node --check` cannot.
//   node tests/dom.mjs
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { anilist, mangadex, archive, imageFor } from './mock.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const html = readFileSync(`${ROOT}index.html`, 'utf8');

const dom = new JSDOM(html, { url: 'http://localhost:8080/?nosw', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;

/* ---- browser bits jsdom does not implement ---- */
window.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};
window.URL.createObjectURL = () => 'blob:mock';
window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
window.HTMLCanvasElement.prototype.getContext = () => null;

for (const k of ['window', 'document', 'navigator', 'location', 'history', 'localStorage', 'HTMLElement', 'Element', 'Node',
  'CustomEvent', 'Event', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'matchMedia',
  'IntersectionObserver', 'URL', 'Blob', 'FormData', 'DOMParser', 'Image']) {
  if (window[k] === undefined) continue;
  try { globalThis[k] = window[k]; } catch { Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true }); }
}

/* ---- mocked network ---- */
const seen = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  seen.push(url);
  const u = new URL(url);
  let body;
  if (u.hostname === 'graphql.anilist.co') body = anilist(init.body || '{}');
  else if (u.hostname === 'api.mangadex.org') body = mangadex(url);
  else if (u.hostname === 'archive.org' && !u.pathname.startsWith('/download') && !u.pathname.startsWith('/services')) body = archive(url);
  else if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) return { ok: true, status: 200, text: async () => imageFor(url) };
  else throw new Error(`blocked ${url}`);
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
const origError = console.error;
console.error = (...a) => { errors.push(a.join(' ')); };

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ` ${extra}`}`); };
const tick = (ms = 300) => new Promise((r) => setTimeout(r, ms));

const { startRouter } = await import(`${ROOT}js/router.js`);
startRouter();
await tick(500);

const app = () => window.document.getElementById('app');
const counts = (sel) => app().querySelectorAll(sel).length;

console.log('Pages');
check('home renders rails', app().querySelectorAll('.rail .card').length > 20);
check('home links to no YouTube / Crunchyroll / Netflix page', app().querySelectorAll('a[href*="youtube"],a[href*="crunchyroll"],a[href*="netflix"]').length === 0);

// go to the watch page
window.location.hash = '#/watch/1000/1';
await tick(600);
window.dispatchEvent(new window.Event('hashchange'));
await tick(1200);

console.log('Watch page');
check('watch page renders shells', !!app().querySelector('#stage') && !!app().querySelector('#srcbox'));
check('tabs: sources / free library / my link', [...app().querySelectorAll('#tabs [data-src]')].map((b) => b.dataset.src).join(',') === 'sources,library,mine');
check('no iframe (nothing embedded)', app().querySelectorAll('iframe').length === 0);
check('watch page links to no YouTube / Crunchyroll / Netflix page', app().querySelectorAll('a[href*="youtube"],a[href*="crunchyroll"],a[href*="netflix"]').length === 0);

// the Internet Archive provider should resolve through the mocked API
let rows = 0;
for (let i = 0; i < 30 && rows === 0; i++) { await tick(200); rows = app().querySelectorAll('.src-row').length; }
check('provider list resolves a playable row', rows >= 1, `rows=${rows}`);
check('the archive provider is listed', /Internet Archive/.test(app().innerHTML));

// My stream: save a template and play it
const form = app().querySelector('#srcform');
const tpl = app().querySelector('#srctpl');
check('stream template form present', !!form && !!tpl);
if (form && tpl) {
  tpl.value = 'https://media.example.com/{id}/{ep0}.mp4';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick(600);
  const v = app().querySelector('.vp video');
  check('saved template plays in the built-in player', !!v && v.getAttribute('src') === 'https://media.example.com/1000/01.mp4', v?.getAttribute('src') || 'no video');
  check('saved template persisted per title', !!JSON.parse(window.localStorage.getItem('nx:src') || '{}')['direct:1000']);
  const directRow = [...app().querySelectorAll('.src-row')].find((r) => /media\.example\.com/.test(r.textContent || '') || r.dataset.play === '0');
  check('resolved stream appears as a source row', !!directRow);
}

// Play once (no save)
const savedBefore = window.localStorage.getItem('nx:src');
const quick2 = app().querySelector('#srcquick');
const tpl2 = app().querySelector('#srctpl');
if (quick2 && tpl2) {
  tpl2.value = 'https://other.example.com/{ep}.webm';
  quick2.click();
  await tick(300);
  const v = app().querySelector('.vp video');
  check('“Play once” plays without saving', !!v && v.getAttribute('src') === 'https://other.example.com/1.webm' && window.localStorage.getItem('nx:src') === savedBefore, v?.getAttribute('src') || 'no video');
}

// library tab still works
app().querySelector('[data-src="library"]').click();
await tick(700);
check('free library tab lists results', app().querySelectorAll('.lib-item').length > 0);
app().querySelector('.lib-item')?.click();
await tick(500);
check('library item plays in the custom player', !!app().querySelector('.vp video'));

console.log('Detail page');
window.localStorage.removeItem('nx:src');
window.location.hash = '#/anime/1000';
await tick(400);
window.dispatchEvent(new window.Event('hashchange'));
await tick(900);
check('detail page renders', !!app().querySelector('.detail-title'));
check('detail has the streaming-sources section', !!app().querySelector('#where'));
check('detail links to no YouTube / Crunchyroll / Netflix page', app().querySelectorAll('a[href*="youtube"],a[href*="youtu.be"],a[href*="crunchyroll"],a[href*="netflix"]').length === 0 && app().querySelectorAll('iframe').length === 0);

console.error = origError;
const noise = errors.filter((e) => !/not implemented|Could not load|blocked http/i.test(e));
check('no uncaught errors', noise.length === 0, `\n    ${noise.slice(0, 5).join('\n    ')}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
