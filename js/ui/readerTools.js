import { html } from '../util.js';
import { icon } from './icons.js';
import { getSettings, setSetting } from '../store.js';

// One compact reader dock across MangaDex, Asura and scan readers.
// Source readers supply their page list in the DOM; MangaDex supplies its own renderer.
export function attachReaderTools(ctx, reader, pageCount, jump, options = {}) {
  const sourceReader = !jump;
  if (sourceReader) reader.classList.add('source-reader');
  const box = document.createElement('details');
  box.className = 'reader-tools';
  box.innerHTML = html`<summary aria-label="Open reader settings">${icon('settings')} <span>Reader settings</span></summary><div class="reader-tools-panel" aria-label="Reader settings">
    <div class="reader-panel-head"><div><b>Make it yours</b><small>Comfortable reading, your way.</small></div><button type="button" id="reader-close" aria-label="Close reader settings">${icon('x')}</button></div>
    <fieldset><legend>Reading layout</legend><div class="reader-choices" id="reader-layout">${[['vertical', 'Long strip'], ['ltr', 'Pages →'], ['rtl', '← Pages']].map(([id, label]) => html`<button type="button" data-reader-mode="${id}">${label}</button>`)}</div></fieldset>
    <fieldset><legend>Page fit</legend><div class="reader-choices" id="reader-fit">${[['width', 'Width'], ['height', 'Height'], ['original', 'Original']].map(([id, label]) => html`<button type="button" data-reader-fit="${id}">${label}</button>`)}</div></fieldset>
    <label for="reader-width">Page width <output id="reader-width-value"></output></label>
    <input id="reader-width" type="range" min="50" max="100" step="5" aria-label="Page width in fit-width mode"><small>In width fit mode.</small>
    <label for="reader-gap">Space between pages <output id="reader-gap-value"></output></label><input id="reader-gap" type="range" min="0" max="40" step="5">
    <form id="reader-jump"><label for="reader-page">Jump to page (1–${pageCount})</label><div class="row"><input class="input" id="reader-page" type="number" min="1" max="${pageCount}" value="1" required><button class="btn sm">Go</button></div></form>
    <label for="reader-speed">Auto-scroll speed <output id="reader-speed-value"></output></label><input id="reader-speed" type="range" min="30" max="250" step="10"><small>Tap play in the dock to start scrolling. Stops at the end.</small>
    <div class="reader-panel-actions"><button class="btn sm" type="button" id="reader-top">Back to top</button><button class="btn sm" type="button" id="reader-full">Fullscreen</button></div><p class="reader-full-status" role="status"></p>
  </div>`.toString();
  const dock = document.createElement('div');
  dock.className = 'reader-dock';
  dock.setAttribute('role', 'toolbar'); dock.setAttribute('aria-label', 'Reading controls');
  dock.innerHTML = html`<button type="button" data-reader-prev aria-label="Previous page">${icon('chevL')}</button><button type="button" data-reader-auto aria-label="Start auto-scroll" aria-pressed="false">${icon('play')}</button><button type="button" data-reader-count aria-label="Jump to a page">1 / ${pageCount}</button><button type="button" data-reader-next aria-label="Next page">${icon('chevR')}</button><button type="button" data-reader-settings aria-label="Reader settings">${icon('settings')}</button><button type="button" data-reader-full aria-label="Enter fullscreen">${icon('fullscreen')}</button>`.toString();
  reader.append(box, dock);
  const panel = box.querySelector('.reader-tools-panel');
  const width = box.querySelector('#reader-width'), gap = box.querySelector('#reader-gap'), speed = box.querySelector('#reader-speed');
  const dockCount = dock.querySelector('[data-reader-count]'), autoButton = dock.querySelector('[data-reader-auto]');
  let current = 0, raf = 0, last = 0, running = false, scrollQueued = false;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const settingNumber = (key, min, max, fallback) => { const n = Number(getSettings()[key]); return Number.isFinite(n) && n >= min && n <= max ? n : fallback; };
  const mode = () => ['vertical', 'ltr', 'rtl'].includes(reader.dataset.mode) ? reader.dataset.mode : 'vertical';
  const wrappers = () => Array.from(reader.querySelectorAll('.reader-view .rwrap'));
  const applyChoices = () => {
    box.querySelectorAll('[data-reader-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.readerMode === mode())));
    box.querySelectorAll('[data-reader-fit]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.readerFit === reader.dataset.fit)));
  };
  const updateCount = () => {
    dockCount.textContent = `${current + 1} / ${pageCount}`;
    dock.querySelector('[data-reader-prev]').disabled = current <= 0;
    dock.querySelector('[data-reader-next]').disabled = current >= pageCount - 1;
  };
  const updateCurrent = () => {
    scrollQueued = false;
    const nodes = wrappers(); if (!nodes.length) return;
    if (mode() !== 'vertical') {
      if (!sourceReader) current = clamp(Number(nodes[0].dataset.i) || 0, 0, pageCount - 1);
    } else {
      const position = window.innerHeight * .3;
      let selected = 0;
      nodes.forEach((node, index) => { if (node.getBoundingClientRect().top <= position) selected = index; });
      current = clamp(selected, 0, pageCount - 1);
    }
    updateCount();
  };
  let lastY = window.scrollY;
  const onScroll = () => {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateCurrent); }
    if (sourceReader && mode() === 'vertical') {
      const bar = reader.querySelector('.reader-bar'), y = window.scrollY;
      if (y > lastY + 12 && y > 120) bar?.classList.add('hide');
      else if (y < lastY - 12 || y < 80) bar?.classList.remove('hide');
      lastY = y;
    }
  };
  const goPage = (index) => {
    current = clamp(index, 0, pageCount - 1);
    if (jump) jump(current);
    else if (mode() === 'vertical') wrappers()[current]?.scrollIntoView({ block: 'start', behavior: 'instant' });
    else { wrappers().forEach((el, i) => el.classList.toggle('reader-current', i === current)); window.scrollTo(0, 0); }
    updateCount();
  };
  const stopAuto = () => { running = false; cancelAnimationFrame(raf); last = 0; autoButton.setAttribute('aria-pressed', 'false'); autoButton.setAttribute('aria-label', 'Start auto-scroll'); autoButton.innerHTML = icon('play').toString(); };
  const tick = (time) => {
    if (!running) return;
    if (last) window.scrollBy({ top: settingNumber('readerSpeed', 30, 250, 100) * Math.min(time - last, 50) / 1000, behavior: 'instant' });
    last = time;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) { stopAuto(); return; }
    raf = requestAnimationFrame(tick);
  };
  const startAuto = () => {
    if (mode() !== 'vertical') { box.open = true; box.querySelector('.reader-full-status').textContent = 'Auto-scroll is available in long strip mode.'; return; }
    if (running) { stopAuto(); return; }
    running = true; box.open = false; autoButton.setAttribute('aria-pressed', 'true'); autoButton.setAttribute('aria-label', 'Pause auto-scroll'); autoButton.innerHTML = icon('pause').toString(); raf = requestAnimationFrame(tick);
  };
  const setRange = (el, output, value, unit) => { el.value = value; box.querySelector(output).textContent = `${value}${unit}`; };
  const setWidth = (value) => { reader.style.setProperty('--reader-page-width', `${value}%`); setRange(width, '#reader-width-value', value, '%'); };
  const setGap = (value) => { reader.style.setProperty('--reader-page-gap', `${value}px`); setRange(gap, '#reader-gap-value', value, 'px'); };
  setWidth(settingNumber('readerWidth', 50, 100, 100)); setGap(settingNumber('readerGap', 0, 40, 0)); setRange(speed, '#reader-speed-value', settingNumber('readerSpeed', 30, 250, 100), 'px/s');
  width.addEventListener('input', () => { setWidth(width.value); setSetting('readerWidth', Number(width.value)); });
  gap.addEventListener('input', () => { setGap(gap.value); setSetting('readerGap', Number(gap.value)); });
  speed.addEventListener('input', () => { setRange(speed, '#reader-speed-value', speed.value, 'px/s'); setSetting('readerSpeed', Number(speed.value)); });
  box.querySelector('#reader-layout').addEventListener('click', (event) => {
    const button = event.target.closest('[data-reader-mode]'); if (!button) return;
    stopAuto(); const nextMode = button.dataset.readerMode;
    setSetting('readerMode', nextMode);
    if (options.setMode) options.setMode(nextMode); else reader.dataset.mode = nextMode;
    applyChoices(); goPage(current);
  });
  box.querySelector('#reader-fit').addEventListener('click', (event) => {
    const button = event.target.closest('[data-reader-fit]'); if (!button) return;
    setSetting('readerFit', button.dataset.readerFit); reader.dataset.fit = button.dataset.readerFit;
    options.setFit?.(button.dataset.readerFit); applyChoices();
  });
  box.querySelector('#reader-jump').addEventListener('submit', (event) => {
    event.preventDefault(); const input = box.querySelector('#reader-page'), number = Number(input.value);
    if (!Number.isInteger(number) || number < 1 || number > pageCount) { input.reportValidity(); return; }
    goPage(number - 1); box.open = false;
  });
  box.querySelector('#reader-top').addEventListener('click', () => { stopAuto(); goPage(0); box.open = false; });
  const fullButtons = [box.querySelector('#reader-full'), dock.querySelector('[data-reader-full]')];
  const fullStatus = box.querySelector('.reader-full-status');
  const syncFull = () => { const active = !!document.fullscreenElement; fullButtons[0].textContent = active ? 'Exit fullscreen' : 'Fullscreen'; fullButtons[1].setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen'); };
  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else throw new Error('unavailable');
      fullStatus.textContent = ''; syncFull();
    } catch { box.open = true; fullStatus.textContent = 'Fullscreen is unavailable in this browser or device.'; }
  };
  fullButtons.forEach((button) => button.addEventListener('click', toggleFull));
  dock.querySelector('[data-reader-prev]').addEventListener('click', () => { stopAuto(); goPage(current - 1); });
  dock.querySelector('[data-reader-next]').addEventListener('click', () => { stopAuto(); goPage(current + 1); });
  autoButton.addEventListener('click', startAuto);
  dock.querySelector('[data-reader-settings]').addEventListener('click', () => { box.open = !box.open; });
  dockCount.addEventListener('click', () => { box.open = true; box.querySelector('#reader-page').value = current + 1; box.querySelector('#reader-page').focus(); });
  box.querySelector('#reader-close').addEventListener('click', () => { box.open = false; box.querySelector('summary').focus(); });
  const onKey = (e) => {
    if (e.key === 'Escape' && box.open) { e.preventDefault(); e.stopImmediatePropagation(); box.open = false; box.querySelector('summary').focus(); return; }
    if (!sourceReader || mode() === 'vertical' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); goPage(current + ((e.key === 'ArrowRight') === (mode() === 'ltr') ? 1 : -1)); }
  };
  const onPageTap = (event) => {
    if (!sourceReader || mode() === 'vertical' || !event.target.matches('.rpage:not(.failed)')) return;
    const x = event.clientX / window.innerWidth;
    if (x > .35 && x < .65) { reader.querySelector('.reader-bar')?.classList.toggle('hide'); return; }
    goPage(current + ((x >= .65) === (mode() === 'ltr') ? 1 : -1));
  };
  reader.addEventListener('click', onPageTap);
  const observer = new MutationObserver(() => { applyChoices(); onScroll(); });
  observer.observe(reader, { attributes: true, attributeFilter: ['data-mode', 'data-fit'] });
  if (!sourceReader) observer.observe(reader.querySelector('.reader-view'), { childList: true });
  window.addEventListener('scroll', onScroll, { passive: true }); document.addEventListener('fullscreenchange', syncFull); document.addEventListener('keydown', onKey, true);
  if (sourceReader) { const saved = getSettings(); reader.dataset.mode = ['vertical', 'ltr', 'rtl'].includes(saved.readerMode) ? saved.readerMode : 'vertical'; reader.dataset.fit = ['width', 'height', 'original'].includes(saved.readerFit) ? saved.readerFit : 'width'; if (mode() !== 'vertical') goPage(0); }
  applyChoices(); updateCount();
  ctx.cleanup(() => { stopAuto(); observer.disconnect(); reader.removeEventListener('click', onPageTap); window.removeEventListener('scroll', onScroll); document.removeEventListener('fullscreenchange', syncFull); document.removeEventListener('keydown', onKey, true); box.remove(); dock.remove(); });
}
