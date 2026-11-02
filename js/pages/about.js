import { html } from '../util.js';
import { icon } from '../ui/icons.js';

export default async function about(ctx) {
  ctx.setTitle('About');
  ctx.render(html`<div class="container page narrow prose">
    <h1 class="page-title">About NullxAnime</h1>
    <p class="lead">A sleek, fast anime &amp; manga hub. External deployments may have their own policies and requirements. Your list lives in your own browser.</p>

    <h2>What it does</h2>
    <ul>
      <li><b>Discover anime</b> — trending, seasonal, top-rated, full search and filters, airing schedule, characters, relations and recommendations (data from AniList).</li>
      <li><b>Watch legally</b> — plays official free YouTube streams and trailers inline, links straight to the official service for each episode (Crunchyroll, Netflix, Muse Asia…), plays public-domain / Creative-Commons video from the Internet Archive, and plays your own files and links.</li>
      <li><b>Read manga, manhwa &amp; manhua</b> — a full reader (vertical, LTR, RTL) on top of the open MangaDex API, with official-release links highlighted.</li>
      <li><b>Track everything</b> — one list for anime and manga, progress, scores, history, stats, backup and MyAnimeList/AniList XML export.</li>
    </ul>

    <h2>Third-party players</h2>
    <div class="notice">${icon('shield')}<div>Instant play uses a third-party episode player; the AnimeGG worker and AniPub player use external providers and deployments. Their availability, content and playback policies depend on the provider.</div></div>

    <h2>Credits &amp; sources</h2>
    <ul>
      <li><a href="https://anilist.co" target="_blank" rel="noopener">AniList</a> — anime metadata, schedules, artwork links.</li>
      <li><a href="https://mangadex.org" target="_blank" rel="noopener">MangaDex</a> — manga catalogue and reader images. Please respect scanlation groups and buy official releases.</li>
      <li><a href="https://archive.org" target="_blank" rel="noopener">Internet Archive</a> — open-licensed video.</li>
      <li><a href="https://github.com/video-dev/hls.js" target="_blank" rel="noopener">hls.js</a> (Apache-2.0) — HLS playback for your own streams.</li>
      <li>Feature ideas (ad-free browsing, installable PWA, watch progress) inspired by the open-source projects <a href="https://github.com/AnimePub/AniPub" target="_blank" rel="noopener">AniPub</a> and <a href="https://github.com/Dovakiin0/Kitsune" target="_blank" rel="noopener">Kitsune</a>, and the community list <a href="https://github.com/anshumanv/awesome-anime-sources" target="_blank" rel="noopener">awesome-anime-sources</a>. The AnimeGG worker adapts Kitsune code under the MIT license; see the repository for attribution.</li>
    </ul>

    <h2>Privacy</h2>
    <p>NullxAnime has no analytics or account. Third-party players and external deployments may use cookies or analytics. Your list, history and settings are stored in your browser’s local storage. Requests go directly from your browser to AniList, MangaDex, the Internet Archive, YouTube’s privacy-enhanced player, the third-party Instant play provider when watching, and any community deployment you choose to connect.</p>

    <h2>Copyright</h2>
    <p>All anime, manga, artwork and trademarks belong to their respective owners. If you are a rights holder and have a concern, please open an issue on the <a href="https://github.com/Inkflow-Gab/NullxAnime" target="_blank" rel="noopener">GitHub repository</a>.</p>
  </div>`);
}
