"""Skin textures: analytic body albedo (countershading, mottling, face/gill detail)
and tiling micro-detail maps (normal + roughness).

The body albedo is painted in body space (u = phi / 2pi, v = x / x_end), so every
feature stays crisp at 2048 x 4096 regardless of mesh resolution.
"""
import numpy as np
from .body import mouth_path
from .util import curve, hex_to_linear, mix, smoothstep

TWO_PI = 2 * np.pi


def _waves(seed, n, f_lo, f_hi, circ=0.55):
    """Random plane waves that are exactly periodic around the body."""
    rng = np.random.RandomState(seed)
    f = np.exp(rng.uniform(np.log(f_lo), np.log(f_hi), n))
    psi = rng.uniform(0, TWO_PI, n)
    return f * np.cos(psi), np.round(circ * f * np.sin(psi)), rng.uniform(0, TWO_PI, n)


def _noise(x, phi, w):
    fx, m, p = w
    out = np.zeros_like(x, dtype=np.float32)
    for a, b, c in zip(fx, m, p):
        out += np.sin(TWO_PI * a * x + b * phi + c).astype(np.float32)
    return out / np.sqrt(len(fx) / 2.0)


def srgb_encode(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def paint_body(body, cfg, W=2048, H=4096, chunk=256):
    """Return (H, W, 3) float32 linear albedo; row 0 = nose (v = 0)."""
    pal = cfg["palette"]
    pt = cfg.get("paint", {})
    dorsal, deep = hex_to_linear(pal["dorsal"]), hex_to_linear(pal["deep"])
    ventral, dark = hex_to_linear(pal["ventral"]), hex_to_linear(pal["edge"])
    dem = pal["demarcation"]
    px, pd = zip(*dem["points"])
    dem_curve = curve(px, pd)
    w_low, w_mid, w_fine = _waves(1, 18, 6, 28), _waves(2, 20, 28, 120), _waves(3, 24, 120, 700)
    w_rag = _waves(4, 14, 10, 40)
    g, m_, e = cfg.get("gills"), cfg.get("mouth"), cfg.get("eye")
    phi_row = (np.arange(W) + 0.5) / W * TWO_PI
    img = np.empty((H, W, 3), np.float32)

    for r0 in range(0, H, chunk):
        rows = np.arange(r0, min(H, r0 + chunk))
        x1 = (rows + 0.5) / H * body.x_end
        X, PHI = np.meshgrid(x1, phi_row, indexing="ij")
        X = X.astype(np.float32)
        PHI = PHI.astype(np.float32)
        theta = np.minimum(PHI, TWO_PI - PHI)
        y, z = body._base(X, PHI)
        n_low, n_mid, n_fine = _noise(X, PHI, w_low), _noise(X, PHI, w_mid), _noise(X, PHI, w_fine)

        # countershading with a ragged, irregular demarcation line
        bnd = np.radians(dem_curve(X) + dem.get("wave", 0) * np.sin(17 * X + 0.7) * np.sin(7 * X + 0.4)
                         + pt.get("ragged_deg", 3.0) * _noise(X, PHI, w_rag))
        t = smoothstep(bnd - dem["softness"], bnd + dem["softness"], theta)
        top = mix(np.broadcast_to(deep, X.shape + (3,)), np.broadcast_to(dorsal, X.shape + (3,)),
                  smoothstep(0.05, 1.25, theta))
        mott = 1 + pt.get("mottle", 0.06) * n_low + 0.04 * n_mid + pt.get("speckle", 0.025) * n_fine
        mott_v = 1 + 0.35 * (mott - 1)
        col = mix(top * mott[..., None], np.broadcast_to(ventral, X.shape + (3,)) * mott_v[..., None], t)

        dark_b = np.broadcast_to(dark, X.shape + (3,))
        r_loc = np.sqrt(np.maximum(body.w(X), 1e-3) * np.maximum((body.up(X) + body.down(X)) / 2, 1e-3))

        # gill slits: thin crisp dark lines
        if g:
            tt = (theta - np.radians(g["theta0"])) / (np.radians(g["theta1"]) - np.radians(g["theta0"]))
            win = smoothstep(0.0, 0.1, tt) * smoothstep(1.0, 0.9, tt)
            line = np.zeros_like(X)
            for i in range(g["count"]):
                xc = g["x0"] + i * g["dx"] + g.get("lean", 0.0) * (tt - 0.5)
                line = np.maximum(line, np.exp(-0.5 * ((X - xc) / pt.get("gill_sigma", 0.0007)) ** 2) * win)
            col = mix(col, dark_b, 0.92 * line)

        # mouth: crisp lip line, pooling darker toward the corner
        if m_:
            tm, slope, win = mouth_path(m_, X)
            d = np.abs(theta - tm) * r_loc / np.sqrt(1 + (r_loc * slope) ** 2)
            corner = 1 + 0.7 * smoothstep(m_["x0"] + 0.6 * (m_["x1"] - m_["x0"]), m_["x1"], X)
            ml = np.exp(-0.5 * (d / pt.get("mouth_sigma", 0.0011)) ** 2) * win
            col = mix(col, dark_b, np.clip(0.78 * ml * corner, 0, 0.95))

        # nostrils: small dark slits near the snout tip
        for nz in cfg.get("nostrils", []):
            dn = ((X - nz["x"]) / nz["len"]) ** 2 + ((theta - np.radians(nz["theta"])) * r_loc / nz["wid"]) ** 2
            col = mix(col, dark_b, 0.85 * smoothstep(1.0, 0.45, dn))

        # eye: shadowed socket ring plus a soft brow shadow
        if e:
            phe = np.radians(e["theta"])
            d2 = ((X - e["x"]) ** 2 + ((theta - phe) * r_loc) ** 2) / e["socket_sigma"] ** 2
            col = mix(col, dark_b, 0.55 * np.exp(-0.5 * d2 * 2.2))
            brow = ((X - e["x"] - 0.002) ** 2 + ((theta - phe + 0.22) * r_loc) ** 2) / (e["socket_sigma"] * 1.1) ** 2
            col = mix(col, dark_b, 0.22 * np.exp(-0.5 * brow))
        img[r0:r0 + len(rows)] = col
    return img


def _tileable_noise(n, beta, seed):
    rng = np.random.RandomState(seed)
    f = np.fft.fft2(rng.randn(n, n))
    fy, fx = np.meshgrid(np.fft.fftfreq(n), np.fft.fftfreq(n), indexing="ij")
    r = np.sqrt(fx ** 2 + fy ** 2)
    r[0, 0] = 1
    h = np.real(np.fft.ifft2(f / r ** beta))
    return (h - h.mean()) / h.std()


def micro_maps(n=1024):
    """Tiling fine-grain height -> (normal RGB, roughness RGB) as float arrays in 0..1."""
    u, v = np.meshgrid(np.arange(n), np.arange(n), indexing="ij")
    cw, ch = 64, 128                        # very faint staggered denticle cells, elongated along the flow
    row = (u // ch).astype(int)
    uu = ((v + (row % 2) * cw / 2) % cw) - cw / 2
    vv = (u % ch) - ch / 2
    cell = np.clip(1 - (uu / (0.55 * cw)) ** 2 - (vv / (0.6 * ch)) ** 2, 0, 1) ** 1.5
    grain = _tileable_noise(n, 1.0, 11)
    broad = _tileable_noise(n, 2.2, 12)
    h = 0.12 * cell + 0.5 * grain + 0.5 * broad
    gy, gx = np.gradient(h)
    k = 1.6
    nx, ny, nz = -gx * k, -gy * k, np.ones_like(h)
    ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    normal = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5
    rough = np.clip(0.40 + 0.06 * broad - 0.02 * cell + 0.03 * grain, 0.24, 0.60)
    rmap = np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], -1)  # R=AO, G=roughness, B=metal
    return normal.astype(np.float32), rmap.astype(np.float32)
