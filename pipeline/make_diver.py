"""Build the diver: python make_diver.py [--no-render] [--fast]

Writes models/diver.glb (standing pose, joint hierarchy for the app) and preview renders in renders/.
"""
import argparse, json, struct, sys, time
from pathlib import Path
import numpy as np

HERE = Path(__file__).parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from sharkgen import human  # noqa: E402

NODES = ["Torso", "ArmL", "ArmR", "ForearmL", "ForearmR", "LegL", "LegR", "ShinL", "ShinR"]
SWIM_ROT = human.rot_x(0.95) @ human.rot_y(0.0) @ human.rot_z(-np.pi / 2)   # the app's swimming pose (three.js XYZ order)


def validate(parts, glb):
    lo, hi, tris = human.diver_stats(parts)
    raw = Path(glb).read_bytes()
    gl = json.loads(raw[20:20 + struct.unpack("<I", raw[12:16])[0]])
    names = {n.get("name") for n in gl["nodes"]}
    head = hi[1]
    checks = {
        f"head top {head:.2f} m = 1.83 m": abs(head - human.DIVER_M) < 0.015,
        f"fin tips reach {lo[1]:.2f} m below the origin (< 0.6)": lo[1] > -0.6,
        f"width {hi[0] - lo[0]:.2f} m is human-sized (0.45-0.7)": 0.45 < hi[0] - lo[0] < 0.7,
        f"depth {hi[2] - lo[2]:.2f} m (tank to mask, 0.3-0.5)": 0.3 < hi[2] - lo[2] < 0.5,
        "joint nodes present": all(n in names for n in NODES),
        f"triangles {tris} <= 45k": tris <= 45000,
        f"glb {len(raw) / 1e3:.0f} KB <= 1500 KB": len(raw) <= 1_500_000,
    }
    for k, ok in checks.items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {k}")
    return all(checks.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--fast", action="store_true")
    a = ap.parse_args()
    from sharkgen.export import export_diver_glb
    models, renders, cache = ROOT / "models", ROOT / "renders", HERE / ".cache"
    for d in (models, renders, cache):
        d.mkdir(exist_ok=True)
    t = time.time()
    parts = human.build_diver()
    glb = models / "diver.glb"
    export_diver_glb(parts, glb)
    print(f"built + exported {glb.name} in {time.time() - t:.1f}s")
    ok = validate(parts, glb)
    if not a.no_render:
        from sharkgen import render
        s = 24 if a.fast else 96
        r = (700, 700) if a.fast else (1400, 1400)
        render.render_prop(glb, renders / "diver_standing.png", res=r, samples=s, yaw=-58, elev=0.05, dist=2.2)
        render.render_prop(glb, renders / "diver_head.png", res=r, samples=s, yaw=-62, elev=0.0, dist=0.5,
                           focus=(0.5, 0.5, 0.93), lens=85)
        swim = human.rotate_all(human.pose_parts(human.build_diver(), human.APP_POSE), SWIM_ROT)
        sw = cache / "diver_swim.glb"
        export_diver_glb(swim, sw)
        render.render_prop(sw, renders / "diver_swim.png", res=(1400, 800) if not a.fast else (800, 460), samples=s,
                           yaw=-60, elev=0.1, dist=2.4)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
