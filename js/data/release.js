// Pages stamps the deployed commit as the unique release ID.
export const RELEASE = Object.freeze({
  id: '2026-11-adult-servers',
  title: 'In-page adult servers',
  changes: [
    'Adult titles now have their own in-page server choices, separate from regular anime.',
    'MegaVid is tried first; adult playback and exact episode matching are not verified.',
    'Switch servers or retry when a provider or episode is unavailable.',
  ],
});
