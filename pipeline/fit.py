"""Fit a model's lateral silhouette to a reference photo and report where the outlines differ.

    python -I fit.py <species> <photo> <out_prefix> --nose x,y --tail x,y [--flip] [--norot] [--sheet out.png]

The silhouette is projected from models/<species>.glb, scaled, rotated and moved so its nose and tail tip land on the
two photo points you read off (pixels, before any --flip; the tail point is the tip of the upper caudal lobe). The
shark is then cut out of the photo (GrabCut, seeded by the model outline) and both outlines are compared column by
column in the model's frame. Output is a table of back-line and belly-line differences, in fractions of total length,
at fixed fractions from the nose, with a straight-line trend removed (the photo is never perfectly level, and a bent
tail tilts the fit) so what remains is shape: a missing nape hump, a belly that sags, a body that is too thin.

    d_back  > 0  the photo's back is higher than the model's; raise `up`
    d_belly > 0  the photo's belly is lower than the model's; raise `down`

Columns where a fin sticks out of the body (in the model) are skipped, so only the body is compared. Use a lateral
photo with the animal not turned toward the camera, and read the nose/tail points carefully. The cut-out is a rough
guess: look at <out_prefix>_fit.png (red = model, green = photo cut-out) before trusting the numbers, and compare
several photos. `--norot` keeps the body level for animals whose tail is swung well off the body axis (the tilt from
the tail-tip point would otherwise rotate the model); the nose point then fixes the height.
"""
import argparse
import sys

import cv2
import numpy as np
import trimesh
from PIL import Image

ROOT = __file__.rsplit("/", 2)[0] if "/" in __file__ else ".."
W = 2000  # silhouette width in pixels == total length

ap = argparse.ArgumentParser()
ap.add_argument("species")
ap.add_argument("photo")
ap.add_argument("out")
ap.add_argument("--nose", required=True)
ap.add_argument("--tail", required=True)
ap.add_argument("--flip", action="store_true", help="mirror the photo (use when the shark faces left)")
ap.add_argument("--norot", action="store_true")
ap.add_argument("--sheet", help="also write the overlay here")
a = ap.parse_args()


def project(scene):
    """Lateral masks (full animal, body only), nose at the right edge, tail tip at the left."""
    meshes = scene.geometry
    allv = np.vstack([g.vertices for g in meshes.values()])
    x0, x1 = allv[:, 0].min(), allv[:, 0].max()
    k = W / (x1 - x0)
    ymin, ymax = allv[:, 1].min(), allv[:, 1].max()
    H = int((ymax - ymin) * k) + 1
    out = {}
    for tag, pick in (("full", lambda n: True), ("body", lambda n: n.endswith("_Body"))):
        m = np.zeros((H, W + 1), np.uint8)
        for name, g in meshes.items():
            if not pick(name):
                continue
            px = ((g.vertices[:, 0] - x0) * k).astype(np.float32)
            py = ((ymax - g.vertices[:, 1]) * k).astype(np.float32)
            pts = np.stack([px, py], 1)[g.faces].astype(np.int32)
            cv2.fillPoly(m, list(pts), 255)
        out[tag] = m
    return out


masks = project(trimesh.load(f"{ROOT}/models/{a.species}.glb"))
full, body = masks["full"], masks["body"]
H = full.shape[0]

photo = cv2.imread(a.photo)
ph, pw = photo.shape[:2]
nose = [float(v) for v in a.nose.split(",")]
tail = [float(v) for v in a.tail.split(",")]
if a.flip:
    photo = cv2.flip(photo, 1)
    nose[0], tail[0] = pw - nose[0], pw - tail[0]

cols = np.where(full.any(0))[0]
xr, xl = cols.max(), cols.min()
mn = np.array([xr, np.where(full[:, xr] > 0)[0].mean()])
mt = np.array([xl, np.where(full[:, xl] > 0)[0].mean()])
if a.norot:
    s = (nose[0] - tail[0]) / (mn[0] - mt[0])
    c = complex(s, 0)
    tail[1] = nose[1] - (mn[1] - mt[1]) * s
else:
    c = complex(nose[0] - tail[0], nose[1] - tail[1]) / complex(*(mn - mt))
M = np.array([[c.real, -c.imag], [c.imag, c.real]])
off = np.array(tail) - M @ mt
A = np.hstack([M, off[:, None]]).astype(np.float64)  # model -> photo

# GrabCut in the photo, seeded by the warped model outline
wmask = cv2.warpAffine(full, A, (pw, ph))
wbody = cv2.warpAffine(body, A, (pw, ph))
Lpx = abs(c) * W
k = lambda f: np.ones((max(3, int(f * Lpx)) | 1,) * 2, np.uint8)
gc = np.full((ph, pw), cv2.GC_BGD, np.uint8)
gc[cv2.dilate(wmask, k(0.08)) > 0] = cv2.GC_PR_BGD
gc[cv2.dilate(wmask, k(0.01)) > 0] = cv2.GC_PR_FGD
gc[cv2.erode(wbody, k(0.03)) > 0] = cv2.GC_FGD
bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
cv2.grabCut(photo, gc, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
pmask = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
pmask = cv2.morphologyEx(pmask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))

# photo cut-out back into the model's frame
inv = cv2.invertAffineTransform(A)
pm = cv2.warpAffine(pmask, inv, (W + 1, H), flags=cv2.INTER_NEAREST)

# overlay for eyeballing
ov = photo.copy()
for m, col in ((pmask, (0, 255, 0)), (wmask, (0, 0, 255))):
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(ov, cs, -1, col, max(2, pw // 500))
for i in range(11):
    p = (np.array(nose) + (np.array(tail) - np.array(nose)) * i / 10).astype(int)
    cv2.circle(ov, tuple(p), 4, (0, 255, 255), -1)
    cv2.putText(ov, f"{i / 10:.1f}", (p[0] + 5, p[1] - 8), cv2.FONT_HERSHEY_SIMPLEX, max(0.4, pw / 2400), (0, 255, 255), 1)
cv2.imwrite(a.out + "_fit.png", ov)
if a.sheet:
    cv2.imwrite(a.sheet, ov)


def edges(m, col):
    ys = np.where(m[:, col] > 0)[0]
    return (ys[0], ys[-1]) if len(ys) else (None, None)


rows = []
for f in np.arange(0.04, 0.93, 0.04):
    col = int(round((1 - f) * W))
    bt, bb = edges(body, col)
    ft, fb = edges(full, col)
    pt, pb = edges(pm, col)
    if None in (bt, ft, pt) or abs(bt - ft) > 3 or abs(bb - fb) > 3:  # a fin sticks out here
        continue
    rows.append((f, bt / W, bb / W, pt / W, pb / W))
rows = np.array(rows)
if len(rows) < 6:
    sys.exit("too few fin-free columns to compare; check the points and the cut-out")
dtop = rows[:, 1] - rows[:, 3]  # model top lower on the page than the photo's top => photo back higher
dbot = rows[:, 4] - rows[:, 2]  # photo bottom lower than model bottom => photo belly lower
mid = (dtop - dbot) / 2  # centre-line offset: a straight-line trend is just tilt/shift, so remove it
fit = np.polyval(np.polyfit(rows[:, 0], mid, 1), rows[:, 0])
shape = mid - fit
print(f"{a.species} vs {a.photo.rsplit('/', 1)[-1]}  (fractions of length; trend removed from the centre line)")
print(f"{'x':>5} {'model depth':>11} {'photo depth':>11} {'d_back':>8} {'d_belly':>8}")
for r, t, b, s in zip(rows, dtop, dbot, shape):
    db = (r[4] - r[3]) - (r[2] - r[1])
    print(f"{r[0]:5.2f} {r[2] - r[1]:11.3f} {r[4] - r[3]:11.3f} {db / 2 + s:8.3f} {db / 2 - s:8.3f}")
