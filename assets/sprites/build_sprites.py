"""Cut the two codex-generated sprite sheets into one strip of seven square frames per member.

Inputs, both one row per member (in --members order) on a magenta (#ff00ff) background,
with 256x256 cells:
- the main sheet, 4 columns (1024 wide): frames 0-3
- the poses sheet, 3 columns (768 wide): frames 4-6
Defaults: the six members kaname..yukihiro, source-sheet.png (1024x1536, see prompt.txt) and
source-sheet-poses.png (768x1536, see prompt-poses.txt) next to this script, and this script's
directory as output. Other members: e.g. --members takumi,musubi,guest1,guest2 with
--sheet source-sheet-new4.png --poses source-sheet-new4-poses.png (1024x1024 and 768x1024).
The scale comes from the main sheet's tallest and widest frame; --scale-from <main sheet> takes it
from another main sheet instead (e.g. source-sheet.png, so new members stand at the same size).
Output: <out_dir>/<memberId>.png, seven FRAME x FRAME frames (80x80, so 560x80) side by side
(0 = front idle, 1 = facing right, 2 = walk right 1, 3 = walk right 2, 4 = front, both hands up,
5 = front, carrying in both arms, 6 = facing right, carrying in both arms), transparent background,
feet on the bottom edge, centred horizontally. Optionally a 2x preview of all frames.

Usage: python build_sprites.py [--members <id,id,...>] [--sheet <sheet.png>] [--poses <poses.png>]
       [--scale-from <sheet.png>] [--out <out_dir>] [--preview <preview.png>]
Needs Pillow only. Not a project dependency; run it from a throwaway venv.
"""

import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

DEFAULT_MEMBERS = ["kaname", "minori", "hibiki", "hirame", "sasae", "yukihiro"]
# Each source sheet is a grid of CELL x CELL cells: one row per member, one column per frame.
CELL = 256
SHEET_COLS = 4
POSES_COLS = 3
FRAMES = SHEET_COLS + POSES_COLS
HERE = Path(__file__).resolve().parent
# Frame size in pixels. Change it here only; everything else derives from it.
FRAME = 80
# The scale leaves a 1px margin on top and both sides of the main sheet's frames. The poses
# (hands up) may use that margin, but nothing may be cut off: they must fit in FRAME x FRAME.
MAX_H = FRAME - 1
MAX_W = FRAME - 2
ALPHA_CUTOFF = 0.5
# A crown tip or hair may touch the cell edge, but most of the outline must be background.
MIN_OUTLINE_BACKGROUND = 0.9
PREVIEW_SCALE = 2
# Outline pixels next to the background are blended with magenta by the generator.
# Within this many source pixels of the background, dark magenta-tinted pixels are pulled to grey.
SPILL_REACH = 2
# The background has green ~3, so outline/background blends stay below this. Dark purple hair
# shades (green 20-40) stay above it and keep their colour.
SPILL_MAX_GREEN = 20


def threshold(channel, test):
    return channel.point(lambda v: 255 if test(v) else 0)


def row_bounds(alpha, rows):
    """Split the sheet between the member rows: on the grid line when it lies in the empty gap
    between two rows, otherwise in the middle of that gap.

    The generator does not always keep characters inside their grid cells (hair or a crown can
    cross the line), so the gaps are found from the picture. Staying on the grid line whenever it
    is clear keeps the frames of a sheet that does respect the grid exactly as before.
    """
    filled = [alpha.crop((0, y, alpha.width, y + 1)).getbbox() is not None for y in range(alpha.height)]
    bands = []
    for y, on in enumerate(filled):
        if on and (y == 0 or not filled[y - 1]):
            bands.append([y, y + 1])
        elif on:
            bands[-1][1] = y + 1
    if len(bands) != rows:
        return None
    cell_h = alpha.height // rows
    cuts = [
        grid if above[1] <= grid <= below[0] else (above[1] + below[0]) // 2
        for grid, above, below in zip(range(cell_h, alpha.height, cell_h), bands, bands[1:])
    ]
    return list(zip([0, *cuts], [*cuts, alpha.height]))


def load_cells(path, members, cols):
    """Key the sheet and cut it into one row per member x cols cells, refusing anything unexpected."""
    sheet = Image.open(path).convert("RGB")
    size = (cols * CELL, len(members) * CELL)
    if sheet.size != size:
        sys.exit(f"{path}: expected {size[0]}x{size[1]}, got {sheet.width}x{sheet.height}")
    bounds = row_bounds(keyed(sheet).getchannel("A"), len(members))
    if bounds is None:
        sys.exit(f"{path}: expected {len(members)} rows of characters separated by background")
    cell_w = sheet.width // cols
    rows = [
        [keyed(sheet.crop((c * cell_w, top, (c + 1) * cell_w, bottom))) for c in range(cols)]
        for top, bottom in bounds
    ]
    boxes = [[cell.getchannel("A").getbbox() for cell in row] for row in rows]
    empty = [f"{members[r]} frame {c}" for r, row in enumerate(boxes) for c, box in enumerate(row) if box is None]
    if empty:
        sys.exit(f"{path}: no character found in " + ", ".join(empty))
    # The cell outline should be almost all background; otherwise the key colour is not magenta.
    off_key = [
        f"{members[r]} frame {c}"
        for r, row in enumerate(rows)
        for c, cell in enumerate(row)
        if outline_background_ratio(cell) < MIN_OUTLINE_BACKGROUND
    ]
    if off_key:
        sys.exit(f"{path}: background is not magenta in " + ", ".join(off_key))
    return rows, boxes


def height(box):
    return box[3] - box[1]


def width(box):
    return box[2] - box[0]


def all_of(*masks):
    result = masks[0]
    for mask in masks[1:]:
        result = ImageChops.multiply(result, mask)
    return result


def despilled(cell, background):
    """Turn dark outline pixels tinted by the magenta background back into neutral dark grey.

    Only pixels near the background with almost no green, red close to blue and both clearly
    above green are touched, so purple hair, pink hair and red cloth keep their colours.
    """
    r, g, b = cell.split()
    near_background = ImageChops.subtract(
        background.filter(ImageFilter.MaxFilter(2 * SPILL_REACH + 1)), background
    )
    spill = all_of(
        near_background,
        threshold(g, lambda v: v < SPILL_MAX_GREEN),
        threshold(ImageChops.subtract(r, g), lambda v: v > 30),
        threshold(ImageChops.difference(r, b), lambda v: v < 60),
    )
    fixed = cell.copy()
    fixed.paste(Image.merge("RGB", (g, g, g)), (0, 0), spill)
    return fixed


def keyed(cell):
    """Return the cell as RGBA with the magenta background made transparent."""
    r, g, b = cell.split()
    background = all_of(
        threshold(r, lambda v: v > 170), threshold(b, lambda v: v > 170), threshold(g, lambda v: v < 90)
    )
    rgba = despilled(cell, background).convert("RGBA")
    rgba.putalpha(ImageChops.invert(background))
    return rgba


def outline_background_ratio(rgba):
    """Share of the cell's one-pixel outline that is transparent (keyed background)."""
    alpha = rgba.getchannel("A")
    w, h = alpha.size
    edges = [alpha.crop(box) for box in ((0, 0, w, 1), (0, h - 1, w, h), (0, 0, 1, h), (w - 1, 0, w, h))]
    clear = sum(edge.histogram()[0] for edge in edges)
    return clear / (2 * w + 2 * h)


def shrink(rgba, size):
    """Area-average downscale on premultiplied colour, then make alpha binary (crisp pixel edges)."""
    small = rgba.convert("RGBa").resize(size, Image.Resampling.BOX).convert("RGBA")
    opaque = threshold(small.getchannel("A"), lambda v: v >= 255 * ALPHA_CUTOFF)
    crisp = Image.new("RGBA", size, (0, 0, 0, 0))
    crisp.paste(small.convert("RGB"), (0, 0), opaque)
    crisp.putalpha(opaque)
    return crisp


def sheet_scale(boxes):
    """One scale for every frame of a main sheet, so that its tallest and widest frames just fit."""
    return min(MAX_H / max(height(b) for row in boxes for b in row), MAX_W / max(width(b) for row in boxes for b in row))


def scale_of(path):
    """The scale of another main sheet, one member per CELL-high row."""
    with Image.open(path) as sheet:
        rows = sheet.height // CELL
    _, boxes = load_cells(path, [f"row {r + 1}" for r in range(rows)], SHEET_COLS)
    return sheet_scale(boxes)


def build(members, sheet_path, poses_path, out_dir, preview_path=None, scale_path=None):
    inputs = {p.resolve() for p in (sheet_path, poses_path, scale_path) if p}
    sprite_paths = {(out_dir / f"{m}.png").resolve() for m in members}
    if inputs & sprite_paths:
        sys.exit(f"{out_dir}: a sprite would overwrite an input sheet")
    if preview_path and preview_path.resolve() in sprite_paths | inputs:
        sys.exit(f"{preview_path}: the preview would overwrite a sprite or an input sheet")
    rows, boxes = load_cells(sheet_path, members, SHEET_COLS)
    pose_rows, pose_boxes = load_cells(poses_path, members, POSES_COLS)
    # One scale for every frame of the main sheet so all members stand at the same size.
    scale = scale_of(scale_path) if scale_path else sheet_scale(boxes)
    # The poses sheet was drawn at its own size. Match each member's standing front pose
    # (pose 5, carrying) to their idle front pose (frame 0) so frames 0-3 stay exactly as they were.
    scales = [
        [scale] * SHEET_COLS + [scale * height(row[0]) / height(pose_row[1])] * POSES_COLS
        for row, pose_row in zip(boxes, pose_boxes)
    ]
    cells = [row + pose_row for row, pose_row in zip(rows, pose_rows)]
    all_boxes = [row + pose_row for row, pose_row in zip(boxes, pose_boxes)]
    sizes = [
        [(max(1, round(width(b) * s)), max(1, round(height(b) * s))) for b, s in zip(row, row_scales)]
        for row, row_scales in zip(all_boxes, scales)
    ]
    too_big = [
        f"{members[r]} frame {c} ({w}x{h})"
        for r, row in enumerate(sizes)
        for c, (w, h) in enumerate(row)
        if w > FRAME or h > FRAME
    ]
    if too_big:
        sys.exit(f"does not fit in {FRAME}x{FRAME} without changing the scale: " + ", ".join(too_big))

    out_dir.mkdir(parents=True, exist_ok=True)
    strips = []
    for member, row, row_boxes, row_sizes in zip(members, cells, all_boxes, sizes):
        strip = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))
        for col, (cell, box, (w, h)) in enumerate(zip(row, row_boxes, row_sizes)):
            sprite = shrink(cell.crop(box), (w, h))
            strip.paste(sprite, (col * FRAME + (FRAME - w) // 2, FRAME - h), sprite)
        strip.save(out_dir / f"{member}.png", optimize=True)
        strips.append(strip)

    if preview_path:
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        preview = Image.new("RGBA", (FRAME * FRAMES, FRAME * len(members)), (60, 60, 70, 255))
        for i, strip in enumerate(strips):
            preview.paste(strip, (0, i * FRAME), strip)
        preview.resize(
            (preview.width * PREVIEW_SCALE, preview.height * PREVIEW_SCALE), Image.Resampling.NEAREST
        ).save(preview_path)


def member_list(text):
    """Comma-separated member ids, top row first. Ids become file names, so keep them simple."""
    members = text.split(",")
    if not all(re.fullmatch(r"[a-z][a-z0-9]*", m) for m in members) or len(set(members)) != len(members):
        raise argparse.ArgumentTypeError(f"expected distinct ids like takumi,musubi, got {text!r}")
    return members


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--members", type=member_list, default=DEFAULT_MEMBERS)
    parser.add_argument("--sheet", type=Path, default=HERE / "source-sheet.png")
    parser.add_argument("--poses", type=Path, default=HERE / "source-sheet-poses.png")
    parser.add_argument("--scale-from", type=Path)
    parser.add_argument("--out", type=Path, default=HERE)
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    build(args.members, args.sheet, args.poses, args.out, args.preview, args.scale_from)
