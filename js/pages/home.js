// Anime home: hero carousel, continue watching, curated rails.

import { html, render, $, $$, cleanAniHtml, plain, seasonLabel, on } from '../util.js';
import { icon } from '../ui/icons.js';
import { homeFeed, genreList } from '../api/anilist.js';
import { card, rail, fromAnime, continueCard, skelRail, errorBox, titleOf, fmtFormat } from '../ui/components.js';
import { getHistory, getSettings, subscribe } from '../store.js';

export default async function home(ctx) {
  ctx.setTitle('');
  document.body.classList.add('has-hero');
  ctx.cleanup(() => document.body.classList.remove('has-hero'));

  ctx.render(html`<div class="skel hero"></div><div class="container">${skelRail()}${skelRail()}</div>`);
  let feed;
  try { feed = await homeFeed(); } catch (e) { document.body.classList.remove('has-hero'); ctx.render(html`<div class="container page">${errorBox(e)}</div>`); return; }
  if (!ctx.alive()) return;

  const heroItems = feed.hero.map(fromAnime);
  const draw = () => {
    const hist = getHistory('anime').slice(0, 14);
    ctx.render(html`
      ${heroSection(heroItems)}
      <div class="container">
        ${quickLinks()}
        ${hist.length ? rail({ title: 'Continue watching', sub: 'Pick up where you left off', items: hist.map(continueCard), land: true, id: 'continue' }) : ''}
        ${rail({ title: 'Trending now', sub: 'What everyone is watching this week', href: '#/search?type=anime&sort=TRENDING_DESC', items: feed.trending.map(fromAnime).map((i) => card(i)) })}
        ${rail({ title: 'Airing now', sub: 'Currently releasing — with next-episode countdowns', href: '#/search?type=anime&status=RELEASING', items: feed.airing.map(fromAnime).map((i) => card(i)) })}
        ${rail({ title: `${seasonLabel(feed.seasonInfo.season, feed.seasonInfo.year)}`, sub: 'This season’s most popular', href: `#/search?type=anime&season=${feed.seasonInfo.season}&year=${feed.seasonInfo.year}`, items: feed.season.map(fromAnime).map((i) => card(i)) })}
        ${rail({ title: 'Coming next season', sub: seasonLabel(feed.nextInfo.season, feed.nextInfo.year), href: `#/search?type=anime&season=${feed.nextInfo.season}&year=${feed.nextInfo.year}`, items: feed.upcoming.map(fromAnime).map((i) => card(i)) })}
        ${rail({ title: 'Top rated', sub: 'Highest average score', href: '#/search?type=anime&sort=SCORE_DESC', items: feed.top.map(fromAnime).map((i) => card(i)) })}
        ${rail({ title: 'All-time popular', href: '#/search?type=anime&sort=POPULARITY_DESC', items: feed.popular.map(fromAnime).map((i) => card(i)) })}
        ${rail({ title: 'Movies', href: '#/search?type=anime&format=MOVIE', items: feed.movies.map(fromAnime).map((i) => card(i)) })}
        <section class="section" id="genres-box"></section>
      </div>`);
    startHero(ctx);
    loadGenres(ctx);
  };
  draw();
  const unsub = subscribe((k) => { if (k === 'history' && ctx.alive()) { const c = $('#continue'); if (!c) draw(); } });
  ctx.cleanup(unsub);
}

function quickLinks() {
  const tiles = [
    ['calendar', 'Airing schedule', 'Never miss an episode', '#/schedule'],
    ['library', 'My list', 'Track what you watch', '#/library'],
    ['film', 'Free & open library', 'Legal, public-domain video', '#/free'],
    ['book', 'Switch to manga', 'Read thousands of titles', '#/manga'],
  ];
  return html`<div class="quick-tiles">${tiles.map(([ic, t, s, href]) => html`<a class="tile" href="${href}"><span class="tile-ic">${icon(ic)}</span><span><b>${t}</b><small>${s}</small></span></a>`)}</div>`;
}

function heroSection(items) {
  if (!items.length) return html`<div class="hero-empty"></div>`;
  return html`<section class="hero" id="hero" aria-roledescription="carousel" aria-label="Featured anime">
    ${items.map((it, i) => {
      const m = it.raw;
      const img = m.bannerImage || m.trailer?.thumbnail || m.coverImage?.extraLarge;
      const meta = [fmtFormat(m.format), m.episodes ? `${m.episodes} eps` : null, m.seasonYear, m.studios?.nodes?.[0]?.name].filter(Boolean);
      return html`<div class="hero-slide ${i === 0 ? 'active' : ''}" data-i="${i}" aria-hidden="${i === 0 ? 'false' : 'true'}">
        <img class="hero-bg" src="${img}" alt="" ${i === 0 ? '' : html`loading="lazy"`} referrerpolicy="no-referrer">
        <div class="hero-shade"></div>
        <div class="container hero-content">
          <div class="hero-kicker"><span class="badge accent">${icon('flame')} #${i + 1} Trending</span>${it.score ? html`<span class="badge score">${icon('star')} ${it.score}</span>` : ''}</div>
          <h1 class="hero-title">${it.title}</h1>
          <div class="hero-meta">${meta.map((x, k) => html`${k ? html`<i></i>` : ''}<span>${x}</span>`)}</div>
          <p class="hero-desc clamp-3">${plain(m.description)}</p>
          <div class="row hero-actions">
            <a class="btn primary lg" href="${it.href}">${icon('play')} Watch now</a>
            <a class="btn ghost lg" href="${it.href}">${icon('info')} Details</a>
            <button class="btn ghost lg" data-action="lib-menu" data-key="anime:${it.id}" aria-label="Add to my list">${icon('plus')} My list</button>
          </div>
        </div>
      </div>`;
    })}
    <div class="hero-dots" role="tablist">${items.map((_, i) => html`<button role="tab" data-dot="${i}" class="${i === 0 ? 'on' : ''}" aria-label="Slide ${i + 1}"></button>`)}</div>
  </section>`;
}

function startHero(ctx) {
  const hero = $('#hero');
  if (!hero) return;
  const slides = $$('.hero-slide', hero), dots = $$('[data-dot]', hero);
  let i = 0, timer;
  const show = (n) => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => { s.classList.toggle('active', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  };
  const play = () => { stop(); if (!getSettings().reduceMotion && slides.length > 1) timer = setInterval(() => { if (!document.hidden) show(i + 1); }, 8000); };
  const stop = () => clearInterval(timer);
  hero.addEventListener('click', (e) => { const d = e.target.closest('[data-dot]'); if (d) { show(Number(d.dataset.dot)); play(); } });
  hero.addEventListener('mouseenter', stop); hero.addEventListener('mouseleave', play);
  let sx = 0;
  hero.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; stop(); }, { passive: true });
  hero.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1)); play(); }, { passive: true });
  play();
  ctx.cleanup(stop);
}

async function loadGenres(ctx) {
  const box = $('#genres-box');
  if (!box) return;
  try {
    const genres = await genreList();
    if (!ctx.alive()) return;
    render(box, html`<div class="section-head"><h2>Browse by genre</h2></div>
      <div class="chips">${genres.map((g) => html`<a class="chip" href="#/search?type=anime&genre=${encodeURIComponent(g)}">${g}</a>`)}</div>`);
  } catch { /* optional */ }
}
