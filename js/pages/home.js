// Anime home: hero carousel, continue watching, curated rails.

import { html, render, $, $$, cleanAniHtml, plain, seasonLabel, on, timeAgo, fmtCountdown, fmtFuzzyDate, fmtTime } from '../util.js';
import { icon } from '../ui/icons.js';
import { homeFeed, genreList, updatesFeed } from '../api/anilist.js';
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
        ${rankingSection(feed)}
        ${hist.length ? rail({ title: 'Continue watching', sub: 'Pick up where you left off', items: hist.map(continueCard), land: true, id: 'continue' }) : ''}
        <div id="updates-box"></div>
        ${quickLinks()}
        ${rail({ title: 'Airing now', sub: 'Currently releasing — with next-episode countdowns', href: '#/search?type=anime&status=RELEASING', items: feed.airing.map(fromAnime).map((i) => card(i)) })}
        ${rail({ title: `${seasonLabel(feed.seasonInfo.season, feed.seasonInfo.year)}`, sub: 'This season’s most popular', href: `#/search?type=anime&season=${feed.seasonInfo.season}&year=${feed.seasonInfo.year}`, items: feed.season.map(fromAnime).map((i) => card(i)) })}
        ${rail({ title: 'Coming next season', sub: seasonLabel(feed.nextInfo.season, feed.nextInfo.year), href: `#/search?type=anime&season=${feed.nextInfo.season}&year=${feed.nextInfo.year}`, items: feed.upcoming.map(fromAnime).map((i) => card(i)) })}
        ${rail({ title: 'Top rated', sub: 'Highest average score', href: '#/search?type=anime&sort=SCORE_DESC', items: feed.top.map(fromAnime).map((i) => card(i)) })}
        ${rail({ title: 'Movies', href: '#/search?type=anime&format=MOVIE', items: feed.movies.map(fromAnime).map((i) => card(i)) })}
        <section class="section" id="genres-box"></section>
      </div>`);
    startHero(ctx);
    startRanking(ctx, feed);
    loadUpdates(ctx);
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

/* ---------- Top ranking ------------------------------------------------------------ */
const RANK_TABS = [['trending', 'Trending', 'flame'], ['popular', 'Most popular', 'heart'], ['top', 'Top rated', 'star'], ['season', 'This season', 'calendar']];
const rankItems = (feed, key) => (feed[key] || []).slice(0, 10).map(fromAnime);
const rankTrack = (items) => items.map((it, i) => html`<div class="rank-item"><span class="rank-n" aria-hidden="true">${i + 1}</span>${card(it, { sub: it.sub })}</div>`);

function rankingSection(feed) {
  return html`<section class="section ranking" id="ranking">
    <div class="section-head"><div><h2>Top 10 anime ranking</h2><div class="sub">Live from AniList — updated through the day</div></div>
      <div class="seg" id="rank-tabs">${RANK_TABS.map(([k, l], i) => html`<button data-rank="${k}" class="${i === 0 ? 'on' : ''}">${l}</button>`)}</div></div>
    <div class="rail">
      <button class="rail-btn prev" data-rail="-1" aria-label="Scroll left">${icon('chevL')}</button>
      <div class="rail-track rank-track" id="rank-track">${rankTrack(rankItems(feed, 'trending'))}</div>
      <button class="rail-btn next" data-rail="1" aria-label="Scroll right">${icon('chevR')}</button>
    </div></section>`;
}
function startRanking(ctx, feed) {
  const tabs = $('#rank-tabs'); if (!tabs) return;
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rank]'); if (!b) return;
    $$('[data-rank]', tabs).forEach((x) => x.classList.toggle('on', x === b));
    const track = $('#rank-track'); render(track, rankTrack(rankItems(feed, b.dataset.rank))); track.scrollTo({ left: 0 });
  });
}

/* ---------- Recent updates / new releases / upcoming ---------------------------------- */
async function loadUpdates(ctx) {
  const box = $('#updates-box'); if (!box) return;
  render(box, html`${skelRail(8)}`);
  let u;
  try { u = await updatesFeed(); } catch { if (ctx.alive()) render(box, html``); return; }
  if (!ctx.alive() || !$('#updates-box')) return;
  const now = Date.now() / 1000;
  const epCard = (x, label, withTime) => { const it = fromAnime(x.media); return card(it, { href: `#/watch/${it.id}/${x.episode}`, badge: label(x), sub: `Episode ${x.episode}${withTime ? ` · ${fmtTime(x.airingAt)}` : it.raw.episodes ? ` of ${it.raw.episodes}` : ''}` }); };
  const premiere = (m) => (m.startDate?.year ? `Premieres ${fmtFuzzyDate(m.startDate)}` : 'Date to be announced');
  const daysTo = (m) => { const d = m.startDate; if (!d?.year || !d.month || !d.day) return null; const n = Math.ceil((new Date(d.year, d.month - 1, d.day) - Date.now()) / 86400000); return n >= 0 ? n : null; };
  render(box, html`
    ${rail({ title: 'Recently updated', sub: 'New episodes that just aired — tap to watch', href: '#/schedule', items: u.recent.map((x) => epCard(x, (y) => `EP ${y.episode} · ${timeAgo(y.airingAt * 1000)}`)), id: 'recent' })}
    ${rail({ title: 'New releases', sub: 'Series that premiered in the last 6 weeks', href: '#/search?type=anime&status=RELEASING&sort=START_DATE_DESC', items: u.fresh.map((m) => { const it = fromAnime(m); return card(it, { badge: 'NEW', sub: `Premiered ${fmtFuzzyDate(m.startDate)}` }); }) })}
    ${rail({ title: 'Airing soon', sub: 'Next episodes in the coming 3 days (your local time)', href: '#/schedule', items: u.soon.map((x) => epCard(x, (y) => `EP ${y.episode} · in ${fmtCountdown(y.airingAt - now)}`, true)) })}
    ${rail({ title: 'Upcoming anime', sub: 'Most anticipated, soonest first', href: '#/search?type=anime&status=NOT_YET_RELEASED&sort=START_DATE', items: u.upcoming.map((m) => { const it = fromAnime(m); const n = daysTo(m); return card(it, { badge: n != null ? (n === 0 ? 'Premieres today' : `In ${n} day${n === 1 ? '' : 's'}`) : 'Upcoming', sub: premiere(m) }); }) })}`);
}
