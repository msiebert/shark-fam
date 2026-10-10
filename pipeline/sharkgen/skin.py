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
        x1 = body.x_of_v((rows + 0.5) / H)
        X, PHI = np.meshgrid(x1, phi_row, indexing="ij")
        X = X.astype(np.float32)
        PHI = PHI.astype(np.float32)
        theta = np.minimum(PHI, TWO_PI - PHI)
        y, z = body._base(X, PHI)
        half = W // 2
        seg = np.hypot(np.diff(y[:, :half], axis=1), np.diff(z[:, :half], axis=1))
        arc_half = np.concatenate([np.zeros((len(rows), 1), np.float32), np.cumsum(seg, axis=1)], axis=1)
        arc = np.concatenate([arc_half, arc_half[:, ::-1]], axis=1)      # surface distance from the dorsal midline
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

        # pale spot-and-stripe pattern (whale shark style)
        sp = cfg.get("spots")
        if sp:
            col = _spots(col, (body.v_of_x(X) * body.s_total).astype(np.float32), arc, theta, bnd, n_low, sp,
                         hex_to_linear(sp["color"]))

        # dark broken vertical bars on the back and flanks (tiger shark style)
        br = cfg.get("bars")
        if br:
            col = _bars(col, X, theta, bnd, n_low, n_mid, br, hex_to_linear(br["color"]))

        # ocelli: a dark disc with a pale ring on each flank (epaulette shark)
        for oc in cfg.get("ocelli", []):
            th0 = np.radians(oc["theta"])
            dth = np.minimum(np.abs(theta - th0), np.abs(theta - (2 * np.pi - th0)))
            rr = np.sqrt(((X - oc["x"]) / oc["rx"]) ** 2 + (dth * r_loc / oc["ry"]) ** 2)
            ring = smoothstep(oc["ring"], oc["ring"] - 0.3, rr) * oc.get("ring_strength", 0.9)
            col = mix(col, np.broadcast_to(hex_to_linear(oc["ring_color"]), col.shape), ring)
            col = mix(col, np.broadcast_to(hex_to_linear(oc.get("color", "#141210")), col.shape), smoothstep(1.0, 0.85, rr) * 0.97)

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


def _hash(a, b, salt):
    return np.mod(np.sin(a * 127.1 + b * 311.7 + salt * 74.7) * 43758.5453, 1.0)


def _spots(col, X, arc, theta, bnd, n_brk, sp, spot_col):
    """Staggered jittered pale spots plus broken horizontal/vertical pale stripes."""
    x = X.astype(np.float64)
    c = arc.astype(np.float64)
    cy = c / sp["sc"]
    iy = np.floor(cy)
    cx = x / sp["sx"] + 0.5 * np.mod(iy, 2)
    ix = np.floor(cx)
    fx, fy = cx - ix - 0.5, cy - iy - 0.5
    jx, jy = (_hash(ix, iy, 1) - 0.5) * 0.45, (_hash(ix, iy, 2) - 0.5) * 0.45
    r0, r1 = sp["r"]
    rr = r0 + (r1 - r0) * _hash(ix, iy, 3)
    d = np.sqrt((fx - jx) ** 2 + (fy - jy) ** 2)
    spot = smoothstep(rr, rr * 0.45, d) * (_hash(ix, iy, 4) < sp.get("keep", 0.93)) * (0.65 + 0.35 * _hash(ix, iy, 5))
    st = sp.get("stripes")
    stripe = 0.0
    if st:
        dh = np.abs(np.mod(c / st["spacing"] + 0.5, 1.0) - 0.5) * st["spacing"]
        dv = np.abs(np.mod(x / st["spacing"] + 0.5, 1.0) - 0.5) * st["spacing"]
        line = np.exp(-0.5 * (dh / st["width"]) ** 2)
        if st.get("vertical", False):
            line = np.maximum(line, np.exp(-0.5 * (dv / st["width"]) ** 2))
        stripe = line * smoothstep(-0.6, 0.0, n_brk) * st["strength"] * (1 - smoothstep(0.9, 1.5, theta))
    zone = 1 - smoothstep(bnd - 0.16, bnd + 0.02, theta)
    m = np.clip(np.maximum(spot, stripe) * zone * sp["strength"], 0, 1).astype(np.float32)
    return mix(col, np.broadcast_to(spot_col, col.shape), m)


def _bars(col, X, theta, bnd, n_low, n_mid, br, bar_col):
    """Irregular dark bars running down the flank from the back, broken up and fading before the belly."""
    x = X.astype(np.float64)
    per = br["period"]
    ph = x / per + br.get("wobble", 0.25) * n_low + br.get("slant", 0.12) * np.sin(2.2 * theta) + 0.08 * n_mid
    d = np.abs(np.mod(ph + 0.5, 1.0) - 0.5) * per
    line = smoothstep(br["width"], br["width"] * 0.45, d)
    broken = smoothstep(-1.3, -0.5, n_low + 0.5 * n_mid + br.get("keep", 0.0))
    xwin = smoothstep(br["x0"], br["x0"] + 0.05, x) * smoothstep(br["x1"], br["x1"] - 0.08, x)
    zone = smoothstep(0.12, 0.3, theta) * (1 - smoothstep(bnd - 0.2, bnd - 0.02, theta))
    m = np.clip(line * broken * xwin * zone * br["strength"], 0, 1).astype(np.float32)
    return mix(col, np.broadcast_to(bar_col, col.shape), m)


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
