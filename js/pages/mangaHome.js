// Manga home: featured carousel, continue reading, rails by popularity / updates / origin.

import { html, render, $, $$, mdPlain, titleCase } from '../util.js';
import { icon } from '../ui/icons.js';
import { mangaHome, tagList, randomManga } from '../api/mangadex.js';
import { card, rail, fromManga, continueCard, skelRail, errorBox, toast } from '../ui/components.js';
import { getHistory, getSettings } from '../store.js';
import { go } from '../router.js';

export default async function mangaHomePage(ctx) {
  ctx.setTitle('Manga');
  const lang = getSettings().mangaLang;
  ctx.render(html`<div class="container page"><div class="skel" style="height:340px;border-radius:22px"></div>${skelRail()}${skelRail()}</div>`);
  let feed;
  try { feed = await mangaHome(lang); } catch (e) { ctx.render(html`<div class="container page">${errorBox(e)}</div>`); return; }
  if (!ctx.alive()) return;

  const f = (arr) => arr.map(fromManga);
  const feat = f(feed.popular).filter((m) => m.cover).slice(0, 6);
  const hist = getHistory('manga').slice(0, 14);
  ctx.render(html`<div class="container page" style="padding-top:18px">
    ${feat.length ? html`<section class="mhero" id="mhero">${feat.map((it, i) => html`<div class="mhero-slide ${i === 0 ? 'active' : ''}">
      <img class="mhero-bg" src="${it.cover}" alt="" referrerpolicy="no-referrer">
      <div class="mhero-inner">
        <img class="mhero-cover" src="${it.cover}" alt="" referrerpolicy="no-referrer">
        <div class="mhero-text">
          <div class="chips"><span class="badge accent">${icon('flame')} #${i + 1} Popular</span>${it.origin !== 'Manga' ? html`<span class="badge">${it.origin}</span>` : ''}${it.raw.status ? html`<span class="badge">${titleCase(it.raw.status)}</span>` : ''}</div>
          <h1>${it.title}</h1>
          <p class="clamp-3">${mdPlain(it.raw.description)}</p>
          <div class="chips">${it.raw.tags.filter((t) => t.group === 'genre').slice(0, 4).map((t) => html`<span class="chip">${t.name}</span>`)}</div>
          <div class="row" style="margin-top:6px"><a class="btn primary lg" href="${it.href}">${icon('book')} Read now</a>
            <button class="btn ghost lg" data-action="lib-menu" data-key="manga:${it.id}">${icon('plus')} My list</button></div>
        </div></div></div>`)}
      <div class="hero-dots">${feat.map((_, i) => html`<button data-dot="${i}" class="${i === 0 ? 'on' : ''}" aria-label="Slide ${i + 1}"></button>`)}</div></section>` : ''}

    <div class="quick-tiles">
      <button class="tile" id="random"><span class="tile-ic">${icon('shuffle')}</span><span><b>Surprise me</b><small>Open a random manga</small></span></button>
      <a class="tile" href="#/search?type=manga&origin=ko"><span class="tile-ic">${icon('scroll')}</span><span><b>Manhwa</b><small>Korean webtoons</small></span></a>
      <a class="tile" href="#/search?type=manga&origin=zh"><span class="tile-ic">${icon('layers')}</span><span><b>Manhua</b><small>Chinese comics</small></span></a>
      <a class="tile" href="#/library"><span class="tile-ic">${icon('library')}</span><span><b>My reading list</b><small>Track your chapters</small></span></a>
    </div>

    ${hist.length ? rail({ title: 'Continue reading', items: hist.map(continueCard), land: true }) : ''}
    ${rail({ title: 'Popular now', sub: 'Most followed on MangaDex', href: '#/search?type=manga&sort=popular', items: f(feed.popular).map((i) => card(i)) })}
    ${rail({ title: 'Latest updates', sub: 'Freshly uploaded chapters', href: '#/search?type=manga&sort=latest', items: f(feed.latest).map((i) => card(i)) })}
    ${rail({ title: 'Top rated', href: '#/search?type=manga&sort=rating', items: f(feed.top).map((i) => card(i)) })}
    ${rail({ title: 'Manhwa', sub: 'Korean long-strip comics', href: '#/search?type=manga&origin=ko', items: f(feed.manhwa).map((i) => card(i)) })}
    ${rail({ title: 'Manhua', sub: 'Chinese comics', href: '#/search?type=manga&origin=zh', items: f(feed.manhua).map((i) => card(i)) })}
    ${rail({ title: 'Newly added', href: '#/search?type=manga&sort=new', items: f(feed.fresh).map((i) => card(i)) })}
    <section class="section" id="tags-box"></section>
  </div>`);

  // carousel
  const hero = $('#mhero');
  if (hero) {
    const slides = $$('.mhero-slide', hero), dots = $$('[data-dot]', hero);
    let i = 0, t;
    const show = (n) => { i = (n + slides.length) % slides.length; slides.forEach((s, k) => s.classList.toggle('active', k === i)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
    const play = () => { clearInterval(t); if (!getSettings().reduceMotion) t = setInterval(() => { if (!document.hidden) show(i + 1); }, 9000); };
    hero.addEventListener('click', (e) => { const d = e.target.closest('[data-dot]'); if (d) { show(Number(d.dataset.dot)); play(); } });
    hero.addEventListener('mouseenter', () => clearInterval(t)); hero.addEventListener('mouseleave', play);
    play(); ctx.cleanup(() => clearInterval(t));
  }
  $('#random')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try { const m = await randomManga(); go(`/manga/${m.id}`); } catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
  });
  tagList().then((tags) => {
    if (!ctx.alive()) return;
    const box = $('#tags-box'); if (!box) return;
    render(box, html`<div class="section-head"><h2>Browse by genre</h2></div><div class="chips">${tags.filter((t) => t.group === 'genre').map((t) => html`<a class="chip" href="#/search?type=manga&tag=${t.id}">${t.name}</a>`)}</div>
      <div class="section-head" style="margin-top:26px"><h2>Themes</h2></div><div class="chips">${tags.filter((t) => t.group === 'theme').slice(0, 40).map((t) => html`<a class="chip" href="#/search?type=manga&tag=${t.id}">${t.name}</a>`)}</div>`);
  }).catch(() => {});
}
