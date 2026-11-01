# Adding a watch source ("provider")

Video on the watch page comes from the **provider layer** in `js/providers.js`.
A provider turns *(anime + episode)* into a list of playable media, and the UI
just renders whatever the registry returns — no page changes needed.

```
watch page  ──resolveSources(ctx)──►  [ provider, provider, provider ]  ──►  playable items  ──►  player
```

## What ships by default

| Provider | What it does |
| --- | --- |
| `direct` — **My stream** | Plays a video/HLS URL, or a URL *template*, that you own or are allowed to use. Saved in `localStorage` per title (`nx:src`), with an optional "every title" default. |
| `archive` — **Internet Archive** | Searches the public-domain / Creative-Commons library for the title and returns its playable files. |

Nothing else is bundled. No YouTube embeds, no Crunchyroll/Netflix links, and
**no scraper for unlicensed streaming sites** — see *Rules* below.

## The contract

```js
registerProvider({
  id: 'my-server',                       // unique, stable
  label: 'My server',                    // shown as the group heading
  note: 'Hosted by me',                  // small grey line under it
  async resolve(ctx) {
    // ctx = { media, item, ep, count, title, id, idMal }
    // return an array of items (or a single item); [] / throw = "nothing here"
    return [
      {
        label: 'Episode 3 — 1080p',
        src: 'https://media.example.com/anime/1000/3/master.m3u8',
        type: 'hls',               // 'hls' | 'video'   (guessed from the URL if omitted)
        poster: 'https://…/poster.jpg',   // optional
        quality: '1080p',                 // optional
        note: 'Own CDN',                  // optional
        page: 'https://example.com/ep/3', // optional "open the source page" link
        subtitles: [                      // optional
          { url: 'https://…/3.en.vtt', label: 'English', lang: 'en' },
        ],
      },
    ];
  },
});
```

`src` must be an absolute `http(s)` URL — it is validated with `safeUrl()`.
The player detects HLS (`.m3u8`), loads hls.js from `vendor/`, and exposes
quality levels and subtitle tracks automatically.

## Helpers you get for free

```js
import { registerProvider, getSourceConfig, setSourceConfig, expandTemplate } from './providers.js';

expandTemplate('https://cdn.example.com/{id}/{ep0}.m3u8', ctx);
// {id} {idMal} {ep} {ep0} {title} {slug} are all substituted
```

## Rules for a provider

1. **Only sources you have the right to distribute.** Your own files/server, a
   CDN you pay for, public-domain / Creative-Commons archives, or a licensed
   API. Scrapers for unlicensed streaming sites are not accepted.
2. **No secrets in the client.** This is a static site — anything in a provider
   file is public. Never put API keys in one; use a server you control.
3. **CORS.** The browser fetches the stream directly. If the host does not send
   `Access-Control-Allow-Origin`, playback fails no matter what you do here —
   use your own server, which you can configure.
4. **Report, don't throw.** Return `[]` when a title is missing; throwing is
   fine too (the UI shows the message per provider) but silence is nicer.

## Where to register

Add a `js/providers.example.js` style module and import it once from
`js/main.js` (or append to `js/providers.js`). Keep each provider small and
independent so a broken one never blocks the others — `resolveSources()` runs
them in parallel and isolates failures.
