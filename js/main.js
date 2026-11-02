// App bootstrap: shell (top bar, tab bar, footer), global shortcuts, service worker, router.

import { html, render, $, $$, on } from './util.js';
import { icon } from './ui/icons.js';
import { applySettings, getSettings, setSetting } from './store.js';
import { bindGlobalUi, toast } from './ui/components.js';
import { openPalette, setPaletteType } from './ui/palette.js';
import { startRouter, onRoute, go, reload } from './router.js';
import { installTvNavigation } from './ui/tv.js';

applySettings();
bindGlobalUi();
installTvNavigation();

const NAV = [
  ['anime', 'Anime', '#/', 'tv'],
  ['manga', 'Manga', '#/manga', 'book'],
  ['schedule', 'Schedule', '#/schedule', 'calendar'],
  ['library', 'My List', '#/library', 'library'],
  ['discover', 'Discover', '#/discover', 'compass'],
];

function drawShell() {
  render($('#topbar'), html`
    <a class="brand" href="#/" aria-label="NullxAnime home"><img src="assets/icon-192.png" alt="" width="32" height="32"><span>Nullx<b>Anime</b></span></a>
    <nav class="nav" aria-label="Main">${NAV.map(([k, label, href, ic]) => html`<a href="${href}" data-nav="${k}">${label}</a>`)}</nav>
    <div class="topbar-spacer"></div>
    <div class="top-actions">
      <button class="search-trigger" data-action="search" aria-label="Search">${icon('search')}<span>Search anime &amp; manga</span><kbd>/</kbd></button>
      <a class="icon-btn" href="#/settings" aria-label="Settings" title="Settings">${icon('settings')}</a>
    </div>`);
  render($('#tabbar'), NAV.map(([k, label, href, ic]) => html`<a href="${href}" data-nav="${k}">${icon(ic)}<span>${label === 'My List' ? 'List' : label}</span></a>`));
  render($('#footer'), html`<div class="footer-inner">
    <div><a class="brand" href="#/" style="margin-bottom:10px"><img src="assets/icon-192.png" alt="" width="28" height="28"><span>Nullx<b>Anime</b></span></a>
      <p>A fast, ad-free anime &amp; manga hub. No captcha, no account, no tracking — your list lives in your browser.</p></div>
    <div><h4>Explore</h4><ul><li><a href="#/">Anime home</a></li><li><a href="#/manga">Manga home</a></li><li><a href="#/search?type=anime">Browse anime</a></li><li><a href="#/search?type=manga">Browse manga</a></li><li><a href="#/free">Free &amp; open library</a></li></ul></div>
    <div><h4>More</h4><ul><li><a href="#/library">My list</a></li><li><a href="#/discover">Discover tools &amp; sites</a></li><li><a href="#/settings">Settings &amp; backup</a></li><li><a href="#/about">About &amp; legal</a></li><li><a href="https://github.com/Inkflow-Gab/NullxAnime" target="_blank" rel="noopener">GitHub</a></li></ul></div>
    <p class="fine">NullxAnime does not host any video or manga files. Metadata comes from <a href="https://anilist.co" target="_blank" rel="noopener">AniList</a>, manga from <a href="https://mangadex.org" target="_blank" rel="noopener">MangaDex</a> and open video from the <a href="https://archive.org" target="_blank" rel="noopener">Internet Archive</a>. All trademarks and artwork belong to their respective owners. Please support the creators through official releases.</p>
  </div>`);
}
drawShell();

/* ----- active nav state + transparent top bar over heroes ----- */
onRoute((nav) => {
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
  const m = nav === 'manga' ? 'manga' : 'anime';
  setPaletteType(m);
  updateTopbar();
});
function updateTopbar() {
  const bar = $('#topbar');
  bar.classList.toggle('on-hero', document.body.classList.contains('has-hero') && window.scrollY < 40);
}
window.addEventListener('scroll', updateTopbar, { passive: true });
new MutationObserver(updateTopbar).observe(document.body, { attributes: true, attributeFilter: ['class'] });

/* ----- global clicks ----- */
on(document, 'click', '[data-action="search"]', () => openPalette());
on(document, 'click', '[data-action="retry"]', () => reload());
on(document, 'click', '[data-action="shortcuts"]', () => showShortcuts());

/* ----- keyboard shortcuts ----- */
let seq = '';
let seqTimer;
window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = ['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable;
  if ((e.key === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); openPalette(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); openPalette(); return; }
  if (e.key === '?') { showShortcuts(); return; }
  if (seq === 'g') {
    const map = { a: '/', m: '/manga', l: '/library', s: '/schedule', d: '/discover', c: '/settings' };
    if (map[e.key]) { go(map[e.key]); }
    seq = ''; clearTimeout(seqTimer); return;
  }
  if (e.key === 'g') { seq = 'g'; clearTimeout(seqTimer); seqTimer = setTimeout(() => (seq = ''), 1200); }
});

function showShortcuts() {
  if ($('#shortcuts')) return;
  const el = document.createElement('div');
  el.className = 'scrim'; el.id = 'shortcuts';
  const rows = [
    ['/  or  Ctrl K', 'Search'], ['g then a', 'Anime home'], ['g then m', 'Manga home'], ['g then l', 'My list'], ['g then s', 'Schedule'],
    ['Space / K', 'Play / pause video'], ['← →', 'Seek 5s (video) / change page (manga)'], ['J / L', 'Seek 10s'], ['F', 'Fullscreen'], ['M', 'Mute'],
    ['N / P', 'Next / previous episode or chapter'], ['?', 'This help'],
  ];
  el.innerHTML = html`<div class="modal"><div class="modal-head"><h3>Keyboard shortcuts</h3><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="modal-body"><dl class="kv" style="grid-template-columns:auto 1fr;gap:10px 22px">${rows.map(([k, d]) => html`<dt><span class="kbd">${k}</span></dt><dd>${d}</dd>`)}</dl></div></div>`.toString();
  const close = () => { el.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  el.addEventListener('mousedown', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  $('#overlay-root').appendChild(el);
}

/* ----- connectivity ----- */
window.addEventListener('offline', () => toast('You are offline', 'err'));
window.addEventListener('online', () => toast('Back online'));

/* ----- PWA ----- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/[?&]nosw/.test(location.search)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.__deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__deferredInstall = e; });

startRouter();
