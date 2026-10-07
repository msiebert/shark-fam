"""Fin generator: swept planform with a NACA-style thin airfoil section."""
import numpy as np
from .util import unit


def naca_half(s, t):
    """Half-thickness (fraction of chord) of a closed-trailing-edge NACA section."""
    return 5 * t * (0.2969 * np.sqrt(s) - 0.1260 * s - 0.3516 * s ** 2
                    + 0.2843 * s ** 3 - 0.1036 * s ** 4)


def make_fin(f, root, mirror=False, nr=22, ns=24):
    """Build one fin.

    f      fin config dict (see species/*.json)
    root   leading-edge root point on the body surface (normalised coords)
    mirror reflect across the sagittal plane (y -> -y)
    Returns verts (N,3), faces, attr dict(v, s, upfacing).
    """
    root = np.array(root, float)
    s_hat = unit(f["span_dir"])
    h = unit(f.get("trail_dir", [1, 0, 0]))
    c_hat = unit(h - np.dot(h, s_hat) * s_hat)
    n_hat = np.cross(s_hat, c_hat)
    if mirror:
        mir = np.array([1, -1, 1.0])
        root, s_hat, c_hat = root * mir, s_hat * mir, c_hat * mir
        n_hat = np.cross(s_hat, c_hat)

    span = f["span"]
    emb = f.get("emb", 0.025)
    u = np.linspace(0, 1, nr)
    v = np.concatenate([[-emb / span], 1 - (1 - u) ** 1.6])
    nrows = len(v)
    vc = np.clip(v, 0, 1)

    x_le = f["sweep"] * vc ** f.get("le_pow", 1.2)
    x_tip_te = f["sweep"] + f["tip_chord"]
    x_te = f["chord_root"] + (x_tip_te - f["chord_root"]) * vc ** f.get("te_pow", 0.7)
    chord = np.maximum(x_te - x_le, 1e-4)
    taper = np.sqrt(np.clip(1 - vc ** 4, 0, 1))
    fillet = 1 + f.get("fillet", 0.6) * np.exp(-vc / 0.07)
    tscale = taper * fillet

    k = np.arange(ns)
    s = 0.5 * (1 - np.cos(np.pi * k / (ns - 1)))  # cosine clustering at LE/TE
    yt = naca_half(s[None, :], f["thickness"]) * (chord * tscale)[:, None]

    base = (root[None, :] + s_hat[None, :] * (span * v)[:, None]
            + c_hat[None, :] * x_le[:, None])                    # (nrows,3)
    along = c_hat[None, None, :] * (s[None, :] * chord[:, None])[..., None]
    top = base[:, None, :] + along + n_hat[None, None, :] * yt[..., None]
    bot = base[:, None, :] + along - n_hat[None, None, :] * yt[..., None]

    verts = [top.reshape(-1, 3)]
    T = np.arange(nrows * ns).reshape(nrows, ns)
    B = T.copy()
    count = nrows * ns
    inner = []
    for i in range(nrows - 1):
        for kk in range(1, ns - 1):
            B[i, kk] = count
            count += 1
            inner.append(bot[i, kk])
    verts.append(np.array(inner))
    verts = np.vstack(verts)

    def grid(idx, flip):
        out = []
        for i in range(nrows - 1):
            for kk in range(ns - 1):
                q = (idx[i, kk], idx[i, kk + 1], idx[i + 1, kk + 1], idx[i + 1, kk])
                out.append(tuple(reversed(q)) if flip else q)
        return out

    def faces_dir(quads):
        mid = quads[len(quads) // 2]
        p = verts[list(mid)]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        return n

    top_f, bot_f = grid(T, False), grid(B, True)
    if np.dot(faces_dir(top_f), n_hat) < 0:
        top_f = [tuple(reversed(q)) for q in top_f]
    if np.dot(faces_dir(bot_f), n_hat) > 0:
        bot_f = [tuple(reversed(q)) for q in bot_f]

    vv = np.zeros(len(verts))
    ss = np.zeros(len(verts))
    up = np.zeros(len(verts))
    uu = np.zeros(len(verts))
    ww = np.zeros(len(verts))
    U = x_le[:, None] + s[None, :] * chord[:, None]      # position along the chord
    vv[:nrows * ns] = np.repeat(v, ns)
    ss[:nrows * ns] = np.tile(s, nrows)
    uu[:nrows * ns] = U.ravel()
    ww[:nrows * ns] = np.repeat(span * v, ns)
    up_top = float(n_hat[2])
    up[:nrows * ns] = np.where((np.tile(k, nrows) == 0) | (np.tile(k, nrows) == ns - 1), 0.0, up_top)
    j = nrows * ns
    for i in range(nrows - 1):
        for kk in range(1, ns - 1):
            vv[j], ss[j], up[j] = v[i], s[kk], -up_top
            uu[j], ww[j] = U[i, kk], span * v[i]
            j += 1
    return verts, top_f + bot_f, {"v": vv, "s": ss, "upfacing": up, "uu": uu, "ww": ww}
