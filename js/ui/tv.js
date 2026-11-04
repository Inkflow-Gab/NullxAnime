// Optional spatial navigation for keyboard-like TV remotes.
const SELECTOR = 'a[href], iframe[title], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const EXCLUDED = 'input, select, textarea, [contenteditable="true"], [role="tablist"], .vp, .reader, .scrim, .popover';
const DIRECTIONS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** Choose a forward candidate, favoring the same row or column. */
export function nearestDirectional(current, candidates, direction) {
  const axis = DIRECTIONS[direction];
  if (!axis) return null;
  const cx = (current.left + current.right) / 2, cy = (current.top + current.bottom) / 2;
  let best = null, bestScore = Infinity;
  for (const candidate of candidates) {
    const r = candidate.rect;
    const dx = (r.left + r.right) / 2 - cx, dy = (r.top + r.bottom) / 2 - cy;
    const forward = dx * axis[0] + dy * axis[1];
    if (forward <= 1) continue;
    const sideways = Math.abs(dx * axis[1] - dy * axis[0]);
    const score = forward + sideways * 2.5;
    if (score < bestScore) { best = candidate.element; bestScore = score; }
  }
  return best;
}

export function installTvNavigation() {
  document.addEventListener('keydown', (event) => {
    if (document.documentElement.dataset.tvMode !== 'on' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const playerRoot = event.target instanceof Element && event.target.matches('.vp');
    if (!DIRECTIONS[event.key] || !(event.target instanceof Element) || (!playerRoot && event.target.closest(EXCLUDED))) return;
    // Left/right belongs to the player for seeking; up/down can leave the player.
    if (playerRoot && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;
    if (document.querySelector('.scrim, .popover')) return;
    const items = [...document.querySelectorAll(SELECTOR)].filter((element) => {
      if (element.tabIndex < 0 || element.closest('[hidden], [aria-hidden="true"], .reader') || (element.closest('.vp') && !element.matches('.vp, .vp-native-toggle')) || element.getAttribute('aria-disabled') === 'true' || element.classList.contains('disabled')) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    });
    const active = document.activeElement;
    if (!items.includes(active)) {
      const first = items.find((item) => {
        const rect = item.getBoundingClientRect();
        return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      });
      if (first) { event.preventDefault(); first.focus({ preventScroll: false }); }
      return;
    }
    const target = nearestDirectional(active.getBoundingClientRect(), items.filter((el) => el !== active).map((element) => ({ element, rect: element.getBoundingClientRect() })), event.key);
    if (target) { event.preventDefault(); target.focus({ preventScroll: false }); target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  });
}
