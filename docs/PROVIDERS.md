# Adding a watch source ("provider")

## Community streaming

### Instant play

The default **Instant play** tab embeds `https://megaplay.buzz/stream/ani/{anilistId}/{episode}/{sub|dub}`, the fallback used in Kitsune's watch player. Sub/dub choice is remembered across episodes. This is a third-party iframe, not a bundled video server. The provider rejects sandboxed embeds, so it is embedded without an iframe sandbox (the normal cross-origin boundary still applies): GitHub Pages does not fetch or proxy its video, so browser CORS is not needed for the embed. Its operator controls availability, content and embedding; autoplay, subtitle/dub coverage, network access, regional blocks, third-party cookies and browser support may vary. If it does not load, use another source tab. We cannot guarantee playback or test live providers from this sandbox.

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
3. On a watch page, select **AnimeGG**, enter the HTTPS worker URL printed by Wrangler and search. Choose the matching series/season and audio, then load the episode. The URL is saved in browser settings. You can remove it with **Forget URL**.

The worker fetches provider HTML, issues time-limited signed URLs for sources, and proxies MP4 or HLS manifests, keys, segments and range requests. The token secret is required; arbitrary client-supplied proxy URLs are not accepted. The worker rejects literal IPs, credentials, local hostnames, non-HTTPS URLs and non-standard ports; provider pages and signed HLS manifests still determine which upstream domains it contacts. Origin checks are not authentication: configure Cloudflare access controls, rate limits and usage limits as appropriate for your deployment. Provider HTML, mirrors, CORS, URLs, availability and episode numbering can change. Some HLS formats or servers may not work; live provider access was not tested in this sandbox.

### AniPub

AniPub's `backend/models/AniDB.js` stores the first video link and episode links in MongoDB; `views-ejs/AniPlayer.ejs` renders either an iframe or a video source. The repository does not contain that catalogue or the values of the `aniAPI` and `VIDEOAPI` deployment variables. The AniPub tab uses an AniPub deployment's search API and episode HTML, extracts the underlying player URL, and mounts that video or iframe instead of the whole AniPub page. Search or page fetch requires CORS; the source itself must allow embedding or playback. A numeric title ID can be entered manually, and an open-on-AniPub link is provided if extraction or playback fails. Episode indices on AniPub are zero-based; NullxAnime translates episode 1 to index 0.

Do not put credentials in deployment URLs. External providers and deployment operators control their content and permissions.

## Built-in sources

Sources are described in `js/sources.js` (`buildSources`) and rendered in `js/pages/watch.js`.
Each tab on the watch page has a `kind`:

| kind | what it does |
| --- | --- |
| `embed` | shows `src` in a sandbox-friendly `<iframe>` (used for official YouTube streams & trailers) |
| `services` | launch pad with links to official services |
| `library` | Internet Archive search + custom player |
| `mine` | the user's own link / local file in the custom player |

To add one (e.g. a **licensed** service with an embed API, or your own media server):

1. Return a descriptor from `buildSources(media, ep)`:
   ```js
   out.push({ id: 'my-server', kind: 'embed', label: 'My server', note: 'Hosted by me', src: `https://media.example.com/embed/${media.id}/${ep}` });
   ```
2. For anything with a custom UI, add a new `kind` branch to `select()` in `watch.js` next to `libraryView()` / `mineView()`. Use `mountPlayer({ src })` for direct MP4/HLS URLs.
3. Test provider errors, availability, and browser CORS/embedding behavior.

AniList data is fetched by `js/api/anilist.js`; adding fields to the `CARD` fragment makes them available on every card.
