// Free & open library: public-domain / Creative-Commons video from the Internet Archive.

import { html, render, $, on, safeUrl } from '../util.js';
import { icon } from '../ui/icons.js';
import { searchOpenVideo, itemFiles, archiveUrl } from '../api/archive.js';
import { createPlayer } from '../player.js';
import { errorBox, toast } from '../ui/components.js';

const TOPICS = ['anime', 'japanese animation', 'cartoon', 'animation short', 'silent animation', 'folk tale animation'];

export default async function free(ctx) {
  ctx.setTitle('Free & open library');
  let q = ctx.query.q || '';
  let player = null;
  ctx.cleanup(() => player?.destroy());
  ctx.render(html`<div class="container page">
    <div class="search-head"><div><h1 class="page-title">Free &amp; open library</h1>
      <p class="muted">Public-domain and Creative-Commons video from the Internet Archive — 100% legal, no captcha, no ads.</p></div></div>
    <form class="filter-bar" id="f"><div class="filter-search">${icon('search')}<input class="input" id="q" value="${q}" placeholder="Search the open library…"></div><button class="btn primary">Search</button></form>
    <div class="chips" style="margin-bottom:18px">${TOPICS.map((t) => html`<button class="chip" data-t="${t}">${t}</button>`)}</div>
    <div class="notice" style="margin-bottom:20px">${icon('info')}<div>Most modern anime is commercially licensed and will not be here. For those, use each title’s <b>Where to watch</b> section to find the official (often free) stream.</div></div>
    <div id="stage-box"></div>
    <div id="res"></div></div>`);
  const run = async () => {
    const box = $('#res');
    render(box, html`<div class="center-load"><div class="spinner"></div></div>`);
    try {
      const list = await searchOpenVideo(q, 36);
      if (!ctx.alive()) return;
      render(box, list.length ? html`<div class="lib-grid big">${list.map((r) => html`<button class="lib-item" data-ia="${r.id}"><img loading="lazy" src="${r.thumb}" alt="" referrerpolicy="no-referrer"><b class="clamp-2">${r.title}</b><small>${[r.creator, r.year].filter(Boolean).join(' · ')}</small></button>`)}</div>`
        : html`<div class="empty"><h3>No open-licensed videos found</h3><p>Try a broader search term.</p></div>`);
    } catch (e) { render(box, errorBox(e)); }
  };
  $('#f').addEventListener('submit', (e) => { e.preventDefault(); q = $('#q').value.trim(); run(); });
  on(ctx.el, 'click', '[data-t]', (e, t) => { q = t.dataset.t; $('#q').value = q; run(); });
  on(ctx.el, 'click', '[data-ia]', async (e, t) => {
    try {
      const info = await itemFiles(t.dataset.ia);
      if (!info.files.length) { toast('No playable file in that item', 'err'); return; }
      const box = $('#stage-box');
      const play = (i) => {
        player?.destroy();
        render(box, html`<div class="stage-wrap" style="margin-bottom:18px"><div class="stage" id="fstage"></div></div>
          <div class="notice" style="margin-bottom:22px">${icon('info')}<div><b>${info.title}</b> · hosted by the Internet Archive${info.license ? html` · <a href="${safeUrl(info.license)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">license</a>` : ''} · <a href="${archiveUrl(info.id)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">archive.org ${icon('ext')}</a>
          ${info.files.length > 1 ? html`<div style="margin-top:10px"><select class="select" id="ff" style="max-width:420px">${info.files.map((f, k) => html`<option value="${k}" ${k === i ? 'selected' : ''}>${f.name}</option>`)}</select></div>` : ''}</div></div>`);
        player = createPlayer($('#fstage'), { src: info.files[i].url, poster: info.cover, label: info.title, autoplay: true });
        $('#ff')?.addEventListener('change', (ev) => play(Number(ev.target.value)));
      };
      play(0);
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { toast(err.message, 'err'); }
  });
  run();
}
