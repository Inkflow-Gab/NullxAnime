import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
console.log('Brand asset checks passed');
