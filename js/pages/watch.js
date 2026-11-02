// Watch page — third-party episode player, official sources, personal media and community deployments.

import { html, render, $, $$, on, esc, hostOf, safeUrl, clamp, debounce, titleCase, copyText } from '../util.js';
import { icon } from '../ui/icons.js';
import { mediaDetail } from '../api/anilist.js';
import { INSTANT_ORIGIN, instantEmbed, baseUrl, animeggSearch, animeggEpisodes, animeggWatch, anipubSearch, anipubPlayer, anipubSource } from '../api/community.js';
import { searchOpenVideo, itemFiles, archiveUrl } from '../api/archive.js';
import { createPlayer } from '../player.js';
import { fromAnime, titleOf, toast, errorBox, skelRail, PLACEHOLDER } from '../ui/components.js';
import { buildSources, episodeCount, episodeLinkMap, officialSearchLinks, streamLinks, youtubeInfo, youtubeEmbed } from '../sources.js';
import { getSettings, setSetting, getMarks, toggleMark, getEntry, saveEntry, pushHistory, getPos, setPos, getMyLink, setMyLink, subscribe } from '../store.js';
import { go } from '../router.js';

export default async function watch(ctx) {
  const id = ctx.params.id;
  ctx.render(html`<div class="container page"><div class="watch"><div><div class="stage skel"></div></div><div class="skel" style="height:420px"></div></div></div>`);
  let m;
  try { m = await mediaDetail(id); } catch (e) { ctx.render(html`<div class="container page">${errorBox(e)}</div>`); return; }
  if (!ctx.alive()) return;
  if (m.isAdult) { go('/'); return; }

  const item = fromAnime(m);
  const count = episodeCount(m);
  const ep = clamp(parseInt(ctx.params.ep, 10) || 1, 1, Math.max(1, count));
  if (String(ep) !== ctx.params.ep) { go(`/watch/${id}/${ep}`, { replace: true }); return; }
  const epLinks = episodeLinkMap(m);
  const epInfo = epLinks.get(ep);
  const isMovie = count === 1;
  const epLabel = isMovie ? 'Full feature' : `Episode ${ep}`;
  ctx.setTitle(`${item.title} — ${epLabel}`);

  pushHistory({ type: 'anime', id, title: item.title, cover: item.cover, ep, label: isMovie ? 'Movie' : `EP ${ep}` });
  const e0 = getEntry('anime', id);
  if (e0 && e0.status === 'planning') saveEntry('anime', id, { status: 'current' });

  const posKey = `a:${id}:${ep}`;
  const embeds = buildSources(m, ep);
  const hasOfficial = streamLinks(m).length > 0 || !!epInfo;
  const tabs = [
    ...(count > 0 ? [{ id: 'instant', kind: 'instant', label: 'Instant play', note: 'Play the selected episode' }] : []),
    ...embeds.filter((s) => s.id !== 'trailer'),
    { id: 'animegg', kind: 'animegg', label: 'AnimeGG', note: 'Kitsune-derived provider' },
    { id: 'anipub', kind: 'anipub', label: 'AniPub', note: 'Connect an AniPub deployment' },
    { id: 'official', kind: 'services', label: 'Official services', note: 'Crunchyroll, Netflix & more' },
    ...embeds.filter((s) => s.id === 'trailer'),
    { id: 'library', kind: 'library', label: 'Free library', note: 'Public-domain & Creative Commons (Internet Archive)' },
    { id: 'mine', kind: 'mine', label: 'My link / file', note: 'Play your own video' },
  ];
  const defaultTab = tabs.find((s) => s.id === 'instant') || embeds.find((s) => s.id !== 'trailer') || (hasOfficial ? tabs.find((t) => t.id === 'official') : null) || embeds[0] || tabs.find((t) => t.id === 'official');
  let active = tabs.find((t) => t.id === ctx.query.src) || defaultTab;
  let player = null;
  const killPlayer = () => { player?.destroy(); player = null; };
  ctx.cleanup(killPlayer);

  /* ---------- static shell ---------- */
  const marks0 = getMarks('anime', id);
  ctx.render(html`<div class="container page watch-page">
    <div class="watch-head">
      <a class="btn sm ghost" href="#/anime/${id}">${icon('chevL')} ${item.title}</a>
      <div class="spacer"></div>
      <button class="btn sm ghost" data-action="shortcuts">${icon('keyboard')} Shortcuts</button>
    </div>
    <div class="watch">
      <div class="watch-main">
        <div class="stage-wrap"><div class="stage" id="stage"></div></div>
        <div class="source-tabs tabs-scroll" id="tabs" role="tablist"></div>
        <div class="watch-bar">
          <div class="watch-title"><h1>${item.title}</h1><div class="muted">${epLabel}${epInfo?.name ? ` — ${epInfo.name}` : ''}</div></div>
          <div class="row">
            <a class="btn sm ${ep > 1 ? '' : 'disabled'}" href="#/watch/${id}/${ep - 1}" id="prev">${icon('skipP')} Prev</a>
            <button class="btn sm" id="markbtn">${icon('check')} <span>Mark watched</span></button>
            <a class="btn sm primary ${ep < count ? '' : 'disabled'}" href="#/watch/${id}/${ep + 1}" id="next">Next ${icon('skipN')}</a>
          </div>
        </div>
        <div id="panel"></div>
        <label class="row switch-row"><span class="switch"><input type="checkbox" id="autonext" ${getSettings().autoNext ? 'checked' : ''}><i></i></span><span>Auto-play the next episode when a video finishes</span></label>
      </div>
      <aside class="watch-side glass">
        <div class="side-head"><b>${isMovie ? 'Movie' : 'Episodes'}</b><span class="muted" id="seen-count"></span></div>
        ${count > 60 ? html`<div style="padding:0 12px 10px"><input class="input" id="jump" type="number" min="1" max="${count}" placeholder="Jump to episode…"></div>` : ''}
        <div class="ep-list" id="eplist">${Array.from({ length: Math.min(count, 1000) }, (_, i) => html`<a class="ep-row" href="#/watch/${id}/${i + 1}" data-ep="${i + 1}"><span class="n">${i + 1}</span><span class="t">${epLinks.get(i + 1)?.name || (isMovie ? 'Full feature' : `Episode ${i + 1}`)}</span><span class="ck"></span></a>`)}</div>
      </aside>
    </div>
  </div>`);

  const stage = $('#stage'), panel = $('#panel');

  const paintEpisodes = () => {
    const marks = getMarks('anime', id);
    $$('.ep-row').forEach((r) => {
      const n = Number(r.dataset.ep);
      r.classList.toggle('current', n === ep);
      r.classList.toggle('seen', marks.has(n));
      r.querySelector('.ck').innerHTML = marks.has(n) ? icon('check').toString() : '';
    });
    $('#seen-count').textContent = `${marks.size}/${count}`;
    const b = $('#markbtn');
    const seen = marks.has(ep);
    b.classList.toggle('on', seen);
    b.querySelector('span').textContent = seen ? 'Watched' : 'Mark watched';
  };
  paintEpisodes();
  $('#eplist .current')?.scrollIntoView({ block: 'center' });

  const paintTabs = () => render($('#tabs'), tabs.map((t) => html`<button role="tab" aria-selected="${t.id === active.id ? 'true' : 'false'}" tabindex="${t.id === active.id ? '0' : '-1'}" class="chip ${t.id === active.id ? 'active' : ''}" data-src="${t.id}" title="${t.note || ''}">${t.kind === 'embed' && t.id !== 'trailer' ? icon('play') : t.kind === 'services' ? icon('globe') : t.kind === 'library' ? icon('film') : t.kind === 'mine' ? icon('link') : icon('film')} ${t.label}</button>`));

  /* ---------- progress / completion ---------- */
  const markWatched = (force) => {
    const now = toggleMark('anime', id, ep, force);
    if (now) {
      const e = getEntry('anime', id);
      if (!e || ep > (e.progress || 0)) saveEntry('anime', id, { progress: ep, status: e?.status === 'completed' ? 'completed' : 'current' }, { title: item.title, cover: item.cover, total: m.episodes, format: m.format });
      toast(`Episode ${ep} marked as watched`);
    }
    return now;
  };
  const sourceQuery = () => ['animegg', 'anipub'].includes(active.id) ? `?src=${active.id}` : '';
  const goNext = () => { if (ep < count) go(`/watch/${id}/${ep + 1}${sourceQuery()}`); };
  const onEnded = () => { markWatched(true); if (getSettings().autoNext) setTimeout(goNext, 1200); };

  /* ---------- stage rendering ---------- */
  function mountPlayer({ src, subtitle, format, crossOrigin, label, poster, autoplay = false }) {
    killPlayer();
    stage.className = 'stage';
    player = createPlayer(stage, {
      src, subtitle, format, crossOrigin, poster, label, autoplay,
      startAt: getPos(posKey)?.pos || 0,
      onProgress: (pos, dur) => { setPos(posKey, pos, dur); if (dur && pos / dur > 0.9) toggleMark('anime', id, ep, true); },
      onEnded,
    });
  }
  function mountEmbed(src, title, sandbox = false) {
    killPlayer();
    stage.className = 'stage';
    stage.innerHTML = `<div class="video-frame"><iframe src="${esc(src)}" title="${esc(title)}" ${sandbox ? 'sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"' : ''} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  }
  function placeholder(iconName, title, text) {
    killPlayer();
    stage.className = 'stage placeholder';
    render(stage, html`<div class="stage-msg">${icon(iconName)}<h3>${title}</h3><p>${text}</p></div>`);
  }

  let sourceController = null;
  ctx.cleanup(() => sourceController?.abort());
  async function select(tab) {
    sourceController?.abort();
    sourceController = new AbortController();
    active = tab;
    paintTabs();
    const suffix = sourceQuery();
    $('#prev').setAttribute('href', `#/watch/${id}/${ep - 1}${suffix}`);
    $('#next').setAttribute('href', `#/watch/${id}/${ep + 1}${suffix}`);
    $$('.ep-row', ctx.el).forEach((row) => row.setAttribute('href', `#/watch/${id}/${row.dataset.ep}${suffix}`));
    render(panel, '');
    history.replaceState(null, '', `#/watch/${id}/${ep}${tab.id !== defaultTab.id ? `?src=${tab.id}` : ''}`);
    if (tab.kind === 'embed') {
      mountEmbed(tab.src, tab.label);
      render(panel, html`<div class="notice">${icon('info')}<div>${tab.id === 'trailer' ? 'This is the official trailer / promo video.' : html`<b>${tab.label}</b> — an official free channel. Pick the episode inside the YouTube player; use <b>Mark watched</b> above to track progress.`}${tab.url ? html` <a href="${tab.url}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">Open on YouTube ${icon('ext')}</a>` : ''}</div></div>`);
    } else if (tab.kind === 'instant') instantView();
    else if (tab.kind === 'services') servicesView();
    else if (tab.kind === 'library') libraryView();
    else if (tab.kind === 'mine') mineView();
    else if (tab.kind === 'animegg') animeggView();
    else if (tab.kind === 'anipub') anipubView();
  }

  /* ----- Direct episode player (Kitsune's iframe fallback) ----- */
  function instantView() {
    let audio = getSettings().instantAudio === 'dub' ? 'dub' : 'sub';
    let lastProgress = 0, completed = false;
    const drawPlayer = () => {
      completed = false; lastProgress = 0;
      const src = instantEmbed(id, ep, audio);
      mountEmbed(src, `${item.title} — ${epLabel}`, true);
      render(panel, html`<div class="instant-panel glass">
        <div><b>Instant play</b><p class="muted">Episode ${ep} · ${audio === 'sub' ? 'Subtitled' : 'Dubbed'}</p></div>
        <div class="seg" aria-label="Audio language"><button type="button" data-instant-audio="sub" class="${audio === 'sub' ? 'on' : ''}" aria-pressed="${audio === 'sub'}">Sub</button><button type="button" data-instant-audio="dub" class="${audio === 'dub' ? 'on' : ''}" aria-pressed="${audio === 'dub'}">Dub</button></div>
        <p class="muted instant-help">No video link needed. Availability depends on the provider and your region. If playback is blocked or this episode is missing, try the other source tabs. <a href="${src}" target="_blank" rel="noopener noreferrer">Open player ${icon('ext')}</a></p>
      </div>`);
    };
    drawPlayer();
    panel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-instant-audio]');
      if (!button || active.kind !== 'instant') return;
      audio = button.dataset.instantAudio;
      setSetting('instantAudio', audio);
      drawPlayer();
    }, { signal: sourceController.signal });
    const onMessage = (event) => {
      const frame = $('iframe', stage);
      if (active.kind !== 'instant' || event.origin !== INSTANT_ORIGIN || !frame || event.source !== frame.contentWindow) return;
      let data = event.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
      if (!data || typeof data !== 'object') return;
      const time = typeof data.currentTime === 'number' ? data.currentTime : data.time;
      const duration = data.duration;
      if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0 || duration > 86400 || time < 0 || time > duration + 1) return;
      if (Math.abs(time - lastProgress) >= 10 || data.event === 'complete') {
        lastProgress = time;
        setPos(posKey, Math.min(time, duration), duration);
        if (time / duration > .9) toggleMark('anime', id, ep, true);
      }
      if (data.event === 'complete' && !completed) { completed = true; onEnded(); }
    };
    window.addEventListener('message', onMessage, { signal: sourceController.signal });
  }

  /* ----- External deployments ----- */
  const deploymentKey = (name) => name === 'AnimeGG' ? 'streamWorkerUrl' : 'anipubUrl';
  function deploymentForm(name, defaultUrl = '') {
    const saved = getSettings()[deploymentKey(name)] || defaultUrl;
    return html`<form id="deployment-form" class="mine-form glass">
      <label class="field">${name === 'AnimeGG' ? 'Streaming worker URL' : 'AniPub deployment URL'}<input id="deployment-url" class="input" type="url" required value="${saved}" placeholder="${name === 'AnimeGG' ? 'https://your-worker.workers.dev' : 'https://your-deployment.example'}"></label>
      <div class="row"><button class="btn primary">Connect</button><button type="button" class="btn" id="deployment-forget">Forget URL</button><span class="muted">Stored in this browser. HTTPS and cross-origin access are required.</span></div>
    </form><div id="deployment-results" aria-live="polite"></div>`;
  }
  function deploymentError(error) {
    if (error.name === 'AbortError' || !ctx.alive()) return;
    const box = $('#deployment-results', panel);
    if (box) render(box, html`<div class="notice" role="alert">${error.message || 'Could not load this source.'}</div>`);
  }
  function animeggView() {
    placeholder('film', 'AnimeGG', 'Search for this title using your NullxAnime streaming worker.');
    render(panel, html`${deploymentForm('AnimeGG')}<form id="animegg-search" class="mine-form glass"><label class="field">Title<input class="input" id="animegg-query" value="${item.title}" required minlength="3" maxlength="150"></label><button class="btn primary">${icon('search')} Search provider</button><p class="muted">Select the exact series and season. The worker must be deployed separately; GitHub Pages is static.</p></form>`);
    const controller = sourceController;
    const current = () => ctx.alive() && active.kind === 'animegg' && !controller.signal.aborted;
    let serial = 0;
    $('#deployment-forget', panel).addEventListener('click', () => { setSetting(deploymentKey('AnimeGG'), ''); select(active); });
    const search = async (event) => {
      event.preventDefault();
      const task = ++serial;
      try {
        const base = baseUrl($('#deployment-url', panel).value);
        setSetting(deploymentKey('AnimeGG'), base);
        placeholder('film', 'AnimeGG', 'Searching the provider…');
        render($('#deployment-results', panel), html`<p class="muted">Searching…</p>`);
        const data = await animeggSearch(base, $('#animegg-query', panel).value, controller.signal);
        if (!current() || task !== serial) return;
        const results = Array.isArray(data.results) ? data.results.filter((x) => /^[a-z\d][a-z\d-]{0,199}$/i.test(x.slug || '') && x.title).slice(0, 50) : [];
        if (!results.length) throw new Error('No titles found. Try another name.');
        render($('#deployment-results', panel), html`<label class="field">Choose the exact title and season<select id="animegg-title" class="select">${results.map((r) => html`<option value="${r.slug}">${r.title}</option>`)}</select></label><label class="field">Audio<select id="animegg-audio" class="select"><option value="sub">Sub</option><option value="dub">Dub</option></select></label><button class="btn primary" id="animegg-play">${icon('play')} Load episode ${ep}</button><div id="animegg-streams" aria-live="polite"></div>`);
        $('#animegg-play', panel).addEventListener('click', async () => {
          const playTask = ++serial;
          try {
            const slug = $('#animegg-title', panel).value, audio = $('#animegg-audio', panel).value;
            placeholder('film', 'AnimeGG', 'Loading this episode…');
            render($('#animegg-streams', panel), html`<p class="muted">Loading…</p>`);
            const listing = await animeggEpisodes(base, slug, controller.signal);
            if (!current() || playTask !== serial) return;
            if (!Array.isArray(listing.episodes) || !listing.episodes.some((e) => Number(e.number) === ep && e[audio])) throw new Error(`Episode ${ep} is not available with ${audio} audio for this series.`);
            const data = await animeggWatch(base, slug, ep, audio, controller.signal);
            if (!current() || playTask !== serial) return;
            const streams = (Array.isArray(data.streams) ? data.streams : []).filter((s) => {
              const url = safeUrl(s.url);
              return url && new URL(url).origin === new URL(base).origin && ['hls', 'mp4'].includes(s.type);
            });
            if (!streams.length) throw new Error('No playable streams were returned for this episode.');
            render($('#animegg-streams', panel), html`<label class="field">Stream<select class="select" id="animegg-stream">${streams.map((s, i) => html`<option value="${i}">${s.server || 'Stream'} · ${s.quality || 'Auto'}</option>`)}</select></label>`);
            const play = () => {
              const source = streams[Number($('#animegg-stream', panel).value)];
              mountPlayer({ src: source.url, format: source.type === 'hls' ? 'hls' : undefined, crossOrigin: true, label: item.title, poster: item.cover, autoplay: true });
            };
            $('#animegg-stream', panel).addEventListener('change', play);
            play();
          } catch (error) { if (current() && playTask === serial && error.name !== 'AbortError') { placeholder('film', 'Episode unavailable', 'Try another title, audio, or provider.'); render($('#animegg-streams', panel), html`<p role="alert">${error.message}</p>`); } }
        });
      } catch (error) { if (current() && task === serial && error.name !== 'AbortError') { placeholder('film', 'Search unavailable', 'Check the worker URL and try again.'); deploymentError(error); } }
    };
    $('#deployment-form', panel).addEventListener('submit', search);
    $('#animegg-search', panel).addEventListener('submit', search);
    if (getSettings()[deploymentKey('AnimeGG')]) $('#animegg-search', panel).requestSubmit();
  }
  function anipubView() {
    placeholder('film', 'AniPub', 'Search the AniPub catalogue and select the matching title.');
    render(panel, html`${deploymentForm('AniPub', 'https://anipub.org')}<form id="anipub-search" class="mine-form glass"><label class="field">Title<input class="input" id="anipub-query" value="${item.title}" required></label><button class="btn">${icon('search')} Search AniPub</button></form><form id="anipub-manual" class="mine-form glass"><label class="field">AniPub title ID (if search is blocked)<input id="anipub-id" class="input" inputmode="numeric" pattern="[0-9]+" required></label><label class="field">Audio<select class="select" id="anipub-manual-audio"><option value="sub">Sub</option><option value="dub">Dub</option></select></label><button class="btn">Open episode ${ep}</button><div id="anipub-manual-link"></div></form>`);
    const controller = sourceController;
    const current = () => ctx.alive() && active.kind === 'anipub' && !controller.signal.aborted;
    let lookupSerial = 0;
    $('#deployment-forget', panel).addEventListener('click', () => { setSetting(deploymentKey('AniPub'), ''); select(active); });
    const search = async (event) => {
      event.preventDefault();
      const lookup = ++lookupSerial;
      try {
        const base = baseUrl($('#deployment-url', panel).value);
        setSetting(deploymentKey('AniPub'), base);
        render($('#deployment-results', panel), html`<p class="muted">Searching AniPub…</p>`);
        const results = await anipubSearch(base, $('#anipub-query', panel).value, controller.signal);
        if (!current() || lookup !== lookupSerial) return;
        if (!results.length) throw new Error('No matching titles found. Try another title.');
        render($('#deployment-results', panel), html`<label class="field">Choose the matching title<select class="select" id="anipub-title">${results.map((r) => html`<option value="${r.Id}">${r.Name}</option>`)}</select></label><label class="field">Audio<select class="select" id="anipub-audio"><option value="sub">Sub</option><option value="dub">Dub</option></select></label><button class="btn primary" id="anipub-play">${icon('play')} Open episode ${ep}</button><div id="anipub-link"></div>`);
        $('#anipub-play', panel).addEventListener('click', () => playAniPub(base, $('#anipub-title', panel).value, $('#anipub-audio', panel).value, $('#anipub-link', panel)));

      } catch (error) { if (current() && lookup === lookupSerial) deploymentError(error); }
    };
    $('#deployment-form', panel).addEventListener('submit', search);
    $('#anipub-search', panel).addEventListener('submit', search);
    async function playAniPub(base, titleId, audio, box) {
      const task = ++lookupSerial;
      const page = anipubPlayer(base, titleId, ep, audio);
      render(box, html`<p class="muted">Loading the episode source… <a href="${page}" target="_blank" rel="noopener noreferrer">Open on AniPub</a></p>`);
      try {
        const source = await anipubSource(base, titleId, ep, audio, controller.signal);
        if (!current() || task !== lookupSerial) return;
        if (source.kind === 'video') mountPlayer({ src: source.url, label: item.title, poster: item.cover, autoplay: true });
        else mountEmbed(source.url, 'AniPub episode', true);
        render(box, html`<p class="muted">Playing the episode source. If playback is blocked, <a href="${page}" target="_blank" rel="noopener noreferrer">open on AniPub</a>.</p>`);
      } catch (error) {
        if (current() && task === lookupSerial && error.name !== 'AbortError') render(box, html`<p role="alert">${error.message} <a href="${page}" target="_blank" rel="noopener noreferrer">Open on AniPub</a>.</p>`);
      }
    }
    $('#anipub-manual', panel).addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const base = baseUrl($('#deployment-url', panel).value);
        setSetting(deploymentKey('AniPub'), base);
        playAniPub(base, $('#anipub-id', panel).value, $('#anipub-manual-audio', panel).value, $('#anipub-manual-link', panel));
      } catch (error) { deploymentError(error); }
    });
  }

  /* ----- Official services launch pad ----- */
  function servicesView() {
    killPlayer();
    stage.className = 'stage launch';
    const streams = streamLinks(m);
    const direct = epInfo?.url ? safeUrl(epInfo.url) : '';
    render(stage, html`<div class="launchpad">
      <div class="lp-top">
        ${epInfo?.thumbnail ? html`<img src="${epInfo.thumbnail}" alt="" referrerpolicy="no-referrer">` : html`<img src="${item.cover || PLACEHOLDER}" alt="" referrerpolicy="no-referrer">`}
        <div><h3>${item.title}</h3><p class="muted">${epLabel}${epInfo?.name ? ` · ${epInfo.name}` : ''}</p>
          ${direct ? html`<a class="btn primary lg" href="${direct}" target="_blank" rel="noopener noreferrer">${icon('play')} Watch ${isMovie ? '' : `EP ${ep} `}on ${epInfo.site || hostOf(direct)}</a>` : streams[0] ? html`<a class="btn primary lg" href="${streams[0].url}" target="_blank" rel="noopener noreferrer">${icon('play')} Watch on ${streams[0].site}</a>` : html`<p class="muted">No official link is listed for this title yet — try the search shortcuts below.</p>`}
        </div>
      </div>
    </div>`);
    render(panel, html`
      ${streams.length ? html`<h3 class="panel-h">Listed streaming services</h3><div class="stream-links">${streams.map((s) => html`<a class="stream-link" href="${s.url}" target="_blank" rel="noopener noreferrer" style="--c:${/^#[0-9a-f]{3,8}$/i.test(s.color || '') ? s.color : 'var(--accent)'}"><span class="dot"></span><b>${s.site}</b>${s.language ? html`<small>${s.language}</small>` : ''}<span class="ext">${icon('ext')}</span></a>`)}</div>` : ''}
      <h3 class="panel-h">Search on official services</h3>
      <div class="stream-links">${officialSearchLinks(item.title).map((s) => html`<a class="stream-link" href="${s.url}" target="_blank" rel="noopener noreferrer" style="--c:${s.color}"><span class="dot"></span><b>${s.site}</b><span class="ext">${icon('ext')}</span></a>`)}</div>
      <div class="notice" style="margin-top:14px">${icon('shield')}<div>Official services require no captcha from us — NullxAnime simply links you there. Several (Muse Asia, Ani-One Asia, Crunchyroll’s free tier) offer free ad-supported viewing in many regions including the Philippines.</div></div>`);
  }

  /* ----- Internet Archive free library ----- */
  async function libraryView(query) {
    placeholder('film', 'Free & open library', 'Search public-domain and Creative-Commons videos from the Internet Archive.');
    const q0 = query ?? item.title;
    render(panel, html`<form class="row lib-search" id="libform"><input class="input" id="libq" value="${q0}" placeholder="Search the open library…" style="flex:1;min-width:200px"><button class="btn primary">${icon('search')} Search</button></form><div id="libres"><div class="center-load"><div class="spinner"></div></div></div>`);
    const run = async (text) => {
      const box = $('#libres');
      render(box, html`<div class="center-load"><div class="spinner"></div></div>`);
      try {
        const res = await searchOpenVideo(text, 18);
        if (!ctx.alive()) return;
        if (!res.length) { render(box, html`<div class="empty" style="padding:30px 10px"><h3>Nothing in the open library for “${text}”</h3><p>Most anime is commercially licensed, so it will not appear here. Try the official services tab, or <a href="#/free" style="color:var(--accent)">browse the free library</a>.</p></div>`); return; }
        render(box, html`<div class="lib-grid">${res.map((r) => html`<button class="lib-item" data-ia="${r.id}"><img loading="lazy" src="${r.thumb}" alt="" referrerpolicy="no-referrer"><b class="clamp-2">${r.title}</b><small>${[r.creator, r.year].filter(Boolean).join(' · ')}</small></button>`)}</div>`);
      } catch (e) { render(box, errorBox(e)); }
    };
    run(q0);
    $('#libform').addEventListener('submit', (e) => { e.preventDefault(); run($('#libq').value); });
    $('#libres').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ia]'); if (!b) return;
      try {
        const info = await itemFiles(b.dataset.ia);
        if (!info.files.length) { toast('No playable video file in that item', 'err'); return; }
        const pick = (i) => {
          const f = info.files[i];
          mountPlayer({ src: f.url, label: info.title, poster: info.cover, autoplay: true });
          render($('#iainfo'), html`<div class="notice">${icon('info')}<div><b>${info.title}</b> — hosted by the Internet Archive${info.license ? html` · <a href="${safeUrl(info.license)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">license</a>` : ''} · <a href="${archiveUrl(info.id)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">open on archive.org ${icon('ext')}</a>
            ${info.files.length > 1 ? html`<div style="margin-top:10px"><select class="select" id="iafile" style="max-width:420px">${info.files.map((x, k) => html`<option value="${k}" ${k === i ? 'selected' : ''}>${x.name}${x.size ? ` (${(x.size / 1048576).toFixed(0)} MB)` : ''}</option>`)}</select></div>` : ''}</div></div>`);
          $('#iafile')?.addEventListener('change', (ev) => pick(Number(ev.target.value)));
        };
        if (!$('#iainfo')) panel.insertAdjacentHTML('afterbegin', '<div id="iainfo" style="margin-bottom:16px"></div>');
        pick(0);
        stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  /* ----- My link / local file ----- */
  function mineView() {
    placeholder('link', 'Play your own video', 'Paste a direct video link (MP4, WebM, HLS .m3u8) or a YouTube link — or pick a file from your device. Only use content you have the right to watch.');
    const saved = getMyLink(id, ep);
    render(panel, html`<form id="mineform" class="mine-form glass">
      <label class="field">Video link<input class="input" id="mineurl" type="url" placeholder="https://… .mp4 / .m3u8 / youtube.com/watch?v=…" value="${saved?.url || ''}"></label>
      <label class="field">Subtitles link (optional, .vtt or .srt)<input class="input" id="minesub" type="url" placeholder="https://… .vtt" value="${saved?.sub || ''}"></label>
      <div class="row"><button class="btn primary">${icon('play')} Play link</button>${saved ? html`<button type="button" class="btn danger" id="minedel">${icon('trash')} Forget link</button>` : ''}
        <span class="spacer"></span>
        <label class="btn" style="cursor:pointer">${icon('file')} Choose local file<input id="minefile" type="file" accept="video/*,.mkv,.m3u8" hidden></label>
        <label class="btn ghost" style="cursor:pointer">${icon('file')} Subtitle file<input id="minesubfile" type="file" accept=".vtt,.srt" hidden></label></div>
      <p class="muted" style="font-size:12.5px">Links are saved only in this browser, per episode. Some hosts block playback on other websites — that is the host’s choice.</p>
    </form>`);
    let subBlob = '';
    const playUrl = (url, sub) => {
      const yt = youtubeInfo(url);
      if (yt) { mountEmbed(youtubeEmbed(yt), 'My video'); return; }
      mountPlayer({ src: url, subtitle: sub || undefined, label: 'My video', poster: item.cover, autoplay: true });
    };
    $('#mineform').addEventListener('submit', (e) => {
      e.preventDefault();
      const url = safeUrl($('#mineurl').value.trim());
      if (!url) { toast('Enter a valid http(s) link', 'err'); return; }
      const sub = safeUrl($('#minesub').value.trim());
      setMyLink(id, ep, { url, sub });
      playUrl(url, sub);
      stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('#minedel')?.addEventListener('click', () => { setMyLink(id, ep, null); mineView(); toast('Link forgotten'); });
    $('#minefile').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const url = URL.createObjectURL(f);
      ctx.cleanup(() => URL.revokeObjectURL(url));
      mountPlayer({ src: url, subtitle: subBlob || undefined, label: f.name, autoplay: true });
      if (/\.mkv$/i.test(f.name)) toast('MKV support depends on your browser — MP4/WebM is the safest.');
    });
    $('#minesubfile').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const { srtToVtt } = await import('../player.js');
      let text = await f.text();
      if (/\.srt$/i.test(f.name)) text = srtToVtt(text);
      subBlob = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
      const v = $('video', stage);
      if (v) { const tr = document.createElement('track'); tr.kind = 'subtitles'; tr.label = f.name; tr.src = subBlob; tr.default = true; v.appendChild(tr); toast('Subtitles loaded'); }
      else toast('Subtitles will load with the next video');
    });
    if (saved?.url) playUrl(saved.url, saved.sub);
  }

  /* ---------- events ---------- */
  on(ctx.el, 'click', '[data-src]', (e, t) => { select(tabs.find((x) => x.id === t.dataset.src)); $(`[data-src="${t.dataset.src}"]`, ctx.el)?.focus({ preventScroll: true }); });
  $('#tabs', ctx.el).addEventListener('keydown', (e) => {
    if (!e.target.closest('[data-src]')) return;
    const index = tabs.findIndex((tab) => tab.id === active.id);
    const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault(); select(tabs[next]); const button = $(`[data-src="${tabs[next].id}"]`, ctx.el); button?.focus({ preventScroll: true }); button?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  });
  $('#markbtn').addEventListener('click', () => { const on_ = toggleMark('anime', id, ep); if (on_) { const e = getEntry('anime', id); if (!e || ep > (e.progress || 0)) saveEntry('anime', id, { progress: ep, status: e?.status || 'current' }, { title: item.title, cover: item.cover, total: m.episodes, format: m.format }); } });
  $('#autonext').addEventListener('change', (e) => setSetting('autoNext', e.target.checked));
  $('#jump')?.addEventListener('change', (e) => { const n = clamp(parseInt(e.target.value, 10) || 1, 1, count); $(`.ep-row[data-ep="${n}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  const onKey = (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === 'n' && ep < count) go(`/watch/${id}/${ep + 1}${sourceQuery()}`);
    if (e.key.toLowerCase() === 'p' && ep > 1) go(`/watch/${id}/${ep - 1}${sourceQuery()}`);
  };
  document.addEventListener('keydown', onKey);
  ctx.cleanup(() => document.removeEventListener('keydown', onKey));
  ctx.cleanup(subscribe((k) => { if (k === 'marks' || k === 'import') paintEpisodes(); }));

  select(active);
}
