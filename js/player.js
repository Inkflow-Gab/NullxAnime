// Lightweight custom video player (MP4 / WebM / HLS) with keyboard control, speed, quality, captions, PiP.
// Used for the Internet Archive library and for the user's own links / local files.

import { html, esc, fmtClock, clamp, $, $$ } from './util.js';
import { icon } from './ui/icons.js';

let hlsPromise;
export function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  hlsPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/hls.min.js', import.meta.url).href;
    s.onload = () => resolve(window.Hls);
    s.onerror = () => reject(new Error('Could not load the HLS engine.'));
    document.head.appendChild(s);
  });
  return hlsPromise;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const isHls = (u) => /\.m3u8(\?|#|$)/i.test(u);

/** Convert an SRT file's text to WebVTT. */
export function srtToVtt(srt) {
  return 'WEBVTT\n\n' + srt.replace(/\r+/g, '').replace(/(\d+:\d+:\d+),(\d+)/g, '$1.$2').trim();
}

export function createPlayer(host, opts = {}) {
  const { src, poster, subtitle, format, startAt = 0, onProgress, onEnded, onError, autoplay = false, label = '' } = opts;
  host.innerHTML = html`<div class="vp" tabindex="0" aria-label="${label || 'Video player'}">
    <video playsinline preload="metadata" ${poster ? html`poster="${poster}"` : ''}></video>
    <div class="vp-center"><button class="vp-bigplay" aria-label="Play">${icon('play')}</button><div class="spinner vp-spin" hidden></div></div>
    <div class="vp-msg" hidden></div>
    <div class="vp-controls">
      <div class="vp-seek"><div class="vp-buf"></div><input type="range" class="vp-range" min="0" max="1000" value="0" step="1" aria-label="Seek"><span class="vp-tip" hidden></span></div>
      <div class="vp-row">
        <button data-c="play" aria-label="Play / pause">${icon('play')}</button>
        <button data-c="back" aria-label="Back 10 seconds" title="-10s (J)">${icon('rewind')}</button>
        <button data-c="fwd" aria-label="Forward 10 seconds" title="+10s (L)">${icon('forward')}</button>
        <div class="vp-vol"><button data-c="mute" aria-label="Mute">${icon('volume')}</button><input type="range" class="vp-volrange" min="0" max="1" step="0.02" value="1" aria-label="Volume"></div>
        <span class="vp-time">0:00 / 0:00</span>
        <span class="spacer"></span>
        <button data-c="cc" class="vp-txt" hidden aria-label="Subtitles">CC</button>
        <button data-c="quality" class="vp-txt" hidden aria-label="Quality">Auto</button>
        <button data-c="speed" class="vp-txt" aria-label="Playback speed">1×</button>
        <button data-c="pip" aria-label="Picture in picture" title="Picture in picture">${icon('pip')}</button>
        <button data-c="full" aria-label="Fullscreen" title="Fullscreen (F)">${icon('fullscreen')}</button>
      </div>
    </div></div>`.toString();

  const root = $('.vp', host);
  const v = $('video', root);
  const range = $('.vp-range', root), volRange = $('.vp-volrange', root), time = $('.vp-time', root);
  const buf = $('.vp-buf', root), spin = $('.vp-spin', root), msg = $('.vp-msg', root), big = $('.vp-bigplay', root);
  const btn = (n) => $(`[data-c="${n}"]`, root);
  let hls = null, hideT, lastSave = 0, destroyed = false, seeking = false, levels = [], levelIdx = -1, speedI = 2;
  const blobs = [];

  const vol = Number(localStorage.getItem('nx:vol') ?? 1);
  v.volume = isNaN(vol) ? 1 : vol; volRange.value = v.volume;
  v.muted = localStorage.getItem('nx:muted') === '1';

  const setIcon = (b, name) => { b.innerHTML = icon(name).toString(); };
  const showMsg = (t) => { msg.hidden = !t; msg.textContent = t || ''; };
  const fail = (text) => { spin.hidden = true; showMsg(text); onError?.(text); };

  /* ----- source ----- */
  (async () => {
    try {
      if (format === 'hls' || isHls(src)) {
        if (v.canPlayType('application/vnd.apple.mpegurl')) v.src = src;
        else {
          const Hls = await loadHls();
          if (destroyed) return;
          if (!Hls.isSupported()) throw new Error('This browser cannot play HLS streams.');
          hls = new Hls({ maxBufferLength: 40, enableWorker: true });
          hls.loadSource(src); hls.attachMedia(v);
          hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
            levels = d.levels.map((l, i) => ({ i, h: l.height })).filter((l) => l.h).sort((a, b) => b.h - a.h);
            if (levels.length > 1) btn('quality').hidden = false;
          });
          hls.on(Hls.Events.ERROR, (_, d) => {
            if (!d.fatal) return;
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR) fail('Network error — the stream may be blocked or expired.');
            else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else fail('This stream could not be played.');
          });
        }
      } else v.src = src;
      if (subtitle) await addSubtitle(subtitle);
      if (autoplay) v.play().catch(() => {});
    } catch (e) { fail(e.message); }
  })();

  async function addSubtitle(url) {
    let href = url;
    if (/\.srt(\?|#|$)/i.test(url)) {
      try { const t = await (await fetch(url)).text(); const b = URL.createObjectURL(new Blob([srtToVtt(t)], { type: 'text/vtt' })); blobs.push(b); href = b; } catch { return; }
    }
    const tr = document.createElement('track');
    tr.kind = 'subtitles'; tr.label = 'Subtitles'; tr.srclang = 'en'; tr.src = href; tr.default = true;
    v.appendChild(tr);
    btn('cc').hidden = false;
    btn('cc').classList.add('on');
  }

  /* ----- state ----- */
  const paint = () => {
    const d = v.duration || 0, t = v.currentTime || 0;
    if (!seeking && d) range.value = (t / d) * 1000;
    range.style.setProperty('--p', `${d ? (t / d) * 100 : 0}%`);
    time.textContent = `${fmtClock(t)} / ${fmtClock(d)}`;
    if (v.buffered.length && d) buf.style.width = `${(v.buffered.end(v.buffered.length - 1) / d) * 100}%`;
  };
  const playing = () => !v.paused && !v.ended;
  const syncPlay = () => {
    const p = playing();
    setIcon(btn('play'), p ? 'pause' : 'play');
    root.classList.toggle('playing', p);
    big.hidden = p;
    if (p) bumpControls(); else { root.classList.add('show'); }
  };
  v.addEventListener('loadedmetadata', () => { if (startAt > 5 && startAt < v.duration - 15) v.currentTime = startAt; paint(); });
  v.addEventListener('timeupdate', () => {
    paint();
    if (Date.now() - lastSave > 5000 && v.duration) { lastSave = Date.now(); onProgress?.(v.currentTime, v.duration); }
  });
  v.addEventListener('progress', paint);
  v.addEventListener('play', syncPlay); v.addEventListener('pause', () => { syncPlay(); if (v.duration) onProgress?.(v.currentTime, v.duration); });
  v.addEventListener('ended', () => { syncPlay(); onProgress?.(v.duration, v.duration); onEnded?.(); });
  v.addEventListener('waiting', () => { spin.hidden = false; });
  v.addEventListener('playing', () => { spin.hidden = true; showMsg(''); });
  v.addEventListener('canplay', () => { spin.hidden = true; });
  v.addEventListener('error', () => {
    if (hls) return;
    fail(v.error?.code === 4 ? 'This file or format can’t be played (it may be blocked from other websites).' : 'Playback error.');
  });
  v.addEventListener('volumechange', () => {
    setIcon(btn('mute'), v.muted || v.volume === 0 ? 'mute' : 'volume');
    volRange.value = v.muted ? 0 : v.volume;
    localStorage.setItem('nx:vol', String(v.volume)); localStorage.setItem('nx:muted', v.muted ? '1' : '0');
  });

  /* ----- controls ----- */
  const toggle = () => (v.paused ? v.play().catch(() => {}) : v.pause());
  const skip = (s) => { v.currentTime = clamp(v.currentTime + s, 0, v.duration || 1e9); bumpControls(); };
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else (root.requestFullscreen || root.webkitRequestFullscreen)?.call(root);
  };
  const bumpControls = () => {
    root.classList.add('show'); clearTimeout(hideT);
    if (playing()) hideT = setTimeout(() => root.classList.remove('show'), 2600);
  };
  big.addEventListener('click', toggle);
  v.addEventListener('click', toggle);
  v.addEventListener('dblclick', fullscreen);
  root.addEventListener('mousemove', bumpControls);
  root.addEventListener('touchstart', bumpControls, { passive: true });
  root.addEventListener('mouseleave', () => { if (playing()) root.classList.remove('show'); });
  range.addEventListener('input', () => { seeking = true; if (v.duration) { v.currentTime = (range.value / 1000) * v.duration; paint(); } });
  range.addEventListener('change', () => { seeking = false; });
  volRange.addEventListener('input', () => { v.muted = false; v.volume = Number(volRange.value); });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const c = b.dataset.c;
    if (c === 'play') toggle();
    else if (c === 'back') skip(-10);
    else if (c === 'fwd') skip(10);
    else if (c === 'mute') v.muted = !v.muted;
    else if (c === 'full') fullscreen();
    else if (c === 'pip') { if (document.pictureInPictureElement) document.exitPictureInPicture(); else v.requestPictureInPicture?.().catch(() => {}); }
    else if (c === 'speed') { speedI = (speedI + 1) % SPEEDS.length; v.playbackRate = SPEEDS[speedI]; b.textContent = `${SPEEDS[speedI]}×`; }
    else if (c === 'cc') { const t = v.textTracks[0]; if (t) { t.mode = t.mode === 'showing' ? 'hidden' : 'showing'; b.classList.toggle('on', t.mode === 'showing'); } }
    else if (c === 'quality' && hls) {
      const order = [-1, ...levels.map((l) => l.i)];
      levelIdx = order[(order.indexOf(levelIdx) + 1) % order.length];
      hls.currentLevel = levelIdx;
      b.textContent = levelIdx === -1 ? 'Auto' : `${levels.find((l) => l.i === levelIdx).h}p`;
    }
  });
  if (!document.pictureInPictureEnabled) btn('pip').hidden = true;
  root.addEventListener('fullscreenchange', () => root.classList.toggle('is-full', document.fullscreenElement === root));
  document.addEventListener('fullscreenchange', () => root.classList.toggle('is-full', document.fullscreenElement === root));

  /* keyboard — active when the player (or page body) has focus */
  const onKey = (e) => {
    const t = e.target;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.classList.contains('vp-range') && !t.classList.contains('vp-volrange')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.getElementById('palette') || document.getElementById('shortcuts')) return;
    const k = e.key.toLowerCase();
    let used = true;
    if (k === ' ' || k === 'k') toggle();
    else if (k === 'arrowleft') skip(-5);
    else if (k === 'arrowright') skip(5);
    else if (k === 'j') skip(-10);
    else if (k === 'l') skip(10);
    else if (k === 'arrowup') { v.volume = clamp(v.volume + 0.05, 0, 1); }
    else if (k === 'arrowdown') { v.volume = clamp(v.volume - 0.05, 0, 1); }
    else if (k === 'm') v.muted = !v.muted;
    else if (k === 'f') fullscreen();
    else if (k >= '0' && k <= '9' && v.duration) v.currentTime = (Number(k) / 10) * v.duration;
    else used = false;
    if (used) { e.preventDefault(); bumpControls(); }
  };
  document.addEventListener('keydown', onKey);

  syncPlay(); root.classList.add('show');

  return {
    video: v,
    destroy() {
      destroyed = true;
      clearTimeout(hideT);
      document.removeEventListener('keydown', onKey);
      if (v.duration) onProgress?.(v.currentTime, v.duration);
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
      hls?.destroy();
      blobs.forEach((b) => URL.revokeObjectURL(b));
      if (document.fullscreenElement === root) document.exitFullscreen?.();
    },
  };
}
