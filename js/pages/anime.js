// Anime detail page.

import { html, render, $, $$, on, cleanAniHtml, fmtFuzzyDate, fmtCountdown, fmtDateShort, fmtTime, seasonLabel, titleCase, copyText, hashQuery, fmtNum, safeUrl } from '../util.js';
import { icon } from '../ui/icons.js';
import { mediaDetail } from '../api/anilist.js';
import { card, rail, fromAnime, titleOf, fmtFormat, fmtStatus, toast, skelRail, errorBox, openLibraryMenu, setStatus, PLACEHOLDER } from '../ui/components.js';
import { getEntry, saveEntry, getMarks, toggleMark, setMarks, lastHistory, subscribe, statusLabel, STATUSES } from '../store.js';
import { episodeCount, episodeLinkMap, streamLinks, infoLinks, trailerEmbed } from '../sources.js';

export default async function anime(ctx) {
  const id = ctx.params.id;
  ctx.render(html`<div class="skel hero" style="height:300px"></div><div class="container page"><div class="skel" style="height:260px"></div>${skelRail()}</div>`);
  let m;
  try { m = await mediaDetail(id); } catch (e) { ctx.render(html`<div class="container page">${errorBox(e)}</div>`); return; }
  if (!ctx.alive()) return;
  if (m.isAdult) { ctx.render(html`<div class="container page"><div class="empty"><h3>Not available</h3><p>This title is not available on NullxAnime.</p></div></div>`); return; }

  const item = fromAnime(m);
  ctx.setTitle(item.title);
  const count = episodeCount(m);
  const epLinks = episodeLinkMap(m);

  const draw = () => {
    const entry = getEntry('anime', id);
    const marks = getMarks('anime', id);
    const last = lastHistory('anime', id);
    const resumeEp = last?.ep ? Number(last.ep) : Math.min(count || 1, (entry?.progress || 0) + 1) || 1;
    const studio = m.allStudios?.edges?.filter((e) => e.isMain).map((e) => e.node.name) || [];
    const producers = m.allStudios?.edges?.filter((e) => !e.isMain && e.node.isAnimationStudio).map((e) => e.node.name) || [];
    const manga = (m.relations?.edges || []).find((e) => e.node.type === 'MANGA' && ['ADAPTATION', 'SOURCE'].includes(e.relationType)) || (m.relations?.edges || []).find((e) => e.node.type === 'MANGA');
    const next = m.nextAiringEpisode;
    const banner = m.bannerImage || m.coverImage?.extraLarge;
    const tags = (m.tags || []).filter((t) => !t.isMediaSpoiler && !t.isGeneralSpoiler).slice(0, 14);
    const synonyms = [...new Set([m.title.english, m.title.native, ...(m.synonyms || [])].filter((t) => t && t !== item.title))].slice(0, 3);
    const streams = streamLinks(m);
    const rel = (m.relations?.edges || []).filter((e) => e.node && !e.node.isAdult);
    const recs = (m.recommendations?.nodes || []).map((n) => n.mediaRecommendation).filter((x) => x && !x.isAdult);

    ctx.render(html`
      <div class="detail-banner">${banner ? html`<img src="${banner}" alt="" referrerpolicy="no-referrer">` : ''}<div class="detail-banner-shade"></div></div>
      <div class="container detail">
        <div class="detail-top">
          <div class="detail-poster"><img src="${item.cover || PLACEHOLDER}" alt="${item.title} poster" referrerpolicy="no-referrer"></div>
          <div class="detail-main">
            <div class="chips">
              <span class="chip active">${fmtStatus(m.status)}</span>
              ${m.format ? html`<span class="chip">${fmtFormat(m.format)}</span>` : ''}
              ${m.averageScore ? html`<span class="chip">${icon('star')} ${(m.averageScore / 10).toFixed(1)}</span>` : ''}
              ${m.rankings?.find((r) => r.type === 'RATED' && r.allTime) ? html`<span class="chip">#${m.rankings.find((r) => r.type === 'RATED' && r.allTime).rank} top rated</span>` : ''}
            </div>
            <h1 class="detail-title">${item.title}</h1>
            ${synonyms.length ? html`<div class="detail-alt">${synonyms.join(' · ')}</div>` : ''}
            <div class="detail-meta">
              ${m.episodes ? html`<span>${icon('film')} ${m.episodes} episodes</span>` : ''}
              ${m.duration ? html`<span>${icon('clock')} ${m.duration} min</span>` : ''}
              ${m.season ? html`<span>${icon('calendar')} ${seasonLabel(m.season, m.seasonYear)}</span>` : ''}
              ${studio.length ? html`<span>${icon('layers')} ${studio.join(', ')}</span>` : ''}
              <span>${icon('heart')} ${fmtNum(m.favourites)} favourites</span>
            </div>
            ${m.genres?.length ? html`<div class="chips">${m.genres.map((g) => html`<a class="chip" href="#/search?type=anime&genre=${encodeURIComponent(g)}">${g}</a>`)}</div>` : ''}
            <div class="detail-actions">
              ${count ? html`<a class="btn primary lg" href="#/watch/${id}/${resumeEp}">${icon('play')} ${last || entry?.progress ? `Continue · EP ${resumeEp}` : count === 1 ? 'Watch' : 'Start · EP 1'}</a>` : html`<span class="btn lg disabled">${icon('clock')} Not released yet</span>`}
              <button class="btn lg" data-action="lib-menu" data-key="anime:${id}">${icon(entry ? 'check' : 'plus')} ${entry ? statusLabel(entry.status, 'anime') : 'Add to list'}</button>
              ${embedFor(m) ? html`<button class="btn lg ghost" data-trailer>${icon('film')} Trailer</button>` : ''}
              ${manga ? html`<a class="btn lg ghost" href="#/search${hashQuery({ type: 'manga', q: titleOf(manga.node) })}">${icon('book')} Read the manga</a>` : ''}
              <button class="btn lg ghost" data-share aria-label="Copy link">${icon('share')}</button>
            </div>
            ${next ? html`<div class="notice" style="margin-top:16px">${icon('clock')}<div><b>Episode ${next.episode}</b> airs ${fmtDateShort(next.airingAt)} at ${fmtTime(next.airingAt)} — <span data-countdown="${next.airingAt}">${fmtCountdown(next.timeUntilAiring)}</span> from now.</div></div>` : ''}
            <div class="detail-desc ${(m.description || '').length > 420 ? 'collapsed' : ''}" id="desc"><p>${m.description ? cleanAniHtml(m.description) : 'No synopsis available yet.'}</p></div>
            ${(m.description || '').length > 420 ? html`<button class="link-btn" data-more>Read more</button>` : ''}
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-col">
            <section class="section" id="episodes">
              <div class="section-head"><div><h2>${m.format === 'MOVIE' ? 'Watch' : 'Episodes'}</h2><div class="sub">${count ? `${marks.size} of ${count} watched` : 'Episodes will appear once the show is released'}</div></div>
                ${count > 1 ? html`<div class="row"><button class="btn sm" data-markall>${icon('check')} Mark all watched</button></div>` : ''}</div>
              ${count ? episodeGrid(id, count, epLinks, marks, resumeEp, item) : ''}
            </section>

            ${watchHelp(streams)}

            ${m.characters?.edges?.length ? html`<section class="section"><div class="section-head"><h2>Characters</h2></div>
              <div class="chars">${m.characters.edges.map((e) => html`<div class="char"><img loading="lazy" src="${e.node.image?.large || PLACEHOLDER}" alt="" referrerpolicy="no-referrer">
                <div><b>${e.node.name.full}</b><small>${titleCase(e.role)}</small>${e.voiceActors?.[0] ? html`<small class="va">${icon('mic')} ${e.voiceActors[0].name.full}</small>` : ''}</div></div>`)}</div></section>` : ''}

            ${rel.length ? rail({ title: 'Related', items: rel.map((e) => {
              const it = e.node.type === 'MANGA' ? { ...fromAnime(e.node), type: 'manga', href: `#/search${hashQuery({ type: 'manga', q: titleOf(e.node) })}` } : fromAnime(e.node);
              return card(it, { sub: titleCase(e.relationType), href: it.href, noQuick: e.node.type === 'MANGA' });
            }) }) : ''}
            ${recs.length ? rail({ title: 'You might also like', items: recs.map((r) => card(fromAnime(r))) }) : ''}
          </div>

          <aside class="detail-side">
            ${trackerPanel(item, entry, count)}
            <div class="glass side-card"><h3>Information</h3>
              <dl class="kv">
                <dt>Format</dt><dd>${fmtFormat(m.format) || '–'}</dd>
                <dt>Status</dt><dd>${fmtStatus(m.status)}</dd>
                <dt>Episodes</dt><dd>${m.episodes || (count ? `${count}+` : '–')}</dd>
                <dt>Duration</dt><dd>${m.duration ? `${m.duration} min` : '–'}</dd>
                <dt>Aired</dt><dd>${fmtFuzzyDate(m.startDate)}${m.endDate?.year ? ` – ${fmtFuzzyDate(m.endDate)}` : ''}</dd>
                <dt>Season</dt><dd>${m.season ? seasonLabel(m.season, m.seasonYear) : '–'}</dd>
                <dt>Source</dt><dd>${titleCase(m.source || '') || '–'}</dd>
                <dt>Studio</dt><dd>${studio.join(', ') || '–'}</dd>
                ${producers.length ? html`<dt>Producers</dt><dd>${producers.slice(0, 3).join(', ')}</dd>` : ''}
                <dt>Popularity</dt><dd>#${fmtNum(m.popularity)} members</dd>
                ${m.hashtag ? html`<dt>Hashtag</dt><dd>${m.hashtag}</dd>` : ''}
              </dl></div>
            ${tags.length ? html`<div class="glass side-card"><h3>Tags</h3><div class="chips">${tags.map((t) => html`<a class="chip" href="#/search?type=anime&tag=${encodeURIComponent(t.name)}" title="${t.rank}% relevance">${t.name}</a>`)}</div></div>` : ''}
            ${m.staff?.edges?.length ? html`<div class="glass side-card"><h3>Staff</h3><ul class="staff">${m.staff.edges.slice(0, 6).map((s) => html`<li><b>${s.node.name.full}</b><small>${s.role}</small></li>`)}</ul></div>` : ''}
            ${linksCard(m)}
          </aside>
        </div>
      </div>`);
    bind();
  };

  let bindController, countdownTimer;
  ctx.cleanup(() => { bindController?.abort(); clearInterval(countdownTimer); });
  function bind() {
    bindController?.abort(); clearInterval(countdownTimer);
    bindController = new AbortController();
    const signal = bindController.signal;
    const root = ctx.el;
    $('[data-more]', root)?.addEventListener('click', (e) => { $('#desc', root).classList.remove('collapsed'); e.target.remove(); });
    $('[data-share]', root)?.addEventListener('click', () => copyText(location.href).then(() => toast('Link copied')));
    $('[data-trailer]', root)?.addEventListener('click', () => openTrailer(m));
    $('[data-markall]', root)?.addEventListener('click', () => {
      const all = getMarks('anime', id);
      for (let e = 1; e <= count; e++) all.add(e);
      setMarks('anime', id, all);
      saveEntry('anime', id, { progress: count, status: 'completed' }, { title: item.title, cover: item.cover, total: m.episodes, format: m.format });
      toast('Marked everything as watched');
    });
    on(root, 'click', '[data-mark]', (e, t) => {
      e.preventDefault(); e.stopPropagation();
      const ep = Number(t.dataset.mark);
      const now = toggleMark('anime', id, ep);
      const e0 = getEntry('anime', id);
      if (now && (!e0 || ep > (e0.progress || 0))) {
        saveEntry('anime', id, { progress: ep, status: e0?.status || 'current' }, { title: item.title, cover: item.cover, total: m.episodes, format: m.format });
      }
    }, { signal });
    // live countdown
    const cd = $('[data-countdown]', root);
    if (cd) {
      countdownTimer = setInterval(() => { cd.textContent = fmtCountdown(Number(cd.dataset.countdown) - Date.now() / 1000); }, 30000);
    }
    // tracker panel
    on(root, 'change', '[data-track]', (e, t) => {
      const kind = t.dataset.track;
      const base = { title: item.title, cover: item.cover, total: m.episodes, format: m.format };
      if (kind === 'status') { setStatus(item, t.value); return; }
      if (kind === 'score') saveEntry('anime', id, { score: Number(t.value) }, base);
      if (kind === 'progress') saveEntry('anime', id, { progress: Math.max(0, Math.min(Number(t.value) || 0, m.episodes || 9999)) }, base);
    }, { signal });
    on(root, 'click', '[data-step]', (e, t) => {
      const e0 = getEntry('anime', id);
      const p = Math.max(0, Math.min((e0?.progress || 0) + Number(t.dataset.step), m.episodes || 9999));
      saveEntry('anime', id, { progress: p, status: e0?.status || 'current' }, { title: item.title, cover: item.cover, total: m.episodes, format: m.format });
    }, { signal });
  }

  draw();
  const unsub = subscribe((k, d) => {
    if (!ctx.alive()) return;
    if ((k === 'library' || k === 'marks') && String(d?.id) === String(id)) {
      const y = window.scrollY; draw(); window.scrollTo(0, y);
    }
  });
  ctx.cleanup(unsub);
}

const embedFor = (m) => trailerEmbed(m.trailer);

function openTrailer(m) {
  const src = trailerEmbed(m.trailer);
  if (!src) return;
  const el = document.createElement('div');
  el.className = 'scrim'; el.style.alignItems = 'center'; el.style.padding = '14px';
  el.innerHTML = `<div class="modal" style="width:min(960px,100%);background:#000;overflow:hidden"><div class="video-frame"><iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="Trailer"></iframe></div></div>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', esc); document.body.classList.remove('no-scroll'); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
  document.body.classList.add('no-scroll');
  document.getElementById('overlay-root').appendChild(el);
}

function episodeGrid(id, count, epLinks, marks, resumeEp, item) {
  const MAX = 1000;
  const n = Math.min(count, MAX);
  const useThumbs = epLinks.size > 0;
  return html`<div class="ep-grid ${useThumbs ? 'with-thumbs' : ''}">${Array.from({ length: n }, (_, i) => {
    const ep = i + 1;
    const l = epLinks.get(ep);
    const seen = marks.has(ep);
    return html`<a class="ep ${seen ? 'seen' : ''} ${ep === resumeEp ? 'current' : ''}" href="#/watch/${id}/${ep}">
      ${useThumbs ? html`<span class="ep-thumb"><img loading="lazy" src="${l?.thumbnail || item.cover || PLACEHOLDER}" alt="" referrerpolicy="no-referrer"></span>` : ''}
      <span class="ep-body"><b>${count === 1 ? 'Full feature' : `Episode ${ep}`}</b>${l?.name ? html`<small class="clamp-2">${l.name}</small>` : ''}</span>
      <button class="ep-check" data-mark="${ep}" aria-label="${seen ? 'Mark unwatched' : 'Mark watched'}" title="${seen ? 'Mark unwatched' : 'Mark watched'}">${icon(seen ? 'check' : 'eye')}</button>
    </a>`;
  })}</div>${count > MAX ? html`<p class="muted" style="margin-top:12px">Showing the first ${MAX} episodes.</p>` : ''}`;
}

function watchHelp(streams) {
  return html`<section class="section" id="where">
    <div class="section-head"><div><h2>Where to watch</h2><div class="sub">Official, legal sources for this title</div></div></div>
    ${streams.length ? html`<div class="stream-links">${streams.map((s) => html`<a class="stream-link" href="${s.url}" target="_blank" rel="noopener noreferrer" style="--c:${/^#[0-9a-f]{3,8}$/i.test(s.color || '') ? s.color : 'var(--accent)'}">
      <span class="dot"></span><b>${s.site}</b>${s.language ? html`<small>${s.language}</small>` : ''}${s.yt ? html`<span class="badge good">Plays here</span>` : html`<span class="ext">${icon('ext')}</span>`}</a>`)}</div>`
      : html`<p class="muted">No official streaming links are listed for this title yet. Open the watch page for search shortcuts to official services.</p>`}
  </section>`;
}

function linksCard(m) {
  const links = infoLinks(m);
  const site = safeUrl(m.siteUrl);
  if (!links.length && !site) return '';
  return html`<div class="glass side-card"><h3>Links</h3><div class="chips">
    ${site ? html`<a class="chip" href="${site}" target="_blank" rel="noopener noreferrer">AniList ${icon('ext')}</a>` : ''}
    ${m.idMal ? html`<a class="chip" href="https://myanimelist.net/anime/${m.idMal}" target="_blank" rel="noopener noreferrer">MyAnimeList ${icon('ext')}</a>` : ''}
    ${links.slice(0, 8).map((l) => html`<a class="chip" href="${l.url}" target="_blank" rel="noopener noreferrer">${l.site} ${icon('ext')}</a>`)}</div></div>`;
}

function trackerPanel(item, entry, count) {
  const total = item.total;
  const pct = total ? Math.min(100, ((entry?.progress || 0) / total) * 100) : 0;
  return html`<div class="glass side-card tracker"><h3>My tracker</h3>
    <label class="field">Status<select class="select" data-track="status">
      <option value="__remove" ${entry ? '' : 'selected'} ${entry ? '' : 'disabled'}>Not on my list</option>
      ${STATUSES.map((s) => html`<option value="${s}" ${entry?.status === s ? 'selected' : ''}>${statusLabel(s, 'anime')}</option>`)}
      ${entry ? html`<option value="__remove">— Remove from list —</option>` : ''}
    </select></label>
    <div class="field" style="margin-top:12px">Episode progress
      <div class="stepper"><button class="icon-btn" data-step="-1" aria-label="Minus one">${icon('minus')}</button>
        <input class="input" type="number" min="0" ${total ? html`max="${total}"` : ''} value="${entry?.progress || 0}" data-track="progress" aria-label="Episodes watched">
        <span class="muted">/ ${total || '?'}</span>
        <button class="icon-btn" data-step="1" aria-label="Plus one">${icon('plus')}</button></div>
      ${total ? html`<div class="progress"><i style="width:${pct}%"></i></div>` : ''}
    </div>
    <label class="field" style="margin-top:12px">Score<select class="select" data-track="score">
      <option value="0">No score</option>${Array.from({ length: 10 }, (_, i) => 10 - i).map((s) => html`<option value="${s}" ${entry?.score === s ? 'selected' : ''}>${s} / 10</option>`)}
    </select></label>
  </div>`;
}
