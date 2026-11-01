<p align="center"><img src="assets/logo.svg" width="84" alt="NullxAnime"></p>

# NullxAnime

A sleek, fast **anime + manga** hub. No captcha, no ads, no account, no tracking — it's a static site (plain ES modules, **no build step**) that runs on GitHub Pages.

**Live:** https://inkflow-gab.github.io/NullxAnime/ (after the first deploy — see [Deploy](#deploy))

## Features

| Area | What you get |
| --- | --- |
| **Anime** | Hero carousel, a **Top 10 ranking** right under it (trending / most popular / top rated / this season), **Recently updated** (episodes that just aired, linking straight to the episode), **New releases**, **Airing soon** and **Upcoming anime with premiere dates**, plus airing / seasonal / top-rated rails, full search + filters (genre, format, status, season, year, sort), detail pages with episodes, characters, relations, recommendations, tags, staff. Data: [AniList](https://anilist.co). |
| **Watch** | A **provider layer** ([docs/PROVIDERS.md](docs/PROVIDERS.md)) resolves video for *(title + episode)* in the browser and plays it in the built-in player: **My stream** (any video/HLS link or URL template you're allowed to use, saved per title or for every title), the **Internet Archive** public-domain / Creative-Commons library, and any provider you register. Custom player: HLS quality levels, subtitles, keyboard shortcuts, speed, PiP, resume position, auto-next. **No YouTube embeds, no Crunchyroll/Netflix redirects.** |
| **Manga** | Home rails (popular, latest, top rated, manhwa, manhua), search + tag/origin/demographic filters, chapter lists in 18 languages, and a full reader (vertical webtoon, paged LTR/RTL, fit modes, data saver, keyboard/tap zones, auto prefetch). Data: [MangaDex](https://mangadex.org). Only *safe/suggestive* ratings. |
| **Tracker** | One list for anime + manga: status, progress, score, history, stats, JSON backup/restore, MyAnimeList/AniList XML export. Lives in `localStorage`. |
| **Schedule** | Per-day airing calendar in your timezone, "only my list" filter. |
| **Discover** | Curated directory of trackers, schedules, official sources and tools (derived from [awesome-anime-sources](https://github.com/anshumanv/awesome-anime-sources), legal sources only). |
| **Polish** | Command-palette search (`/` or `Ctrl+K`), dark / OLED / light themes, 6 accents, installable PWA + offline shell, mobile tab bar, keyboard shortcuts (`?`). |

## Streaming: how sources work

The repos this project took architecture ideas from ([AniPub](https://github.com/AnimePub/AniPub), [Kitsune](https://github.com/Dovakiin0/Kitsune)) get their video by scraping unlicensed streaming sites. NullxAnime **does not** ship any of those scrapers: that would mean distributing copyrighted shows without permission, it breaks constantly, and those hosts are where the malware and pop-ups come from.

Instead there is a small **provider layer** (`js/providers.js`). Two providers ship:

* **My stream** — paste a video/HLS URL, or a URL template (`https://cdn.example.com/{id}/{ep}.m3u8`), that you own or are allowed to use. It plays in the app's own player; save it per title, or as the default for every title.
* **Internet Archive** — the public-domain / Creative-Commons open library.

Adding more is one `registerProvider({ id, label, resolve })` call — see [docs/PROVIDERS.md](docs/PROVIDERS.md). YouTube embeds and the Crunchyroll/Netflix launch pads have been removed; everything plays in one place.

## Presenting it

A 5-minute demo script, an 8-slide outline and the likely Q&A are in [docs/DEMO.md](docs/DEMO.md).

## Run locally

```bash
npm install        # only needed for tests
npm start          # → http://localhost:8080  (any static server works)
npm test           # jsdom smoke test: real router + pages, mocked APIs, no browser needed
npm run test:e2e   # full end-to-end run in headless Chrome (needs Chrome / @sparticuz/chromium)
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
js/sources.js         episode counts / per-episode names / information links
js/providers.js       streaming provider layer (my stream, open library, your own)
js/player.js          custom video player (MP4/WebM/HLS)
js/pages/             one module per route
js/ui/                icons, cards/rails/toasts/popovers, search palette
tests/                serve.mjs · dom.mjs (jsdom smoke) · e2e.mjs (headless Chrome) · mock.mjs
```

## Credits

AniList, MangaDex and the Internet Archive for their open APIs; [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0, vendored in `vendor/`). All anime, manga and artwork belong to their owners — please support official releases.
