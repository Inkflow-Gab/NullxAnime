import { html } from '../util.js';
import { getSettings, setSetting } from '../store.js';

export const layoutClass = () => getSettings().browseLayout === 'list' ? 'list-view' : '';
export function layoutControls() {
  const list = getSettings().browseLayout === 'list';
  return html`<div class="browse-layout" role="group" aria-label="Results layout"><span>View</span><button type="button" data-layout="grid" aria-pressed="${!list}">Grid</button><button type="button" data-layout="list" aria-pressed="${list}">List</button></div>`;
}
export function bindBrowseLayout(root) {
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-layout]');
    if (!button || !root.contains(button)) return;
    const mode = button.dataset.layout;
    setSetting('browseLayout', mode);
    root.querySelectorAll('[data-layout]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === mode)));
    root.querySelectorAll('.layout-grid').forEach((grid) => grid.classList.toggle('list-view', mode === 'list'));
  });
}
