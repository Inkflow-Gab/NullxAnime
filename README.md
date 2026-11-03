<p align="center"><img src="assets/icon-192.png" width="84" alt="NullxAnime"></p>

# NullxAnime

A sleek, fast **anime + manga** hub. No account required and no ads added by NullxAnime; third-party players may contain ads or tracking. It's a static site (plain ES modules, **no build step**) that runs on GitHub Pages.

**Live:** https://inkflow-gab.github.io/NullxAnime/ (after the first deploy — see [Deploy](#deploy))

## Features

| Area | What you get |
| --- | --- |
| **Anime** | Hero carousel, a **Top 10 ranking** right under it (trending / most popular / top rated / this season), **New releases** (episodes that just aired, linking straight to the episode), **New series**, **Airing soon** and **Upcoming anime with premiere dates**, plus airing / seasonal / top-rated rails, full search + filters (genre, format, status, season, year, sort), detail pages with episodes, characters, relations, recommendations, tags, staff. Data: [AniList](https://anilist.co). |
| **Watch** | No-setup Instant play, Aniweeb, SupaPlay, AniEmbed and Movies Nexus episode-player embeds, with audio and server choices. The public-domain / CC [Internet Archive](https://archive.org) library is also available. Providers control playback, ads and availability. |
| **Manga** | MangaDex search and reader plus separate Asura, Vortex, Hivetoons and Omega Scans catalogues and vertical readers. MangaDex manga, manhwa and manhua include safe/suggestive ratings by default; adult-rated titles require local 18+ opt-in. Omega is an 18+ source and is hidden until opt-in; source catalogues are separate from MangaDex. |
| **Tracker** | One list for anime + manga: status, progress, score, history, stats, JSON backup/restore, MyAnimeList/AniList XML export. Lives in `localStorage`. |
| **Schedule** | Per-day airing calendar in your timezone, "only my list" filter. |
| **Discover** | Curated directory of trackers, schedules, official sources and tools (derived from [awesome-anime-sources](https://github.com/anshumanv/awesome-anime-sources), legal sources only). |
| **Polish** | Command-palette search (`/` or `Ctrl+K`), dark / OLED / light themes, 6 accents, installable PWA + offline shell, mobile tab bar, keyboard shortcuts (`?`), optional TV mode with arrow-key navigation. |

## Community streaming

The watch page starts with **Instant play**, a direct episode embed using the same fallback endpoint as Kitsune. **Aniweeb** offers a separate episode-player embed with two numbered servers; SupaPlay, AniEmbed and Movies Nexus provide additional sandboxed episode players. CI observed sample SupaPlay video progress; AniEmbed and Movies Nexus are experimental because no playback was observed in the sample. No server URL is required, but the provider may be unavailable, block embedding or lack a particular episode. The site also includes an AnimeGG adapter based on [Kitsune](https://github.com/Dovakiin0/Kitsune), but it is hidden until the site maintainer deploys and configures the worker. Viewers are not asked for a server URL.

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
js/api/               AniList · MangaDex · scan-source · archive clients
js/sources.js         episode metadata and external information-link helpers
js/player.js          custom video player (MP4/WebM/HLS)
js/pages/             one module per route
js/ui/                icons, cards/rails/toasts/popovers, search palette
tests/                static server, API mocks, e2e
```

## Credits

[Cinzel](https://github.com/google/fonts/tree/main/ofl/cinzel) (SIL Open Font License 1.1; see `assets/fonts/OFL-Cinzel.txt`); AniList, MangaDex and the Internet Archive for their open APIs; [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0, vendored in `vendor/`). All anime, manga and artwork belong to their owners — please support official releases.

### Device and player notes

The layout adapts to the viewport and touch input. Recognizable TV user agents enable remote navigation automatically; Settings can override TV mode. Detection is local and best-effort, not a guarantee for every device. The watch page includes episode filtering, retry, and share-link controls. The Recent episodes page browses AniList airing events newest first with automatic and manual pagination (up to 500 pages); an aired episode may not yet be available at a provider. MangaDex can deny requests in some browsers or regions: the manga home keeps other sources accessible and offers an Asura fallback, but cannot unblock MangaDex itself.

The optional Senshi tab retrieves available Senshi/StreamNin/FileMoon mirrors from the updated separately deployed worker using the title's MyAnimeList ID. Availability, embedding, audio, ads and permissions depend on each external provider; no provider backend is hosted by GitHub Pages. See [provider notes](docs/PROVIDERS.md) for what is and is not implemented.

**More servers** can discover Kitsune-compatible providers and mirrors when the site operator configures an API. The **MKissa** tab is hidden because no backend is deployed; MKissa manga is not integrated. The app does not make all upstream servers ready by itself. Third-party streams may require unavailable headers or be blocked. See [provider notes](docs/PROVIDERS.md).

**Performance:** Lightweight effects automatically reduce expensive blur on phones, TVs, data-saving connections and devices reporting low memory. Override it under Settings. This reduces rendering work but cannot guarantee a particular frame rate.

### Reading sources and mature content

Asura's public JSON API supplies its own catalogue and chapter images; chapter listings omit paid or early-access chapters. Asura access and image loading can vary by browser, region, and provider changes. The Asura reader currently uses vertical scrolling and does not sync with the MangaDex tracker. The source was informed by [Yūzōnō's Android extensions](https://github.com/yuzono/anime-extensions) and [Kagi's Asura integration](https://github.com/Jocseh07/kagi), but APK extensions cannot run inside a browser.

Omega Scans, Vortex Scans and Hivetoons use their public JSON APIs and direct image URLs. Only free/unlocked chapters are listed; the readers do not execute source-site ads or scripts. These integrations are mock-tested and their public JSON responses were observed live. A Pages-origin CI probe loaded JSON and sample covers from Asura, Vortex and Omega; Hivetoons JSON loaded but its sample cover failed, so Hivetoons is marked experimental. Chapter images and availability can vary. Source restrictions, checks, image hotlink rules and 502 errors can prevent use. They currently do not sync to the MangaDex tracker. MangaFire, Toonily and MKissa manga are **not integrated**.

The optional adult setting enables MangaDex adult ratings and Omega's catalogue only after the viewer self-attests they are 18 or older; it is off by default and is not age verification. Turn it off again in Settings. The source controls content and availability.

Aniweeb and the new alternate players are sandboxed against popup and top-level navigation; Instant play offers an optional popup-protection toggle because its provider has refused sandboxed embeds. This may stop new tabs or redirects but **does not remove in-player ads**, and enabling it may break playback. NullxAnime cannot block all ads or browser checks inside a cross-origin player.

### Finding chapters and seasons
The manga home combines a first page of recently updated titles from Asura, Vortex and MangaDex when each is reachable. Open a title, select a provider, confirm the matching title, and choose an unlocked chapter. Search with another spelling if necessary. Results are not a complete catalogue and provider access can vary by browser or region. Hivetoons is experimental; MangaFire is unavailable because the public services tested did not provide working browser-accessible chapter images. No provider website is embedded.

Anime detail and watch pages show AniList prequel/sequel installments where available. Episode counts for airing shows use AniList's next-airing information and represent episodes that have aired, not confirmed inventory on a player. Airing times use the viewer's device timezone and locale; streaming providers can release at different times.

### Release notifications
Update `js/data/release.js` with a short title and user-facing changes for each release. The Pages workflow stamps the deployed commit as its release ID, so visitors see the violet update window once per release and can revisit it from “What’s new” in the footer. If curated notes were not changed, the build uses commit titles instead of repeating stale notes. A new service worker offers a reload rather than interrupting playback. Acknowledgement is stored on the device; clearing or blocking local storage can make the window reappear.

### App update recovery
The service worker keeps each release's app files together instead of refreshing modules independently. During the one-time migration from the older cache, open app tabs reload to repair mixed files; browser library, settings and reading history are not deleted. Later updates wait for you to reload, and other open tabs keep using their original version until they reload. If an app module cannot load, the recovery button performs a full page reload.
