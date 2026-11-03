import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url)));
for (const icon of manifest.icons) {
  const bytes = await readFile(new URL(`../${icon.src}`, import.meta.url));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const [width, height] = icon.sizes.split('x').map(Number);
  assert.equal(bytes.readUInt32BE(16), width);
  assert.equal(bytes.readUInt32BE(20), height);
}
assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
const font = await readFile(new URL('../assets/fonts/Cinzel.ttf', import.meta.url));
assert.equal(font.readUInt32BE(0), 0x00010000);
assert.ok((await readFile(new URL('../assets/fonts/OFL-Cinzel.txt', import.meta.url), 'utf8')).includes('SIL OPEN FONT LICENSE'));
for (const name of ['cover-placeholder.svg', 'release-sigil.svg']) {
  const svg = await readFile(new URL(`../assets/${name}`, import.meta.url), 'utf8');
  assert.ok(svg.includes('<svg') && svg.includes('viewBox='));
  assert.ok(!/<(?:script|image|foreignObject)\b/i.test(svg));
  assert.ok((await readFile(new URL('../sw.js', import.meta.url), 'utf8')).includes(`assets/${name}`));
}

// Every app module and stylesheet must be present in the immutable shell.
const shell = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
for (const dir of ['js', 'css']) {
  const entries = await readdir(new URL(`../${dir}/`, import.meta.url), { recursive: true, withFileTypes: true });
  for (const entry of entries.filter((item) => item.isFile() && /\.(js|css)$/.test(item.name))) {
    const path = `${entry.parentPath || entry.path}/${entry.name}`.replaceAll('\\', '/').replace(/\/+/g, '/');
    const relative = path.slice(path.lastIndexOf(`/${dir}/`) + 1);
    assert.ok(shell.includes(`'${relative}'`), `${relative} must be in the app shell`);
  }
}
console.log('Brand asset and app-shell checks passed');
