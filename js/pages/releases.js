// Browse recent AniList airing events, page by page; aired does not guarantee a stream.
import { html, $, timeAgo } from '../util.js';
import { recentEpisodes } from '../api/anilist.js';
import { card, fromAnime, skelGrid, errorBox, emptyBox } from '../ui/components.js';

export default async function releases(ctx) {
  ctx.setTitle('Recent episodes');
  // Freeze the time window so new arrivals cannot shift items between pages mid-browse.
  const to = Math.floor(Date.now() / 60000) * 60, from = to - 30 * 86400;
  ctx.render(html`<div class="container page"><div class="search-head"><div><h1 class="page-title">Recent episodes</h1><p class="muted">AniList airing events from the last 30 days, newest first. Airing does not guarantee a provider has the episode yet.</p></div><div class="row"><a class="btn" href="#/schedule">Airing schedule</a><a class="btn" href="#/search?type=anime&status=RELEASING&sort=START_DATE_DESC">New series</a></div></div><div id="release-results">${skelGrid(12)}</div><div class="load-more" id="release-more" hidden><button class="btn" id="release-load">Load more</button></div></div>`);
  let page = 1, busy = false, started = false;
  const load = async () => {
    if (busy) return;
    busy = true;
    const button = $('#release-load', ctx.el); button.disabled = true;
    try {
      const result = await recentEpisodes(from, to, page);
      if (!ctx.alive()) return;
      const markup = result.items.map((x) => {
        const item = fromAnime(x.media);
        return card(item, { href: `#/watch/${item.id}/${x.episode}`, badge: `EP ${x.episode} · ${timeAgo(x.airingAt * 1000)}`, sub: `Episode ${x.episode}` });
      }).join('');
      const box = $('#release-results', ctx.el);
      if (!started) {
        box.innerHTML = '<div class="grid" id="release-grid"></div>';
        started = true;
      }
      $('#release-grid', ctx.el).insertAdjacentHTML('beforeend', markup);
      page++;
      $('#release-more', ctx.el).hidden = !result.hasNext;
      if (!result.hasNext && !$('#release-grid .card', ctx.el)) box.innerHTML = emptyBox('calendar', 'No recent episodes found', 'Try the airing schedule or browse new series.').toString();
      button.textContent = 'Load more';
    } catch (error) {
      if (ctx.alive()) {
        if (!started) $('#release-results', ctx.el).innerHTML = errorBox(error).toString();
        else { $('#release-more', ctx.el).hidden = false; button.textContent = 'Retry'; }
      }
    } finally { busy = false; button.disabled = false; }
  };
  $('#release-load', ctx.el).addEventListener('click', load);
  await load();
}
