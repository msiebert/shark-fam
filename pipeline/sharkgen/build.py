"""Assemble a species config into world-space skin + eye geometry (pure numpy)."""
import numpy as np
from .body import Body
from .fins import make_fin
from .util import curve, hex_to_linear, mix, smoothstep


# ---------------------------------------------------------------- colours
def fin_colors(f, attr, pal):
    n = len(attr["v"])
    base = hex_to_linear(pal["dorsal"] if f.get("color", "dorsal") == "dorsal" else pal["ventral"])
    col = np.broadcast_to(base, (n, 3)).copy()
    dark = np.broadcast_to(hex_to_linear(pal["edge"]), (n, 3))
    under = attr["upfacing"] < -0.05
    if f.get("underside") == "pearl":
        col[under] = hex_to_linear(pal["ventral"])
    ew = f.get("edge_width", 0.14)
    col = mix(col, dark, f.get("edge_dark", 0.5) * smoothstep(1 - ew, 1.0, attr["s"]))
    if f.get("tip_patch"):
        w = smoothstep(0.55, 0.78, attr["v"]) * under
        col = mix(col, dark, 0.92 * w)
    if f.get("tip_white"):
        # pale tip patch on both faces (oceanic whitetip): the outer ~25% of the span
        w = smoothstep(0.7, 0.82, attr["v"])
        col = mix(col, hex_to_linear("#E9E6DC"), f["tip_white"] * w)
    if f.get("tip_black"):
        # dark tip patch on both faces (blacktip reef shark), optionally with a pale band just inside it
        if f.get("tip_band"):
            wb = smoothstep(0.42, 0.48, attr["v"]) * (1 - smoothstep(0.58, 0.62, attr["v"]))
            col = mix(col, hex_to_linear("#E9E6DC"), f["tip_band"] * wb)
        w = smoothstep(0.6, 0.65, attr["v"])
        col = mix(col, hex_to_linear("#111214"), f["tip_black"] * w)
    return col


# ---------------------------------------------------------------- helpers
def uv_sphere(center, radius, nu=20, nv=14):
    th = np.linspace(0, np.pi, nv + 1)[1:-1]
    ph = np.linspace(0, 2 * np.pi, nu, endpoint=False)
    T, P = np.meshgrid(th, ph, indexing="ij")
    ring = np.stack([np.cos(T), np.sin(T) * np.cos(P), np.sin(T) * np.sin(P)], -1).reshape(-1, 3)
    verts = np.vstack([[[1, 0, 0]], ring, [[-1, 0, 0]]]) * radius + center
    faces = []
    rid = lambda i, j: 1 + i * nu + (j % nu)
    for j in range(nu):
        faces.append((0, rid(0, j), rid(0, j + 1)))
    for i in range(nv - 2):
        for j in range(nu):
            faces.append((rid(i, j), rid(i + 1, j), rid(i + 1, j + 1), rid(i, j + 1)))
    last = 1 + (nv - 1) * nu
    for j in range(nu):
        faces.append((last, rid(nv - 2, j + 1), rid(nv - 2, j)))
    v = verts[list(faces[len(faces) // 2])]
    if np.dot(np.cross(v[1] - v[0], v[2] - v[0]), v.mean(0) - center) < 0:
        faces = [tuple(reversed(t)) for t in faces]
    return verts, faces


def merge(pieces):
    verts, faces, off = [], [], 0
    for v, f in pieces:
        verts.append(v)
        faces += [tuple(i + off for i in q) for q in f]
        off += len(v)
    return np.vstack(verts), faces


def to_world(verts, cfg, total, bend):
    """Apply cruise-pose bend, scale to metres and orient nose to +X."""
    v = verts.copy()
    s = cfg["length_m"] / total
    if bend:
        u = v[:, 0] / total
        v[:, 1] += bend["amp"] * (np.sin(bend["freq"] * np.pi * u + bend["phase"]) - np.sin(bend["phase"]))
    xo = 0.4 * total
    out = np.empty_like(v)
    out[:, 0] = -(v[:, 0] - xo) * s
    out[:, 1] = -v[:, 1] * s
    out[:, 2] = v[:, 2] * s
    return out


# ---------------------------------------------------------------- main
TILE_M = 0.25   # metres per tile of the fin micro-detail UVs


def build_shark(cfg):
    body = Body(cfg)
    pal = cfg["palette"]
    bv, bf, buv = body.build(cfg.get("ring", 72))

    fin_pieces, fin_colors_l, fin_uv = [], [], []
    for f in cfg["fins"]:
        att = f["attach"]
        root = body.axis(att["x"]) if att.get("axis") else body.surface(att["x"], np.radians(att["theta"]))
        for mirror in ([False, True] if f.get("paired") else [False]):
            fv, ff, fa = make_fin(f, root, mirror)
            fin_pieces.append((fv, ff))
            fin_colors_l.append(fin_colors(f, fa, pal))
            fin_uv.append(np.stack([fa["uu"], fa["ww"]], 1))
    fins_v, fins_f = merge(fin_pieces)
    fins_c = np.vstack(fin_colors_l)
    fins_uv = np.vstack(fin_uv)

    # eyes: low, slightly elongated ellipsoids sunk into the socket
    eyes = []
    e = cfg.get("eye")
    if e:
        phe = np.radians(e["theta"])
        fw = body.feature_weights(np.float64(e["x"]), np.float64(phe))
        y, z = body._base(np.float64(e["x"]), np.float64(phe))
        zc = float(body.z0(e["x"]))
        r = 1 - float(fw["shrink"])
        surf = np.array([e["x"], y * r, zc + (z - zc) * r])
        inward = np.array([0.0, -y, -(z - zc)])
        inward /= np.linalg.norm(inward)
        c = surf + inward * e["inset"]
        for sgn in (1, -1):
            cc = c * np.array([1, sgn, 1.0])
            ev, ef = uv_sphere(cc, e["radius"])
            ev = cc + (ev - cc) * np.array([e.get("elong", 1.25), 1.0, 0.9])
            eyes.append((ev, ef))
    eye_v, eye_f = merge(eyes) if eyes else (np.zeros((0, 3)), [])

    allv = np.vstack([bv, fins_v])
    total = float(allv[:, 0].max() - allv[:, 0].min())
    bend = cfg.get("bend")
    sc = cfg["length_m"] / total
    return {
        "body": (to_world(bv, cfg, total, bend), bf, buv),
        "fins": (to_world(fins_v, cfg, total, bend), fins_f, fins_c, fins_uv * sc / TILE_M),
        "eye": (to_world(eye_v, cfg, total, bend) if len(eye_v) else eye_v, eye_f),
        "body_obj": body,
        "tiles": body.tiles(cfg["length_m"], total),
        "total_norm": total,
    }
