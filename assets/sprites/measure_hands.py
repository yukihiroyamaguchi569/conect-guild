"""Measure where the hands are in each member's holding frames (4-6) of assets/sprites/<id>.png.

Prints JSON in the shape of MEASURED in apps/web/src/render/hands.ts (frame px; feet at y 80,
middle at x 40):
- raiseTop: frame 4, the top of the raised hands (the highest skin-coloured pixel), up from the feet
- carryFront: frame 5, the centre of the bounding box of the hands, up from the feet, and its x
- carrySide: frame 6 (facing right), the centre of the bounding box of the hands, up and forward

Hands are skin-coloured pixel groups (4-connected) of at least MIN_PIXELS lying wholly between
HAND_LOW and HAND_HIGH px above the feet, which leaves out the face and neck above, bare knees
below and stray specks. On the six original members this gives raiseTop exactly, carryFront and
the carrySide height within 1 px of hands.ts, and the carrySide forward within 1 px except kaname
and yukihiro (20 here, 15 in hands.ts). Check the result on the picture before using it.

Usage: python measure_hands.py <sprite.png> [<sprite.png> ...]
Needs Pillow only. Not a project dependency; run it from a throwaway venv.
"""

import json
import sys
from pathlib import Path

from PIL import Image

FRAME = 80
HAND_LOW = 25
HAND_HIGH = 42
MIN_PIXELS = 20


def is_skin(pixel):
    r, g, b, a = pixel
    return a > 0 and r > 200 and g > 150 and b > 110 and r > b + 30 and r - g < 70


def frame_of(sheet, index):
    return sheet.crop((index * FRAME, 0, (index + 1) * FRAME, FRAME))


def skin_pixels(frame):
    return {(x, y) for y in range(FRAME) for x in range(FRAME) if is_skin(frame.getpixel((x, y)))}


def groups(pixels):
    left = set(pixels)
    while left:
        stack = [left.pop()]
        group = []
        while stack:
            x, y = stack.pop()
            group.append((x, y))
            for near in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if near in left:
                    left.remove(near)
                    stack.append(near)
        yield group


def hands_centre(frame):
    hands = [
        p
        for group in groups(skin_pixels(frame))
        if len(group) >= MIN_PIXELS
        and HAND_LOW <= FRAME - max(y for _, y in group)
        and FRAME - min(y for _, y in group) <= HAND_HIGH
        for p in group
    ]
    if not hands:
        sys.exit("no hands found")
    xs = [x for x, _ in hands]
    ys = [y for _, y in hands]
    # Pixel centres: a pixel at x spans x..x+1.
    cx = (min(xs) + max(xs) + 1) / 2
    cy = (min(ys) + max(ys) + 1) / 2
    return round(FRAME - cy), round(cx)


def measure(path):
    sheet = Image.open(path).convert("RGBA")
    raise_top = FRAME - min(y for _, y in skin_pixels(frame_of(sheet, 4)))
    front_up, front_x = hands_centre(frame_of(sheet, 5))
    side_up, side_x = hands_centre(frame_of(sheet, 6))
    return {
        "raiseTop": raise_top,
        "carryFront": {"up": front_up, "x": front_x},
        "carrySide": {"up": side_up, "forward": side_x - FRAME // 2},
    }


if __name__ == "__main__":
    print(json.dumps({Path(p).stem: measure(p) for p in sys.argv[1:]}, indent=2))
