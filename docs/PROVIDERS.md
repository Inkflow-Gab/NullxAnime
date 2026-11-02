# Adding a watch source ("provider")

## Community deployments

On any watch page, choose **Kitsune** or **AniPub**. These integrations use their upstream interfaces; they do not include a backend, catalogue or video in this repository.

- **Kitsune:** The tab defaults to the upstream project’s listed deployment, `https://kitsunee.moe`, and attempts to load sources when selected. Alternatively, run a Kitsune deployment as described in its [README](https://github.com/Dovakiin0/Kitsune), make it accessible over HTTPS, and enter its root URL (not `/api`) in the Kitsune tab. The default is not verified live here and may be down or reject cross-origin requests. NullxAnime requests `/api/episodes/{anilistId}`, lets you pick a provider and sub/dub, requests the returned `/api/watch/...` episode ID, and plays a stream through that deployment's `/api/proxy`. The browser must be allowed to access these endpoints via CORS. The upstream proxy may expose access to arbitrary URLs; secure your deployment rather than exposing an unprotected proxy publicly.
- **AniPub:** Enter an HTTPS deployment root URL (defaults to `https://anipub.org`). Search by title, explicitly select the correct match, then open the episode. The upstream search API must permit cross-origin browser access. If it does not, find the numeric ID in AniPub's `/AniPlayer/<ID>/...` URL and enter it manually. The AniPub site must allow framing for in-page playback; otherwise use the provided open-in-new-tab link. AniPub's episode indexes begin at zero, so NullxAnime episode 1 uses index 0. Audio options and availability depend on AniPub.

URLs are stored in browser localStorage and must not contain credentials. HTTPS is required. External sources can fail, change, block embeds, or lack a particular episode. The deployment operator is responsible for its contents and permissions. GitHub Pages cannot run the required server. No live external services are exercised by the automated tests.

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
