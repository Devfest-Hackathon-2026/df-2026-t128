// Offline asset preparation only. Pass a path to an existing sharp installation.
// No runtime dependency is added to the app; the original PNGs are never changed.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] ? resolve(process.argv[2]) : 'sharp');
const root = new URL('../public/', import.meta.url);
const names = [
  ['bookstore', 'sato'], ['supermarket', 'tanaka'], ['station', 'yamamoto'],
];
const report = [];
for (const [place, person] of names) {
  for (const name of [`${place}-bg`, ...['neutral', 'confused', 'cautious', 'relieved'].map(expression => `${person}-${expression}`)]) {
    const source = `${place}/${name}.png`;
    const target = `${place}/${name}.webp`;
    const png = await readFile(new URL(source, root));
    const webp = await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer();
    const original = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (original.info.width !== decoded.info.width || original.info.height !== decoded.info.height) throw new Error(`Dimensions changed: ${source}`);
    for (let i = 0; i < original.data.length; i += 4) {
      // RGB in fully transparent pixels is invisible and may be discarded by WebP.
      if (original.data[i + 3] !== decoded.data[i + 3] ||
          (original.data[i + 3] !== 0 && !original.data.subarray(i, i + 3).equals(decoded.data.subarray(i, i + 3)))) {
        throw new Error(`Visible pixels or alpha changed: ${source}`);
      }
    }
    if (webp.length >= png.length) throw new Error(`No size saving: ${source}`);
    await writeFile(new URL(target, root), webp);
    report.push({ source, target, width: original.info.width, height: original.info.height,
      sourceBytes: png.length, outputBytes: webp.length,
      sourceSha256: createHash('sha256').update(png).digest('hex'),
      outputSha256: createHash('sha256').update(webp).digest('hex'),
      visiblePixelsAndAlphaUnchanged: true });
  }
}
await writeFile(new URL('../docs/scene-image-sizes.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
const before = report.reduce((total, item) => total + item.sourceBytes, 0);
const after = report.reduce((total, item) => total + item.outputBytes, 0);
console.log(JSON.stringify({ images: report.length, before, after, savedPercent: Math.round(100 * (1 - after / before)) }));
