// Tiny two-level cache (memory + sessionStorage) with in-flight request de-duplication.
// Keeps us well under AniList / MangaDex rate limits and makes navigation feel instant.

const mem = new Map();      // key -> { v, exp }
const inflight = new Map(); // key -> Promise
const SS = 'nxc:';

function ssGet(key) {
  try {
    const raw = sessionStorage.getItem(SS + key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o;
  } catch { return null; }
}
function ssSet(key, o) {
  try { sessionStorage.setItem(SS + key, JSON.stringify(o)); }
  catch {
    // quota: drop our oldest entries and give up quietly
    try {
      Object.keys(sessionStorage).filter((k) => k.startsWith(SS)).slice(0, 12).forEach((k) => sessionStorage.removeItem(k));
    } catch {}
  }
}

export async function cached(key, ttlMs, fetcher, { persist = true } = {}) {
  const now = Date.now();
  let hit = mem.get(key);
  if (!hit && persist) { hit = ssGet(key); if (hit) mem.set(key, hit); }
  if (hit && hit.exp > now) return hit.v;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const v = await fetcher();
      const o = { v, exp: Date.now() + ttlMs };
      mem.set(key, o);
      if (persist) ssSet(key, o);
      return v;
    } catch (e) {
      // serve stale data rather than an error screen if we have any
      if (hit) return hit.v;
      throw e;
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}
export function clearCache() {
  mem.clear();
  try { Object.keys(sessionStorage).filter((k) => k.startsWith(SS)).forEach((k) => sessionStorage.removeItem(k)); } catch {}
}
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
