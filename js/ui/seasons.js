// Related installments are labelled by title rather than guessed season numbers.
import { html, render, $ } from '../util.js';
import { relatedSeasons } from '../api/anilist.js';
import { titleOf, fmtFormat } from './components.js';
import { episodeCount } from '../sources.js';
import { go } from '../router.js';

export async function mountSeasonPicker(ctx, media, target, watch = false) {
  try {
    const seasons = await relatedSeasons(media);
    if (!ctx.alive() || seasons.length < 2) return;
    const box = $(target, ctx.el);
    if (!box) return;
    render(box, html`<section class="season-picker"><label class="field" for="season-select">Related seasons &amp; installments</label><select id="season-select" class="select">${seasons.map((s) => html`<option value="${s.id}" ${String(s.id) === String(media.id) ? 'selected' : ''}>${titleOf(s)} · ${fmtFormat(s.format)}${s.seasonYear ? ` · ${s.seasonYear}` : ''}${s.status === 'NOT_YET_RELEASED' ? ' · Upcoming' : ''}</option>`)}</select><small class="muted">Based on AniList prequel/sequel links. Airing does not guarantee streaming availability.</small></section>`);
    $('#season-select', box).addEventListener('change', (e) => {
      const selected = seasons.find((s) => String(s.id) === e.target.value);
      if (!selected || String(selected.id) === String(media.id)) return;
      go(watch && episodeCount(selected) > 0 ? `/watch/${selected.id}/1` : `/anime/${selected.id}`);
    });
  } catch { /* Season metadata is optional; the title and episode list remain usable. */ }
}
