import { html } from '../util.js';

// Non-blocking and never includes a title being watched/read (including adult titles).
export function installLevelUpNotice() {
  let timer;
  window.addEventListener('nx:level-up', (event) => {
    const level = Number(event.detail?.level);
    if (!Number.isSafeInteger(level) || level < 2) return;
    const old = document.querySelector('.level-notice'); old?.remove(); clearTimeout(timer);
    const el = document.createElement('div'); el.className = 'level-notice'; el.setAttribute('role', 'status');
    el.innerHTML = html`<span class="level-notice-glyph" aria-hidden="true">✦</span><div><small>LEVEL UP</small><b>Level ${level} unlocked</b><span>${event.detail?.title || 'Explorer'}</span></div><a href="#/profile">View profile</a><button type="button" aria-label="Dismiss level notification">×</button>`.toString();
    document.body.appendChild(el);
    const close = () => { clearTimeout(timer); el.remove(); };
    el.querySelector('button').addEventListener('click', close);
    timer = setTimeout(close, 8000);
  });
}
