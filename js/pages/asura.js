import { attachReaderTools } from '../ui/readerTools.js';
// Built-in Asura catalogue and vertical reader; no external site is embedded.
import { html, $, cleanAniHtml } from '../util.js';
import { icon } from '../ui/icons.js';
import { asuraSearch, asuraDetails, asuraChapters, asuraPages } from '../api/asura.js';
import { skelGrid, errorBox, emptyBox, PLACEHOLDER } from '../ui/components.js';
import { go } from '../router.js';
import { pushHistory, toggleMark } from '../store.js';

export default async function asura(ctx) {
  const { slug, chapter } = ctx.params;
  if (chapter) return read(ctx, slug, chapter);
  if (slug) return detail(ctx, slug);
  ctx.setTitle('Asura Scans');
  const q = String(ctx.query.q || '').trim().slice(0, 150);
  ctx.render(html`<div class="container page"><h1 class="page-title">Asura Scans</h1><p class="muted">Browse Asura's own catalogue. Availability and access are controlled by the provider.</p><form id="asura-search" class="filter-bar"><label class="sr-only" for="asura-query">Search Asura</label><input id="asura-query" class="input" value="${q}" placeholder="Search Asura titles…"><button class="btn primary">${icon('search')} Search</button></form><div id="asura-results">${skelGrid(12)}</div><div class="load-more" id="asura-more" hidden><button class="btn">Load more</button></div></div>`);
  $('#asura-search', ctx.el).addEventListener('submit', (e) => { e.preventDefault(); go(`/asura?q=${encodeURIComponent($('#asura-query', ctx.el).value.trim())}`); });
  let page = 1, busy = false;
  const load = async () => {
    if (busy) return;
    busy = true;
    try {
      const result = await asuraSearch(q, page);
      if (!ctx.alive()) return;
      const cards = result.items.map((it) => html`<article class="card"><a class="poster" href="#/asura/${it.slug}"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${it.cover || PLACEHOLDER}" alt=""><span class="shade"></span><span class="tl"><span class="badge accent">Asura</span></span><span class="play">${icon('book')}</span></a><a class="meta" href="#/asura/${it.slug}"><div class="title">${it.title}</div><div class="sub">${it.type} · ${it.status}</div></a></article>`).join('');
      const box = $('#asura-results', ctx.el);
      if (page === 1) box.innerHTML = result.items.length ? `<div class="grid" id="asura-grid">${cards}</div>` : emptyBox('search', 'No Asura titles found', 'Try another search.').toString();
      else $('#asura-grid', ctx.el)?.insertAdjacentHTML('beforeend', cards);
      $('#asura-more', ctx.el).hidden = !result.hasNext;
      page++;
    } catch (error) { if (ctx.alive()) $('#asura-results', ctx.el).innerHTML = errorBox(error).toString(); }
    finally { busy = false; }
  };
  $('#asura-more button', ctx.el).addEventListener('click', load);
  await load();
}

async function detail(ctx, slug) {
  ctx.render(html`<div class="container page">${skelGrid(3)}</div>`);
  try {
    const [m, chapters] = await Promise.all([asuraDetails(slug), asuraChapters(slug)]);
    if (!ctx.alive()) return;
    ctx.setTitle(`${m.title} · Asura`);
    const list = chapters.slice().reverse();
    ctx.render(html`<div class="container page"><a class="btn sm ghost" href="#/asura">${icon('chevL')} Asura catalogue</a><div class="asura-detail"><img src="${m.cover || PLACEHOLDER}" referrerpolicy="no-referrer" alt="" class="asura-poster"><div><div class="chips"><span class="badge accent">Asura Scans</span><span class="badge">${m.type}</span></div><h1 class="page-title">${m.title}</h1><p class="muted">${m.status}${m.author ? ` · ${m.author}` : ''}</p><div class="detail-desc">${cleanAniHtml(m.description)}</div>${chapters.length ? html`<a class="btn primary" href="#/asura/${slug}/${chapters[0].number}">${icon('book')} Start reading</a>` : html`<p class="muted">No unlocked chapters are available.</p>`}</div></div><section class="section"><div class="section-head"><div><h2>Chapters</h2><div class="sub">${chapters.length} unlocked chapters · newest first</div></div></div><div class="ch-list">${list.map((c) => html`<a class="ch" href="#/asura/${slug}/${c.number}"><span class="ch-main"><b>Chapter ${c.number}</b>${c.title ? html`<span class="ch-title">${c.title}</span>` : ''}</span><span class="ch-meta">${c.pages ? `${c.pages} pages` : ''}</span></a>`)}</div></section></div>`);
  } catch (error) { if (ctx.alive()) ctx.render(html`<div class="container page">${errorBox(error)}</div>`); }
}

async function read(ctx, slug, chapter) {
  ctx.render(html`<div class="reader-loading"><div class="spinner"></div><p>Loading Asura chapter…</p></div>`);
  try {
    const [m, chapters, pages] = await Promise.all([asuraDetails(slug), asuraChapters(slug), asuraPages(slug, chapter)]);
    if (!ctx.alive()) return;
    const index = chapters.findIndex((c) => c.number === chapter);
    if (index < 0) throw new Error('This chapter is unavailable or locked.');
    const prev = chapters[index - 1], next = chapters[index + 1];
    pushHistory({ type: 'manga', id: `asura:${slug}`, source: 'asura', sourceSlug: slug, chapterId: chapter, title: m.title, cover: m.cover, label: `Chapter ${chapter}` });
    ctx.setTitle(`${m.title} · Chapter ${chapter}`);
    document.body.classList.add('reading');
    ctx.cleanup(() => document.body.classList.remove('reading'));
    ctx.render(html`<div class="reader" data-mode="vertical" data-fit="width"><header class="reader-bar"><a class="icon-btn" href="#/asura/${slug}" aria-label="Back to chapters">${icon('chevL')}</a><div class="reader-title"><b>${m.title}</b><small>Asura · Chapter ${chapter}</small></div><div class="spacer"></div>${prev ? html`<a class="btn sm" href="#/asura/${slug}/${prev.number}">Previous</a>` : ''}${next ? html`<a class="btn sm primary" href="#/asura/${slug}/${next.number}">Next</a>` : ''}</header><div class="reader-view vertical">${pages.map((url, i) => html`<div class="rwrap"><img class="rpage" src="${url}" alt="Page ${i + 1}" ${i > 1 ? html`loading="lazy"` : ''} decoding="async" referrerpolicy="no-referrer"></div>`)}<div class="reader-end"><h3>Chapter ${chapter} finished</h3><div class="row" style="justify-content:center"><a class="btn" href="#/asura/${slug}">Chapters</a>${next ? html`<a class="btn primary" href="#/asura/${slug}/${next.number}">Next chapter</a>` : ''}</div></div></div></div>`);
    // Surface failed CDN images rather than silently leaving a blank page.
    attachReaderTools(ctx, ctx.el.querySelector('.reader'), pages.length, null, { onComplete: () => toggleMark('manga', `asura:${slug}`, chapter, true) });
    ctx.el.querySelectorAll('.rpage').forEach((img, i) => {
      img.addEventListener('error', () => {
        const wrapper = img.parentElement;
        if (!wrapper || !ctx.alive()) return;
        const retry = document.createElement('button');
        retry.type = 'button'; retry.className = 'rpage failed';
        retry.textContent = `Page ${i + 1} failed to load. Tap to retry.`;
        retry.addEventListener('click', () => { retry.replaceWith(img); img.src = pages[i]; });
        img.replaceWith(retry);
      });
    });
  } catch (error) { if (ctx.alive()) ctx.render(html`<div class="container page">${errorBox(error)}<a class="btn" href="#/asura/${slug}">Back to chapters</a></div>`); }
}
