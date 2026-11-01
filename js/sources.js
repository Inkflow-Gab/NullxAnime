// Title metadata helpers shared by the anime detail page and the watch page:
// episode counts, per-episode names from AniList, and "information" links.
//
// Playable video does NOT live here any more — it comes from the provider layer
// in js/providers.js (your own stream / template, the Internet Archive, or any
// provider you register). No YouTube, no Crunchyroll/Netflix launch pads.

import { safeUrl } from './util.js';

/** Non-streaming links AniList lists for a title (official site, MAL, Twitter, …). */
export function infoLinks(media) {
  return (media.externalLinks || [])
    .filter((l) => l.type !== 'STREAMING' && !l.isDisabled && safeUrl(l.url))
    .map((l) => ({ site: l.site, url: safeUrl(l.url), color: l.color, type: l.type }));
}

/** AniList lists official per-episode pages; map them by episode number for names/thumbnails. */
export function episodeLinkMap(media) {
  const map = new Map();
  for (const e of media.streamingEpisodes || []) {
    const m = (e.title || '').match(/(?:episode|ep\.?)\s*(\d+)/i);
    if (m && !map.has(Number(m[1]))) {
      map.set(Number(m[1]), {
        ...e,
        ep: Number(m[1]),
        name: (e.title || '').replace(/^.*?(?:episode|ep\.?)\s*\d+\s*[-–:]?\s*/i, ''),
      });
    }
  }
  return map;
}

export function episodeCount(m) {
  if (m.format === 'MOVIE' || m.format === 'MUSIC') return 1;
  if (m.episodes) return m.episodes;
  if (m.nextAiringEpisode) return Math.max(1, m.nextAiringEpisode.episode - 1);
  const map = episodeLinkMap(m);
  if (map.size) return Math.max(...map.keys());
  return m.status === 'NOT_YET_RELEASED' ? 0 : 1;
}
