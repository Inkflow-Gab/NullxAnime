// Direct provider JSON first; a maintainer-operated gateway may be configured
// when a provider does not expose its public API to the browser's origin.
import { PROVIDER_ENDPOINTS } from '../config.js';
import { requestTimeout } from '../util.js';

export async function mangaJSON(source, url, path) {
  let lastError;
  const configured = PROVIDER_ENDPOINTS.mangaGateway;
  const endpoints = [url];
  try {
    const gateway = new URL(configured);
    if (gateway.protocol === 'https:' && !gateway.username && !gateway.password && !gateway.search && !gateway.hash && ['asura', 'vortex'].includes(source)) endpoints.push(`${gateway.href.replace(/\/$/, '')}/${source}${path}`);
  } catch { /* no deployed gateway */ }
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { credentials: 'omit', headers: { Accept: 'application/json' }, signal: requestTimeout(endpoints.length > 1 ? 8000 : 15000) });
      if (!response.ok) { lastError = new Error(`HTTP ${response.status}`); continue; }
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid provider response');
      return data;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Connection failed');
}
