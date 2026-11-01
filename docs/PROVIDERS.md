# Adding a watch source ("provider")

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
3. Only add sources you have the right to distribute. Scrapers for unlicensed sites will not be accepted.

AniList data is fetched by `js/api/anilist.js`; adding fields to the `CARD` fragment makes them available on every card.
