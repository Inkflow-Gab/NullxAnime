import { html } from '../util.js';
import { getSettings, setSetting } from '../store.js';

// Shared across MangaDex, Asura and scan readers; width applies to fit-width mode.
export function attachReaderTools(ctx, reader, pageCount, jump) {
  const box = document.createElement('details');
  box.className = 'reader-tools';
  box.innerHTML = html`<summary>Reader tools</summary><div class="reader-tools-panel">
    <label for="reader-width">Page width <output id="reader-width-value"></output></label>
    <input id="reader-width" type="range" min="50" max="100" step="5" aria-label="Page width in fit-width mode">
    <small>Applies to fit-width mode.</small>
    <form id="reader-jump"><label for="reader-page">Jump to page (1–${pageCount})</label><div class="row"><input class="input" id="reader-page" type="number" min="1" max="${pageCount}" value="1" required><button class="btn sm">Go</button></div></form>
    <button class="btn sm" type="button" id="reader-top">Back to top</button><button class="btn sm" type="button" id="reader-full">Toggle fullscreen</button>
  </div>`.toString();
  reader.append(box);
  const slider = box.querySelector('#reader-width'), value = box.querySelector('#reader-width-value');
  const apply = (width) => { reader.style.setProperty('--reader-page-width', `${width}%`); slider.value = width; value.textContent = `${width}%`; };
  const initial = Number(getSettings().readerWidth); apply(initial >= 50 && initial <= 100 ? initial : 100);
  slider.addEventListener('input', () => { apply(slider.value); setSetting('readerWidth', Number(slider.value)); });
  box.querySelector('#reader-jump').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = box.querySelector('#reader-page');
    const number = Number(input.value);
    if (!Number.isInteger(number) || number < 1 || number > pageCount) { input.reportValidity(); return; }
    if (jump) jump(number - 1); else reader.querySelectorAll('.rwrap')[number - 1]?.scrollIntoView({ block: 'start' });
    box.open = false;
  });
  box.querySelector('#reader-top').addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'auto' }); box.open = false; });
  box.querySelector('#reader-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else reader.requestFullscreen?.().catch(() => {});
  });
  ctx.cleanup(() => box.remove());
}
