// Turn codex outputs in gen/ into final card parts in final/.
// usage: node build.mjs   (reads the codex outputs in gen/, made by run.sh; writes final/)
import { readPng, writePng, crop, resize, bbox, windowBox, blank, paste } from './png.mjs';
import { existsSync } from 'node:fs';

const GEN = new URL('./gen/', import.meta.url).pathname;
const OUT = new URL('./final/', import.meta.url).pathname;
const CARD_W = 600, CARD_H = 840;

const magenta = (d, o) => Math.min(d[o], d[o + 2]) - d[o + 1];

// Make #FF00FF-like pixels transparent, then eat magenta-tinted fringe next to holes.
function keyMagenta(img) {
  const d = img.data, { w, h } = img;
  for (let o = 0; o < d.length; o += 4) {
    if (magenta(d, o) > 90 && Math.abs(d[o] - d[o + 2]) < 90) d[o + 3] = 0;
  }
  for (let pass = 0; pass < 3; pass++) {
    const kill = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const o = (y * w + x) * 4;
      if (d[o + 3] === 0 || magenta(d, o) <= 35) continue;
      if (d[o - 4 + 3] === 0 || d[o + 4 + 3] === 0 || d[o - w * 4 + 3] === 0 || d[o + w * 4 + 3] === 0) kill.push(o);
    }
    for (const o of kill) d[o + 3] = 0;
  }
  return img;
}

// Desaturate everything except the warm parchment scroll in the lower part.
function grayFrame(img) {
  const d = img.data;
  const scrollTop = Math.floor(img.h * 0.72);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const o = (y * img.w + x) * 4;
    if (d[o + 3] === 0) continue;
    if (y >= scrollTop && d[o] - d[o + 2] > 25) continue;
    const l = Math.round(0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]);
    d[o] = d[o + 1] = d[o + 2] = l;
  }
}

// Fit the whole opaque area (ornaments and crown included) into 600x840.
// fill=true stretches it to the full canvas (the back, which is opaque edge to edge);
// otherwise the aspect is kept and the card is centered on a transparent canvas.
function buildCard(name, { gray = false, fill = false } = {}) {
  const src = keyMagenta(readPng(`${GEN}${name}.png`));
  const box = bbox(src);
  const s = Math.min(CARD_W / box.w, CARD_H / box.h);
  const w = fill ? CARD_W : Math.round(box.w * s), h = fill ? CARD_H : Math.round(box.h * s);
  const card = blank(CARD_W, CARD_H);
  paste(card, resize(crop(src, box.x, box.y, box.w, box.h), w, h), (CARD_W - w) >> 1, (CARD_H - h) >> 1);
  if (gray) grayFrame(card);
  writePng(`${OUT}${name}.png`, card);
  console.log(name, 'src box', box, 'placed', w, 'x', h, 'window', name === 'back' ? '-' : windowBox(card));
  return card;
}

const ILLS = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'takumi', 'musubi', 'yukihiro'];
const want = process.argv.slice(2);
const has = (n) => (want.length === 0 || want.includes(n)) && existsSync(`${GEN}${n}.png`);

let win = null;
if (has('frame-dept')) win = windowBox(buildCard('frame-dept', { gray: true }));
if (has('frame-crown')) buildCard('frame-crown');
if (has('back')) buildCard('back', { fill: true });

// Illustrations: center-crop to the window aspect, 480 wide.
const ratio = win ? win.w / win.h : 1.2;
const IW = 480, IH = Math.round(IW / ratio);
for (const m of ILLS) {
  if (!has(`ill-${m}`)) continue;
  const s = readPng(`${GEN}ill-${m}.png`);
  const cw = Math.min(s.w, Math.round(s.h * ratio)), ch = Math.round(cw / ratio);
  const img = resize(crop(s, (s.w - cw) >> 1, (s.h - ch) >> 1, cw, ch), IW, IH);
  writePng(`${OUT}ill-${m}.png`, img, true);
  console.log(`ill-${m}`, IW, IH);
}
