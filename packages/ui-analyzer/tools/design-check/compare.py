import io, os, sys
from PIL import Image, ImageChops, ImageFilter
import numpy as np

if not os.environ.get("REFERENCE_DIR"):
    sys.exit("compare.py: set REFERENCE_DIR to the photographs to compare against, such as the set the commit before took")
REF_DIRS = [os.environ["REFERENCE_DIR"]]
SHOT_DIR = os.environ.get("OUT_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
OUT_DIR = os.path.join(SHOT_DIR, "diff")
os.makedirs(OUT_DIR, exist_ok=True)

def jpeg_normalised(image, quality=78):
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=quality)
    buffer.seek(0)
    return Image.open(buffer).convert("RGB")

names = sys.argv[1:] or [f[:-4] for f in sorted(os.listdir(SHOT_DIR)) if f.endswith(".png")]
worst = []

for name in names:
    ref_path = next((os.path.join(folder, name + ".png") for folder in REF_DIRS if os.path.exists(os.path.join(folder, name + ".png"))), "")
    shot_path = os.path.join(SHOT_DIR, name + ".png")
    if not (os.path.exists(ref_path) and os.path.exists(shot_path)):
        print(f"{name:40s} MISSING")
        continue
    ref = Image.open(ref_path).convert("RGB")
    shot = Image.open(shot_path).convert("RGB").resize(ref.size)
    raw = np.array(ImageChops.difference(ref, shot).convert("L")).astype(int)

    blurred = np.array(ImageChops.difference(ref.filter(ImageFilter.GaussianBlur(0.6)),
                                             shot.filter(ImageFilter.GaussianBlur(0.6))).convert("L")).astype(int)
    score = 100 * (blurred > 34).mean()
    worst.append((score, name))
    print(f"{name:40s} diff={score:5.2f}%   (raw mean {raw.mean():5.2f})")

    canvas = Image.new("RGB", (ref.size[0], ref.size[1] * 3 + 8), (255, 0, 255))
    canvas.paste(ref, (0, 0))
    canvas.paste(shot, (0, ref.size[1] + 4))
    canvas.paste(Image.fromarray(np.uint8(np.clip(blurred * 4, 0, 255))).convert("RGB"), (0, ref.size[1] * 2 + 8))
    canvas.save(os.path.join(OUT_DIR, name + ".png"))

if len(names) > 3:
    print("\nworst first:")
    for score, name in sorted(worst, reverse=True)[:8]:
        print(f"  {score:5.2f}%  {name}")
