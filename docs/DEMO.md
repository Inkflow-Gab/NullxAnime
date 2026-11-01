# Demo script & slide outline

A 5-minute run-of-show for presenting NullxAnime, plus the slide outline and the
answers to the two questions a teacher is most likely to ask.

---

## 10 minutes before class

```bash
cd NullxAnime
npm install        # once
npm start          # → http://localhost:8080
```

1. Open the site, then open **Settings → nothing to change**, just confirm the
   theme loads (this warms the service worker).
2. Visit one title you will show (e.g. `#/anime/154587`) so the AniList call is
   cached — the demo then runs on cached data even if the school Wi-Fi drops.
3. Have a stream URL ready to paste into **Streaming sources**:
   * your own host — `https://your-host/shows/{id}/{ep}.mp4`
   * or any public-domain file — `https://archive.org/download/<id>/<file>.mp4`
4. Hard-refresh once (`Ctrl/Cmd+Shift+R`) so the new JS is definitely loaded.

---

## Run of show (5 minutes)

| Time | Do this | Say this |
| --- | --- | --- |
| 0:00 | Home page | "One static site, no build step, no sign-up, no ads. Data comes from AniList." |
| 0:30 | Scroll: Top 10 → Recently updated → Airing soon | "Deep links: *recently updated* goes straight to the episode that just aired." |
| 1:00 | Open a title page | "Episode grid, characters, relations, recommendations, my tracker on the right." |
| 1:30 | Click **Start · EP 1** | "This is the watch page. Tabs: **Streaming sources**, **Free library**, **My link / file**." |
| 2:00 | **Streaming sources** → point at the two providers | "Not one hard-coded website. A **provider layer** asks every registered source for a stream, in parallel, and plays whatever comes back." |
| 2:30 | Paste your link with `{ep}` → **Play once** | "One URL plays a whole series — `{id}`, `{ep}`, `{ep0}`, `{title}` are substituted per episode." |
| 3:00 | **Save & play** | "Saved per title. **Use for every title** makes it the default for the whole library." |
| 3:15 | Player: quality menu, subtitles, speed, PiP, ←/→ keys | "HLS with quality switching via hls.js, multi-track subtitles, keyboard control, resume position, auto-next." |
| 3:45 | **Free library** tab | "Public-domain and Creative-Commons video from the Internet Archive — genuinely free to play." |
| 4:00 | Manga: MangaDex reader (vertical ↔ paged RTL) | "Same app, full manga reader." |
| 4:20 | Library / export backup | "Everything lives in `localStorage` — one JSON backup, MAL/AniList XML export." |
| 4:35 | `Ctrl+K` palette, mobile tab bar | "Command palette, installable PWA, works offline for cached pages." |
| 4:50 | Close | "Static, private, and the source layer is pluggable by design." |

---

## Slide outline (8 slides)

1. **NullxAnime** — anime & manga hub. Static site, no build step, no accounts, no tracking.
2. **The problem** — tracking a show means 4 tabs: list, schedule, player, wiki.
3. **What it does** — discover, track, watch, read. Screenshot grid.
4. **Architecture** — AniList + MangaDex + Internet Archive → `js/api/*` → pages →
   `localStorage`. One diagram, three boxes.
5. **The interesting part: the provider layer** —
   `resolveSources(ctx)` → `[{provider, items}]` → player.
   Parallel, isolated failures, safe URL validation, no page changes to add a source.
6. **Playback** — hls.js quality levels, subtitles, resume, auto-next, keyboard.
7. **What it deliberately doesn't do** — no scrapers, no pirate hosts, no proxying.
   Sources are *user-supplied*; the app ships none.
8. **Next steps** — accounts? no. Better: offline downloads, more providers the
   user registers, PWA push for airing episodes.

---

## The questions you will get

**"Where does the video come from?"**
> From providers the user configures. The app itself ships two: the Internet
> Archive's open library, and a URL/template player for a link the user is allowed
> to use. Everything else is a `registerProvider()` call — the app never bundles a
> scraper for a streaming site, because I'd be redistributing someone else's
> licensed content and it would break within a month anyway.

**"Isn't that just a video player with extra steps?"**
> No — the provider turns *(title, episode)* into streams automatically, handles
> HLS manifests, quality levels, subtitles, failures per source, and remembers
> progress per episode. Swapping a source is config, not code.

**"How would you add another source?"**
> One file, ~15 lines: an `id`, a label, and a `resolve(ctx)` that returns
> `{ label, src, type, subtitles }`. Documented in `docs/PROVIDERS.md`. If it's a
> licensed API with a key, it needs a small server, since this is a static site —
> that's the honest limit of the architecture.

---

## If something breaks on the day

| Symptom | Fix |
| --- | --- |
| Blank page | `Ctrl/Cmd+Shift+R`; check the console for a stale service worker (`?nosw` skips it) |
| Titles don't load | AniList is down or blocked — you're offline; cached pages still open |
| Pasted link won't play | The host must send `Access-Control-Allow-Origin`; test the same URL in a new tab first |
| Player shows "Network error" | That host blocks hot-linking — use a host you control |
