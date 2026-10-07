"""Body hull: lofted superellipse cross-sections along the spine.

Coordinates here are *normalised* (fractions of total length): x runs nose (0)
to tail (+), y is lateral (+ = right side), z is up.  Cross-section angle phi
is measured from the dorsal midline: 0 = top, pi/2 = right flank, pi = belly.
"""
import numpy as np
from .util import curve, sgnpow, smoothstep


class Body:
    def __init__(self, cfg):
        b = cfg["body"]
        xs = b["x"]
        self.exp = b.get("exponent", 2.3)
        self.up = curve(xs, b["up"])
        self.down = curve(xs, b["down"])
        self.w = curve(xs, b["half_width"])
        zx, zz = zip(*b["z0"])
        self.z0 = curve(zx, zz)
        self.x_end = xs[-1]
        self.cfg = cfg

    # -- geometry -------------------------------------------------------
    def _base(self, x, phi):
        p = 2.0 / self.exp
        s, c = np.sin(phi), np.cos(phi)
        up = np.maximum(self.up(x), 5e-4)
        dn = np.maximum(self.down(x), 5e-4)
        w = np.maximum(self.w(x), 5e-4)
        y = w * sgnpow(s, p)
        z = self.z0(x) + np.where(c >= 0, up, dn) * sgnpow(c, p)
        return y, z

    def surface(self, x, phi):
        """Undisplaced surface point(s) as (...,3)."""
        x = np.asarray(x, float) * np.ones_like(np.asarray(phi, float))
        y, z = self._base(x, np.asarray(phi, float))
        return np.stack([x, y, z], -1)

    def axis(self, x):
        return np.array([x, 0.0, float(self.z0(x))])

    # -- surface features (gill slits, mouth, eye socket) -----------------
    def feature_weights(self, x, phi):
        """Return dict of weight fields in [0,1] on the (x, phi) grid."""
        cfg = self.cfg
        y, z = self._base(x, phi)
        r_loc = np.sqrt(np.maximum(self.w(x), 1e-3) * np.maximum((self.up(x) + self.down(x)) / 2, 1e-3))
        theta = np.minimum(phi, 2 * np.pi - phi)  # 0..pi regardless of side
        out = {}

        g = cfg.get("gills")
        slit = np.zeros_like(x)
        if g:
            t = (theta - np.radians(g["theta0"])) / (np.radians(g["theta1"]) - np.radians(g["theta0"]))
            win = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.88, t)
            for i in range(g["count"]):
                xc = g["x0"] + i * g["dx"] + g.get("lean", 0.0) * (t - 0.5)
                slit = np.maximum(slit, np.exp(-0.5 * ((x - xc) / g["sigma"]) ** 2) * win)
        out["gill"] = slit

        m = cfg.get("mouth")
        mouth = np.zeros_like(x)
        if m:
            ay = np.abs(y)
            xm = m["x0"] + m["curve_k"] * (ay / m["ymax"]) ** m.get("curve_p", 2.2)
            fade = smoothstep(m["ymax"], m["ymax"] * 0.82, ay)
            bottom = np.clip(0.25 - np.cos(phi) * 3.0, 0.0, 1.0)
            mouth = np.exp(-0.5 * ((x - xm) / m["sigma"]) ** 2) * fade * bottom
        out["mouth"] = mouth

        e = cfg.get("eye")
        sock = np.zeros_like(x)
        if e:
            phe = np.radians(e["theta"])
            ye, ze = self._base(np.float64(e["x"]), np.float64(phe))
            d2 = (x - e["x"]) ** 2 + (theta - phe) ** 2 * r_loc ** 2
            sock = np.exp(-0.5 * d2 / e["socket_sigma"] ** 2)
        out["socket"] = sock

        k = 0.0
        if g:
            k = k + g["k"] * slit
        if m:
            k = k + m["k"] * mouth
        if e:
            k = k + e["socket_k"] * sock
        out["shrink"] = np.clip(k, 0.0, 0.5)
        out["theta"] = theta
        return out

    # -- mesh -----------------------------------------------------------
    def build(self, n_ring=64):
        cfg = self.cfg
        xs = np.concatenate([
            np.linspace(0.0015, 0.12, 55),
            np.linspace(0.12, 0.30, 150)[1:],
            np.linspace(0.30, self.x_end, 95)[1:],
        ])
        S, M = len(xs), n_ring
        phi = np.linspace(0, 2 * np.pi, M, endpoint=False)
        X, PHI = np.meshgrid(xs, phi, indexing="ij")
        fw = self.feature_weights(X, PHI)
        y, z = self._base(X, PHI)
        zc = self.z0(X)
        r = 1.0 - fw["shrink"]
        y = y * r
        z = zc + (z - zc) * r
        ring = np.stack([X, y, z], -1).reshape(-1, 3)

        nose = np.array([[0.0, 0.0, float(self.z0(0.0))]])
        tail = np.array([[self.x_end, 0.0, float(self.z0(self.x_end))]])
        verts = np.vstack([nose, ring, tail])
        i_nose, i_tail = 0, 1 + S * M

        def rid(i, j):
            return 1 + i * M + (j % M)

        faces = []
        for j in range(M):
            faces.append((i_nose, rid(0, j + 1), rid(0, j)))
        for i in range(S - 1):
            for j in range(M):
                faces.append((rid(i, j), rid(i, j + 1), rid(i + 1, j + 1), rid(i + 1, j)))
        for j in range(M):
            faces.append((i_tail, rid(S - 1, j), rid(S - 1, j + 1)))

        # attributes per vertex
        def flat(a):
            return a.reshape(-1)
        attr = {k: np.concatenate([[0.0], flat(v), [0.0]]) for k, v in fw.items()}
        attr["x"] = np.concatenate([[0.0], flat(X), [self.x_end]])
        attr["phi"] = np.concatenate([[0.0], flat(PHI), [0.0]])
        attr["theta"] = np.concatenate([[0.0], flat(fw["theta"]), [0.0]])
        faces = orient_outward(verts, faces, self)
        return verts, faces, attr


def orient_outward(verts, faces, body):
    """Flip all faces if the majority point toward the spine."""
    f = faces[len(faces) // 2]
    v = verts[list(f)]
    n = np.cross(v[1] - v[0], v[2] - v[0])
    cen = v.mean(0)
    axis = np.array([cen[0], 0.0, float(body.z0(cen[0]))])
    if np.dot(n, cen - axis) < 0:
        faces = [tuple(reversed(t)) for t in faces]
    return faces
