// Release notices are acknowledged locally, once per deployed release.
import { html, $ } from '../util.js';
import { RELEASE } from '../data/release.js';

const SEEN_KEY = 'nx:seen-release';
let acknowledgedThisSession = false;

export function showUpdateWindow({ force = false } = {}) {
  if ($('#update-notice')) return;
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === RELEASE.id; } catch { /* local storage may be blocked */ }
  if (!force && (seen || acknowledgedThisSession)) return;
  const previousFocus = document.activeElement;
  const wasNoScroll = document.body.classList.contains('no-scroll');
  const background = ['topbar', 'app', 'footer', 'tabbar'].map((id) => document.getElementById(id)).filter(Boolean);
  const inertBefore = background.map((el) => el.inert);
  background.forEach((el) => { el.inert = true; });
  document.body.classList.add('no-scroll');
  const el = document.createElement('div');
  el.className = 'scrim update-scrim';
  el.id = 'update-notice';
  el.innerHTML = html`<section class="update-window" role="dialog" aria-modal="true" aria-labelledby="update-title" aria-describedby="update-intro">
    <div class="update-ornament" aria-hidden="true">✦ &nbsp; SYSTEM NOTICE &nbsp; ✦</div>
    <h2 id="update-title">Update complete</h2>
    <p class="update-subtitle" id="update-intro">${RELEASE.title}</p>
    <div class="update-divider" aria-hidden="true"><span>◆</span></div>
    <ul class="update-changes">${RELEASE.changes.map((change) => html`<li>${change}</li>`)}</ul>
    <button class="update-ok" type="button">OK</button>
  </section>`.toString();
  $('#overlay-root').appendChild(el);
  const button = $('.update-ok', el);
  const close = () => {
    acknowledgedThisSession = true;
    try { localStorage.setItem(SEEN_KEY, RELEASE.id); } catch { /* notice will appear next session */ }
    document.removeEventListener('keydown', keys, true);
    background.forEach((node, i) => { node.inert = inertBefore[i]; });
    if (!wasNoScroll) document.body.classList.remove('no-scroll');
    el.remove();
    if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
  };
  const keys = (event) => {
    if (event.key === 'Tab') { event.preventDefault(); button.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  };
  document.addEventListener('keydown', keys, true);
  button.addEventListener('click', close);
  button.focus();
}

// Do not interrupt a reader/player with a forced reload when a new shell arrives.
export function notifyUpdateReady(applyUpdate = () => location.reload()) {
  if ($('#update-ready')) return;
  const el = document.createElement('div');
  el.id = 'update-ready';
  el.className = 'update-ready';
  el.setAttribute('role', 'status');
  el.innerHTML = html`<span>A new update is ready.</span><button type="button">Reload to see what changed</button>`.toString();
  $('button', el).addEventListener('click', applyUpdate);
  document.body.appendChild(el);
}
