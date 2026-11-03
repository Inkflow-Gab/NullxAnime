// Weekly airing schedule (AniList), shown in the viewer's own timezone.

import { html, render, $, $$, on, fmtTime, fmtCountdown, localDayStarts } from '../util.js';
import { icon } from '../ui/icons.js';
import { airingBetween } from '../api/anilist.js';
import { fromAnime, titleOf, skelCard, errorBox, emptyBox, PLACEHOLDER } from '../ui/components.js';
import { allEntries } from '../store.js';

export default async function schedule(ctx) {
  ctx.setTitle('Airing schedule');
  const days = localDayStarts(9);
  let sel = Math.min(Math.max(Math.trunc(Number(ctx.query.d) || 0), 0), 7);
  let mineOnly = false;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  ctx.render(html`<div class="container page">
    <div class="search-head"><div><h1 class="page-title">Airing schedule</h1><p class="muted">Times shown in your timezone (${tz}).</p></div>
      <label class="row"><span class="switch"><input type="checkbox" id="mine"><i></i></span><span>Only my list</span></label></div>
    <div class="day-tabs tabs-scroll" id="days"></div>
    <div id="sched"></div></div>`);

  const paintDays = () => render($('#days'), days.slice(0, 8).map((d, i) => {
    const dt = new Date(d);
    return html`<button class="day ${i === sel ? 'on' : ''}" data-d="${i}"><small>${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dt.toLocaleDateString([], { weekday: 'short' })}</small><b>${dt.getDate()}</b><small>${dt.toLocaleDateString([], { month: 'short' })}</small></button>`;
  }));

  let request = 0;
  const load = async () => {
    const task = ++request;
    paintDays();
    const box = $('#sched');
    render(box, html`<div class="sched-list">${Array.from({ length: 6 }, () => html`<div class="skel" style="height:86px"></div>`)}</div>`);
    try {
      const from = Math.floor(days[sel] / 1000);
      let list = await airingBetween(from - 1, Math.floor(days[sel + 1] / 1000));
      if (!ctx.alive() || task !== request) return;
      if (mineOnly) { const ids = new Set(allEntries('anime').map((e) => e.id)); list = list.filter((s) => ids.has(String(s.media.id))); }
      // regional noise: keep Japanese-origin first, then by popularity within the same hour
      list = list.slice().sort((a, b) => a.airingAt - b.airingAt || (b.media.popularity || 0) - (a.media.popularity || 0));
      if (!list.length) { render(box, emptyBox('calendar', mineOnly ? 'Nothing from your list airs this day' : 'No episodes scheduled', mineOnly ? 'Add shows to your list to see them here.' : 'Check another day.')); return; }
      const now = Date.now() / 1000;
      render(box, html`<div class="sched-list">${list.map((s) => {
        const it = fromAnime(s.media);
        const aired = s.airingAt <= now;
        return html`<a class="sched-row ${aired ? 'aired' : ''}" href="${it.href}">
          <span class="sched-time"><b>${fmtTime(s.airingAt)}</b><small>${aired ? 'Aired' : `in ${fmtCountdown(s.airingAt - now)}`}</small></span>
          <img loading="lazy" src="${s.media.coverImage?.large || PLACEHOLDER}" alt="" referrerpolicy="no-referrer">
          <span class="sched-info"><b class="clamp-2">${it.title}</b><small>Episode ${s.episode}${s.media.episodes ? ` of ${s.media.episodes}` : ''} · ${it.raw.genres?.slice(0, 2).join(', ') || ''}</small></span>
          <span class="sched-go">${icon(aired ? 'play' : 'clock')}</span></a>`;
      })}</div>`);
    } catch (e) { if (ctx.alive() && task === request) render(box, errorBox(e)); }
  };
  on(ctx.el, 'click', '[data-d]', (e, t) => { sel = Number(t.dataset.d); load(); });
  $('#mine').addEventListener('change', (e) => { mineOnly = e.target.checked; load(); });
  load();
}
