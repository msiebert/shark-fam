"""Lay a reference photo and a render side by side so proportions can be compared by eye.

    python -I compare.py <photo> <render> <out.png> [--flip-photo] [--crop-photo x0,y0,x1,y1] [--crop-render x0,y0,x1,y1]

Both images are scaled to the same height with a light grid of tenths across each. The tenths only mean something if
each image is cropped so the nose is at the left or right edge and the tail tip at the other, so pass the pixel crops
(read them off the images first). Use a near-lateral photo and the hero render; the photo is only a reference and must
not be committed (licences). Both images must end up with the head on the right; `--flip-photo` mirrors a photo whose shark faces left. Grid labels are
the fraction of length measured from the nose, the same x the species configs use (nose = 0).
"""
import argparse
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("photo")
ap.add_argument("render")
ap.add_argument("out")
ap.add_argument("--flip-photo", action="store_true")
ap.add_argument("--crop-photo", help="x0,y0,x1,y1 in photo pixels, taken before any flip")
ap.add_argument("--crop-render", help="x0,y0,x1,y1 in render pixels")
ap.add_argument("--height", type=int, default=640)
a = ap.parse_args()


def load(path, flip=False, crop=None):
    im = Image.open(path).convert("RGB")
    if crop:
        im = im.crop(tuple(int(v) for v in crop.split(",")))
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    w = round(im.width * a.height / im.height)
    return im.resize((w, a.height), Image.LANCZOS)


def grid(im):
    d = ImageDraw.Draw(im)
    for i in range(1, 10):
        x = round(im.width * i / 10)
        d.line([(x, 0), (x, im.height)], fill=(255, 255, 255), width=1)
        d.text((x + 3, 3), f"{1 - i / 10:.1f}", fill=(255, 255, 0))  # fraction of length from the nose (head is at the right)
    return im


photo, render = grid(load(a.photo, a.flip_photo, a.crop_photo)), grid(load(a.render, crop=a.crop_render))
sheet = Image.new("RGB", (photo.width + render.width + 12, a.height), (20, 20, 20))
sheet.paste(photo, (0, 0))
sheet.paste(render, (photo.width + 12, 0))
sheet.save(a.out)
print(f"wrote {a.out} ({sheet.width}x{sheet.height}); photo left, render right")
