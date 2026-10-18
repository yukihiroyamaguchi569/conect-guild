"""Normalize the codex-generated held items (props_raw.png, decor_raw_small.png) into props.png.

Usage: python build_props.py <props_raw.png> <decor_raw_small.png> <props.png>
Ran with Python 3.14.7 and Pillow 12.3.0 (installed in a throwaway venv,
not a project dependency).

The raw image follows prompt.txt (two 512px cells on a #FF00FF background):
the scroll in the left half, the chest in the right half. Each piece is made
of the opaque components whose center lies in its region (only their pixels).
The scroll and the chest are shrunk by the same factor so their relative sizes stay as
drawn, then centred in their slot of the output sheet (drawProp centres the
slot on the point it is given). A piece that does not fit its slot fails the
build. The tankard (Issue #193) is the left piece of ../decor/decor_raw_small.png (prompt in
../decor/prompt-small.txt, 256px cells drawn at the decor scale); only RAW's window of that sheet is
read here (build_decor.py cuts the rest), and the tankard is scaled to its FIT_SIZE instead of by
SCALE. Keep LAYOUT in sync with props.ts (checked before building).
"""

import hashlib
import os
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

TILE = 40
# Raw px -> output px. Chosen so the scroll (the wider piece) fills about 39 of
# the 40px slot; the chest comes out about 35 x 31, close to a member's width.
SCALE = 0.085
SHEET_COLS = 3
SHEET_ROWS = 1
# Components smaller than this many raw pixels are specks: kept when they lie
# in a piece's region, dropped otherwise.
MIN_PX = 40
# Opaque pixels within this many raw pixels of the background whose colour is
# a dark blend with the magenta key become the outline colour.
SPILL_REACH = 3
OUTLINE = (44, 26, 20)

# Pieces scaled so one side (h = height, w = width) is this many px instead of by SCALE: the
# tankard, at the size chosen when it was drawn.
FIT_SIZE = {"tankard": ("h", 26)}

# The regions below are measured on these exact files; refuse others.
# After regenerating a raw sheet, re-check the regions and update the hash.
# sheet id: (size, sha256, window (left, top, right, bottom) of the sheet that is read, or None
#            for all of it)
RAW = {
    "props": ((1024, 512), "d68fd4c6c3bd96b8ed4adb069317ec295c6ec15bbf1e24a726f91991de8117b6", None),
    "small": ((1024, 256), "ff71645d8e9c4e7f333cd9938a6a6ec235fbaff6bb4565e42be501048c5f96ae", (0, 0, 325, 256)),
}

# name: (raw sheet, search region (left, top, right, bottom) in raw pixels, output col, row, w, h in tiles)
LAYOUT = {
    "scroll": ("props", (0, 0, 512, 512), 0, 0, 1, 1),
    "chest": ("props", (512, 0, 1024, 512), 1, 0, 1, 1),
    "tankard": ("small", (0, 0, 325, 256), 2, 0, 1, 1),
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
    its bbox. Every component of MIN_PX or more must land in a region, and a
    piece must lie wholly inside its region, so a drifted sheet fails instead
    of yielding clipped or merged pieces."""
    regions, labels = components(img)
    names = [n for n, spec in LAYOUT.items() if spec[0] == sheet_id]
    owner = {}
    for name in names:
        region = LAYOUT[name][1]
        for index, (box, _) in enumerate(regions):
            if center_in(box, region):
                owner[index] = name
    stray = [box for index, (box, count) in enumerate(regions) if count >= MIN_PX and index not in owner]
    if stray:
        raise SystemExit(f"sheet {sheet_id}: components outside every region: {stray}")
    pieces = {}
    for name in names:
        region = LAYOUT[name][1]
        mine = [index for index, who in owner.items() if who == name]
        if not any(regions[index][1] >= MIN_PX for index in mine):
            raise SystemExit(f"{name}: nothing drawn in region {region}")
        bbox = (
            min(regions[i][0][0] for i in mine),
            min(regions[i][0][1] for i in mine),
            max(regions[i][0][2] for i in mine),
            max(regions[i][0][3] for i in mine),
        )
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


def build_piece(crop, name, size):
    scale = SCALE
    if name in FIT_SIZE:
        axis, px = FIT_SIZE[name]
        scale = px / (crop.height if axis == "h" else crop.width)
    small_size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    if small_size[0] > size[0] or small_size[1] > size[1]:
        raise SystemExit(f"{name}: {crop.size} raw px becomes {small_size}, larger than its {size} slot")
    small = shrink(crop, small_size)
    tile = Image.new("RGBA", size, (0, 0, 0, 0))
    tile.paste(small, ((size[0] - small.width) // 2, (size[1] - small.height) // 2))
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


PROPS_TS = Path(__file__).resolve().parent / "props.ts"
TS_TILE_SIZE = re.compile(r"^export const PROPS_TILE_SIZE = (\d+);$", re.M)
TS_ENTRY = re.compile(r"^  '?([a-z-]+)'?: \{ col: (\d+), row: (\d+), w: (\d+), h: (\d+) \},$", re.M)


def check_props_ts():
    """props.ts must list exactly LAYOUT's slots and the same tile size."""
    source = PROPS_TS.read_text(encoding="utf-8")
    sizes = TS_TILE_SIZE.findall(source)
    if sizes != [str(TILE)]:
        raise SystemExit(f"{PROPS_TS}: expected one PROPS_TILE_SIZE = {TILE}, found {sizes}")
    entries = TS_ENTRY.findall(source)
    in_ts = {name: tuple(int(v) for v in rest) for name, *rest in entries}
    in_py = {name: spec[2:] for name, spec in LAYOUT.items()}
    if len(entries) != len(in_ts) or in_ts != in_py:
        raise SystemExit(f"{PROPS_TS} does not match LAYOUT; update one to match the other")


def load_raw(sheet_id, path):
    size, sha, window = RAW[sheet_id]
    with open(path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    if digest != sha:
        raise SystemExit(f"{path} is not the raw sheet {sheet_id} the regions were checked on (sha256 {digest})")
    img = Image.open(path)
    if img.size != size:
        raise SystemExit(f"expected a {size} raw sheet {sheet_id}, got {img.size}")
    img = keyed(img)
    if window is None:
        return img
    read = Image.new("RGBA", size, (0, 0, 0, 0))
    read.paste(img.crop(window), window[:2])
    return read


def same_file(a, b):
    return os.path.realpath(a) == os.path.realpath(b) or (os.path.exists(b) and os.path.samefile(a, b))


def main(src, src_small, dst):
    if same_file(src, dst) or same_file(src_small, dst):
        raise SystemExit("output path must differ from the source images")
    if not dst.endswith(".png"):
        raise SystemExit("output path must be a .png file")
    check_slots()
    check_props_ts()
    sheet = Image.new("RGBA", (SHEET_COLS * TILE, SHEET_ROWS * TILE), (0, 0, 0, 0))
    for sheet_id, path in (("props", src), ("small", src_small)):
        for name, crop in find_pieces(sheet_id, load_raw(sheet_id, path)).items():
            _, _, col, row, w, h = LAYOUT[name]
            sheet.paste(build_piece(crop, name, (w * TILE, h * TILE)), (col * TILE, row * TILE))
    sheet.save(dst)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: python build_props.py <props_raw.png> <decor_raw_small.png> <props.png>")
    main(sys.argv[1], sys.argv[2], sys.argv[3])
