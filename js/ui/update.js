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
  el.innerHTML = html`<div class="update-rupture" aria-hidden="true">
    <div class="update-impact"></div><div class="update-pulse-ring ring-one"></div><div class="update-pulse-ring ring-two"></div>
    <svg class="update-glass" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid meet" focusable="false">
      <g class="glass-shards"><path class="shard shard-a" d="M400 400 201 121 66 290 250 349Z"/><path class="shard shard-b" d="M400 400 201 121 379 48 477 278Z"/><path class="shard shard-c" d="M400 400 477 278 731 218 661 368Z"/><path class="shard shard-d" d="M400 400 661 368 738 557 511 525Z"/><path class="shard shard-e" d="M400 400 511 525 592 731 350 666Z"/><path class="shard shard-f" d="M400 400 350 666 106 588 250 349Z"/></g>
      <g class="glass-cracks" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path pathLength="1" d="M400 400 348 327 201 121 160 56 M348 327 250 349 66 290 M250 349 104 370 24 343 M400 400 477 278 456 164 379 48 M477 278 585 253 731 218 M585 253 621 119 684 82 M400 400 661 368 764 323 M661 368 738 557 785 600 M400 400 511 525 592 731 632 780 M511 525 350 666 309 779 M350 666 212 660 106 588 M400 400 250 349 181 455 65 504 M181 455 106 588 37 645 M400 400 360 457 350 666 M400 400 438 350 477 278 M400 400 460 436 511 525"/>
      </g>
      <g class="glass-lightning" fill="none" stroke-linecap="square" stroke-linejoin="miter"><path pathLength="1" d="M259 159 323 252 292 254 400 400 512 516 482 522 571 665"/><path pathLength="1" d="M139 451 270 405 255 380 400 400 531 330 518 359 679 306"/></g>
    </svg>
  </div><section class="update-window" role="dialog" aria-modal="true" aria-labelledby="update-title" aria-describedby="update-intro">
    <div class="update-effects" aria-hidden="true"><span></span><i></i></div>
    <div class="update-topline" aria-hidden="true"><span>NULLX / SYSTEM</span><span>● &nbsp;ONLINE</span></div>
    <div class="update-sigil" aria-hidden="true"><img src="assets/icon-192.png" alt=""><span>✦</span></div>
    <div class="update-ornament" aria-hidden="true">◆ &nbsp; SYSTEM MESSAGE &nbsp; ◆</div>
    <h2 id="update-title" data-glitch="UPDATE COMPLETE">UPDATE COMPLETE</h2>
    <p class="update-subtitle" id="update-intro">${RELEASE.title}</p>
    <div class="update-divider" aria-hidden="true"><span>◆</span></div>
    <div class="update-log-label" aria-hidden="true"><span>RELEASE LOG</span><span>NEW DATA ACQUIRED</span></div>
    <ul class="update-changes">${RELEASE.changes.map((change) => html`<li>${change}</li>`)}</ul>
    <button class="update-ok" type="button"><span>Continue exploring</span><span aria-hidden="true">›</span></button>
    <div class="update-foot" aria-hidden="true"><span>◆ &nbsp; NULLXANIME</span><span>STATUS: UPDATED</span></div>
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
  el.innerHTML = html`<span class="update-ready-icon" aria-hidden="true">✦</span><span><b>A new update is ready</b><small>Your reading or playback won't be interrupted.</small></span><button type="button" data-apply>Update now</button><button type="button" data-dismiss aria-label="Dismiss update notification">×</button>`.toString();
  $('[data-apply]', el).addEventListener('click', applyUpdate);
  $('[data-dismiss]', el).addEventListener('click', () => el.remove());
  document.body.appendChild(el);
}
