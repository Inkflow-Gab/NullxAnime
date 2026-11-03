// Settings, backup & restore, PWA install.

import { html, render, $, $$, on, download } from '../util.js';
import { icon } from '../ui/icons.js';
import { getSettings, setSetting, exportAll, importAll, wipeAll, allEntries } from '../store.js';
import { toast } from '../ui/components.js';
import { clearCache } from '../cache.js';
import { LANGS } from '../api/mangadex.js';
import { exportMalXml } from './library.js';

const ACCENTS = [['violet', '#8b5cf6'], ['rose', '#f43f5e'], ['cyan', '#06b6d4'], ['lime', '#84cc16'], ['amber', '#f59e0b'], ['sky', '#3b82f6']];

export default async function settings(ctx) {
  ctx.setTitle('Settings');
  const draw = () => {
    const s = getSettings();
    ctx.render(html`<div class="container page narrow">
      <h1 class="page-title">Settings</h1>

      <section class="glass set-card"><h2>Appearance</h2>
        <div class="set-row"><div><b>Theme</b><small>Dark, pure-black for OLED, or light.</small></div>
          <div class="seg">${['dark', 'oled', 'light'].map((t) => html`<button data-set="theme" data-v="${t}" class="${s.theme === t ? 'on' : ''}">${t === 'oled' ? 'OLED' : t[0].toUpperCase() + t.slice(1)}</button>`)}</div></div>
        <div class="set-row"><div><b>Accent colour</b><small>Buttons, highlights and gradients.</small></div>
          <div class="swatches">${ACCENTS.map(([n, c]) => html`<button data-set="accent" data-v="${n}" class="swatch ${s.accent === n ? 'on' : ''}" style="--c:${c}" aria-label="${n}"></button>`)}</div></div>
        <div class="set-row"><div><b>Anime titles</b><small>Which title to show first.</small></div>
          <div class="seg">${[['romaji', 'Romaji'], ['english', 'English'], ['native', 'Native']].map(([v, l]) => html`<button data-set="titleLang" data-v="${v}" class="${s.titleLang === v ? 'on' : ''}">${l}</button>`)}</div></div>
        <div class="set-row"><div><b>Airing countdowns on cards</b><small>Show “EP 5 · 2d 4h” badges.</small></div>${toggle('showCountdown', s.showCountdown)}</div>
        <div class="set-row"><div><b>TV mode</b><small>Auto detects known TVs; override it for larger controls and remote navigation.</small></div><div class="seg" role="group" aria-label="TV mode">${[['auto', 'Auto'], ['on', 'On'], ['off', 'Off']].map(([v, label]) => html`<button data-tv="${v}" class="${(s.tvMode == null ? 'auto' : s.tvMode ? 'on' : 'off') === v ? 'on' : ''}" aria-pressed="${(s.tvMode == null ? 'auto' : s.tvMode ? 'on' : 'off') === v}">${label}</button>`)}</div></div>
        <div class="set-row"><div><b>Lightweight effects</b><small>Auto reduces expensive blur on phones, TVs and data-saving devices. On or Off overrides detection.</small></div><div class="seg" role="group" aria-label="Lightweight effects">${[['auto', 'Auto'], ['on', 'On'], ['off', 'Off']].map(([v, label]) => html`<button data-set="performanceMode" data-v="${v}" class="${s.performanceMode === v ? 'on' : ''}" aria-pressed="${s.performanceMode === v}">${label}</button>`)}</div></div>
        <div class="set-row"><div><b>Reduce motion</b><small>Disable carousels and animations.</small></div>${toggle('reduceMotion', s.reduceMotion)}</div>
      </section>

      <section class="glass set-card"><h2>Watching</h2>
        <div class="set-row"><div><b>Auto-play next episode</b><small>When a video in the built-in player finishes.</small></div>${toggle('autoNext', s.autoNext)}</div>
      </section>

      <section class="glass set-card"><h2>Manga reader</h2>
        <div class="set-row"><div><b>Preferred language</b><small>Used for chapter lists and search.</small></div>
          <select class="select" data-sel="mangaLang" style="width:auto">${LANGS.map(([c, n]) => html`<option value="${c}" ${s.mangaLang === c ? 'selected' : ''}>${n}</option>`)}</select></div>
        <div class="set-row"><div><b>Reading mode</b><small>Webtoon scroll, or paged left-to-right / right-to-left.</small></div>
          <div class="seg">${[['vertical', 'Vertical'], ['ltr', 'LTR'], ['rtl', 'RTL']].map(([v, l]) => html`<button data-set="readerMode" data-v="${v}" class="${s.readerMode === v ? 'on' : ''}">${l}</button>`)}</div></div>
        <div class="set-row"><div><b>Image fit</b></div>
          <div class="seg">${[['width', 'Width'], ['height', 'Height'], ['original', 'Original']].map(([v, l]) => html`<button data-set="readerFit" data-v="${v}" class="${s.readerFit === v ? 'on' : ''}">${l}</button>`)}</div></div>
        <div class="set-row"><div><b>18+ anime &amp; manga</b><small>Off by default. Enables the Hentai catalogue and adult manga sources. Self-declaration and a math question are not age verification.</small></div>${toggle('adultManga', s.adultManga)}</div>
        <form id="adult-gate" class="adult-gate" hidden>
          <h3>Enable 18+ content</h3><p>This is a local self-declaration, not age verification. Content and third-party players may be explicit.</p>
          <label class="adult-declaration"><input id="adult-declare" type="checkbox"> I confirm I am at least 18 years old and want to view adult content.</label>
          <label for="adult-answer" id="adult-question"></label><input class="input" id="adult-answer" type="number" inputmode="numeric" required aria-describedby="adult-error">
          <p id="adult-error" role="status" aria-live="polite"></p><div class="row"><button class="btn primary" type="submit">Enable 18+</button><button class="btn" type="button" id="adult-cancel">Cancel</button></div>
        </form>
        <div class="set-row"><div><b>Data saver</b><small>Use compressed page images.</small></div>${toggle('readerDataSaver', s.readerDataSaver)}</div>
      </section>

      <section class="glass set-card"><h2>Your data</h2>
        <p class="muted">Everything — list, progress, history, settings — lives only in this browser. Make a backup to move to another device.</p>
        <div class="row" style="margin-top:12px">
          <button class="btn" id="exp">${icon('download')} Export backup (.json)</button>
          <label class="btn" style="cursor:pointer">${icon('upload')} Import backup<input type="file" id="imp" accept="application/json,.json" hidden></label>
          <button class="btn" id="mal">${icon('download')} Export anime list for MyAnimeList / AniList (.xml)</button>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm" id="cc">${icon('refresh')} Clear cached data</button>
          <button class="btn sm danger" id="wipe">${icon('trash')} Erase everything</button>
        </div>
        <p class="muted" style="margin-top:10px;font-size:12.5px">${allEntries().length} items on your list.</p>
      </section>

      <section class="glass set-card"><h2>App</h2>
        <div class="row"><button class="btn" id="install" ${window.__deferredInstall ? '' : 'hidden'}>${icon('download')} Install NullxAnime</button>
          <button class="btn" data-action="shortcuts">${icon('keyboard')} Keyboard shortcuts</button><a class="btn" href="#/about">${icon('info')} About &amp; legal</a></div>
        <p class="muted" style="margin-top:10px;font-size:12.5px">Tip: on phones use “Add to Home Screen” to install it like a native app.</p>
      </section>
    </div>`);
  };
  const toggle = (key, on_) => html`<label class="switch"><input type="checkbox" aria-label="${key === 'adultManga' ? '18+ anime and manga' : key}" data-tg="${key}" ${on_ ? 'checked' : ''}><i></i></label>`;
  draw();
  on(ctx.el, 'click', '[data-tv]', (e, t) => { setSetting('tvMode', t.dataset.tv === 'auto' ? null : t.dataset.tv === 'on'); draw(); });
  on(ctx.el, 'click', '[data-set]', (e, t) => { setSetting(t.dataset.set, t.dataset.v); draw(); });
  let answer;
  on(ctx.el, 'change', '[data-tg]', (e, t) => {
    if (t.dataset.tg === 'adultManga') {
      if (t.checked) {
        t.checked = false;
        const a = 23 + Math.floor(Math.random() * 27), b = 17 + Math.floor(Math.random() * 25), c = 31 + Math.floor(Math.random() * 50);
        answer = a * b - c;
        $('#adult-question', ctx.el).textContent = `Solve: ${a} × ${b} − ${c} = ?`;
        $('#adult-gate', ctx.el).hidden = false;
        $('#adult-declare', ctx.el).focus();
        return;
      }
      setSetting('adultConfirmation', false);
    }
    setSetting(t.dataset.tg, t.checked);
  });
  on(ctx.el, 'click', '#adult-cancel', () => { $('#adult-gate', ctx.el).hidden = true; $('[data-tg="adultManga"]', ctx.el).focus(); });
  on(ctx.el, 'submit', '#adult-gate', (e) => {
    e.preventDefault();
    if (!$('#adult-declare', ctx.el).checked || Number($('#adult-answer', ctx.el).value) !== answer || $('#adult-answer', ctx.el).value.trim() === '') {
      $('#adult-error', ctx.el).textContent = 'Please confirm your age and enter the correct answer.'; return;
    }
    setSetting('adultConfirmation', true); setSetting('adultManga', true); draw();
    $('[data-tg="adultManga"]', ctx.el).focus();
  });
  on(ctx.el, 'change', '[data-sel]', (e, t) => setSetting(t.dataset.sel, t.value));
  const q = (sel, fn) => ctx.el.addEventListener('click', (e) => { if (e.target.closest(sel)) fn(e); });
  q('#exp', () => { download(`nullxanime-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportAll(), null, 2)); toast('Backup downloaded'); });
  ctx.el.addEventListener('change', async (e) => {
    if (e.target.id !== 'imp') return;
    try { importAll(JSON.parse(await e.target.files[0].text())); toast('Backup imported'); draw(); } catch (err) { toast(err.message || 'Could not read that file', 'err'); }
  });
  q('#mal', async (e) => {
    const b = e.target.closest('#mal'); b.disabled = true;
    try { const r = await exportMalXml(); if (!r.exported) { toast('No anime with a MyAnimeList id to export yet', 'err'); } else { download('nullxanime-anime-list.xml', r.xml, 'application/xml'); toast(`Exported ${r.exported} anime${r.skipped ? ` (${r.skipped} skipped)` : ''}`); } }
    catch (err) { toast(err.message, 'err'); }
    b.disabled = false;
  });
  q('#cc', () => { clearCache(); toast('Cache cleared'); });
  q('#wipe', () => { if (confirm('Erase your list, history, progress and settings from this browser? This cannot be undone.')) { wipeAll(); toast('Everything erased'); draw(); } });
  q('#install', async () => { const p = window.__deferredInstall; if (!p) return; p.prompt(); await p.userChoice; window.__deferredInstall = null; draw(); });
}
