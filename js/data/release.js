// Update this record for every release with the user-facing changes.
// The Pages workflow stamps the deployed commit as the unique release ID.
export const RELEASE = Object.freeze({
  id: '2026-11-manga-relay',
  title: 'Manga connection update',
  changes: [
    'Asura and Vortex can use a relay when direct catalogue requests fail.',
    'The connection check shows both direct and relay results.',
    'Availability and chapter images still depend on each provider and network.',
  ],
});
