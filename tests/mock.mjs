// Offline mocks of AniList, MangaDex and the Internet Archive so the UI can be tested without network access.

const TITLES = [
  ['Sousou no Frieren', 'Frieren: Beyond Journey’s End', '葬送のフリーレン'], ['Kimetsu no Yaiba', 'Demon Slayer', '鬼滅の刃'],
  ['One Piece', 'One Piece', 'ONE PIECE'], ['Jujutsu Kaisen', 'Jujutsu Kaisen', '呪術廻戦'], ['Dandadan', 'Dandadan', 'ダンダダン'],
  ['Spy x Family', 'Spy x Family', 'SPY×FAMILY'], ['Chainsaw Man', 'Chainsaw Man', 'チェンソーマン'], ['Bocchi the Rock!', 'Bocchi the Rock!', 'ぼっち・ざ・ろっく！'],
  ['Shingeki no Kyojin', 'Attack on Titan', '進撃の巨人'], ['Kaguya-sama wa Kokurasetai', 'Kaguya-sama: Love Is War', 'かぐや様は告らせたい'],
  ['Mob Psycho 100', 'Mob Psycho 100', 'モブサイコ100'], ['Vinland Saga', 'Vinland Saga', 'ヴィンランド・サガ'], ['Oshi no Ko', 'Oshi no Ko', '【推しの子】'],
  ['Cowboy Bebop', 'Cowboy Bebop', 'カウボーイビバップ'], ['Fullmetal Alchemist: Brotherhood', 'Fullmetal Alchemist: Brotherhood', '鋼の錬金術師'],
  ['Hunter x Hunter', 'Hunter x Hunter', 'HUNTER×HUNTER'], ['Violet Evergarden', 'Violet Evergarden', 'ヴァイオレット・エヴァーガーデン'],
  ['Suzume no Tojimari', 'Suzume', 'すずめの戸締まり'], ['Blue Lock', 'Blue Lock', 'ブルーロック'], ['Haikyuu!!', 'Haikyu!!', 'ハイキュー!!'],
];
const COLORS = ['#e45050', '#50a2e4', '#e4a850', '#6ce450', '#c850e4', '#50e4cb', '#e45093', '#8450e4'];
const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Romance', 'Sci-Fi', 'Slice of Life', 'Supernatural'];

const svg = (w, h, c, label = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#14142a"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.3}" r="${Math.min(w, h) * 0.18}" fill="rgba(255,255,255,.12)"/><text x="${w / 2}" y="${h / 2}" font-family="sans-serif" font-size="${Math.min(w, h) / 9}" fill="rgba(255,255,255,.85)" text-anchor="middle">${label}</text></svg>`;
export const imageFor = (url) => {
  const m = url.match(/#c=([0-9a-f]{6})/i);
  const wide = /banner|trailer|thumb|episode/i.test(url);
  const n = (url.length * 7) % COLORS.length;
  const label = (url.match(/[?&]l=([^&]+)/) || [])[1] || '';
  return svg(wide ? 1200 : 400, wide ? 400 : 600, COLORS[n], decodeURIComponent(label));
};

const img = (kind, i) => `https://s4.anilist.co/file/${kind}/${i}.jpg?l=${encodeURIComponent(TITLES[i % TITLES.length][1].slice(0, 18))}`;
export function media(i, extra = {}) {
  const t = TITLES[i % TITLES.length];
  const releasing = i % 3 === 0;
  return {
    id: 1000 + i, idMal: 5000 + i, type: 'ANIME', format: i % 7 === 6 ? 'MOVIE' : 'TV', status: releasing ? 'RELEASING' : 'FINISHED',
    episodes: i % 7 === 6 ? 1 : releasing ? null : 12 + (i % 4) * 12, chapters: null, volumes: null, duration: 24, season: 'FALL', seasonYear: 2026 - (i % 5),
    averageScore: 90 - (i % 15), popularity: 100000 - i * 3000, isAdult: false, genres: [GENRES[i % 9], GENRES[(i + 3) % 9], GENRES[(i + 5) % 9]],
    title: { romaji: t[0], english: t[1], native: t[2] },
    coverImage: { extraLarge: img('cover', i), large: img('cover', i), color: COLORS[i % COLORS.length] },
    bannerImage: img('banner', i),
    startDate: { year: 2026 - (i % 5), month: 10, day: 3 },
    studios: { nodes: [{ name: ['MAPPA', 'Madhouse', 'Ufotable', 'Bones', 'Wit Studio'][i % 5] }] },
    nextAiringEpisode: releasing ? { episode: 6 + (i % 5), airingAt: Math.floor(Date.now() / 1000) + 86400 * (1 + (i % 4)) + 3600 * i, timeUntilAiring: 86400 * (1 + (i % 4)) + 3600 * i } : null,
    description: `A sweeping story about ${t[1]}.<br><br>Follow <i>unforgettable</i> characters through <b>heartfelt</b> drama, thrilling action and stunning animation. <script>alert(1)</script>(Source: Mock)`,
    trailer: { id: 'dQw4w9WgXcQ', site: 'youtube', thumbnail: img('banner', i) },
    ...extra,
  };
}
const many = (n, off = 0) => Array.from({ length: n }, (_, k) => media(k + off));

export function detail(id) {
  const i = id - 1000;
  const m = id === 1004 ? media(i, { status: 'NOT_YET_RELEASED', episodes: 12, nextAiringEpisode: { episode: 1, airingAt: Math.floor(Date.now() / 1000) + 86400, timeUntilAiring: 86400 } }) : media(i);
  return {
    ...m, source: 'MANGA', hashtag: '#frieren', synonyms: ['Frieren'], countryOfOrigin: 'JP', favourites: 48210, siteUrl: `https://anilist.co/anime/${id}`,
    endDate: { year: 2027, month: 3, day: 1 },
    allStudios: { edges: [{ isMain: true, node: { id: 1, name: 'MAPPA', isAnimationStudio: true } }, { isMain: false, node: { id: 2, name: 'Aniplex', isAnimationStudio: false } }] },
    tags: [{ name: 'Magic', rank: 92, isMediaSpoiler: false, isGeneralSpoiler: false }, { name: 'Elf', rank: 80, isMediaSpoiler: false, isGeneralSpoiler: false }, { name: 'Secret', rank: 60, isMediaSpoiler: true, isGeneralSpoiler: false }],
    externalLinks: [
      { id: 1, site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GG5H5XQ7D', type: 'STREAMING', language: 'English', color: '#f47521', isDisabled: false },
      { id: 2, site: 'Youtube', url: 'https://www.youtube.com/playlist?list=PLmockmockmock', type: 'STREAMING', language: 'English', color: '#ff0000', isDisabled: false },
      { id: 3, site: 'Official Site', url: 'https://frieren-anime.jp/', type: 'INFO', color: null, isDisabled: false },
    ],
    streamingEpisodes: Array.from({ length: 6 }, (_, k) => ({ title: `Episode ${k + 1} - Chapter title ${k + 1}`, thumbnail: img('episode', i + k), url: `https://www.crunchyroll.com/watch/mock${k}`, site: 'Crunchyroll' })),
    rankings: [{ rank: 3, type: 'RATED', allTime: true, season: null, year: null, context: 'highest rated all time' }],
    characters: { edges: Array.from({ length: 6 }, (_, k) => ({ role: k ? 'SUPPORTING' : 'MAIN', node: { id: k, name: { full: ['Frieren', 'Fern', 'Stark', 'Himmel', 'Heiter', 'Eisen'][k] }, image: { large: img('char', k) } }, voiceActors: [{ id: k, name: { full: 'Atsumi Tanezaki' }, image: { medium: img('va', k) } }] })) },
    staff: { edges: [{ role: 'Director', node: { id: 1, name: { full: 'Keiichiro Saito' }, image: { large: img('staff', 1) } } }, { role: 'Original Creator', node: { id: 2, name: { full: 'Kanehito Yamada' }, image: { large: img('staff', 2) } } }] },
    relations: { edges: [{ relationType: 'ADAPTATION', node: { ...media(30), type: 'MANGA', format: 'MANGA' } }, { relationType: 'SEQUEL', node: media(2) }] },
    recommendations: { nodes: many(8, 5).map((x) => ({ rating: 100, mediaRecommendation: x })) },
  };
}

/* ---------- AniList ---------- */
export function anilist(body) {
  const { query, variables } = JSON.parse(body);
  if (query.includes('hero:')) return { data: { hero: { media: many(6) }, trending: { media: many(14, 2) }, airing: { media: many(14, 0).filter((m) => m.nextAiringEpisode) }, season: { media: many(12, 4) }, upcoming: { media: many(12, 7) }, top: { media: many(12, 9) }, popular: { media: many(12, 11) }, movies: { media: many(10, 6) } } };
  if (query.includes('recent:')) {
    const mk = (n, off, t) => many(n, off).map((m, k) => ({ airingAt: t(k), episode: 3 + k, media: m }));
    const now = variables.now;
    return { data: {
      recent: { airingSchedules: mk(10, 1, (k) => now - 3600 * (k + 1)) }, soon: { airingSchedules: mk(10, 4, (k) => now + 3600 * (k + 2)) },
      fresh: { media: many(8, 8).map((m, k) => ({ ...m, status: 'RELEASING', startDate: { year: 2026, month: 10, day: 10 + k } })) },
      upcoming: { media: many(8, 12).map((m, k) => ({ ...m, status: 'NOT_YET_RELEASED', startDate: { year: 2027, month: 1 + (k % 3), day: 5 + k } })) },
    } };
  }
  if (query.includes('SeasonGraph')) {
    return { data: { Page: { media: variables.ids.map((id) => ({ id, relations: { edges: id === 1000 ? [{ relationType: 'SEQUEL', node: media(1) }] : id === 1001 ? [{ relationType: 'PREQUEL', node: media(0) }, { relationType: 'SEQUEL', node: media(2) }] : [{ relationType: 'PREQUEL', node: media(1) }] } })) } } };
  }
  if (query.includes('GenreCollection')) return { data: { GenreCollection: GENRES.concat(['Hentai']) } };
  if (query.includes('RecentEpisodes')) {
    const p = variables.page;
    return { data: { Page: { pageInfo: { hasNextPage: p < 2 }, airingSchedules: many(6, p === 1 ? 0 : 6).map((m, k) => ({ airingAt: variables.to - 3600 * (k + 1 + (p - 1) * 6), episode: 1 + k, media: m })) } } };
  }
  if (query.includes('airingSchedules')) {
    const f = variables.from;
    return { data: { Page: { pageInfo: { hasNextPage: false }, airingSchedules: many(9, 3).map((m, k) => ({ airingAt: f + 3600 * (3 + k * 2), episode: 5 + k, timeUntilAiring: 3600 * (3 + k * 2) - 100, media: { ...m, countryOfOrigin: 'JP' } })) } } };
  }
  if (query.includes('Media(id')) return { data: { Media: { ...detail(variables.id), isAdult: variables.id === 1099 } } };
  if (query.includes('id_in')) return { data: { Page: { media: variables.ids.map((id) => media(id - 1000)) } } };
  if (query.includes('$search')) {
    const q = (variables.search || '').toLowerCase();
    const adult = query.includes('isAdult: true');
    let items = (adult ? [media(99 + (variables.page - 1), { isAdult: true, format: 'OVA', status: 'FINISHED', genres: ['Fantasy', 'Romance'] })] : many(20)).filter((m) => !q || `${m.title.romaji} ${m.title.english}`.toLowerCase().includes(q));
    if (variables.genre) items = items.filter((m) => m.genres.includes(variables.genre));
    if (variables.format) items = items.filter((m) => m.format === variables.format);
    if (variables.status) items = items.filter((m) => m.status === variables.status);
    return { data: { Page: { pageInfo: { hasNextPage: variables.page < 2 && (adult ? items.length > 0 : items.length > 10), currentPage: variables.page, total: adult && items.length ? 2 : items.length }, media: items } } };

  }
  return { errors: [{ message: 'mock: unknown query' }] };
}

/* ---------- MangaDex ---------- */
const MANGA = [['Solo Leveling', 'ko'], ['One Piece', 'ja'], ['Chainsaw Man', 'ja'], ['Tower of God', 'ko'], ['Blue Lock', 'ja'], ['Soul Land', 'zh'], ['Spy x Family', 'ja'], ['Frieren', 'ja'], ['Berserk', 'ja'], ['Vagabond', 'ja']];
const mid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const cid = (m, c) => `11111111-0000-4000-8000-${String(m * 1000 + c).padStart(12, '0')}`;
function mdManga(i) {
  const [t, lang] = MANGA[i % MANGA.length];
  return {
    id: mid(i), type: 'manga',
    attributes: { title: { en: t }, altTitles: [{ ja: 'テスト' }], description: { en: `The story of ${t}.\n\nA gripping tale with *incredible* art.\n\n---\n**Links:**\n- [Official](https://example.com)` }, status: i % 2 ? 'ongoing' : 'completed', year: 2015 + i % 8, contentRating: i === 9 ? 'erotica' : 'safe', originalLanguage: lang, lastChapter: '120', publicationDemographic: 'shounen', availableTranslatedLanguages: ['en', 'es', 'pt-br'], links: { al: '30002', mal: '2', mu: 'abc123', engtl: 'https://www.viz.com/one-piece' }, tags: [{ id: 't1', attributes: { name: { en: 'Action' }, group: 'genre' } }, { id: 't2', attributes: { name: { en: 'Fantasy' }, group: 'genre' } }, { id: 't3', attributes: { name: { en: 'Isekai' }, group: 'theme' } }] },
    relationships: [{ type: 'cover_art', attributes: { fileName: `cover${i}.jpg?l=${encodeURIComponent(t)}` } }, { type: 'author', attributes: { name: 'Mock Author' } }, { type: 'artist', attributes: { name: 'Mock Artist' } }],
  };
}
export function mangadex(url) {
  const u = new URL(url);
  const p = u.pathname;
  if (p === '/manga/tag') return { data: ['Action', 'Fantasy', 'Isekai', 'Romance'].map((n, k) => ({ id: `t${k + 1}`, attributes: { name: { en: n }, group: k === 2 ? 'theme' : 'genre' } })) };
  if (p === '/manga/random') return { data: mdManga(2) };
  if (p === '/manga') { const ratings = u.searchParams.getAll('contentRating[]'); const data = Array.from({ length: 12 }, (_, k) => mdManga(k)).filter((m) => ratings.includes(m.attributes.contentRating)); return { data, total: ratings.includes('safe') ? 40 : data.length, offset: Number(u.searchParams.get('offset')) || 0 }; }
  let m;
  if ((m = p.match(/^\/statistics\/manga\/(.+)$/))) return { statistics: { [m[1]]: { rating: { bayesian: 8.74 }, follows: 123456 } } };
  if ((m = p.match(/^\/manga\/([^/]+)\/feed$/))) {
    const idx = Number(m[1].slice(-12));
    const lang = u.searchParams.get('translatedLanguage[]');
    const data = lang === 'pt-br' ? [] : Array.from({ length: 30 }, (_, k) => ({ id: cid(idx, k + 1), attributes: { chapter: String(k + 1), volume: String(Math.floor(k / 10) + 1), title: k % 3 ? '' : `The ${k + 1}th trial`, translatedLanguage: lang, pages: 18, publishAt: new Date(Date.now() - (30 - k) * 86400000 * 3).toISOString() }, relationships: [{ type: 'scanlation_group', attributes: { name: 'Mock Scans' } }, { type: 'manga', id: m[1] }] }));
    return { data, total: data.length, offset: 0 };
  }
  if ((m = p.match(/^\/manga\/([^/]+)$/))) return { data: mdManga(Number(m[1].slice(-12))) };
  if ((m = p.match(/^\/chapter\/(.+)$/))) { const n = Number(m[1].slice(-12)); const k = n % 1000; return { data: { id: m[1], attributes: { chapter: String(k), volume: '1', title: '', translatedLanguage: 'en', pages: 18 }, relationships: [{ type: 'manga', id: mid(Math.floor(n / 1000)) }] } }; }
  if ((m = p.match(/^\/at-home\/server\/(.+)$/))) return { baseUrl: 'https://uploads.mangadex.org', chapter: { hash: 'abc', data: Array.from({ length: 8 }, (_, k) => `page${k + 1}.jpg?l=${m[1].slice(-4)}-p${k + 1}`), dataSaver: Array.from({ length: 8 }, (_, k) => `s${k + 1}.jpg`) } };
  return { result: 'error', errors: [{ detail: 'mock: unknown ' + p }] };
}

/* ---------- Internet Archive ---------- */
export function archive(url) {
  const u = new URL(url);
  if (u.pathname.startsWith('/advancedsearch.php')) return { response: { docs: Array.from({ length: 6 }, (_, k) => ({ identifier: `open-film-${k}`, title: `Open Film ${k + 1}`, creator: 'Public Domain Studio', year: 1930 + k, downloads: 1000 - k, licenseurl: 'https://creativecommons.org/publicdomain/mark/1.0/' })) } };
  if (u.pathname.startsWith('/metadata/')) return { metadata: { title: 'Open Film', licenseurl: 'https://creativecommons.org/publicdomain/mark/1.0/' }, files: [{ name: 'film.mp4', format: 'h.264', size: '12345678', source: 'derivative' }, { name: 'film_thumb.mp4', size: '1', source: 'derivative' }] };
  return {};
}
