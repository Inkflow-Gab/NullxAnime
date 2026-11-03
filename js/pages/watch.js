// Watch page — episode players and configured third-party providers.

import { html, render, $, $$, on, esc, hostOf, safeUrl, clamp, debounce, titleCase, copyText, fmtLocalDateTime, localTimeZone } from '../util.js';
import { PROVIDER_ENDPOINTS } from '../config.js';
import { icon } from '../ui/icons.js';
import { mediaDetail } from '../api/anilist.js';
import { INSTANT_ORIGIN, instantEmbed, aniweebEmbed, EXTRA_PLAYERS, extraEmbed, baseUrl, animeggSearch, animeggEpisodes, animeggWatch, senshiWatch, anipubSearch, anipubPlayer, anipubSource } from '../api/community.js';
import { kitsuneEpisodes, kitsuneChoices, kitsuneWatch, kitsuneStreams, kitsuneProxy } from '../api/kitsune.js';
import { searchOpenVideo, itemFiles, archiveUrl } from '../api/archive.js';
import { createPlayer } from '../player.js';
import { fromAnime, titleOf, toast, errorBox, skelRail, PLACEHOLDER } from '../ui/components.js';
import { episodeCount, episodeLinkMap } from '../sources.js';
import { getSettings, setSetting, getMarks, toggleMark, getEntry, saveEntry, pushHistory, getPos, setPos, subscribe } from '../store.js';
import { go } from '../router.js';
import { mountSeasonPicker } from '../ui/seasons.js';

export default async function watch(ctx) {
  const id = ctx.params.id;
  ctx.render(html`<div class="container page"><div class="watch"><div><div class="stage skel"></div></div><div class="skel" style="height:420px"></div></div></div>`);
  let m;
  try { m = await mediaDetail(id); } catch (e) { ctx.render(html`<div class="container page">${errorBox(e)}</div>`); return; }
  if (!ctx.alive()) return;
  if (m.isAdult) { go('/'); return; }

  const item = fromAnime(m);
  const count = episodeCount(m);
  if (!count) { ctx.setTitle(item.title); ctx.render(html`<div class="container page"><div class="empty"><h3>No aired episodes listed yet</h3><p>${m.nextAiringEpisode ? `Episode ${m.nextAiringEpisode.episode} is scheduled for ${fmtLocalDateTime(m.nextAiringEpisode.airingAt)} (${localTimeZone()}).` : 'AniList has not reported an aired episode yet.'} Provider availability may differ.</p><a class="btn" href="#/anime/${id}">Back to title</a></div></div>`); return; }
  const ep = clamp(parseInt(ctx.params.ep, 10) || 1, 1, count);
  if (String(ep) !== ctx.params.ep) { go(`/watch/${id}/${ep}`, { replace: true }); return; }
  const epLinks = episodeLinkMap(m);
  const epInfo = epLinks.get(ep);
  const isMovie = m.format === 'MOVIE';
  const epLabel = isMovie ? 'Full feature' : `Episode ${ep}`;
  ctx.setTitle(`${item.title} — ${epLabel}`);

  pushHistory({ type: 'anime', id, title: item.title, cover: item.cover, ep, label: isMovie ? 'Movie' : `EP ${ep}` });
  const e0 = getEntry('anime', id);
  if (e0 && e0.status === 'planning') saveEntry('anime', id, { status: 'current' });

  const posKey = `a:${id}:${ep}`;
  const tabs = [
    ...(count > 0 ? [{ id: 'instant', kind: 'instant', label: 'Instant play', note: 'Play the selected episode' }] : []),
    ...(count > 0 ? [{ id: 'aniweeb', kind: 'aniweeb', label: 'Aniweeb', note: 'Alternate episode player' }] : []),
    ...(count > 0 ? Object.entries(EXTRA_PLAYERS).map(([id, p]) => ({ id, kind: 'extra', label: p.label, note: 'Third-party episode player' })) : []),
    ...(PROVIDER_ENDPOINTS.kitsuneApi ? [{ id: 'mkissa', kind: 'kitsune', label: 'MKissa', note: 'MKissa anime' }] : []),
    ...(PROVIDER_ENDPOINTS.kitsuneApi ? [{ id: 'kitsune', kind: 'kitsune', label: 'More servers', note: 'Additional provider mirrors' }] : []),
    ...(PROVIDER_ENDPOINTS.streamWorker ? [{ id: 'senshi', kind: 'senshi', label: 'Senshi', note: 'Kitsune-derived mirrors' }, { id: 'animegg', kind: 'animegg', label: 'AnimeGG', note: 'Kitsune-derived provider' }] : []),
    ...(PROVIDER_ENDPOINTS.aniPub ? [{ id: 'anipub', kind: 'anipub', label: 'AniPub', note: 'AniPub episode source' }] : []),
    { id: 'library', kind: 'library', label: 'Free library', note: 'Public-domain & Creative Commons (Internet Archive)' },
  ];
  const defaultTab = tabs.find((s) => s.id === 'instant') || tabs.find((s) => s.id === 'library');
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
      <button class="btn sm ghost" id="copy-episode">${icon('link')} Copy episode link</button>
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
        <div id="watch-seasons"></div>
        ${m.nextAiringEpisode ? html`<p class="watch-airing">Episode ${m.nextAiringEpisode.episode} airs <time datetime="${new Date(m.nextAiringEpisode.airingAt * 1000).toISOString()}">${fmtLocalDateTime(m.nextAiringEpisode.airingAt)}</time> (${localTimeZone()}). Provider release may differ.</p>` : ''}
        <div class="side-head"><b>${isMovie ? 'Movie' : 'Aired episodes'}</b><span class="muted" id="seen-count"></span></div><p class="watch-airing">Airing data is from AniList; a provider may not have every episode.</p>
        ${count > 1 ? html`<div class="episode-filter"><label class="sr-only" for="episode-search">Filter episodes</label><input class="input" id="episode-search" type="search" placeholder="Find episode or title…" autocomplete="off"><span id="episode-results" class="muted" aria-live="polite"></span></div>` : ''}
        <div class="ep-list" id="eplist">${Array.from({ length: Math.min(count, 1000) }, (_, i) => html`<a class="ep-row" href="#/watch/${id}/${i + 1}" data-ep="${i + 1}"><span class="n">${i + 1}</span><span class="t">${epLinks.get(i + 1)?.name || (isMovie ? 'Full feature' : `Episode ${i + 1}`)}</span><span class="ck"></span></a>`)}</div>
      </aside>
    </div>
  </div>`);

  mountSeasonPicker(ctx, m, '#watch-seasons', true);
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

  const paintTabs = () => render($('#tabs'), tabs.map((t) => html`<button role="tab" aria-selected="${t.id === active.id ? 'true' : 'false'}" tabindex="${t.id === active.id ? '0' : '-1'}" class="chip ${t.id === active.id ? 'active' : ''}" data-src="${t.id}" title="${t.note || ''}">${icon('film')} ${t.label}</button>`));

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
  const sourceQuery = () => ['aniweeb', 'animegg', 'anipub', 'senshi', 'kitsune', 'mkissa', ...Object.keys(EXTRA_PLAYERS)].includes(active.id) ? `?src=${active.id}` : '';
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
    if (tab.kind === 'instant') instantView();
    else if (tab.kind === 'aniweeb') aniweebView();
    else if (tab.kind === 'extra') extraView(tab);
    else if (tab.kind === 'library') libraryView();
    else if (tab.kind === 'kitsune') kitsuneView(tab.id === 'mkissa' ? 'mkissa' : '');
    else if (tab.kind === 'senshi') senshiView();
    else if (tab.kind === 'animegg') animeggView();
    else if (tab.kind === 'anipub') anipubView();
  }

  /* ----- Direct episode player (Kitsune's iframe fallback) ----- */
  function instantView() {
    let audio = getSettings().instantAudio === 'dub' ? 'dub' : 'sub';
    let protectedMode = getSettings().instantPopupProtection === true;
    let lastProgress = 0, completed = false;
    const drawPlayer = () => {
      completed = false; lastProgress = 0;
      const src = instantEmbed(id, ep, audio);
      // This host may refuse sandboxed embeds; protection is optional and never weakens other players.
      mountEmbed(src, `${item.title} — ${epLabel}`, protectedMode);
      render(panel, html`<div class="instant-panel glass">
        <div><b>Instant play</b><p class="muted">Episode ${ep} · ${audio === 'sub' ? 'Subtitled' : 'Dubbed'}</p></div>
        <div class="seg" aria-label="Audio language"><button type="button" data-instant-audio="sub" class="${audio === 'sub' ? 'on' : ''}" aria-pressed="${audio === 'sub'}">Sub</button><button type="button" data-instant-audio="dub" class="${audio === 'dub' ? 'on' : ''}" aria-pressed="${audio === 'dub'}">Dub</button></div>
        <button type="button" class="btn sm" data-instant-retry>${icon('refresh')} Retry player</button>
        <button type="button" class="btn sm" data-instant-protect aria-pressed="${protectedMode}">${icon('shield')} Popup protection: ${protectedMode ? 'on' : 'off'}</button>
        <p class="muted instant-help">Popup protection limits new tabs and top-level redirects, but this provider may refuse to play with it on. It cannot remove ads inside the player. Try Aniweeb or disable protection if playback fails. <a href="${src}" target="_blank" rel="noopener noreferrer">Open player ${icon('ext')}</a></p>
      </div>`);
    };
    drawPlayer();
    panel.addEventListener('click', (event) => {
      if (active.kind !== 'instant') return;
      if (event.target.closest('[data-instant-retry]')) { drawPlayer(); return; }
      if (event.target.closest('[data-instant-protect]')) { protectedMode = !protectedMode; setSetting('instantPopupProtection', protectedMode); drawPlayer(); return; }
      const button = event.target.closest('[data-instant-audio]');
      if (!button) return;
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

  /* A documented episode-player embed, not the upstream catalogue website. */
  function aniweebView() {
    let audio = getSettings().aniweebAudio === 'dub' ? 'dub' : 'sub';
    let server = getSettings().aniweebServer === 2 ? 2 : 1;
    const drawPlayer = () => {
      const src = aniweebEmbed(id, ep, audio, server);
      mountEmbed(src, `${item.title} — Aniweeb server ${server}`, true);
      render(panel, html`<div class="instant-panel glass">
        <div><b>Aniweeb</b><p class="muted">Episode ${ep} · Server ${server} · ${audio === 'sub' ? 'Subtitled' : 'Dubbed'}</p></div>
        <div class="seg" role="group" aria-label="Audio language">${['sub', 'dub'].map((a) => html`<button type="button" data-aniweeb-audio="${a}" class="${audio === a ? 'on' : ''}" aria-pressed="${audio === a}">${a === 'sub' ? 'Sub' : 'Dub'}</button>`)}</div>
        <div class="seg" role="group" aria-label="Aniweeb server">${[1, 2].map((n) => html`<button type="button" data-aniweeb-server="${n}" class="${server === n ? 'on' : ''}" aria-pressed="${server === n}">Server ${n}</button>`)}</div>
        <button type="button" class="btn sm" data-aniweeb-retry>${icon('refresh')} Retry player</button>
        <p class="muted instant-help">Popup protection is enabled for this player, limiting new tabs and redirects. Ads inside the player can still appear. Switch server or try Instant play if playback fails.</p>
      </div>`);
    };
    drawPlayer();
    panel.addEventListener('click', (event) => {
      const a = event.target.closest('[data-aniweeb-audio]');
      const s = event.target.closest('[data-aniweeb-server]');
      if (a) { audio = a.dataset.aniweebAudio; setSetting('aniweebAudio', audio); }
      else if (s) { server = Number(s.dataset.aniweebServer); setSetting('aniweebServer', server); }
      else if (!event.target.closest('[data-aniweeb-retry]')) return;
      drawPlayer();
    }, { signal: sourceController.signal });
  }

  /* Separate episode-player embeds, not whole provider websites. */
  function extraView(tab) {
    let audio = getSettings().extraAudio === 'dub' ? 'dub' : 'sub';
    const drawPlayer = () => {
      const src = extraEmbed(tab.id, id, ep, audio);
      mountEmbed(src, `${item.title} — ${tab.label}`, true);
      render(panel, html`<div class="instant-panel glass">
        <div><b>${tab.label}</b><p class="muted">Episode ${ep} · ${audio === 'sub' ? 'Subtitled' : 'Dubbed'}</p></div>
        <div class="seg" role="group" aria-label="Audio language">${['sub', 'dub'].map((a) => html`<button type="button" data-extra-audio="${a}" class="${audio === a ? 'on' : ''}" aria-pressed="${audio === a}">${a === 'sub' ? 'Sub' : 'Dub'}</button>`)}</div>
        <button type="button" class="btn sm" data-extra-retry>${icon('refresh')} Retry player</button>
        <p class="muted instant-help">Popup protection is enabled; in-player ads may still appear. If this provider or audio track fails, try another source. Availability and playback depend on the provider.</p>
      </div>`);
    };
    drawPlayer();
    panel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-extra-audio]');
      if (button) { audio = button.dataset.extraAudio; setSetting('extraAudio', audio); }
      else if (!event.target.closest('[data-extra-retry]')) return;
      drawPlayer();
    }, { signal: sourceController.signal });
  }

  /* ----- External deployments ----- */
  const deploymentResults = () => html`<div id="deployment-results" aria-live="polite"></div>`;
  function deploymentError(error) {
    if (error.name === 'AbortError' || !ctx.alive()) return;
    const box = $('#deployment-results', panel);
    if (box) render(box, html`<div class="notice" role="alert">${error.message || 'Could not load this source.'}</div>`);
  }
  /* The optional API returns per-title provider availability and per-episode mirrors. */
  function kitsuneView(preferredProvider = '') {
    if (!PROVIDER_ENDPOINTS.kitsuneApi) {
      placeholder('film', 'MKissa is unavailable', 'The MKissa server is not connected yet. Use Instant play or another available source.');
      render(panel, html`<div class="notice" role="status">MKissa needs a server operated by NullxAnime; there is no link for you to enter. <button class="btn sm" id="use-instant">Use Instant play</button></div>`);
      $('#use-instant', panel)?.addEventListener('click', () => select(tabs.find((tab) => tab.id === 'instant') || defaultTab));
      return;
    }
    placeholder('film', preferredProvider ? 'MKissa anime' : 'More servers', 'Looking up this episode.');
    render(panel, html`<form id="kitsune-load" class="mine-form glass"><div><b>${preferredProvider ? 'MKissa anime' : 'Kitsune-compatible providers'}</b><p class="muted">Availability, ads and playback depend on each provider.</p></div><label class="field">Audio<select id="kitsune-audio" class="select"><option value="sub" ${getSettings().kitsuneAudio !== 'dub' ? 'selected' : ''}>Sub</option><option value="dub" ${getSettings().kitsuneAudio === 'dub' ? 'selected' : ''}>Dub</option></select></label><button class="btn primary">Find episode ${ep} servers</button><div id="kitsune-results" aria-live="polite"></div></form>`);
    const controller = sourceController;
    const current = () => ctx.alive() && active.kind === 'kitsune' && !controller.signal.aborted;
    let serial = 0, choices = [], base = '';
    const loadProvider = async () => {
      const task = ++serial;
      const choice = choices[Number($('#kitsune-provider', panel)?.value)];
      if (!choice) return;
      try {
        placeholder('film', choice.name, 'Loading mirrors…');
        render($('#kitsune-streams', panel), html`<p class="muted">Loading mirrors…</p>`);
        const data = await kitsuneWatch(base, choice.path, controller.signal);
        if (!current() || task !== serial) return;
        const streams = kitsuneStreams(data).filter((s) => new URL(s.url).origin !== location.origin);
        if (!streams.length) throw new Error('No playable mirrors were returned. Try another provider.');
        render($('#kitsune-streams', panel), html`<label class="field">Mirror<select id="kitsune-mirror" class="select">${streams.map((s, i) => html`<option value="${i}">${s.server} · ${s.quality} · ${s.format}</option>`)}</select></label><p class="muted">Mirrors may block embedding or contain ads. Switch mirrors if playback fails.</p><div id="kitsune-open"></div>`);
        const play = () => {
          const source = streams[Number($('#kitsune-mirror', panel).value)];
          if (source.format === 'embed') mountEmbed(source.url, `${item.title} — ${source.server}`, true);
          else mountPlayer({ src: kitsuneProxy(base, source), subtitle: source.subtitle ? kitsuneProxy(base, { url: source.subtitle, referer: source.referer }) : undefined, format: source.format === 'hls' ? 'hls' : undefined, crossOrigin: true, label: item.title, poster: item.cover, autoplay: true });
          render($('#kitsune-open', panel), html`<a href="${source.url}" target="_blank" rel="noopener noreferrer">Open selected mirror ${icon('ext')}</a>`);
        };
        $('#kitsune-mirror', panel).addEventListener('change', play); play();
      } catch (error) { if (current() && task === serial && error.name !== 'AbortError') { placeholder('film', 'Mirror unavailable', 'Try another provider.'); render($('#kitsune-streams', panel), html`<p role="alert">${error.message}</p>`); } }
    };
    const load = async (event) => {
      event.preventDefault();
      const task = ++serial;
      try {
        base = baseUrl(PROVIDER_ENDPOINTS.kitsuneApi);
        const audio = $('#kitsune-audio', panel).value;
        setSetting('kitsuneAudio', audio);
        render($('#kitsune-results', panel), html`<p class="muted">Finding available providers…</p>`);
        const data = await kitsuneEpisodes(base, id, controller.signal, preferredProvider);
        if (!current() || task !== serial) return;
        choices = kitsuneChoices(data, id, ep, audio);
        if (preferredProvider) choices = choices.filter((choice) => choice.name === preferredProvider);
        if (!choices.length) {
          if (preferredProvider && data[preferredProvider]?.error) {
            const message = String(data[preferredProvider].error);
            if (/\bcaptcha\b/i.test(message)) throw new Error('MKissa requires a security check. Complete it with the provider and try again, or use another source.');
            throw new Error(`MKissa is unavailable: ${message.slice(0, 160)}`);
          }
          throw new Error('No providers reported this episode and audio. Try another audio or Instant play.');
        }
        render($('#kitsune-results', panel), html`<label class="field">Provider<select class="select" id="kitsune-provider">${choices.map((choice, i) => html`<option value="${i}">${choice.name}</option>`)}</select></label><div id="kitsune-streams" aria-live="polite"></div>`);
        $('#kitsune-provider', panel).addEventListener('change', loadProvider);
        await loadProvider();
      } catch (error) { if (current() && task === serial && error.name !== 'AbortError') render($('#kitsune-results', panel), html`<p role="alert">${error.message}</p>`); }
    };
    $('#kitsune-load', panel).addEventListener('submit', load);
    $('#kitsune-load', panel).requestSubmit();
  }
  function senshiView() {
    placeholder('film', 'Senshi mirrors', 'Load available mirrors for this episode.');
    render(panel, html`${deploymentResults()}<form id="senshi-load" class="mine-form glass"><div><b>Senshi mirrors</b><p class="muted">Uses the title’s MyAnimeList ID. External mirrors may show ads or block embedding. Server availability varies.</p></div><label class="field">Audio<select class="select" id="senshi-audio"><option value="sub">Sub</option><option value="dub">Dub</option></select></label><button class="btn primary" ${m.idMal ? '' : 'disabled'}>Load episode ${ep} servers</button>${m.idMal ? '' : html`<p role="alert">No MyAnimeList ID is available for this title.</p>`}<div id="senshi-streams" aria-live="polite"></div></form>`);
    const controller = sourceController;
    const current = () => ctx.alive() && active.kind === 'senshi' && !controller.signal.aborted;
    let serial = 0;
    const load = async (event) => {
      event.preventDefault();
      const task = ++serial;
      try {
        if (!m.idMal) throw new Error('This title has no MyAnimeList ID.');
        const base = baseUrl(PROVIDER_ENDPOINTS.streamWorker);
        render($('#senshi-streams', panel), html`<p class="muted">Finding mirrors…</p>`);
        const data = await senshiWatch(base, m.idMal, ep, $('#senshi-audio', panel).value, controller.signal);
        if (!current() || task !== serial) return;
        const streams = (Array.isArray(data.streams) ? data.streams : []).filter((s) => {
          const u = safeUrl(s.url);
          if (!u || !['embed', 'video', 'hls'].includes(s.type)) return false;
          const target = new URL(u), host = target.hostname.toLowerCase();
          return target.protocol === 'https:' && !target.username && !target.password && !target.port && target.origin !== location.origin && !host.includes(':') && !/^[\d.]+$/.test(host) && host.includes('.') && !/(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(host);
        }).slice(0, 50);
        if (!streams.length) throw new Error('No mirrors found for this episode and audio.');
        render($('#senshi-streams', panel), html`<label class="field">Server<select id="senshi-server" class="select">${streams.map((s, i) => html`<option value="${i}">${s.server || 'Mirror'} · ${s.type}</option>`)}</select></label><p class="muted">If a mirror fails, choose another. Mirrors control their own ads and playback.</p><p id="senshi-open"></p>`);
        const play = () => {
          const source = streams[Number($('#senshi-server', panel).value)];
          if (source.type === 'embed') mountEmbed(source.url, `${item.title} — ${source.server}`, true);
          else mountPlayer({ src: source.url, format: source.type === 'hls' ? 'hls' : undefined, crossOrigin: true, label: item.title, poster: item.cover, autoplay: true });
          render($('#senshi-open', panel), html`<a href="${source.url}" target="_blank" rel="noopener noreferrer">Open selected mirror ${icon('ext')}</a>`);
        };
        $('#senshi-server', panel).addEventListener('change', play); play();
      } catch (error) { if (current() && task === serial && error.name !== 'AbortError') render($('#senshi-streams', panel), html`<p role="alert">${error.message}</p>`); }
    };
    $('#senshi-load', panel).addEventListener('submit', load);
    if (m.idMal) $('#senshi-load', panel).requestSubmit();
  }
  function animeggView() {
    placeholder('film', 'AnimeGG', 'Search for this title.');
    render(panel, html`${deploymentResults()}<form id="animegg-search" class="mine-form glass"><label class="field">Title<input class="input" id="animegg-query" value="${item.title}" required minlength="3" maxlength="150"></label><button class="btn primary">${icon('search')} Search provider</button><p class="muted">Select the exact series and season.</p></form>`);
    const controller = sourceController;
    const current = () => ctx.alive() && active.kind === 'animegg' && !controller.signal.aborted;
    let serial = 0;
    const search = async (event) => {
      event.preventDefault();
      const task = ++serial;
      try {
        const base = baseUrl(PROVIDER_ENDPOINTS.streamWorker);
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
      } catch (error) { if (current() && task === serial && error.name !== 'AbortError') { placeholder('film', 'Search unavailable', 'Try another source or try again later.'); deploymentError(error); } }
    };
    $('#animegg-search', panel).addEventListener('submit', search);
    $('#animegg-search', panel).requestSubmit();
  }
  function anipubView() {
    placeholder('film', 'AniPub', 'Search the AniPub catalogue and select the matching title.');
    render(panel, html`${deploymentResults()}<form id="anipub-search" class="mine-form glass"><label class="field">Title<input class="input" id="anipub-query" value="${item.title}" required></label><button class="btn">${icon('search')} Search AniPub</button></form>`);
    const controller = sourceController;
    const current = () => ctx.alive() && active.kind === 'anipub' && !controller.signal.aborted;
    let lookupSerial = 0;
    const search = async (event) => {
      event.preventDefault();
      const lookup = ++lookupSerial;
      try {
        const base = baseUrl(PROVIDER_ENDPOINTS.aniPub);
        render($('#deployment-results', panel), html`<p class="muted">Searching AniPub…</p>`);
        const results = await anipubSearch(base, $('#anipub-query', panel).value, controller.signal);
        if (!current() || lookup !== lookupSerial) return;
        if (!results.length) throw new Error('No matching titles found. Try another title.');
        render($('#deployment-results', panel), html`<label class="field">Choose the matching title<select class="select" id="anipub-title">${results.map((r) => html`<option value="${r.Id}">${r.Name}</option>`)}</select></label><label class="field">Audio<select class="select" id="anipub-audio"><option value="sub">Sub</option><option value="dub">Dub</option></select></label><button class="btn primary" id="anipub-play">${icon('play')} Open episode ${ep}</button><div id="anipub-link"></div>`);
        $('#anipub-play', panel).addEventListener('click', () => playAniPub(base, $('#anipub-title', panel).value, $('#anipub-audio', panel).value, $('#anipub-link', panel)));

      } catch (error) { if (current() && lookup === lookupSerial) deploymentError(error); }
    };
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
        if (!res.length) { render(box, html`<div class="empty" style="padding:30px 10px"><h3>Nothing in the open library for “${text}”</h3><p>Most anime is commercially licensed, so it will not appear here. Try another source, or <a href="#/free" style="color:var(--accent)">browse the free library</a>.</p></div>`); return; }
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
  $('#episode-search')?.addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase(); let visible = 0;
    $$('.ep-row', ctx.el).forEach((row) => {
      const match = !query || row.dataset.ep === query || row.querySelector('.t').textContent.toLowerCase().includes(query);
      row.hidden = !match; if (match) visible++;
    });
    $('#episode-results').textContent = query ? `${visible} episode${visible === 1 ? '' : 's'} found` : '';
  });
  $('#copy-episode').addEventListener('click', async () => {
    try { await copyText(location.href); toast('Episode link copied'); }
    catch { toast('Could not copy the link', 'err'); }
  });
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
