// Discover: curated directory of trackers, schedules, official sources and tools.

import { html, render, $, $$, on } from '../util.js';
import { icon } from '../ui/icons.js';
import { DIRECTORY } from '../data/directory.js';
import { hostOf } from '../util.js';

const hue = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

export default async function discover(ctx) {
  ctx.setTitle('Discover');
  let cat = ctx.query.c || 'all', q = '';
  const draw = () => {
    const sections = DIRECTORY.filter((s) => cat === 'all' || s.id === cat).map((s) => ({ ...s, items: s.items.filter(([n, , d]) => !q || `${n} ${d}`.toLowerCase().includes(q.toLowerCase())) })).filter((s) => s.items.length);
    render($('#dir'), sections.length ? sections.map((s) => html`<section class="section"><div class="section-head"><div><h2>${s.title}</h2><div class="sub">${s.blurb}</div></div></div>
      <div class="dir-grid">${s.items.map(([n, url, d, tags]) => html`<a class="dir-card glass" href="${url}" target="_blank" rel="noopener noreferrer">
        <span class="dir-ic" style="--h:${hue(n)}">${n.replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase()}</span>
        <span><b>${n}</b><small>${d}</small><i>${hostOf(url)}</i></span><span class="ext">${icon('ext')}</span></a>`)}</div></section>`)
      : html`<div class="empty"><h3>No matches</h3><p>Try another search.</p></div>`);
  };
  ctx.render(html`<div class="container page">
    <div class="search-head"><div><h1 class="page-title">Discover</h1><p class="muted">Trackers, schedules, official places to watch &amp; read, and handy tools. Curated from the community list <a href="https://github.com/anshumanv/awesome-anime-sources" target="_blank" rel="noopener" style="color:var(--accent)">awesome-anime-sources</a> — legal sources only.</p></div></div>
    <div class="filter-bar"><div class="tabs-scroll" id="cats" style="flex:1"></div><div class="filter-search" style="max-width:260px">${icon('search')}<input class="input" id="dq" placeholder="Filter sites…"></div></div>
    <div id="dir"></div></div>`);
  const cats = () => render($('#cats'), [html`<button class="chip ${cat === 'all' ? 'active' : ''}" data-c="all">All</button>`, ...DIRECTORY.map((s) => html`<button class="chip ${cat === s.id ? 'active' : ''}" data-c="${s.id}">${s.title}</button>`)]);
  cats(); draw();
  on(ctx.el, 'click', '[data-c]', (e, t) => { cat = t.dataset.c; cats(); draw(); });
  $('#dq').addEventListener('input', (e) => { q = e.target.value; draw(); });
}
