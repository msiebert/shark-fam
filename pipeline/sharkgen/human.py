"""Scuba diver geometry (pure numpy), built in the app's diver space.

Metres, +y up, +z the way the diver faces, feet near the origin, head top at 1.83 m (six feet).  The model is a small
joint hierarchy so the app can animate it without a skeleton:

    Torso                      everything static: body, head, mask, BCD, tank, hoses
      ArmL / ArmR              pivot at the shoulder
        ForearmL / ForearmR    pivot at the elbow (forearm, glove)
      LegL / LegR              pivot at the hip
        ShinL / ShinR          pivot at the knee (shin, boot, fin)

Every part is a `Body` loft (the same superellipse hull the sharks use) placed along an axis, plus tubes for hoses.
Colours are per-vertex; materials are chosen per sub-mesh.
"""
import numpy as np
from .body import Body
from .util import hex_to_linear, mix, smoothstep

DIVER_M = 1.83

# ---- palette: muted grey-blue suit with ochre fins and tank, matching the app's original diver
C = {k: hex_to_linear(v) for k, v in {
    "suit": "#647a83", "suit_dark": "#3a4a52", "hood": "#23333a", "skin": "#c39a82", "ochre": "#a88f55",
    "ochre_dark": "#6b5a33", "rubber": "#161d20", "glove": "#1d272b", "bcd": "#2c3c44", "bcd_trim": "#a88f55",
    "metal": "#b9a06a", "steel": "#8d979b", "glass": "#8fcfca", "hose": "#14191b", "octo": "#c7a94a",
}.items()}


# ------------------------------------------------------------------ primitives
def _weld(verts, faces, tol=1e-7):
    """Merge coincident vertices (the loft's UV-seam duplicates) so shading is smooth across the seam."""
    key = np.round(verts / tol).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    nv = verts[first]
    nf = []
    for f in faces:
        g = tuple(dict.fromkeys(int(inv[i]) for i in f))   # drop repeated corners (collapsed quads become triangles)
        if len(g) >= 3:
            nf.append(g)
    return nv, nf


def loft(length, prof, n=36, ring=28, exponent=2.2):
    """A hull along local +x.  prof = [(t, front, back, half_width)] with t in 0..1 and radii in metres.
    Local y is lateral, local z is front(+)/back(-)."""
    t = [p[0] for p in prof]
    cfg = {"body": {"exponent": exponent, "x": t,
                    "up": [p[1] / length for p in prof], "down": [p[2] / length for p in prof],
                    "half_width": [p[3] / length for p in prof], "z0": [[0, 0], [1, 0]],
                    "stations": [[0.004, 1.0, n]]}}
    v, f, _ = Body(cfg).build(ring)
    v, f = _weld(v * length, f)
    return v, f


def tube(points, radius, ring=10, samples=24, cap=True):
    """A round tube along a Catmull-Rom spline through `points` (parallel-transport frames)."""
    P = np.asarray(points, float)
    ext = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    pts = []
    per = max(2, samples // (len(P) - 1))
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for s in np.linspace(0, 1, per, endpoint=False):
            pts.append(0.5 * ((2 * p1) + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * s ** 3))
    pts.append(P[-1])
    pts = np.array(pts)
    tan = np.gradient(pts, axis=0)
    tan /= np.linalg.norm(tan, axis=1)[:, None]
    ref = np.array([0.0, 1.0, 0.0]) if abs(tan[0, 1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    nrm = np.cross(tan[0], ref)
    nrm /= np.linalg.norm(nrm)
    verts, k = [], len(pts)
    ang = np.linspace(0, 2 * np.pi, ring, endpoint=False)
    for i in range(k):
        if i:
            nrm = nrm - np.dot(nrm, tan[i]) * tan[i]
            nrm /= np.linalg.norm(nrm)
        b = np.cross(tan[i], nrm)
        r = radius if np.isscalar(radius) else radius[i]
        for a in ang:
            verts.append(pts[i] + r * (np.cos(a) * nrm + np.sin(a) * b))
    faces = []
    for i in range(k - 1):
        for j in range(ring):
            a, b2 = i * ring + j, i * ring + (j + 1) % ring
            faces.append((a, a + ring, b2 + ring, b2))
    verts = np.array(verts)
    if cap:
        for idx, ordr in ((0, 1), (k - 1, 0)):
            c = len(verts)
            verts = np.vstack([verts, pts[idx]])
            for j in range(ring):
                a, b2 = idx * ring + j, idx * ring + (j + 1) % ring
                faces.append((c, b2, a) if ordr else (c, a, b2))
    # make winding outward: test one side face against the path
    f0 = faces[len(faces) // 2]
    p = verts[list(f0[:3])]
    n = np.cross(p[1] - p[0], p[2] - p[0])
    i0 = f0[0] // ring
    if np.dot(n, p.mean(0) - pts[min(i0, k - 1)]) < 0:
        faces = [tuple(reversed(q)) for q in faces]
    return verts, faces


def place(v, f, R, origin, flip=False):
    out = np.asarray(v) @ np.asarray(R).T + np.asarray(origin)
    return out, ([tuple(reversed(q)) for q in f] if flip else f)


def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


# local x -> world axis, keeping local z = front(+z) and a right-handed frame
UP = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1.0]])       # part runs toward +y
DOWN = np.array([[0, 1, 0], [-1, 0, 0], [0, 0, 1.0]])     # part runs toward -y
LAT = np.eye(3)                                            # part runs along +x, local y is vertical


class Part:
    """One node of the hierarchy: sub-meshes in world coordinates, drawn relative to the pivot."""

    def __init__(self, name, pivot, parent=None):
        self.name, self.pivot, self.parent = name, np.asarray(pivot, float), parent
        self.subs = []     # (verts_world, faces, colors, material)

    def add(self, v, f, color, material):
        v = np.asarray(v, float)
        col = np.broadcast_to(color, (len(v), 3)).copy() if np.ndim(color) == 1 else color
        self.subs.append((v, f, col, material))


# ------------------------------------------------------------------ the diver
def build_diver():
    parts = {}
    torso = parts["Torso"] = Part("Torso", [0, 0, 0])

    def seam_dark(v, cx, w, base, dark, side):
        """Darker neoprene panel running down the outer side of a limb."""
        u = (v[:, 0] - cx) * side
        m = smoothstep(0.55, 0.9, u / np.maximum(w, 1e-6))
        return mix(np.broadcast_to(base, (len(v), 3)), np.broadcast_to(dark, (len(v), 3)), m)

    # ---- torso: wetsuit
    prof = [(0, 0, 0, 0), (.045, .08, .075, .145), (.15, .10, .095, .162), (.30, .098, .092, .152), (.45, .105, .098, .155),
            (.60, .115, .100, .175), (.75, .112, .095, .195), (.85, .098, .085, .205), (.925, .085, .075, .14),
            (.97, .06, .058, .07), (1.0, 0, 0, 0)]
    v, f = loft(0.67, prof, n=40, ring=32, exponent=2.4)
    v, f = place(v, f, UP, [0, 0.90, 0])
    torso.add(v, f, seam_dark(v, 0, 0.17, C["suit"], C["suit_dark"], 1), "Suit")

    # ---- neck and head (hood with a skin-toned face opening)
    v, f = loft(0.13, [(0, .0, .0, .0), (.05, .052, .05, .052), (.5, .055, .053, .055), (.95, .056, .054, .056), (1, 0, 0, 0)], n=8, ring=20)
    v, f = place(v, f, UP, [0, 1.53, 0])
    torso.add(v, f, C["hood"], "Suit")

    hp = [(0, 0, 0, 0), (.05, .05, .04, .04), (.15, .085, .07, .062), (.30, .098, .09, .074), (.50, .10, .098, .078),
          (.70, .095, .095, .075), (.85, .082, .08, .066), (.95, .05, .045, .04), (1, 0, 0, 0)]
    v, f = loft(0.235, hp, n=40, ring=36, exponent=2.1)
    v, f = place(v, f, UP, [0, 1.595, 0.0])
    # face: an oval on the front (z > 0) around mask/mouth, blending into the hood
    fy = (v[:, 1] - 1.675) / 0.075
    fx = v[:, 0] / 0.062
    face = smoothstep(1.0, 0.7, np.sqrt(fx ** 2 + fy ** 2)) * smoothstep(0.02, 0.07, v[:, 2])
    torso.add(v, f, mix(np.broadcast_to(C["hood"], (len(v), 3)), np.broadcast_to(C["skin"], (len(v), 3)), face), "Suit")

    # ---- mask: black skirt + teal lens, strap hugging the hood
    mv, mf = loft(0.118, [(0, 0, 0, 0), (.08, .014, .012, .026), (.5, .02, .016, .036), (.92, .014, .012, .026), (1, 0, 0, 0)], n=14, ring=28, exponent=2.6)
    mv, mf = place(mv, mf, LAT, [-0.059, 1.738, 0.086])
    torso.add(mv, mf, C["rubber"], "Gear")
    lv, lf = loft(0.098, [(0, 0, 0, 0), (.08, .024, .002, .022), (.5, .03, .004, .03), (.92, .024, .002, .022), (1, 0, 0, 0)], n=14, ring=28, exponent=2.5)
    lv, lf = place(lv, lf, LAT, [-0.049, 1.738, 0.091])
    torso.add(lv, lf, C["glass"], "Glass")
    sv, sf = tube([(-0.058, 1.738, 0.088), (-0.078, 1.738, 0.045), (-0.083, 1.738, -0.02), (-0.066, 1.738, -0.078), (0, 1.738, -0.1),
                   (0.066, 1.738, -0.078), (0.083, 1.738, -0.02), (0.078, 1.738, 0.045), (0.058, 1.738, 0.088)], 0.0065, ring=8, samples=64)
    torso.add(sv, sf, C["rubber"], "Gear")

    # ---- BCD: wing at the back, side panels around the torso
    bp = [(0, 0, 0, 0), (.03, .125, .135, .17), (.12, .138, .15, .185), (.5, .136, .16, .19), (.88, .13, .15, .205),
          (.97, .105, .12, .15), (1, 0, 0, 0)]
    v, f = loft(0.53, bp, n=34, ring=32, exponent=2.8)
    v, f = place(v, f, UP, [0, 0.99, -0.004])
    bcd_col = np.broadcast_to(C["bcd"], (len(v), 3)).copy()
    # ochre piping along the shoulder line and across the lower edge
    pipe = np.maximum(smoothstep(0.015, 0.0, np.abs(v[:, 1] - 1.50)), smoothstep(0.012, 0.0, np.abs(v[:, 1] - 1.04)))
    torso.add(v, f, mix(bcd_col, np.broadcast_to(C["bcd_trim"], (len(v), 3)), pipe * 0.9), "Gear")

    # ---- tank on the back, with boot, bands and valve
    tp = [(0, 0, 0, 0), (.02, .046, .046, .046), (.07, .084, .084, .084), (.14, .09, .09, .09), (.86, .09, .09, .09),
          (.93, .082, .082, .082), (.985, .048, .048, .048), (1, 0, 0, 0)]
    v, f = loft(0.60, tp, n=40, ring=32, exponent=2.0)
    v, f = place(v, f, UP, [0, 0.98, -0.205])
    tc = np.broadcast_to(C["ochre"], (len(v), 3)).copy()
    boot = smoothstep(1.075, 1.03, v[:, 1])
    tc = mix(tc, np.broadcast_to(C["rubber"], (len(v), 3)), boot)
    stripe = smoothstep(0.012, 0.0, np.abs(v[:, 1] - 1.34))
    tc = mix(tc, np.broadcast_to(C["ochre_dark"], (len(v), 3)), stripe)
    torso.add(v, f, tc, "Tank")
    for yb in (1.14, 1.45):
        v, f = loft(0.035, [(0, 0, 0, 0), (.08, .097, .097, .097), (.5, .099, .099, .099), (.92, .097, .097, .097), (1, 0, 0, 0)], n=8, ring=32, exponent=2.0)
        v, f = place(v, f, UP, [0, yb - 0.0175, -0.205])
        torso.add(v, f, C["rubber"], "Gear")
    v, f = loft(0.10, [(0, 0, 0, 0), (.1, .02, .02, .02), (.5, .022, .022, .022), (.95, .028, .028, .028), (1, 0, 0, 0)], n=10, ring=16)
    v, f = place(v, f, UP, [0, 1.56, -0.205])
    torso.add(v, f, C["metal"], "Metal")
    v, f = loft(0.11, [(0, 0, 0, 0), (.08, .03, .03, .03), (.5, .034, .034, .034), (.92, .03, .03, .03), (1, 0, 0, 0)], n=10, ring=18)
    v, f = place(v, f, LAT, [-0.055, 1.665, -0.205])
    torso.add(v, f, C["steel"], "Metal")

    # ---- regulator: second stage at the mouth, primary hose over the right shoulder, octopus and gauge hoses
    rv, rf = loft(0.055, [(0, 0, 0, 0), (.1, .018, .018, .018), (.5, .021, .021, .021), (.9, .017, .017, .017), (1, 0, 0, 0)], n=8, ring=18)
    rv, rf = place(rv, rf, np.array([[0, 1, 0], [0, 0, 1], [1, 0, 0.0]]), [0, 1.655, 0.078])   # local x -> +z (toward the front)
    torso.add(rv, rf, C["rubber"], "Gear")
    hv, hf = tube([(0.02, 1.656, 0.112), (0.065, 1.65, 0.092), (0.098, 1.626, 0.03), (0.108, 1.60, -0.06), (0.08, 1.632, -0.15),
                   (0.04, 1.665, -0.185), (0.0, 1.668, -0.205)], 0.0085, ring=10, samples=56)
    torso.add(hv, hf, C["hose"], "Gear")
    ov, of = tube([(-0.012, 1.668, -0.205), (-0.09, 1.64, -0.2), (-0.16, 1.55, -0.1), (-0.165, 1.44, 0.03), (-0.125, 1.35, 0.14), (-0.07, 1.31, 0.145)], 0.0095, ring=10, samples=56)
    torso.add(ov, of, C["octo"], "Gear")
    ov2, of2 = loft(0.055, [(0, 0, 0, 0), (.1, .02, .02, .02), (.5, .024, .024, .024), (.9, .02, .02, .02), (1, 0, 0, 0)], n=8, ring=16)
    ov2, of2 = place(ov2, of2, DOWN, [-0.07, 1.335, 0.145])
    torso.add(ov2, of2, C["octo"], "Gear")
    gv, gf = tube([(0.02, 1.668, -0.205), (0.1, 1.62, -0.2), (0.19, 1.45, -0.09), (0.215, 1.2, 0.0), (0.2, 1.06, 0.1), (0.17, 1.0, 0.13)], 0.0085, ring=10, samples=56)
    torso.add(gv, gf, C["hose"], "Gear")
    v, f = loft(0.075, [(0, 0, 0, 0), (.1, .014, .012, .026), (.5, .018, .014, .034), (.9, .014, .012, .026), (1, 0, 0, 0)], n=8, ring=18, exponent=2.6)
    v, f = place(v, f, LAT, [0.1325, 1.0, 0.135])
    torso.add(v, f, C["rubber"], "Gear")
    v, f = loft(0.056, [(0, 0, 0, 0), (.1, .012, .002, .02), (.5, .016, .003, .025), (.9, .012, .002, .02), (1, 0, 0, 0)], n=8, ring=18)
    v, f = place(v, f, LAT, [0.1385, 1.0, 0.145])
    torso.add(v, f, C["glass"], "Glass")

    # ---- arms (wetsuit sleeve, glove) with shoulder and elbow pivots
    for side, nm in ((-1, "L"), (1, "R")):
        sh = np.array([0.205 * side, 1.485, 0.0])
        arm = parts["Arm" + nm] = Part("Arm" + nm, sh, "Torso")
        el = sh + [0, -0.29, 0]
        fore = parts["Forearm" + nm] = Part("Forearm" + nm, el, "Arm" + nm)
        ap = [(0, 0, 0, 0), (.04, .058, .058, .058), (.15, .064, .064, .064), (.5, .055, .055, .055), (.9, .047, .047, .047), (.97, .04, .04, .04), (1, 0, 0, 0)]
        v, f = loft(0.29, ap, n=22, ring=24)
        v, f = place(v, f, DOWN, sh)
        c = seam_dark(v, sh[0], 0.06, C["suit"], C["suit_dark"], side)
        band = smoothstep(0.012, 0.0, np.abs(v[:, 1] - 1.30))
        arm.add(v, f, mix(c, np.broadcast_to(C["bcd_trim"], (len(v), 3)), band * 0.9), "Suit")
        fp = [(0, 0, 0, 0), (.03, .044, .044, .044), (.2, .046, .046, .046), (.55, .040, .040, .040), (.93, .034, .034, .034), (1, 0, 0, 0)]
        v, f = loft(0.27, fp, n=20, ring=24)
        v, f = place(v, f, DOWN, el)
        fore.add(v, f, seam_dark(v, el[0], 0.045, C["suit"], C["suit_dark"], side), "Suit")
        wr = el + [0, -0.265, 0]
        hp2 = [(0, 0, 0, 0), (.05, .03, .03, .034), (.22, .022, .024, .046), (.6, .018, .02, .044), (.88, .014, .016, .03), (1, 0, 0, 0)]
        v, f = loft(0.17, hp2, n=18, ring=22, exponent=2.4)
        v, f = place(v, f, DOWN, wr)
        fore.add(v, f, C["glove"], "Gear")
        tv, tf = loft(0.075, [(0, 0, 0, 0), (.15, .016, .016, .016), (.6, .014, .014, .014), (1, 0, 0, 0)], n=8, ring=14)
        tv, tf = place(tv, tf, rot_z(0.55 * side) @ rot_x(-0.35) @ DOWN, wr + [-0.03 * side, -0.05, 0.012])
        fore.add(tv, tf, C["glove"], "Gear")
        if nm == "L":   # dive computer on the wrist
            dv, df = loft(0.05, [(0, 0, 0, 0), (.1, .014, .004, .02), (.5, .018, .006, .026), (.9, .014, .004, .02), (1, 0, 0, 0)], n=8, ring=20, exponent=2.5)
            dv, df = place(dv, df, DOWN, el + [0.0, -0.20, 0.036])
            fore.add(dv, df, C["rubber"], "Gear")
            gv2, gf2 = loft(0.038, [(0, 0, 0, 0), (.1, .008, .002, .014), (.5, .011, .003, .018), (.9, .008, .002, .014), (1, 0, 0, 0)], n=8, ring=18)
            gv2, gf2 = place(gv2, gf2, DOWN, el + [0.0, -0.206, 0.05])
            fore.add(gv2, gf2, C["glass"], "Glass")

    # ---- legs (suit), boot, long fin, with hip and knee pivots
    for side, nm in ((-1, "L"), (1, "R")):
        hip = np.array([0.095 * side, 0.95, 0.0])
        leg = parts["Leg" + nm] = Part("Leg" + nm, hip, "Torso")
        knee = hip + [0, -0.44, 0]
        shin = parts["Shin" + nm] = Part("Shin" + nm, knee, "Leg" + nm)
        tp2 = [(0, 0, 0, 0), (.03, .078, .074, .078), (.15, .09, .086, .09), (.5, .08, .078, .08), (.9, .064, .062, .064), (.97, .055, .055, .055), (1, 0, 0, 0)]
        v, f = loft(0.44, tp2, n=24, ring=28)
        v, f = place(v, f, DOWN, hip)
        c = seam_dark(v, hip[0], 0.085, C["suit"], C["suit_dark"], side)
        band = smoothstep(0.012, 0.0, np.abs(v[:, 1] - 0.70))
        leg.add(v, f, mix(c, np.broadcast_to(C["bcd_trim"], (len(v), 3)), band * 0.9), "Suit")
        sp = [(0, 0, 0, 0), (.03, .058, .056, .058), (.15, .062, .074, .066), (.32, .058, .078, .068), (.7, .043, .05, .048), (.95, .036, .036, .038), (1, 0, 0, 0)]
        v, f = loft(0.43, sp, n=22, ring=28)
        v, f = place(v, f, DOWN, knee)
        c = seam_dark(v, knee[0], 0.07, C["suit"], C["suit_dark"], side)
        kp = smoothstep(0.085, 0.0, np.abs(v[:, 1] - 0.47)) * smoothstep(0.0, 0.03, v[:, 2])
        shin.add(v, f, mix(c, np.broadcast_to(C["suit_dark"], (len(v), 3)), kp), "Suit")
        ank = knee + [0, -0.43, 0]
        bp2 = [(0, 0, 0, 0), (.05, .036, .05, .038), (.3, .036, .06, .042), (.65, .034, .054, .046), (.95, .03, .03, .034), (1, 0, 0, 0)]
        v, f = loft(0.21, bp2, n=16, ring=24, exponent=2.3)
        v, f = place(v, f, DOWN, ank)
        shin.add(v, f, C["rubber"], "Gear")
        # fin: foot pocket + long blade, tilted slightly toward the front like a loaded fin
        tilt = rot_x(-0.16)
        pv, pf = loft(0.17, [(0, 0, 0, 0), (.08, .02, .03, .05), (.5, .015, .02, .066), (.92, .01, .012, .06), (1, 0, 0, 0)], n=12, ring=20, exponent=2.8)
        pv, pf = place(pv, pf, tilt @ DOWN, ank + [0, -0.16, 0.0])
        shin.add(pv, pf, C["rubber"], "Gear")
        bv, bf = loft(0.36, [(0, 0, 0, 0), (.02, .007, .007, .05), (.12, .009, .009, .066), (.4, .010, .010, .088), (.75, .009, .009, .104),
                           (.96, .006, .006, .092), (1, 0, 0, 0)], n=26, ring=26, exponent=3.6)
        origin = ank + tilt @ np.array([0, -0.30, 0.0])
        bv, bf = place(bv, bf, tilt @ DOWN, origin)
        rel = (bv[:, 1] - origin[1]) / -0.36        # 0 at the pocket, 1 at the tip
        edge = smoothstep(0.62, 0.9, np.abs(bv[:, 0] - ank[0]) / 0.1)
        bc = mix(np.broadcast_to(C["ochre"], (len(bv), 3)), np.broadcast_to(C["ochre_dark"], (len(bv), 3)), np.maximum(edge, smoothstep(0.22, 0.0, rel)))
        shin.add(bv, bf, bc, "Gear")
    return parts


def rotate_all(parts, R, origin=(0, 0, 0)):
    """Rigidly rotate a whole diver (used for the swim-pose preview)."""
    o = np.asarray(origin, float)
    for p in parts.values():
        p.pivot = (p.pivot - o) @ R.T + o
        p.subs = [((v - o) @ R.T + o, f, c, m) for v, f, c, m in p.subs]
    return parts


def diver_stats(parts):
    allv = np.vstack([v for p in parts.values() for v, *_ in p.subs])
    tris = sum(len(f) * 2 for p in parts.values() for _, f, *_ in p.subs)
    return allv.min(0), allv.max(0), tris
