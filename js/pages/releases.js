// Browse recent AniList airing events, page by page; aired does not guarantee a stream.
import { html, $, timeAgo } from '../util.js';
import { recentEpisodes } from '../api/anilist.js';
import { card, fromAnime, skelGrid, errorBox, emptyBox } from '../ui/components.js';

export default async function releases(ctx) {
  ctx.setTitle('Recent episodes');
  // Freeze the time window so new arrivals cannot shift items between pages mid-browse.
  const to = Math.floor(Date.now() / 60000) * 60, from = 0;
  ctx.render(html`<div class="container page"><div class="search-head release-head"><div><span class="release-kicker">THE LATEST · NEWEST FIRST</span><h1 class="page-title">Recent episodes</h1><p class="muted">Recently aired episodes, newest first. Keep scrolling for older releases. Aired does not guarantee a provider has the episode yet.</p></div><div class="row"><a class="btn" href="#/schedule">Airing schedule</a><a class="btn" href="#/search?type=anime&status=RELEASING&sort=START_DATE_DESC">New series</a></div></div><div id="release-results">${skelGrid(12)}</div><p id="release-limit" class="muted" hidden>AniList browsing is limited to 500 pages.</p><div class="load-more" id="release-more" hidden><button class="btn" id="release-load">Load more</button></div></div>`);
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
        return card({ ...item, cover: item.banner || item.cover }, { href: `#/watch/${item.id}/${x.episode}`, badge: `EP ${x.episode} · ${timeAgo(x.airingAt * 1000)}`, sub: `Episode ${x.episode}` });
      }).join('');
      const box = $('#release-results', ctx.el);
      if (!started) {
        box.innerHTML = '<div class="grid release-grid" id="release-grid"></div>';
        started = true;
      }
      $('#release-grid', ctx.el).insertAdjacentHTML('beforeend', markup);
      page++;
      $('#release-more', ctx.el).hidden = !result.hasNext || page > 500;
      $('#release-limit', ctx.el).hidden = !(result.hasNext && page > 500);
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
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => { if (entries[0].isIntersecting && !$('#release-more', ctx.el).hidden && !busy && $('#release-load', ctx.el).textContent !== 'Retry') load(); }, { rootMargin: '500px' }) : null;
  observer?.observe($('#release-more', ctx.el));
  ctx.cleanup(() => observer?.disconnect());
  await load();
}
