// Update this record for every release with the user-facing changes.
// The Pages workflow stamps the deployed commit as the unique release ID.
export const RELEASE = Object.freeze({
  id: '2026-11-cache-repair',
  title: 'A more reliable update',
  changes: [
    'Fixed an update issue that could mix older and newer files and prevent pages from opening.',
    'Future updates keep each open tab on a consistent version until you choose to reload.',
    'MangaFire remains unavailable; chapter and player availability can vary.',
  ],
});
