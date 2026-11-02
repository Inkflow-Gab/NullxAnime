import { currentDevice, useLightweightEffects } from './ui/device.js';

// Local-first persistence. Everything lives in the browser's localStorage under the `nx:` prefix,
// so there are no accounts, no captcha and no server. Export / import JSON from Settings.

const P = 'nx:';
const listeners = new Set();

function read(key, fallback) {
  try { const v = localStorage.getItem(P + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(P + key, JSON.stringify(value)); } catch (e) { console.warn('storage full?', e); }
}
function emit(kind, detail) { listeners.forEach((fn) => { try { fn(kind, detail); } catch (e) { console.error(e); } }); }
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/* ---------------- Settings -------------------------------------------------- */
export const DEFAULT_SETTINGS = {
  theme: 'dark',          // dark | oled | light
  accent: 'violet',
  titleLang: 'romaji',    // romaji | english | native
  mangaLang: 'en',
  readerMode: 'vertical', // vertical | ltr | rtl
  readerFit: 'width',     // width | height | original
  readerDataSaver: false,
  autoNext: true,
  instantAudio: 'sub',
  kitsuneAudio: 'sub',
  autoplay: true,
  reduceMotion: false,
  performanceMode: 'auto', // auto | on | off
  showCountdown: true,
  tvMode: null,           // null = auto; true / false = manual override
};
let settings = { ...DEFAULT_SETTINGS, ...read('settings', {}) };
export const getSettings = () => settings;
export function setSetting(key, value) {
  settings = { ...settings, [key]: value };
  write('settings', settings);
  applySettings();
  emit('settings', { key, value });
}
export function applySettings() {
  const r = document.documentElement;
  r.dataset.theme = settings.theme;
  r.dataset.accent = settings.accent;
  const device = currentDevice();
  r.dataset.device = device;
  const lightweight = settings.performanceMode === 'on' || (settings.performanceMode !== 'off' && useLightweightEffects({ device, memory: navigator.deviceMemory, saveData: navigator.connection?.saveData }));
  r.dataset.performance = lightweight ? 'on' : 'off';
  r.dataset.tvMode = (settings.tvMode == null ? device === 'tv' : settings.tvMode === true) ? 'on' : 'off';
  r.classList.toggle('reduce-motion', !!settings.reduceMotion);
  const tc = { dark: '#0b0b12', oled: '#000000', light: '#f4f4fa' }[settings.theme] || '#0b0b12';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tc);
}

/* ---------------- Library (the tracker) --------------------------------------- */
// entry = { type: 'anime'|'manga', id, title, cover, status, progress, total, score, notes, format, addedAt, updatedAt }
export const STATUSES = ['current', 'planning', 'completed', 'paused', 'dropped'];
export const statusLabel = (status, type) => ({
  current: type === 'manga' ? 'Reading' : 'Watching',
  planning: type === 'manga' ? 'Plan to read' : 'Plan to watch',
  completed: 'Completed',
  paused: 'On hold',
  dropped: 'Dropped',
}[status] || status);

let library = read('library', {});
const libKey = (type, id) => `${type}:${id}`;
export const getEntry = (type, id) => library[libKey(type, id)] || null;
export const allEntries = (type) => Object.values(library).filter((e) => !type || e.type === type);
export function saveEntry(type, id, patch, base = {}) {
  const k = libKey(type, id);
  const prev = library[k];
  const now = Date.now();
  const next = {
    type, id: String(id), title: '', cover: '', status: 'planning', progress: 0, total: null, score: 0, notes: '', format: '',
    addedAt: now, ...base, ...prev, ...patch, updatedAt: now,
  };
  if (next.total && next.progress >= next.total && next.status === 'current') next.status = 'completed';
  library[k] = next;
  write('library', library);
  emit('library', { type, id, entry: next });
  return next;
}
export function removeEntry(type, id) {
  delete library[libKey(type, id)];
  write('library', library);
  emit('library', { type, id, entry: null });
}

/* ---------------- Watch / read history ------------------------------------------ */
// item = { type, id, title, cover, ep|chapterId, label, at, pos, dur }
let history = read('history', []);
export const getHistory = (type) => history.filter((h) => !type || h.type === type);
export function pushHistory(item) {
  history = history.filter((h) => !(h.type === item.type && String(h.id) === String(item.id)));
  history.unshift({ ...item, at: Date.now() });
  history = history.slice(0, 60);
  write('history', history);
  emit('history', item);
}
export function removeHistory(type, id) {
  history = history.filter((h) => !(h.type === type && String(h.id) === String(id)));
  write('history', history);
  emit('history', null);
}
export const lastHistory = (type, id) => history.find((h) => h.type === type && String(h.id) === String(id)) || null;

/* ---------------- Watched episodes / read chapters ------------------------------- */
let marks = read('marks', {}); // { 'anime:123': [1,2,3], 'manga:uuid': ['chapterId',...] }
export const getMarks = (type, id) => new Set(marks[libKey(type, id)] || []);
export function toggleMark(type, id, value, force) {
  const k = libKey(type, id);
  const set = new Set(marks[k] || []);
  const has = set.has(value);
  const want = force == null ? !has : force;
  if (want) set.add(value); else set.delete(value);
  marks[k] = Array.from(set);
  write('marks', marks);
  emit('marks', { type, id, value, on: want });
  return want;
}
export function setMarks(type, id, values) {
  marks[libKey(type, id)] = Array.from(values);
  write('marks', marks);
  emit('marks', { type, id });
}

/* ---------------- Player positions ----------------------------------------------- */
let positions = read('positions', {});
export const getPos = (key) => positions[key] || null;
export function setPos(key, pos, dur) {
  positions[key] = { pos: Math.floor(pos), dur: Math.floor(dur || 0), at: Date.now() };
  const keys = Object.keys(positions);
  if (keys.length > 300) {
    keys.sort((a, b) => positions[a].at - positions[b].at).slice(0, keys.length - 300).forEach((k) => delete positions[k]);
  }
  write('positions', positions);
}

/* ---------------- "My links": per-episode personal sources ------------------------ */
let myLinks = read('mylinks', {});
export const getMyLink = (id, ep) => myLinks[`${id}:${ep}`] || null;
export function setMyLink(id, ep, data) {
  if (data) myLinks[`${id}:${ep}`] = data; else delete myLinks[`${id}:${ep}`];
  write('mylinks', myLinks);
  emit('mylinks', { id, ep });
}

/* ---------------- Search history --------------------------------------------------- */
let searches = read('searches', []);
export const getSearches = () => searches;
export function pushSearch(q) {
  q = q.trim(); if (!q) return;
  searches = [q, ...searches.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  write('searches', searches);
}
export function clearSearches() { searches = []; write('searches', searches); }

/* ---------------- Backup ------------------------------------------------------------- */
const BACKUP_KEYS = ['settings', 'library', 'history', 'marks', 'positions', 'mylinks', 'searches'];
export function exportAll() {
  const data = { app: 'NullxAnime', version: 1, exportedAt: new Date().toISOString() };
  for (const k of BACKUP_KEYS) data[k] = read(k, null);
  return data;
}
export function importAll(data, { merge = true } = {}) {
  if (!data || data.app !== 'NullxAnime') throw new Error('This file is not a NullxAnime backup.');
  if (data.settings) { settings = { ...DEFAULT_SETTINGS, ...data.settings }; write('settings', settings); applySettings(); }
  if (data.library) { library = merge ? { ...library, ...data.library } : data.library; write('library', library); }
  if (data.history) { history = merge ? [...data.history, ...history].slice(0, 60) : data.history; write('history', history); }
  if (data.marks) {
    if (merge) for (const [k, v] of Object.entries(data.marks)) marks[k] = Array.from(new Set([...(marks[k] || []), ...v]));
    else marks = data.marks;
    write('marks', marks);
  }
  if (data.positions) { positions = merge ? { ...positions, ...data.positions } : data.positions; write('positions', positions); }
  if (data.mylinks) { myLinks = merge ? { ...myLinks, ...data.mylinks } : data.mylinks; write('mylinks', myLinks); }
  emit('import', null);
}
export function wipeAll() {
  for (const k of BACKUP_KEYS) { try { localStorage.removeItem(P + k); } catch {} }
  settings = { ...DEFAULT_SETTINGS }; library = {}; history = []; marks = {}; positions = {}; myLinks = {}; searches = [];
  applySettings();
  emit('import', null);
}
