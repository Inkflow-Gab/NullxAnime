// Device-local progression. IDs are random installation IDs, not hardware fingerprints.
// A completion is credited only once, even if a mark is toggled off and on again.
const KEY = 'nx:profile';
const TYPES = new Set(['anime', 'manga']);
const MAX_EVENTS = 30000;
const XP = { anime: 20, manga: 10 };
const TITLE_TIERS = [
  [1, 'New Explorer', 'Page Wanderer', 'Screen Wanderer'],
  [3, 'Curious Adventurer', 'Page Seeker', 'Episode Seeker'],
  [6, 'Story Seeker', 'Chapter Voyager', 'Episode Voyager'],
  [10, 'World Traveller', 'Lore Keeper', 'Scene Keeper'],
  [15, 'Starbound Veteran', 'Ink Guardian', 'Screen Guardian'],
  [25, 'Legend of Stories', 'Master of Pages', 'Master of Episodes'],
  [40, 'Astral Archivist', 'Astral Reader', 'Astral Viewer'],
];
let memory;
if (typeof window !== 'undefined') window.addEventListener?.('storage', (event) => { if (event.key === KEY || event.key == null) memory = null; });
const safeNumber = (n) => Number.isSafeInteger(n) && n >= 0 ? n : 0;
const makeId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};
const fresh = () => ({ version: 1, id: makeId(), name: 'Explorer', earned: {}, createdAt: Date.now() });
function validKey(key) {
  if (typeof key !== 'string' || key.length > 500) return false;
  try { const parts = JSON.parse(key); return Array.isArray(parts) && parts.length === 3 && TYPES.has(parts[0]) && parts.slice(1).every((part) => typeof part === 'string' && part.length > 0 && part.length <= 200); } catch { return false; }
}
function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || !raw.earned || typeof raw.earned !== 'object' || Array.isArray(raw.earned)) return null;
  const earned = {};
  for (const [key, value] of Object.entries(raw.earned).slice(0, MAX_EVENTS)) if (validKey(key) && value === true) earned[key] = true;
  return { version: 1, id: typeof raw.id === 'string' && /^[a-z0-9-]{8,80}$/i.test(raw.id) ? raw.id : makeId(), name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 32) || 'Explorer' : 'Explorer', earned, createdAt: safeNumber(raw.createdAt) || Date.now() };
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* still available for this session */ } }
function ensure() {
  if (memory) return memory;
  try { memory = sanitize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { /* storage unavailable or malformed */ }
  if (!memory) {
    memory = fresh();
    // Existing marks become starting progress once, without a burst of level-up notices.
    try {
      const marks = JSON.parse(localStorage.getItem('nx:marks') || '{}');
      let count = 0;
      for (const [key, values] of Object.entries(marks || {})) {
        const split = key.indexOf(':'); const type = key.slice(0, split), id = key.slice(split + 1);
        if (split < 0 || !TYPES.has(type) || !Array.isArray(values)) continue;
        for (const value of values) {
          const event = eventKey(type, id, value);
          if (event && !memory.earned[event] && count < MAX_EVENTS) { memory.earned[event] = true; count++; }
        }
      }
    } catch { /* keep a fresh profile */ }
    persist();
  }
  return memory;
}
export function eventKey(type, id, value) {
  if (!TYPES.has(type) || id == null || value == null) return null;
  const key = JSON.stringify([type, String(id), String(value)]);
  return validKey(key) ? key : null;
}
// XP required for each level increases steadily; no artificial level cap.
export function xpForLevel(level) { const n = Math.max(1, Math.floor(Number(level) || 1)); return 50 * (n - 1) * n; }
export function levelForXP(xp) {
  const value = Math.max(0, Math.floor(Number(xp) || 0));
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + value / 12.5)) / 2));
}
export function titleFor(level, anime, manga) {
  let tier = TITLE_TIERS[0];
  for (const row of TITLE_TIERS) if (level >= row[0]) tier = row;
  return manga > anime * 1.5 ? tier[2] : anime > manga * 1.5 ? tier[3] : tier[1];
}
export function profileSummary(profile = ensure()) {
  let anime = 0, manga = 0;
  for (const key of Object.keys(profile.earned || {})) { try { const [type] = JSON.parse(key); if (type === 'anime') anime++; else if (type === 'manga') manga++; } catch { /* ignored */ } }
  const xp = anime * XP.anime + manga * XP.manga, level = levelForXP(xp);
  const start = xpForLevel(level), next = xpForLevel(level + 1);
  return { id: profile.id, name: profile.name, anime, manga, xp, level, start, next, progress: Math.max(0, Math.min(1, (xp - start) / (next - start))), title: titleFor(level, anime, manga) };
}
export function getProfile() { return profileSummary(); }
export function setProfileName(name) { const profile = ensure(); profile.name = String(name || '').trim().slice(0, 32) || 'Explorer'; persist(); return getProfile(); }
export function recordCompletions(type, id, values, { notify = true } = {}) {
  const profile = ensure(), before = profileSummary(profile);
  let size = Object.keys(profile.earned).length, added = 0;
  for (const value of values) {
    const key = eventKey(type, id, value);
    if (!key || profile.earned[key] || size >= MAX_EVENTS) continue;
    profile.earned[key] = true; added++; size++;
  }
  if (!added) return before;
  persist();
  const after = profileSummary(profile);
  if (notify && after.level > before.level && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nx:level-up', { detail: { level: after.level, title: after.title } }));
  return after;
}
export function exportProfile() { const p = ensure(); return { version: 1, name: p.name, earned: { ...p.earned }, createdAt: p.createdAt }; }
export function importProfile(data, { merge = true } = {}) {
  const current = ensure(), incoming = sanitize({ ...data, id: current.id });
  if (!incoming) return;
  const earned = merge ? { ...current.earned, ...incoming.earned } : incoming.earned;
  current.earned = Object.fromEntries(Object.entries(earned).slice(0, MAX_EVENTS));
  current.name = incoming.name; persist();
}
export function resetProfile() { memory = null; try { localStorage.removeItem(KEY); } catch {} }
