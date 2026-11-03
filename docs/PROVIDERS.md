# Adding a watch source ("provider")

## Community streaming

### Instant play

The default **Instant play** tab embeds `https://megaplay.buzz/stream/ani/{anilistId}/{episode}/{sub|dub}`, the fallback used in Kitsune's watch player. Sub/dub choice is remembered across episodes. This is a third-party iframe, not a bundled video server. The provider has rejected sandboxed embeds, so it defaults to an unsandboxed iframe (the normal cross-origin boundary still applies). An optional popup-protection button adds a sandbox that blocks new windows and top-level navigation but may break this provider: GitHub Pages does not fetch or proxy its video, so browser CORS is not needed for the embed. Its operator controls availability, content and embedding; autoplay, subtitle/dub coverage, network access, regional blocks, third-party cookies and browser support may vary. If it does not load, use another source tab. We cannot guarantee playback or test live providers from this sandbox.

### Additional episode-player embeds

SupaPlay (`/stream/ani/{id}/{episode}/{sub|dub}`), AniEmbed (`/e/{id}/{episode}?lang=sub|dub`) and Movies Nexus (`/anime/{id}/{episode}/{sub|dub}`) are separate episode-player iframe endpoints. They are sandboxed without popup or top-level navigation permissions. Source selection and audio are mock-tested. A Pages-origin CI probe observed progress for one SupaPlay episode; no video progress was observed for AniEmbed or Movies Nexus, which are labelled experimental. Non-blocking CI probes attempt playback of one sampled episode inside the same sandbox; a failed probe does not establish universal failure, nor does a pass guarantee other episodes, regions, or ad-free behavior. The providers control their content, availability and player behavior.

### AnimeGG provider (adapted from Kitsune)

`streaming/worker.js` implements a small, separately deployed Cloudflare Worker. The search, series/episode parsing and stream extraction are adapted from Kitsune's AnimeGG provider at commit `cd05752f01d3365fdd5a600445703084383f3c78`; the MIT notice is in `streaming/LICENSE.kitsune`. This is one Kitsune provider, not the entire Kitsune app or all of its providers. NullxAnime does not contact the Kitsune website for this provider.

GitHub Pages cannot execute the worker. To use it with Pages:

1. Have a Cloudflare account with Workers enabled and Node.js 20 or newer. Set `ALLOWED_ORIGINS` in `streaming/wrangler.toml` to your Pages origin (for this repo, `https://inkflow-gab.github.io`; no `/NullxAnime` or trailing slash). Additional origins can be comma-separated.
2. From the repo root, authenticate Wrangler and deploy:
   ```sh
   npx wrangler login
   npx wrangler deploy --config streaming/wrangler.toml
   npx wrangler secret put TOKEN_SECRET --config streaming/wrangler.toml
   ```
   Supply a random secret of at least 32 characters to the secret prompt; do not commit it. For example, generate one locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. The site maintainer sets `streamWorker` in `js/config.js` to the HTTPS worker URL and redeploys the site. Once configured, viewers can select **AnimeGG** or **Senshi** without entering a URL.

The worker fetches provider HTML, issues time-limited signed URLs for sources, and proxies MP4 or HLS manifests, keys, segments and range requests. The token secret is required; arbitrary client-supplied proxy URLs are not accepted. The worker rejects literal IPs, credentials, local hostnames, non-HTTPS URLs and non-standard ports; provider pages and signed HLS manifests still determine which upstream domains it contacts. Origin checks are not authentication: configure Cloudflare access controls, rate limits and usage limits as appropriate for your deployment. Provider HTML, mirrors, CORS, URLs, availability and episode numbering can change. Some HLS formats or servers may not work; live provider access was not tested in this sandbox.

### Senshi mirrors (adapted from Kitsune)

The same worker exposes `/senshi?mal={id}&episode={number}&audio=sub|dub`, fetching Senshi's episode-embeds endpoint and returning validated HTTPS links for the `url`, `server2`, and `serverFM` fields (Senshi, StreamNin, and FileMoon). The watch tab looks up the title's AniList-provided MyAnimeList ID and lets users select returned mirrors. Update/redeploy the worker to use it; the repo does not include a hosted worker. Embed permissions, ads, CORS and subtitle/audio availability are controlled by the mirror. A GitHub Actions request to Senshi for a sample episode returned HTTP 403 without a CORS header; a deployed worker or other network may behave differently, but neither mirror playback nor bypass has been verified. These are embed fallbacks, not Kitsune's VidCloud stream extractor.

### More servers: compatible provider API

When configured by the site maintainer in `js/config.js`, the **More servers** tab speaks the Kitsune-compatible provider API contract: `/episodes/{anilistId}`, `/watch/{provider}/{anilistId}/{sub|dub}/{provider}-{episode}`, and `/proxy`. It displays reported providers and their individual mirrors and uses the configured API's proxy for HLS/MP4. The API base must be a trusted HTTPS URL ending in `/api`; viewers do not enter it. Nothing in this tab embeds the upstream website.

The adapter recognizes all 12 providers listed below, but this repository does **not** contain or host their full server-side extractors. The API must already be separately deployed and must allow your Pages origin with CORS; its proxy and providers need their own access controls, network protections and rate limits. The upstream proxy accepts arbitrary URLs and must not be exposed publicly without hardening. Media URLs, required headers, encrypted playlists, ads and subtitles vary; this frontend forwards a referer and playlist key but not arbitrary provider headers, so some streams may fail. Provider discovery and switching are mock-tested only. Without a compatible backend, use Instant play.

### MKissa anime and manga

When a backend is configured, the **MKissa** tab selects MKissa on the compatible provider API and uses its filtered `/episodes/mkissa/{anilistId}?map=false` endpoint. It understands MKissa's `sources` response, including extracted HLS/MP4 and supported embed mirrors. This is a frontend adapter, **not** an MKissa server: a separately hosted, CORS-enabled, hardened API with MKissa support and a working proxy is required. No MKissa backend is deployed by this repository, so the tab is hidden and real MKissa playback has not been verified. A public Anivexa endpoint observed in another project was paused, and the Anisurge scraper returned not-found for MKissa on several sample titles; neither is configured as a working substitute. Viewers are never asked to enter a URL. MKissa may require a security check; the app does not solve or bypass it. Complete any check through the provider, though that authorization may not transfer to the API host.

MKissa also has a manga catalogue (see [AllManga extension](https://github.com/keiyoushi/extensions-source/tree/main/src/en/allanime)), but its page extraction uses a protected browser flow, not the Kitsune anime API. **MKissa manga is not integrated**; NullxAnime has separate MangaDex and Asura catalogues and readers. No MKissa website is embedded. A future implementation needs a permitted, supported page source and must handle access checks without bypassing them.

### Upstream coverage

At Kitsune commit `cd05752f01d3365fdd5a600445703084383f3c78`, its backend lists mkissa, reanime, anikoto, animegg, animenosub, anizone, aniwaves, senshi, kaa, animedunya, animeonsen and anipm. NullxAnime implements the MegaPlay fallback, AnimeGG worker, and Senshi embed mirrors; the optional API client can discover the other providers only if a compatible backend is supplied. Their server-side extractors are **not** implemented or deployed here. They require different server-side extractors, dependencies, access and/or deployment; a static Pages site cannot run them. Mirror links are dynamic per title and episode, not a complete static list in the repository.

The third inspected repository, awesome-anime-sources, is a directory rather than a player API. Its sites cannot be assumed embeddable, ad-free, licensed, or currently online; the existing Discover directory is curated rather than a copy of every link.

### AniPub

AniPub's `backend/models/AniDB.js` stores the first video link and episode links in MongoDB; `views-ejs/AniPlayer.ejs` renders either an iframe or a video source. The repository does not contain that catalogue or the values of the `aniAPI` and `VIDEOAPI` deployment variables. The AniPub tab uses an AniPub deployment's search API and episode HTML, extracts the underlying player URL, and mounts that video or iframe instead of the whole AniPub page. Search or page fetch requires CORS; the source itself must allow embedding or playback. The AniPub tab is hidden unless a site-maintainer-configured deployment exists; an open-on-AniPub link is provided if extraction or playback fails. Episode indices on AniPub are zero-based; NullxAnime translates episode 1 to index 0.

Do not put credentials in deployment URLs. External providers and deployment operators control their content and permissions.

## Built-in sources

Episode players are configured in `js/pages/watch.js`. Aniweeb uses its documented `/embed/ani/{anilistId}/{episode}?track=sub|dub&server=1..2` player route. Its numbered servers do not identify themselves as MKissa. The browser contacts Aniweeb directly; its availability, content, ads, regional behavior and playback are outside this project. The sample player page responded during development, but live video playback was not verified.
Each tab on the watch page has a `kind`:

| kind | what it does |
| --- | --- |
| `instant` / `aniweeb` | documented episode-player embeds (third party) |
| `library` | Internet Archive search + custom player |

For maintainers: integrate a provider only where its access and embedding are permitted.


Asura's reader uses `https://api.asurascans.com/api` directly for catalogue, unlocked chapter metadata and page URLs; images are loaded directly as images. The implementation is independent of the Android extension and cannot install APKs. It does not bypass challenges or paid chapters. CORS, hotlinking and availability may change. Metadata and chapter JSON were observed for a sample title, but browser image rendering on the deployed origin has not been verified. MangaFire, Toonily and MKissa manga have no integrated reader here; several need different access, cross-origin handling or a server.

AniList data is fetched by `js/api/anilist.js`; adding fields to the `CARD` fragment makes them available on every card.

### Other manga sources

Omega Scans, Vortex Scans and Hivetoons have separate clients in `js/api/scans.js` and an image reader in `js/pages/scans.js`. They request public JSON directly, limit request rate, filter paid and locked chapters, validate series and image origins, and never embed an upstream website or execute its ad scripts. Omega's entire catalogue is behind the existing local 18+ self-attestation, including direct links. The Iken and HeanCMS API shapes were informed by the [Mangayomi Iken extension](https://github.com/m2k3a/mangayomi-extensions) and [Keiyoushi HeanCMS extension](https://github.com/keiyoushi/extensions-source); no extension APKs are installed. No login or bypass for paid chapters, access checks or CAPTCHA is implemented. Test fixtures cover catalogue, gating, locked chapters and image URLs. Live catalogue, chapter list and page URL JSON were observed. Earlier browser probes ran with web security disabled and did not establish CORS; the current non-blocking probe enables browser security and tests the Pages origin plus a sample cover and chapter page (not every title or region). Hivetoons sample cover did not load in CI and the catalogue is marked experimental. Providers can block or change access; Omega returned a 502 during one request. These source readers do not sync to the MangaDex tracker.

### Ads and redirects

Aniweeb and configured third-party mirrors run in sandboxed iframes without popup or top-navigation permissions. Instant play has an opt-in sandbox because the provider may refuse to play in one. Sandboxing can prevent popup windows and parent-page redirects; it cannot inspect or block ads, redirects within the frame, tracking, or embedded ad media. A third-party player or browser may still fail. No provider security challenges are automatically bypassed.

### Optional Asura / Vortex JSON gateway

The reader can fall back to `manga-gateway/worker.js` after a direct public API request fails, using the separately deployed Worker configured in `js/config.js`. A static GitHub Pages site cannot run it itself. The relay is only used when a direct request fails; it may also be blocked by a provider.

To operate or replace it, the site operator needs a separate Cloudflare Workers deployment. Review the provider's terms and access restrictions, deploy `manga-gateway/wrangler.toml` using an authenticated operator account, set `mangaGateway` in `js/config.js` to the resulting HTTPS worker base, then redeploy Pages. The end user never enters an endpoint or credentials. Only the existing Pages origin is allowed in `manga-gateway/worker.js`; change that allowlist deliberately if hosting elsewhere. Never commit credentials.

The relay supports only a small allowlist of public Asura/Vortex JSON paths and bounded query parameters; it does not proxy arbitrary URLs, forward cookies or authorization, follow redirects, serve images, access MangaDex, solve challenges, or unlock paid content. Search terms and titles sent to the relay are visible to its operator. Origin checks are not authentication; before exposing it, configure Cloudflare-side rate limiting and usage controls to prevent abuse. Even after deployment, a provider can block the relay, alter its API, or deny image access. Test the catalogue, unlocked chapter list and actual images from the affected browser before describing it as working.
