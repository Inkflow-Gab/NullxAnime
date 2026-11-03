// Update this record for every release with the user-facing changes.
// The Pages workflow stamps the deployed commit as the unique release ID.
export const RELEASE = Object.freeze({
  id: '2026-11-manga-connection',
  title: 'Manga browsing & connection checks',
  changes: [
    'Switch between latest and popular manga and manhwa from multiple catalogues.',
    'Check catalogue connections and sample images on your device when reading fails.',
    'Source availability still varies by network, region and title.',
  ],
});
