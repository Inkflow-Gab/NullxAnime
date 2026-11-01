<p align="center"><img src="assets/logo.svg" width="84" alt="NullxAnime"></p>

# NullxAnime

A sleek, fast **anime + manga** hub. No captcha, no ads, no account, no tracking — it's a static site (plain ES modules, **no build step**) that runs on GitHub Pages.

**Live:** https://inkflow-gab.github.io/NullxAnime/ (after the first deploy — see [Deploy](#deploy))

## Features

| Area | What you get |
| --- | --- |
| **Anime** | Hero carousel, trending / airing (with countdowns) / seasonal / upcoming / top-rated rails, full search + filters (genre, format, status, season, year, sort), detail pages with episodes, characters, relations, recommendations, tags, staff. Data: [AniList](https://anilist.co). |
| **Watch (legal)** | Official free YouTube streams + trailers play inline; per-episode links to the official service (Crunchyroll, Netflix, Muse Asia…); public-domain / CC video from the [Internet Archive](https://archive.org); "My link / file" player for your own media (MP4, WebM, HLS, YouTube, local files, SRT/VTT subtitles). Custom player with keyboard shortcuts, speed, quality, PiP, resume position. |
| **Manga** | Home rails (popular, latest, top rated, manhwa, manhua), search + tag/origin/demographic filters, chapter lists in 18 languages, and a full reader (vertical webtoon, paged LTR/RTL, fit modes, data saver, keyboard/tap zones, auto prefetch). Data: [MangaDex](https://mangadex.org). Only *safe/suggestive* ratings. |
| **Tracker** | One list for anime + manga: status, progress, score, history, stats, JSON backup/restore, MyAnimeList/AniList XML export. Lives in `localStorage`. |
| **Schedule** | Per-day airing calendar in your timezone, "only my list" filter. |
| **Discover** | Curated directory of trackers, schedules, official sources and tools (derived from [awesome-anime-sources](https://github.com/anshumanv/awesome-anime-sources), legal sources only). |
| **Polish** | Command-palette search (`/` or `Ctrl+K`), dark / OLED / light themes, 6 accents, installable PWA + offline shell, mobile tab bar, keyboard shortcuts (`?`). |

## Why there are no pirate streaming sources

The repos this project took ideas from ([AniPub](https://github.com/AnimePub/AniPub), [Kitsune](https://github.com/Dovakiin0/Kitsune)) get their video by scraping unlicensed streaming sites. NullxAnime deliberately does **not** do that: it would mean distributing copyrighted shows without permission, it breaks constantly, and those hosts are where the malware and popups come from. Instead the watch page sends you to the official place for each title (often free — e.g. Muse Asia / Ani-One Asia on YouTube) and plays everything that is genuinely free to play. The provider layer is pluggable — see [docs/PROVIDERS.md](docs/PROVIDERS.md).

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
js/sources.js         legal watch sources (YouTube, official links, search links)
js/player.js          custom video player (MP4/WebM/HLS)
js/pages/             one module per route
js/ui/                icons, cards/rails/toasts/popovers, search palette
tests/                static server, API mocks, e2e
```

## Credits

AniList, MangaDex and the Internet Archive for their open APIs; [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0, vendored in `vendor/`). All anime, manga and artwork belong to their owners — please support official releases.
