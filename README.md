<p align="center"><img src="assets/icon-192.png" width="84" alt="NullxAnime"></p>

# NullxAnime

A sleek, fast **anime + manga** hub. No account required and no ads added by NullxAnime; third-party players may contain ads or tracking. It's a static site (plain ES modules, **no build step**) that runs on GitHub Pages.

**Live:** https://inkflow-gab.github.io/NullxAnime/ (after the first deploy — see [Deploy](#deploy))

## Features

| Area | What you get |
| --- | --- |
| **Anime** | Hero carousel, a **Top 10 ranking** right under it (trending / most popular / top rated / this season), **Recently updated** (episodes that just aired, linking straight to the episode), **New releases**, **Airing soon** and **Upcoming anime with premiere dates**, plus airing / seasonal / top-rated rails, full search + filters (genre, format, status, season, year, sort), detail pages with episodes, characters, relations, recommendations, tags, staff. Data: [AniList](https://anilist.co). |
| **Watch** | Official free YouTube streams + trailers play inline; per-episode links to the official service (Crunchyroll, Netflix, Muse Asia…); public-domain / CC video from the [Internet Archive](https://archive.org); An optional local-file player (MP4, WebM, SRT/VTT subtitles). Custom player with keyboard shortcuts, speed, quality, PiP, resume position. Additional adapters are displayed only when the site operator has configured a backend. |
| **Manga** | Home rails (popular, latest, top rated, manhwa, manhua), search + tag/origin/demographic filters, chapter lists in 18 languages, and a full reader (vertical webtoon, paged LTR/RTL, fit modes, data saver, keyboard/tap zones, auto prefetch). Data: [MangaDex](https://mangadex.org). Only *safe/suggestive* ratings. |
| **Tracker** | One list for anime + manga: status, progress, score, history, stats, JSON backup/restore, MyAnimeList/AniList XML export. Lives in `localStorage`. |
| **Schedule** | Per-day airing calendar in your timezone, "only my list" filter. |
| **Discover** | Curated directory of trackers, schedules, official sources and tools (derived from [awesome-anime-sources](https://github.com/anshumanv/awesome-anime-sources), legal sources only). |
| **Polish** | Command-palette search (`/` or `Ctrl+K`), dark / OLED / light themes, 6 accents, installable PWA + offline shell, mobile tab bar, keyboard shortcuts (`?`), optional TV mode with arrow-key navigation. |

## Community streaming

The watch page starts with **Instant play**, a direct episode embed using the same fallback endpoint as Kitsune. No server URL is required, but the provider may be unavailable, block embedding or lack a particular episode. The site also includes an AnimeGG adapter based on [Kitsune](https://github.com/Dovakiin0/Kitsune), but it is hidden until the site maintainer deploys and configures the worker. Viewers are not asked for a server URL.

The [AniPub](https://github.com/AnimePub/AniPub) adapter extracts a video or iframe source rather than embedding its full site. Its tab is hidden until the maintainer configures a working deployment and database; CORS and host restrictions can prevent playback.

Both integrations depend on third-party services and were not tested against live providers in this environment. See [docs/PROVIDERS.md](docs/PROVIDERS.md) for deployment, licensing, and limitations.

## Run locally

```bash
npm install        # only needed for tests
npm start          # → http://localhost:8080  (any static server works)
npm test           # headless-Chrome end-to-end tests with mocked APIs
```

## Deploy

GitHub Pages is deployed by [`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `main`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Project layout

```
index.html            app shell
css/                  base (tokens, shell) · components · pages
js/main.js            bootstrap, shortcuts, PWA
js/router.js          hash router (lazy page modules)
js/store.js           settings, library, history, backups (localStorage)
js/api/               anilist · mangadex · archive clients
js/sources.js         official watch sources (YouTube, official links, search links)
js/player.js          custom video player (MP4/WebM/HLS)
js/pages/             one module per route
js/ui/                icons, cards/rails/toasts/popovers, search palette
tests/                static server, API mocks, e2e
```

## Credits

[Cinzel](https://github.com/google/fonts/tree/main/ofl/cinzel) (SIL Open Font License 1.1; see `assets/fonts/OFL-Cinzel.txt`); AniList, MangaDex and the Internet Archive for their open APIs; [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0, vendored in `vendor/`). All anime, manga and artwork belong to their owners — please support official releases.

### Device and player notes

The layout adapts to the viewport and touch input. Recognizable TV user agents enable remote navigation automatically; Settings can override TV mode. Detection is local and best-effort, not a guarantee for every device. The watch page includes episode filtering, retry, and share-link controls.

The optional Senshi tab retrieves available Senshi/StreamNin/FileMoon mirrors from the updated separately deployed worker using the title's MyAnimeList ID. Availability, embedding, audio, ads and permissions depend on each external provider; no provider backend is hosted by GitHub Pages. See [provider notes](docs/PROVIDERS.md) for what is and is not implemented.

**More servers** can discover Kitsune-compatible providers and mirrors when the site operator configures an API. The **MKissa** tab is currently marked unavailable because no backend is deployed; MKissa manga is not integrated (the reader uses MangaDex). The app does not make all upstream servers ready by itself. Third-party streams may require unavailable headers or be blocked. See [provider notes](docs/PROVIDERS.md).

**Performance:** Lightweight effects automatically reduce expensive blur on phones, TVs, data-saving connections and devices reporting low memory. Override it under Settings. This reduces rendering work but cannot guarantee a particular frame rate.
