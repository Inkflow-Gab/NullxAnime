// Source-specific catalogues and an image-only reader, not an embedded website.
import { html, $, cleanAniHtml } from '../util.js';
import { icon } from '../ui/icons.js';
import { sourceOf, scansSearch, scansDetails, scansChapters, scansPages } from '../api/scans.js';
import { getSettings } from '../store.js';
import { skelGrid, errorBox, emptyBox, PLACEHOLDER } from '../ui/components.js';
import { go } from '../router.js';

export default async function scans(ctx) {
  const { source, slug, chapter } = ctx.params;
  const config = sourceOf(source);
  if (config.adult && getSettings().adultManga !== true) {
    ctx.setTitle('18+ source');
    ctx.render(html`<div class="container page narrow"><h1>Adults only</h1><p class="muted">Omega Scans includes adult content. Enable 18+ manga in Settings if you are 18 or older.</p><a class="btn primary" href="#/settings">Open Settings</a></div>`);
    return;
  }
  if (chapter) return read(ctx, source, config, slug, chapter);
  if (slug) return detail(ctx, source, config, slug);
  ctx.setTitle(config.label);
  const q = String(ctx.query.q || '').trim().slice(0, 150);
  ctx.render(html`<div class="container page"><h1 class="page-title">${config.label} ${config.adult ? html`<span class="badge">18+</span>` : ''}</h1><p class="muted">Browse this source's own catalogue. Access depends on the provider and your browser.${source === 'hive' ? ' Hivetoons images failed a Pages-origin test and may not load.' : ''}</p><form id="scans-search" class="filter-bar"><label class="sr-only" for="scans-query">Search ${config.label}</label><input id="scans-query" class="input" value="${q}" placeholder="Search titles…"><button class="btn primary">${icon('search')} Search</button></form><div id="scans-results">${skelGrid(12)}</div><div class="load-more" id="scans-more" hidden><button class="btn">Load more</button></div></div>`);
  $('#scans-search', ctx.el).addEventListener('submit', (e) => { e.preventDefault(); go(`/scans/${source}?q=${encodeURIComponent($('#scans-query', ctx.el).value.trim())}`); });
  let page = 1, busy = false;
  const load = async () => {
    if (busy) return;
    busy = true;
    try {
      const result = await scansSearch(source, q, page);
      if (!ctx.alive() || (config.adult && getSettings().adultManga !== true)) return;
      const cards = result.items.map((it) => html`<article class="card"><a class="poster" href="#/scans/${source}/${it.slug}"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${it.cover || PLACEHOLDER}" alt=""><span class="shade"></span><span class="tl"><span class="badge accent">${config.label}</span>${config.adult ? html`<span class="badge">18+</span>` : ''}</span><span class="play">${icon('book')}</span></a><a class="meta" href="#/scans/${source}/${it.slug}"><div class="title">${it.title}</div><div class="sub">${it.type} · ${it.status}</div></a></article>`).join('');
      const box = $('#scans-results', ctx.el);
      if (page === 1) box.innerHTML = result.items.length ? `<div class="grid" id="scans-grid">${cards}</div>` : emptyBox('search', 'No titles found', 'Try another search.').toString();
      else $('#scans-grid', ctx.el)?.insertAdjacentHTML('beforeend', cards);
      $('#scans-more', ctx.el).hidden = !result.hasNext;
      page++;
    } catch (error) { if (ctx.alive()) $('#scans-results', ctx.el).innerHTML = errorBox(error).toString(); }
    finally { busy = false; }
  };
  $('#scans-more button', ctx.el).addEventListener('click', load);
  await load();
}
async function detail(ctx, source, config, slug) {
  ctx.render(html`<div class="container page">${skelGrid(3)}</div>`);
  try {
    const m = await scansDetails(source, slug);
    const chapters = await scansChapters(source, slug, m.id);
    if (!ctx.alive() || (config.adult && getSettings().adultManga !== true)) return;
    ctx.setTitle(`${m.title} · ${config.label}`);
    ctx.render(html`<div class="container page"><a class="btn sm ghost" href="#/scans/${source}">${icon('chevL')} ${config.label}</a><div class="asura-detail"><img src="${m.cover || PLACEHOLDER}" referrerpolicy="no-referrer" alt="" class="asura-poster"><div><div class="chips"><span class="badge accent">${config.label}</span>${config.adult ? html`<span class="badge">18+</span>` : ''}<span class="badge">${m.type}</span></div><h1 class="page-title">${m.title}</h1><p class="muted">${m.status}${m.author ? ` · ${m.author}` : ''}</p><div class="detail-desc">${cleanAniHtml(m.description)}</div>${chapters.length ? html`<a class="btn primary" href="#/scans/${source}/${slug}/${chapters[0].id}">${icon('book')} Start reading</a>` : html`<p class="muted">No unlocked chapters are available.</p>`}</div></div><section class="section"><div class="section-head"><div><h2>Chapters</h2><div class="sub">${chapters.length} unlocked chapters · newest first</div></div></div><div class="ch-list">${chapters.slice().reverse().map((c) => html`<a class="ch" href="#/scans/${source}/${slug}/${c.id}"><span class="ch-main"><b>${c.label}</b>${c.title ? html`<span class="ch-title">${c.title}</span>` : ''}</span></a>`)}</div></section></div>`);
  } catch (error) { if (ctx.alive()) ctx.render(html`<div class="container page">${errorBox(error)}</div>`); }
}
async function read(ctx, source, config, slug, chapter) {
  ctx.render(html`<div class="reader-loading"><div class="spinner"></div><p>Loading chapter…</p></div>`);
  try {
    const m = await scansDetails(source, slug);
    const chapters = await scansChapters(source, slug, m.id);
    const index = chapters.findIndex((c) => c.id === chapter);
    if (index < 0) throw new Error('This chapter is unavailable or locked.');
    const pages = await scansPages(source, slug, chapter, m.id);
    if (!ctx.alive() || (config.adult && getSettings().adultManga !== true)) return;
    const prev = chapters[index - 1], next = chapters[index + 1], current = chapters[index];
    ctx.setTitle(`${m.title} · ${current.label}`);
    document.body.classList.add('reading');
    ctx.cleanup(() => document.body.classList.remove('reading'));
    ctx.render(html`<div class="reader" data-mode="vertical" data-fit="width"><header class="reader-bar"><a class="icon-btn" href="#/scans/${source}/${slug}" aria-label="Back to chapters">${icon('chevL')}</a><div class="reader-title"><b>${m.title}</b><small>${config.label} · ${current.label}</small></div><div class="spacer"></div>${prev ? html`<a class="btn sm" href="#/scans/${source}/${slug}/${prev.id}">Previous</a>` : ''}${next ? html`<a class="btn sm primary" href="#/scans/${source}/${slug}/${next.id}">Next</a>` : ''}</header><div class="reader-view vertical">${pages.map((url, i) => html`<div class="rwrap"><img class="rpage" src="${url}" alt="Page ${i + 1}" ${i > 1 ? html`loading="lazy"` : ''} decoding="async" referrerpolicy="no-referrer"></div>`)}<div class="reader-end"><h3>${current.label} finished</h3><div class="row" style="justify-content:center"><a class="btn" href="#/scans/${source}/${slug}">Chapters</a>${next ? html`<a class="btn primary" href="#/scans/${source}/${slug}/${next.id}">Next chapter</a>` : ''}</div></div></div></div>`);
    ctx.el.querySelectorAll('.rpage').forEach((img, i) => img.addEventListener('error', () => {
      if (!img.parentElement || !ctx.alive()) return;
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'rpage failed';
      retry.textContent = `Page ${i + 1} failed to load. Tap to retry.`;
      retry.addEventListener('click', () => { retry.replaceWith(img); img.src = pages[i]; });
      img.replaceWith(retry);
    }));
  } catch (error) { if (ctx.alive()) ctx.render(html`<div class="container page">${errorBox(error)}<a class="btn" href="#/scans/${source}/${slug}">Back to chapters</a></div>`); }
}
