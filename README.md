<p align="center"><img src="assets/logo.svg" width="84" alt="NullxAnime"></p>

# NullxAnime

A sleek, fast **anime + manga** hub. No captcha, no ads, no account, no tracking — it's a static site (plain ES modules, **no build step**) that runs on GitHub Pages.

**Live:** https://inkflow-gab.github.io/NullxAnime/ (after the first deploy — see [Deploy](#deploy))

## Features

| Area | What you get |
| --- | --- |
| **Anime** | Hero carousel, a **Top 10 ranking** right under it (trending / most popular / top rated / this season), **Recently updated** (episodes that just aired, linking straight to the episode), **New releases**, **Airing soon** and **Upcoming anime with premiere dates**, plus airing / seasonal / top-rated rails, full search + filters (genre, format, status, season, year, sort), detail pages with episodes, characters, relations, recommendations, tags, staff. Data: [AniList](https://anilist.co). |
| **Watch** | Official free YouTube streams + trailers play inline; per-episode links to the official service (Crunchyroll, Netflix, Muse Asia…); public-domain / CC video from the [Internet Archive](https://archive.org); "My link / file" player for your own media (MP4, WebM, HLS, YouTube, local files, SRT/VTT subtitles). Custom player with keyboard shortcuts, speed, quality, PiP, resume position. Optional Kitsune and AniPub deployment connections are available on the watch page. |
| **Manga** | Home rails (popular, latest, top rated, manhwa, manhua), search + tag/origin/demographic filters, chapter lists in 18 languages, and a full reader (vertical webtoon, paged LTR/RTL, fit modes, data saver, keyboard/tap zones, auto prefetch). Data: [MangaDex](https://mangadex.org). Only *safe/suggestive* ratings. |
| **Tracker** | One list for anime + manga: status, progress, score, history, stats, JSON backup/restore, MyAnimeList/AniList XML export. Lives in `localStorage`. |
| **Schedule** | Per-day airing calendar in your timezone, "only my list" filter. |
| **Discover** | Curated directory of trackers, schedules, official sources and tools (derived from [awesome-anime-sources](https://github.com/anshumanv/awesome-anime-sources), legal sources only). |
| **Polish** | Command-palette search (`/` or `Ctrl+K`), dark / OLED / light themes, 6 accents, installable PWA + offline shell, mobile tab bar, keyboard shortcuts (`?`). |

## Optional community deployments

The watch page can connect to a user-configured [Kitsune](https://github.com/Dovakiin0/Kitsune) deployment and search or open a title on an [AniPub](https://github.com/AnimePub/AniPub) deployment. These are external services: NullxAnime does not bundle or host their backend, catalogue, or streams. The Kitsune tab defaults to the deployment listed by that project (`https://kitsunee.moe`); you can change it to your own. Kitsune needs a running HTTPS deployment with its `/api/episodes`, `/api/watch`, and `/api/proxy` endpoints reachable from your browser. AniPub search requires CORS; if it is blocked, enter its numeric title ID manually. AniPub playback may require opening the episode in a separate tab if its server blocks embedding. The default deployment has not been live-tested here; availability, CORS, and source permissions depend on the deployment. See [docs/PROVIDERS.md](docs/PROVIDERS.md) for setup and limitations.

GitHub Pages hosts only static files and cannot run these backends. Deployment URLs are stored in this browser. Do not enter secrets in them.

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

AniList, MangaDex and the Internet Archive for their open APIs; [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0, vendored in `vendor/`). All anime, manga and artwork belong to their owners — please support official releases.
