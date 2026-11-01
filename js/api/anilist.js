// AniList GraphQL client — metadata, search, schedule. Public API, no key needed for reads.
// Docs: https://docs.anilist.co/

import { cached, MIN, HOUR } from '../cache.js';
import { currentSeason, nextSeason, sleep } from '../util.js';

const ENDPOINT = 'https://graphql.anilist.co';

// Serialise requests slightly so a page that fires several queries never trips the rate limiter.
let chain = Promise.resolve();
let lastAt = 0;
function throttle(task) {
  const run = chain.then(async () => {
    const wait = lastAt + 180 - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    return task();
  });
  chain = run.catch(() => {});
  return run;
}

export async function gql(query, variables = {}, attempt = 0) {
  const res = await throttle(() => fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  }));
  if (res.status === 429 && attempt < 2) {
    const wait = Number(res.headers.get('Retry-After')) || 6;
    await sleep(Math.min(wait, 20) * 1000);
    return gql(query, variables, attempt + 1);
  }
  let json;
  try { json = await res.json(); } catch { throw new Error(`AniList returned an unreadable response (${res.status}).`); }
  if (json.errors?.length && !json.data) throw new Error(json.errors[0].message || 'AniList error');
  if (!res.ok && !json.data) throw new Error(`AniList error ${res.status}`);
  return json.data;
}

/* ---------- Fragments ---------------------------------------------------------- */
const CARD = `
  id idMal type format status episodes chapters volumes duration season seasonYear averageScore popularity isAdult genres
  title { romaji english native }
  coverImage { extraLarge large color }
  bannerImage
  startDate { year month day }
  studios(isMain: true) { nodes { name } }
  nextAiringEpisode { episode airingAt timeUntilAiring }
`;
const HERO = `${CARD} description(asHtml: false) trailer { id site thumbnail }`;

/* ---------- Home feed -------------------------------------------------------------- */
export function homeFeed() {
  return cached('al:home:v2', 10 * MIN, async () => {
    const s = currentSeason();
    const n = nextSeason();
    const q = `query ($s: MediaSeason, $y: Int, $ns: MediaSeason, $ny: Int) {
      hero: Page(page: 1, perPage: 8) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false, format_in: [TV, MOVIE, ONA]) { ${HERO} } }
      trending: Page(page: 1, perPage: 20) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${CARD} } }
      airing: Page(page: 1, perPage: 20) { media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) { ${CARD} } }
      season: Page(page: 1, perPage: 20) { media(type: ANIME, season: $s, seasonYear: $y, sort: POPULARITY_DESC, isAdult: false) { ${CARD} } }
      upcoming: Page(page: 1, perPage: 20) { media(type: ANIME, season: $ns, seasonYear: $ny, sort: POPULARITY_DESC, isAdult: false) { ${CARD} } }
      top: Page(page: 1, perPage: 20) { media(type: ANIME, sort: SCORE_DESC, isAdult: false, format_in: [TV, MOVIE, ONA]) { ${CARD} } }
      popular: Page(page: 1, perPage: 20) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${CARD} } }
      movies: Page(page: 1, perPage: 20) { media(type: ANIME, format: MOVIE, sort: POPULARITY_DESC, isAdult: false) { ${CARD} } }
    }`;
    const d = await gql(q, { s: s.season, y: s.year, ns: n.season, ny: n.year });
    const pick = (k) => d[k]?.media || [];
    return {
      hero: pick('hero').filter((m) => m.bannerImage || m.trailer?.thumbnail).slice(0, 6),
      trending: pick('trending'), airing: pick('airing'), season: pick('season'), upcoming: pick('upcoming'),
      top: pick('top'), popular: pick('popular'), movies: pick('movies'),
      seasonInfo: s, nextInfo: n,
    };
  });
}

/* ---------- Search / browse -------------------------------------------------------- */
export function searchMedia({ type = 'ANIME', q = '', page = 1, perPage = 30, genre, tag, format, status, season, year, sort, country } = {}) {
  const key = `al:s:${JSON.stringify([type, q, page, perPage, genre, tag, format, status, season, year, sort, country])}`;
  return cached(key, 10 * MIN, async () => {
    const query = `query ($page: Int, $perPage: Int, $type: MediaType, $search: String, $genre: String, $tag: String, $format: MediaFormat,
      $status: MediaStatus, $season: MediaSeason, $year: Int, $sort: [MediaSort], $country: CountryCode) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage currentPage total }
        media(type: $type, search: $search, genre: $genre, tag: $tag, format: $format, status: $status, season: $season, seasonYear: $year,
              sort: $sort, countryOfOrigin: $country, isAdult: false) { ${CARD} }
      }
    }`;
    const vars = {
      page, perPage, type, search: q || undefined, genre: genre || undefined, tag: tag || undefined, format: format || undefined,
      status: status || undefined, season: season || undefined, year: year ? Number(year) : undefined, country: country || undefined,
      sort: [sort || (q ? 'SEARCH_MATCH' : 'POPULARITY_DESC')],
    };
    const d = await gql(query, vars);
    return { items: d.Page.media, hasNext: d.Page.pageInfo.hasNextPage, total: d.Page.pageInfo.total };
  });
}

/* ---------- Detail ------------------------------------------------------------------ */
export function mediaDetail(id) {
  return cached(`al:m:${id}`, 30 * MIN, async () => {
    const mini = `id type format status averageScore title { romaji english native } coverImage { large color } episodes chapters seasonYear isAdult`;
    const q = `query ($id: Int) {
      Media(id: $id) {
        ${CARD}
        description(asHtml: false) source hashtag synonyms countryOfOrigin favourites siteUrl
        endDate { year month day }
        trailer { id site thumbnail }
        tags { name rank isMediaSpoiler isGeneralSpoiler }
        allStudios: studios { edges { isMain node { id name isAnimationStudio } } }
        externalLinks { id site url type language color icon isDisabled }
        streamingEpisodes { title thumbnail url site }
        rankings { rank type allTime season year context }
        characters(sort: [ROLE, FAVOURITES_DESC], perPage: 14) { edges { role node { id name { full } image { large } } voiceActors(language: JAPANESE, sort: RELEVANCE) { id name { full } image { medium } } } }
        staff(sort: RELEVANCE, perPage: 8) { edges { role node { id name { full } image { large } } } }
        relations { edges { relationType(version: 2) node { ${mini} } } }
        recommendations(sort: RATING_DESC, perPage: 14) { nodes { rating mediaRecommendation { ${mini} } } }
      }
    }`;
    const d = await gql(q, { id: Number(id) });
    if (!d?.Media) throw new Error('Title not found.');
    return d.Media;
  });
}

/* ---------- Airing schedule ------------------------------------------------------------ */
export function airingBetween(from, to) {
  return cached(`al:sched:${from}:${to}`, 15 * MIN, async () => {
    const out = [];
    for (let page = 1; page <= 4; page++) {
      const q = `query ($from: Int, $to: Int, $page: Int) {
        Page(page: $page, perPage: 50) {
          pageInfo { hasNextPage }
          airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
            airingAt episode timeUntilAiring
            media { id type format status episodes duration isAdult popularity averageScore genres title { romaji english native } coverImage { large color } countryOfOrigin }
          }
        }
      }`;
      const d = await gql(q, { from, to, page });
      out.push(...d.Page.airingSchedules);
      if (!d.Page.pageInfo.hasNextPage) break;
    }
    return out.filter((s) => s.media && !s.media.isAdult);
  });
}

/* ---------- Genres / tags --------------------------------------------------------------- */
export function genreList() {
  return cached('al:genres', 24 * HOUR, async () => {
    const d = await gql('{ GenreCollection }');
    return (d.GenreCollection || []).filter((g) => g !== 'Hentai');
  });
}

/* ---------- Bulk refresh for the library ------------------------------------------------- */
export function mediaByIds(ids) {
  if (!ids.length) return Promise.resolve([]);
  const list = ids.slice(0, 50).map(Number).sort();
  return cached(`al:ids:${list.join(',')}`, 10 * MIN, async () => {
    const d = await gql(`query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { ${CARD} } } }`, { ids: list });
    return d.Page.media;
  });
}
