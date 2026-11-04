// Local, best-effort device hints. Layout still adapts to viewport and input capabilities.
export function detectDevice({ userAgent = '', width = 1024, coarse = false } = {}) {
  if (/smart[- ]?tv|vidaa|hisense|hbbtv|netcast|web0s|webos|tizen|appletv|googletv|android tv|aft[bms]|\bcrkey\b|playstation|xbox/i.test(userAgent)) return 'tv';
  if (/ipad|tablet|silk/i.test(userAgent) || (/android/i.test(userAgent) && !/mobile/i.test(userAgent))) return 'tablet';
  if (/iphone|ipod|android.*mobile|windows phone/i.test(userAgent)) return 'phone';
  if (coarse && width < 600) return 'phone';
  if (coarse && width < 1024) return 'tablet';
  return 'desktop';
}

export function currentDevice() {
  return detectDevice({ userAgent: navigator.userAgent, width: window.innerWidth, coarse: window.matchMedia?.('(pointer: coarse)').matches });
}

// Conservative hints only; device detection is local and never uploaded.
export function useLightweightEffects({ device = 'desktop', memory, saveData = false } = {}) {
  return device === 'phone' || device === 'tv' || saveData || (Number.isFinite(memory) && memory > 0 && memory <= 4);
}
