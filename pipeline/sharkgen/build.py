"""Assemble a species config into world-space skin + eye geometry (pure numpy)."""
import numpy as np
from .body import Body
from .fins import make_fin
from .util import curve, hex_to_linear, mix, smoothstep


# ---------------------------------------------------------------- colours
def body_colors(attr, pal):
    x, th = attr["x"], attr["theta"]
    dorsal, deep = hex_to_linear(pal["dorsal"]), hex_to_linear(pal["deep"])
    ventral, dark = hex_to_linear(pal["ventral"]), hex_to_linear(pal["edge"])
    dem = pal["demarcation"]
    px, pd = zip(*dem["points"])
    bnd = np.radians(curve(px, pd)(x) + dem.get("wave", 0.0) * np.sin(17 * x + 0.7) * np.sin(7 * x + 0.4))
    t = smoothstep(bnd - dem["softness"], bnd + dem["softness"], th)
    top = mix(np.broadcast_to(deep, (len(x), 3)), np.broadcast_to(dorsal, (len(x), 3)),
              smoothstep(0.05, 1.25, th))
    noise = 1 + 0.05 * np.sin(61 * x + 3 * th) * np.sin(23 * x - 2 * th + 1.7)
    top = top * noise[:, None]
    col = mix(top, np.broadcast_to(ventral, (len(x), 3)), t)
    col = mix(col, np.broadcast_to(dark, (len(x), 3)), 0.80 * attr["gill"])
    col = mix(col, np.broadcast_to(dark, (len(x), 3)), 0.70 * attr["mouth"])
    col = mix(col, np.broadcast_to(dark, (len(x), 3)), 0.35 * attr["socket"])
    return col


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
def build_shark(cfg):
    body = Body(cfg)
    pal = cfg["palette"]
    bv, bf, battr = body.build(cfg.get("ring", 64))
    pieces = [(bv, bf)]
    colors = [body_colors(battr, pal)]
    # nose pole should sit on the dorso-ventral transition rather than the dark back
    colors[0][0] = colors[0][1]

    for f in cfg["fins"]:
        att = f["attach"]
        root = body.axis(att["x"]) if att.get("axis") else body.surface(att["x"], np.radians(att["theta"]))
        for mirror in ([False, True] if f.get("paired") else [False]):
            fv, ff, fa = make_fin(f, root, mirror)
            pieces.append((fv, ff))
            colors.append(fin_colors(f, fa, pal))
    skin_v, skin_f = merge(pieces)
    skin_c = np.vstack(colors)

    # eyes
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
            eyes.append(uv_sphere(cc, e["radius"]))
    eye_v, eye_f = merge(eyes) if eyes else (np.zeros((0, 3)), [])

    total = float(skin_v[:, 0].max() - skin_v[:, 0].min())
    bend = cfg.get("bend")
    skin_w = to_world(skin_v, cfg, total, bend)
    return {
        "skin": (skin_w, skin_f, skin_c),
        "eye": (to_world(eye_v, cfg, total, bend) if len(eye_v) else eye_v, eye_f),
        "body_only": (to_world(bv, cfg, total, bend), bf),
        "total_norm": total,
    }
