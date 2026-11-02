// Build-time endpoints operated by the site maintainer, never entered by viewers.
// Leave an endpoint empty until it is securely deployed and verified.
export const PROVIDER_ENDPOINTS = Object.freeze({
  kitsuneApi: '', // HTTPS base ending in /api, with MKissa support
  streamWorker: '', // HTTPS AnimeGG / Senshi worker
  aniPub: '', // HTTPS AniPub deployment
});
