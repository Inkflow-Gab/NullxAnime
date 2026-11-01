// Watch page — plays whatever the provider registry in js/providers.js resolves:
// your own stream / URL template, the Internet Archive open library, or any
// provider you register. Nothing is embedded from YouTube and nothing bounces
// you out to Crunchyroll/Netflix.

import { html, render, $, $$, on, safeUrl, hostOf, clamp } from '../util.js';
import { icon } from '../ui/icons.js';
import { mediaDetail } from '../api/anilist.js';
import { searchOpenVideo, itemFiles, archiveUrl } from '../api/archive.js';
import { createPlayer } from '../player.js';
import { fromAnime, titleOf, toast, errorBox, skelRail, PLACEHOLDER } from '../ui/components.js';
import { episodeCount, episodeLinkMap } from '../sources.js';
import { resolveSources, getSourceConfig, setSourceConfig, expandTemplate } from '../providers.js';
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
  const tabs = [
    { id: 'sources', kind: 'sources', label: 'Streaming sources', note: 'Provider streams, played here' },
    { id: 'library', kind: 'library', label: 'Free library', note: 'Public-domain & Creative Commons (Internet Archive)' },
    { id: 'mine', kind: 'mine', label: 'My link / file', note: 'Play your own video' },
  ];
  let active = tabs.find((t) => t.id === ctx.query.src) || tabs[0];
  const defaultTab = active;
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

  const paintTabs = () => render($('#tabs'), tabs.map((t) => html`<button role="tab" class="chip ${t.id === active.id ? 'active' : ''}" data-src="${t.id}" title="${t.note || ''}">${t.kind === 'sources' ? icon('play') : t.kind === 'library' ? icon('film') : icon('link')} ${t.label}</button>`));

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
  const goNext = () => { if (ep < count) go(`/watch/${id}/${ep + 1}`); };
  const onEnded = () => { markWatched(true); if (getSettings().autoNext) setTimeout(goNext, 1200); };

  /* ---------- stage rendering ---------- */
  function mountPlayer({ src, subtitle, subtitles, label, poster, autoplay = false }) {
    killPlayer();
    stage.className = 'stage';
    player = createPlayer(stage, {
      src, subtitle, subtitles, poster, label, autoplay,
      startAt: getPos(posKey)?.pos || 0,
      onProgress: (pos, dur) => { setPos(posKey, pos, dur); if (dur && pos / dur > 0.9) toggleMark('anime', id, ep, true); },
      onEnded,
    });
  }
  function placeholder(iconName, title, text) {
    killPlayer();
    stage.className = 'stage placeholder';
    render(stage, html`<div class="stage-msg">${icon(iconName)}<h3>${title}</h3><p>${text}</p></div>`);
  }

  async function select(tab) {
    active = tab;
    paintTabs();
    render(panel, '');
    history.replaceState(null, '', `#/watch/${id}/${ep}${tab.id !== defaultTab.id ? `?src=${tab.id}` : ''}`);
    if (tab.kind === 'sources') sourcesView();
    else if (tab.kind === 'library') libraryView();
    else if (tab.kind === 'mine') mineView();
  }

  /* ----- Streaming sources (provider registry) ----- */
  const sourceCtx = () => ({ media: m, item, ep, count, title: item.title, id, idMal: m.idMal });
  let sourceItems = [];

  function sourcesView(autoplayFirst = false) {
    killPlayer();
    stage.className = 'stage placeholder';
    render(stage, html`<div class="stage-msg">${icon('play')}<h3>${item.title}</h3><p>${epLabel} — choose a source below</p></div>`);
    render(panel, html`<div id="srcbox"><div class="center-load"><div class="spinner"></div></div></div>`);
    paintSources(autoplayFirst);
  }

  async function paintSources(autoplayFirst = false) {
    const cfg = getSourceConfig('direct', id);
    const groups = await resolveSources(sourceCtx());
    const box = $('#srcbox');
    if (!ctx.alive() || !box) return;
    sourceItems = groups.flatMap((g) => g.items);
    const cards = groups.map((g) => html`<div class="src-group glass">
      <div class="src-head"><b>${g.provider.label}</b><small class="muted">${g.provider.note || ''}</small></div>
      ${g.error ? html`<p class="muted" style="font-size:13px">${g.error}</p>` : ''}
      ${g.items.length ? html`<div class="src-list">${g.items.map((it) => {
        const i = sourceItems.indexOf(it);
        return html`<div class="src-row" data-play="${i}" role="button" tabindex="0"><span class="src-play">${icon('play')}</span>
          <span class="src-body"><b>${it.label}</b><small class="muted">${[it.type === 'hls' ? 'HLS stream' : 'Video', it.quality, it.note].filter(Boolean).join(' · ')}</small></span>
          ${it.page ? html`<a class="src-ext" href="${it.page}" target="_blank" rel="noopener noreferrer" title="Open the source page">${icon('ext')}</a>` : ''}</div>`;
      })}</div>` : html`<p class="muted" style="font-size:13px">${g.provider.id === 'direct' ? 'No link saved yet — paste one above.' : 'Nothing found for this title.'}</p>`}
    </div>`);

    render(box, html`
      <form class="glass src-form" id="srcform">
        <div class="src-head"><b>My stream</b><small class="muted">A video or HLS link you are allowed to use — a URL template plays every episode</small></div>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <label class="field" style="flex:1;min-width:240px">Stream URL or template
            <input class="input" id="srctpl" placeholder="https://cdn.example.com/anime/{id}/{ep}.m3u8" value="${cfg?.template || ''}"></label>
          <label class="field" style="flex:1;min-width:200px">Subtitles (.vtt, optional)
            <input class="input" id="srcsub" type="url" placeholder="https://…/ep{ep0}.vtt" value="${cfg?.subtitle || ''}"></label>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:8px">
          <button class="btn primary" type="submit">${icon('play')} Save &amp; play</button>
          <button class="btn" type="button" id="srcquick">${icon('play')} Play once</button>
          <button class="btn ghost" type="button" id="srcdef">${icon('check')} Use for every title</button>
          ${cfg ? html`<button class="btn danger" type="button" id="srcdel">${icon('trash')} Forget</button>` : ''}
          <span class="spacer"></span>
          <span class="muted" style="font-size:12px">Tokens: <code>{id}</code> <code>{idMal}</code> <code>{ep}</code> <code>{ep0}</code> <code>{title}</code> <code>{slug}</code></span>
        </div>
      </form>
      ${cards.length ? cards : html`<div class="empty" style="padding:26px 10px"><h3>No provider returned a stream</h3><p>Paste a link above, or register your own provider — see <code>docs/PROVIDERS.md</code>.</p></div>`}
      ${cfg ? html`<div class="notice">${icon('info')}<div>Sources are resolved in your browser by <code>js/providers.js</code> and played by the built-in HLS/MP4 player. Only add sources you have the right to use.</div></div>`
        : html`<div class="notice">${icon('info')}<div><b>Set up a source in three steps.</b> 1) Paste a video (<code>.mp4</code>/<code>.webm</code>) or HLS (<code>.m3u8</code>) link above — put <code>{ep}</code> where the episode number goes, e.g. <code>https://your-host/show/{id}/{ep}.m3u8</code>. 2) Press <b>Save &amp; play</b> (or <b>Play once</b> to try it without saving). 3) Add <b>Use for every title</b> if the same template works for your whole library. Your own files and the open library below always work.</div></div>`}`);

    bindSources();
    if (autoplayFirst && sourceItems[0]) playSource(0);
  }

  function bindSources() {
    $('#srcform')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const template = $('#srctpl').value.trim();
      const subtitle = $('#srcsub').value.trim();
      if (!template) { toast('Paste a stream link first', 'err'); return; }
      setSourceConfig('direct', id, { template, subtitle: subtitle || '' });
      paintSources(true);
    });
    $('#srcdef')?.addEventListener('click', () => {
      const template = $('#srctpl').value.trim();
      const subtitle = $('#srcsub').value.trim();
      if (!template) { toast('Paste a stream link first', 'err'); return; }
      setSourceConfig('direct', null, { template, subtitle: subtitle || '' });
      toast('Saved as the default for every title');
      paintSources();
    });
    $('#srcdel')?.addEventListener('click', () => { setSourceConfig('direct', id, null); toast('Source forgotten'); paintSources(); });
    $('#srcquick')?.addEventListener('click', () => {
      const template = $('#srctpl').value.trim();
      if (!template) { toast('Paste a stream link first', 'err'); return; }
      const src = safeUrl(expandTemplate(template, sourceCtx()));
      if (!src) { toast('That does not look like a valid http(s) link', 'err'); return; }
      mountPlayer({ src, poster: item.cover, label: hostOf(src) || 'My stream', autoplay: true });
      stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function playSource(i) {
    const it = sourceItems[i];
    if (!it) return;
    mountPlayer({
      src: it.src, poster: it.poster || item.cover, label: it.label, autoplay: true,
      subtitle: it.subtitles?.[0]?.url, subtitles: it.subtitles,
    });
    stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    placeholder('link', 'Play your own video', 'Paste a direct video link (MP4, WebM, HLS .m3u8) or pick a file from your device. Only use content you have the right to watch.');
    const saved = getMyLink(id, ep);
    render(panel, html`<form id="mineform" class="mine-form glass">
      <label class="field">Video link<input class="input" id="mineurl" type="url" placeholder="https://… .mp4 / .webm / .m3u8" value="${saved?.url || ''}"></label>
      <label class="field">Subtitles link (optional, .vtt or .srt)<input class="input" id="minesub" type="url" placeholder="https://… .vtt" value="${saved?.sub || ''}"></label>
      <div class="row"><button class="btn primary">${icon('play')} Play link</button>${saved ? html`<button type="button" class="btn danger" id="minedel">${icon('trash')} Forget link</button>` : ''}
        <span class="spacer"></span>
        <label class="btn" style="cursor:pointer">${icon('file')} Choose local file<input id="minefile" type="file" accept="video/*,.mkv,.m3u8" hidden></label>
        <label class="btn ghost" style="cursor:pointer">${icon('file')} Subtitle file<input id="minesubfile" type="file" accept=".vtt,.srt" hidden></label></div>
      <p class="muted" style="font-size:12.5px">Links are saved only in this browser, per episode. Some hosts block playback on other websites — that is the host’s choice.</p>
    </form>`);
    let subBlob = '';
    const playUrl = (url, sub) => {
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
  on(ctx.el, 'click', '[data-src]', (e, t) => select(tabs.find((x) => x.id === t.dataset.src)));
  on(ctx.el, 'click', '[data-play]', (e, t) => { if (e.target.closest('a')) return; e.preventDefault(); playSource(Number(t.dataset.play)); });
  $('#markbtn').addEventListener('click', () => { const on_ = toggleMark('anime', id, ep); if (on_) { const e = getEntry('anime', id); if (!e || ep > (e.progress || 0)) saveEntry('anime', id, { progress: ep, status: e?.status || 'current' }, { title: item.title, cover: item.cover, total: m.episodes, format: m.format }); } });
  $('#autonext').addEventListener('change', (e) => setSetting('autoNext', e.target.checked));
  $('#jump')?.addEventListener('change', (e) => { const n = clamp(parseInt(e.target.value, 10) || 1, 1, count); $(`.ep-row[data-ep="${n}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  const onKey = (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === 'n' && ep < count) go(`/watch/${id}/${ep + 1}`);
    if (e.key.toLowerCase() === 'p' && ep > 1) go(`/watch/${id}/${ep - 1}`);
  };
  document.addEventListener('keydown', onKey);
  ctx.cleanup(() => document.removeEventListener('keydown', onKey));
  ctx.cleanup(subscribe((k) => { if (k === 'marks' || k === 'import') paintEpisodes(); }));

  select(active);
}
