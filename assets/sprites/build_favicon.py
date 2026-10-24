"""Cut the king's face out of his front idle frame and save it as the page's favicon.

Input: yukihiro.png next to this script (frame 0 is the 80x80 square at the left).
Output: apps/web/public/favicon.png, the 40x40 face (crown and beard) scaled 2x with nearest
neighbour to 80x80, so the pixels stay sharp.

Usage: python build_favicon.py
Needs Pillow only. Not a project dependency; run it from a throwaway venv.
"""

from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / "apps" / "web" / "public" / "favicon.png"
# The face in frame 0: left, top, right, bottom.
FACE_BOX = (20, 3, 60, 43)
SCALE = 2


def main() -> None:
    sprite = Image.open(HERE / "yukihiro.png").convert("RGBA")
    face = sprite.crop(FACE_BOX)
    face.resize((face.width * SCALE, face.height * SCALE), Image.NEAREST).save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
