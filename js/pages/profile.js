import { html, $, render } from '../util.js';
import { icon } from '../ui/icons.js';
import { getProfile, setProfileName } from '../profile.js';

export default function profilePage(ctx) {
  ctx.setTitle('My profile');
  const draw = () => {
    const p = getProfile();
    ctx.render(html`<div class="container page profile-page">
      <div class="profile-banner"><div class="profile-orbit" aria-hidden="true"><img src="assets/astral-emblem.png" alt=""></div><div class="profile-intro"><span class="profile-kicker">YOUR STORY SO FAR</span><h1>${p.name}</h1><p>${p.title}</p><span class="profile-level">${icon('sparkles')} Level ${p.level}</span></div></div>
      <div class="profile-grid"><section class="profile-card profile-journey"><div class="profile-card-head"><div><span class="profile-kicker">YOUR JOURNEY</span><h2>Next level</h2></div><strong>${p.level} <span>→</span> ${p.level + 1}</strong></div><div class="profile-meter" role="progressbar" aria-label="Progress to next level" aria-valuemin="${p.start}" aria-valuemax="${p.next}" aria-valuenow="${p.xp}"><i style="width:${Math.round(p.progress * 100)}%"></i></div><p>${p.xp} / ${p.next} XP <span>· ${p.next - p.xp} XP to go</span></p><div class="profile-stat-grid"><div>${icon('film')}<b>${p.anime}</b><small>episodes marked</small></div><div>${icon('book')}<b>${p.manga}</b><small>chapters marked</small></div><div>${icon('star')}<b>${p.xp}</b><small>total XP</small></div></div></section>
      <section class="profile-card"><span class="profile-kicker">MAKE IT YOURS</span><h2>Display name</h2><form id="profile-name-form"><label class="sr-only" for="profile-name">Display name</label><div class="profile-name-row"><input id="profile-name" class="input" maxlength="32" value="${p.name}" autocomplete="nickname"><button class="btn primary">Save</button></div><p class="muted">Only saved in this browser.</p></form><hr><h3>How XP works</h3><p>Mark an episode watched for 20 XP, or a chapter read for 10 XP. Each item counts once—even if you unmark it. Titles change as your level and interests grow.</p></section></div>
      <section class="profile-note">${icon('shield')}<div><b>Private to this browser</b><p>Your random local profile ID is <code>${p.id}</code>. It is not a hardware ID or an account. Clearing browser data removes it; export a backup in Settings to preserve progress. Backups restore progress, not the device ID.</p><a href="#/settings">Settings &amp; backup ${icon('arrowR')}</a></div></section>
    </div>`);
    $('#profile-name-form', ctx.el).addEventListener('submit', (e) => { e.preventDefault(); setProfileName($('#profile-name', ctx.el).value); draw(); $('#profile-name', ctx.el).focus(); });
  };
  draw();
}
