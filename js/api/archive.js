// Internet Archive client — a legal, open library of public-domain / Creative-Commons video.
// https://archive.org/advancedsearch.php  and  https://archive.org/metadata/<id>

import { cached, MIN, HOUR } from '../cache.js';
import { qs } from '../util.js';

const OPEN_LICENSE = '(licenseurl:(*creativecommons*) OR licenseurl:(*publicdomain*))';

export function searchOpenVideo(text, rows = 24, page = 1) {
  const clean = String(text || '').replace(/["():\\/\[\]{}^~*?!+-]/g, ' ').replace(/\s+/g, ' ').trim();
  const topic = clean
    ? `title:(${clean})`
    : '(subject:(anime) OR subject:("japanese animation") OR subject:(animation))';
  const query = `${topic} AND mediatype:(movies) AND ${OPEN_LICENSE}`;
  return cached(`ia:s:${query}:${rows}:${page}`, HOUR, async () => {
    const q = qs({
      q: query, 'fl[]': ['identifier', 'title', 'description', 'creator', 'year', 'downloads', 'licenseurl'],
      'sort[]': 'downloads desc', rows, page, output: 'json',
    });
    const res = await fetch(`https://archive.org/advancedsearch.php?${q}`);
    if (!res.ok) throw new Error(`Internet Archive error ${res.status}`);
    const j = await res.json();
    return (j.response?.docs || []).map((d) => ({
      id: d.identifier, title: d.title, creator: [].concat(d.creator || []).join(', '), year: d.year,
      downloads: d.downloads, license: d.licenseurl,
      thumb: `https://archive.org/services/img/${d.identifier}`,
    }));
  });
}

const PLAYABLE = /\.(mp4|m4v|webm|ogv)$/i;
export function itemFiles(identifier) {
  return cached(`ia:m:${identifier}`, HOUR, async () => {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
    if (!res.ok) throw new Error(`Internet Archive error ${res.status}`);
    const j = await res.json();
    const files = (j.files || [])
      .filter((f) => PLAYABLE.test(f.name) && !/_thumb|sample|trailer/i.test(f.name) && f.source !== 'metadata')
      .map((f) => ({
        name: f.name, size: Number(f.size) || 0, length: Number(f.length) || 0, format: f.format,
        url: `https://archive.org/download/${encodeURIComponent(identifier)}/${f.name.split('/').map(encodeURIComponent).join('/')}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { id: identifier, title: j.metadata?.title, license: j.metadata?.licenseurl, files, cover: `https://archive.org/services/img/${identifier}` };
  });
}
export const archiveUrl = (id) => `https://archive.org/details/${encodeURIComponent(id)}`;
