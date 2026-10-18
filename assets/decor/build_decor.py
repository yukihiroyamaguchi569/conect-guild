"""Normalize the codex-generated decor sheets (decor_raw_a/b/poodle/poodle_wag.png) into decor.png.

Usage: python build_decor.py <decor_raw_a.png> <decor_raw_b.png> <decor_raw_poodle.png> <decor_raw_poodle_wag.png> <decor.png>
Ran with Python 3.14.7 and Pillow 12.3.0 (installed in a throwaway venv,
not a project dependency).

The raw images follow prompt.txt and prompt-poodle.txt (128px cells on a #FF00FF background), but
the generator drifts off its grid, so every piece is found by a hand-measured
search region instead of its grid cell: the piece is made of the opaque
components whose center lies in the region (only their pixels, so a
neighbour reaching into its bbox is not copied). Every piece is shrunk by the same
factor (128px cell -> 32px tile) so relative sizes stay as drawn, then placed
bottom-center in its slot of the output sheet. A piece slightly larger than
its slot is shrunk to fit, up to MAX_FIT_SHRINK; beyond that the build fails.
The two frames of the wagging poodle (decor_raw_poodle_wag.png, prompt-poodle-wag.txt) are drawn
larger than their cells instead: each is scaled to FIT_HEIGHT and centred on its head (see
build_fitted), so the body stays put between them and only the tail moves.
Keep LAYOUT in sync with decor.ts (checked before building).
"""

import hashlib
import math
import os
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

TILE = 32
SCALE = TILE / 128
SHEET_COLS = 8
SHEET_ROWS = 11
# Pieces scaled to this height in px instead of by SCALE, centred on the head: the middle of the
# opaque run HEAD_ROW of the way down the piece (the wagging poodle's two frames, as tall as
# awake-poodle).
FIT_HEIGHT = {"wag-poodle-a": 27, "wag-poodle-b": 27}
HEAD_ROW = 0.3
MAX_FIT_SHRINK = 0.15
# Components smaller than this many raw pixels are specks: kept when they lie
# in a piece's region, dropped otherwise.
MIN_PX = 40
# Opaque pixels within this many raw pixels of the background whose colour is
# a dark blend with the magenta key become the outline colour.
SPILL_REACH = 3
OUTLINE = (44, 26, 20)

# The search regions below are measured on these exact files; refuse others.
# After regenerating a raw sheet, re-measure its regions and update the hash.
RAW = {
    "a": ((1024, 512), "9673ecba0fd0b78f92677afd9c4717d759621a58787ce28e5bd8096e97ad393e"),
    "b": ((1024, 1024), "97b2046314d540e58399ef7154750d458e171fb6e48852f47467dc5158ccf62e"),
    "poodle": ((1024, 512), "f534f72914c6036cd2ed0f8485eb02e1a853d09383e4550d85393d8428569261"),
    "poodle_wag": ((1024, 512), "3b981b93a6db79a4d4bba3fa67e5b0530700ca299bde3766a7a07a9f6e1a4f4d"),
}

# name: (raw sheet, search region (left, top, right, bottom) in raw pixels,
#        output col, row, w, h in tiles)
LAYOUT = {
    "banner": ("a", (260, 8, 386, 260), 0, 0, 1, 2),
    "barrel": ("b", (10, 120, 145, 300), 1, 0, 1, 2),
    "plant-large": ("b", (137, 80, 288, 296), 2, 0, 1, 2),
    "plant-tall": ("b", (288, 70, 392, 300), 3, 0, 1, 2),
    "safe": ("b", (395, 138, 530, 304), 4, 0, 1, 2),
    "easel": ("b", (532, 78, 684, 312), 5, 0, 1, 2),
    "pillar-lamp": ("b", (20, 594, 112, 854), 6, 0, 1, 2),
    "coat-rack": ("b", (130, 624, 240, 864), 7, 0, 1, 2),
    "barrel-pair": ("b", (242, 634, 382, 856), 0, 2, 1, 2),
    "crate-stack": ("b", (685, 90, 872, 290), 1, 2, 2, 2),
    "file-cabinet": ("b", (8, 326, 228, 582), 3, 2, 2, 2),
    "round-table": ("b", (532, 398, 758, 582), 5, 2, 2, 2),
    "lantern": ("a", (22, 4, 120, 158), 7, 2, 1, 1),
    "sconce": ("a", (158, 18, 232, 158), 7, 3, 1, 1),
    "map-table": ("b", (228, 372, 532, 582), 0, 4, 3, 2),
    "light-patch": ("b", (758, 398, 1020, 568), 3, 4, 2, 2),
    "wall-map": ("a", (386, 24, 640, 158), 5, 4, 2, 1),
    "wall-shelf": ("a", (648, 24, 896, 178), 5, 5, 2, 1),
    "poster-cat": ("a", (910, 24, 1012, 160), 7, 4, 1, 1),
    "poster-stripes": ("a", (10, 158, 122, 282), 7, 5, 1, 1),
    "bench": ("b", (544, 808, 800, 920), 0, 6, 2, 1),
    "key-board": ("a", (126, 176, 262, 280), 2, 6, 1, 1),
    "plant-hanging": ("a", (386, 146, 518, 304), 3, 6, 1, 1),
    "candlestick": ("a", (540, 156, 614, 284), 4, 6, 1, 1),
    "abacus": ("a", (638, 180, 762, 280), 5, 6, 1, 1),
    "ledger-stack": ("a", (762, 180, 892, 284), 6, 6, 1, 1),
    "coin-pile": ("a", (894, 170, 1022, 284), 7, 6, 1, 1),
    "megaphone": ("a", (6, 284, 132, 396), 0, 7, 1, 1),
    "flyers": ("a", (136, 300, 262, 394), 1, 7, 1, 1),
    "globe": ("a", (270, 272, 374, 398), 2, 7, 1, 1),
    "model": ("a", (376, 278, 524, 396), 3, 7, 1, 1),
    "blueprint-rolls": ("a", (522, 280, 640, 398), 4, 7, 1, 1),
    "file-stack": ("a", (642, 290, 760, 398), 5, 7, 1, 1),
    "open-book": ("a", (760, 300, 910, 400), 6, 7, 1, 1),
    "flower-vase": ("a", (910, 278, 1020, 400), 7, 7, 1, 1),
    "mugs": ("a", (4, 404, 144, 506), 0, 8, 1, 1),
    "book-pile": ("a", (144, 404, 264, 504), 1, 8, 1, 1),
    "book-pile-tall": ("a", (266, 390, 384, 508), 2, 8, 1, 1),
    "scroll-pile": ("a", (384, 410, 524, 500), 3, 8, 1, 1),
    "inkwell": ("a", (534, 392, 618, 504), 4, 8, 1, 1),
    "hourglass": ("a", (640, 392, 724, 508), 5, 8, 1, 1),
    "barrel-small": ("b", (874, 86, 1004, 210), 6, 8, 1, 1),
    "sacks": ("b", (872, 210, 1016, 320), 7, 8, 1, 1),
    "plant-small": ("b", (390, 652, 502, 788), 0, 9, 1, 1),
    "stool": ("b", (510, 688, 604, 792), 1, 9, 1, 1),
    "toolbox": ("b", (610, 674, 746, 796), 2, 9, 1, 1),
    "sleeping-cat": ("b", (752, 690, 900, 792), 3, 9, 1, 1),
    "jar": ("b", (906, 646, 1018, 796), 4, 9, 1, 1),
    "chest": ("b", (380, 790, 544, 924), 5, 9, 1, 1),
    "sleeping-poodle": ("poodle", (250, 280, 390, 390), 6, 9, 1, 1),
    "awake-poodle": ("poodle", (650, 260, 760, 390), 7, 9, 1, 1),
    "wag-poodle-a": ("poodle_wag", (200, 170, 420, 400), 0, 10, 1, 1),
    "wag-poodle-b": ("poodle_wag", (600, 170, 820, 400), 1, 10, 1, 1),
}


def is_key(px):
    r, g, b = px[:3]
    return r > 150 and b > 150 and g < 110 and abs(r - b) < 90


def is_spill(px):
    r, g, b = px[:3]
    return r - g > 40 and b - g > 40 and abs(r - b) < 80


def keyed(img):
    """RGBA copy: the chroma key becomes transparent, and dark magenta blends
    on the outline (within SPILL_REACH of the key) become OUTLINE."""
    rgb = img.convert("RGB")
    key = Image.new("L", rgb.size)
    key.putdata([255 if is_key(p) else 0 for p in rgb.get_flattened_data()])
    near = key.filter(ImageFilter.MaxFilter(2 * SPILL_REACH + 1))
    near = ImageChops.subtract(near, key)
    out = []
    for p, k, n in zip(rgb.get_flattened_data(), key.get_flattened_data(), near.get_flattened_data()):
        if k:
            out.append((0, 0, 0, 0))
        elif n and is_spill(p):
            out.append((*OUTLINE, 255))
        else:
            out.append((p[0], p[1], p[2], 255))
    result = Image.new("RGBA", rgb.size)
    result.putdata(out)
    return result


def components(img):
    """4-connected opaque regions as (bbox, pixel count), plus a label map
    giving each opaque pixel the index of its region (-1 for transparent)."""
    alpha = img.getchannel("A").load()
    w, h = img.size
    labels = [-1] * (w * h)
    regions = []
    for y0 in range(h):
        for x0 in range(w):
            if labels[y0 * w + x0] >= 0 or not alpha[x0, y0]:
                continue
            index = len(regions)
            labels[y0 * w + x0] = index
            stack = [(x0, y0)]
            x_min, y_min, x_max, y_max, count = x0, y0, x0, y0, 0
            while stack:
                x, y = stack.pop()
                count += 1
                x_min, y_min = min(x_min, x), min(y_min, y)
                x_max, y_max = max(x_max, x), max(y_max, y)
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and labels[ny * w + nx] < 0 and alpha[nx, ny]:
                        labels[ny * w + nx] = index
                        stack.append((nx, ny))
            regions.append(((x_min, y_min, x_max + 1, y_max + 1), count))
    return regions, labels


def center_in(box, region):
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    return region[0] <= cx < region[2] and region[1] <= cy < region[3]


def find_pieces(sheet_id, img):
    """Map name -> RGBA image holding only that piece's own pixels, cropped to
    its bbox. A region takes the components whose center lies in it. Every
    component of MIN_PX or more must land in exactly one region, so a drifted
    or regenerated sheet fails instead of yielding clipped or merged pieces;
    smaller specks outside every region are dropped. A piece must also lie
    wholly inside its region, so a region that catches only part of a piece,
    or a neighbour that reaches far out, fails too. Two regions of same-sized
    pieces swapped with each other still pass (check_slot_size catches swaps
    across sizes): check the preview after editing LAYOUT."""
    regions, labels = components(img)
    names = [n for n, spec in LAYOUT.items() if spec[0] == sheet_id]
    owner = {}
    for name in names:
        region = LAYOUT[name][1]
        if not (0 <= region[0] < region[2] <= img.width and 0 <= region[1] < region[3] <= img.height):
            raise SystemExit(f"{name}: region {region} is outside the {img.size} sheet")
        for index, (box, _) in enumerate(regions):
            if center_in(box, region):
                if index in owner:
                    raise SystemExit(f"component {box} is in both {owner[index]} and {name}")
                owner[index] = name
    stray = [box for index, (box, count) in enumerate(regions) if count >= MIN_PX and index not in owner]
    if stray:
        raise SystemExit(f"sheet {sheet_id}: components outside every region: {stray}")
    pieces = {}
    for name in names:
        mine = [index for index, who in owner.items() if who == name]
        if not any(regions[index][1] >= MIN_PX for index in mine):
            raise SystemExit(f"{name}: nothing drawn in region {LAYOUT[name][1]}")
        bbox = (
            min(regions[i][0][0] for i in mine),
            min(regions[i][0][1] for i in mine),
            max(regions[i][0][2] for i in mine),
            max(regions[i][0][3] for i in mine),
        )
        region = LAYOUT[name][1]
        if not (region[0] <= bbox[0] and region[1] <= bbox[1] and bbox[2] <= region[2] and bbox[3] <= region[3]):
            raise SystemExit(f"{name}: drawn pixels {bbox} reach outside its region {region}")
        mask = Image.new("L", img.size)
        wanted = set(mine)
        mask.putdata([255 if label in wanted else 0 for label in labels])
        piece = Image.new("RGBA", img.size, (0, 0, 0, 0))
        piece.paste(img, (0, 0), mask)
        pieces[name] = piece.crop(bbox)
    return pieces


def shrink(img, size):
    """Area-average resize with premultiplied alpha, then binary alpha."""
    small = img.convert("RGBa").resize(size, Image.Resampling.BOX).convert("RGBA")
    small.putdata([(r, g, b, 255) if a >= 128 else (0, 0, 0, 0) for r, g, b, a in small.get_flattened_data()])
    return small


def check_slot_size(crop, name, size):
    """The slot must be the tightest one the piece fits at SCALE (allowing the
    MAX_FIT_SHRINK squeeze), so an oversized slot, or a region swapped with a
    piece of another size, fails instead of shifting pieces around."""
    for axis, (raw, slot) in enumerate(zip(crop.size, size)):
        need = raw * SCALE
        tightest = max(1, math.ceil(need * (1 - MAX_FIT_SHRINK) / TILE))
        loosest = max(1, math.ceil(need / TILE))
        if not tightest <= slot // TILE <= loosest:
            dim = "wh"[axis]
            raise SystemExit(f"{name}: {dim} is {slot // TILE} tiles, but a {need:.0f}px piece needs {tightest}..{loosest}")


def build_piece(crop, name, size):
    check_slot_size(crop, name, size)
    scale = SCALE
    fit = min(size[0] / (crop.width * scale), size[1] / (crop.height * scale))
    if fit < 1:
        if fit < 1 - MAX_FIT_SHRINK:
            raise SystemExit(f"{name}: {crop.size} raw px does not fit a {size} slot; enlarge its slot in LAYOUT")
        scale *= fit
    small = shrink(crop, (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))))
    tile = Image.new("RGBA", size, (0, 0, 0, 0))
    tile.paste(small, ((size[0] - small.width) // 2, size[1] - small.height))
    return tile


def build_fitted(crop, name, size):
    """A FIT_HEIGHT piece: scaled to its height, feet on the slot's bottom, head at its centre."""
    height = FIT_HEIGHT[name]
    row = round(crop.height * HEAD_ROW)
    xs = [x for x in range(crop.width) if crop.getpixel((x, row))[3]]
    head = (min(xs) + max(xs)) / 2
    scale = height / crop.height
    small = shrink(crop, (round(crop.width * scale), height))
    left = round(size[0] / 2 - head * scale)
    if left < 0 or left + small.width > size[0] or height > size[1]:
        raise SystemExit(f"{name}: {small.size} at x {left} does not fit a {size} slot")
    tile = Image.new("RGBA", size, (0, 0, 0, 0))
    tile.paste(small, (left, size[1] - height))
    return tile


def check_slots():
    taken = {}
    for name, (sheet_id, _, col, row, w, h) in LAYOUT.items():
        if sheet_id not in RAW:
            raise SystemExit(f"{name}: unknown raw sheet {sheet_id!r}")
        if col < 0 or row < 0 or col + w > SHEET_COLS or row + h > SHEET_ROWS:
            raise SystemExit(f"{name}: slot is outside the {SHEET_COLS}x{SHEET_ROWS} sheet")
        for c in range(col, col + w):
            for r in range(row, row + h):
                if (c, r) in taken:
                    raise SystemExit(f"{name} and {taken[(c, r)]} share the cell {c},{r}")
                taken[(c, r)] = name


DECOR_TS = Path(__file__).resolve().parent / "decor.ts"
TS_ENTRY = re.compile(r"^  '?([a-z-]+)'?: \{ col: (\d+), row: (\d+), w: (\d+), h: (\d+) \},$", re.M)


def check_decor_ts():
    """decor.ts must list exactly LAYOUT's slots and the same tile size."""
    source = DECOR_TS.read_text(encoding="utf-8")
    if f"export const DECOR_TILE_SIZE = {TILE};" not in source:
        raise SystemExit(f"{DECOR_TS}: DECOR_TILE_SIZE is not {TILE}")
    entries = TS_ENTRY.findall(source)
    in_ts = {name: tuple(int(v) for v in rest) for name, *rest in entries}
    in_py = {name: spec[2:] for name, spec in LAYOUT.items()}
    if len(entries) != len(in_ts) or in_ts != in_py:
        raise SystemExit(f"{DECOR_TS} does not match LAYOUT; update one to match the other")


def load_raw(sheet_id, path):
    size, sha = RAW[sheet_id]
    with open(path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    if digest != sha:
        raise SystemExit(f"{path} is not the raw sheet {sheet_id} the regions were measured on (sha256 {digest})")
    img = Image.open(path)
    if img.size != size:
        raise SystemExit(f"expected a {size} raw sheet {sheet_id}, got {img.size}")
    return keyed(img)


def same_file(a, b):
    return os.path.realpath(a) == os.path.realpath(b) or (os.path.exists(b) and os.path.samefile(a, b))


def main(src_a, src_b, src_poodle, src_wag, dst):
    if any(same_file(src, dst) for src in (src_a, src_b, src_poodle, src_wag)):
        raise SystemExit("output path must differ from the source images")
    check_slots()
    check_decor_ts()
    raws = {
        "a": load_raw("a", src_a),
        "b": load_raw("b", src_b),
        "poodle": load_raw("poodle", src_poodle),
        "poodle_wag": load_raw("poodle_wag", src_wag),
    }
    sheet = Image.new("RGBA", (SHEET_COLS * TILE, SHEET_ROWS * TILE), (0, 0, 0, 0))
    placed = set()
    for sheet_id, raw in raws.items():
        for name, crop in find_pieces(sheet_id, raw).items():
            _, _, col, row, w, h = LAYOUT[name]
            build = build_fitted if name in FIT_HEIGHT else build_piece
            sheet.paste(build(crop, name, (w * TILE, h * TILE)), (col * TILE, row * TILE))
            placed.add(name)
    if placed != set(LAYOUT):
        raise SystemExit(f"pieces not placed: {sorted(set(LAYOUT) - placed)}")
    sheet.save(dst)


if __name__ == "__main__":
    if len(sys.argv) != 6:
        raise SystemExit(
            "usage: python build_decor.py <decor_raw_a.png> <decor_raw_b.png> <decor_raw_poodle.png>"
            " <decor_raw_poodle_wag.png> <decor.png>"
        )
    main(*sys.argv[1:6])
