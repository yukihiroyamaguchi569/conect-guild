// Turn the card parts in final/ (made by build.mjs) into the WebP files the app imports, next to
// this script. The department frame is split in two: its metal (grey, tinted by the app with the
// member's colour through a CSS mask) and its parchment scroll (kept as it is).
// usage: node export.mjs   (needs cwebp on the PATH)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blank, readPng, writePng } from './png.mjs';

const FINAL = new URL('./final/', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;
const ILLS = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'takumi', 'musubi', 'yukihiro'];
const QUALITY = '80';

const tmp = mkdtempSync(join(tmpdir(), 'card-export-'));

function webp(png, name, quality = QUALITY) {
  execFileSync('cwebp', ['-quiet', '-q', quality, '-alpha_q', '90', '-m', '6', png, '-o', `${OUT}${name}.webp`]);
}

// Grey (unsaturated) pixels are the metal; the rest (the warm parchment) is the scroll.
function splitFrame(img) {
  const metal = blank(img.w, img.h);
  const scroll = blank(img.w, img.h);
  for (let o = 0; o < img.data.length; o += 4) {
    const d = img.data;
    if (d[o + 3] === 0) continue;
    const spread = Math.max(d[o], d[o + 1], d[o + 2]) - Math.min(d[o], d[o + 1], d[o + 2]);
    (spread > 6 ? scroll : metal).data.set(d.subarray(o, o + 4), o);
  }
  return { metal, scroll };
}

try {
  const { metal, scroll } = splitFrame(readPng(`${FINAL}frame-dept.png`));
  for (const [name, img] of [['frame-dept-metal', metal], ['frame-dept-scroll', scroll]]) {
    writePng(join(tmp, `${name}.png`), img);
    webp(join(tmp, `${name}.png`), name);
  }
  for (const name of ['frame-crown', 'back', ...ILLS.map((m) => `ill-${m}`)]) webp(`${FINAL}${name}.png`, name);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
