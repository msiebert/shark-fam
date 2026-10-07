import numpy as np
from scipy.interpolate import PchipInterpolator

# Style-guide palette tokens (sRGB hex)
PALETTE = {
    "slate-dorsal": "#3A4750",
    "deep-dorsal": "#25303A",
    "steel-flank": "#6E7F8A",
    "pearl-ventral": "#E9ECEA",
    "sand-warm": "#A89880",
    "abyss-blue": "#2E4A68",
    "fin-edge-dark": "#1A2229",
}


def hex_to_linear(h):
    h = PALETTE.get(h, h).lstrip("#")
    c = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)]) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def curve(xs, ys):
    return PchipInterpolator(np.asarray(xs, float), np.asarray(ys, float), extrapolate=True)


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def sgnpow(v, p):
    return np.sign(v) * np.abs(v) ** p


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def mix(a, b, t):
    t = np.asarray(t)[..., None]
    return a * (1 - t) + b * t
