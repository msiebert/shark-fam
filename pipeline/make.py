"""Build a species: python make.py great_white [--no-render] [--fast]"""
import argparse, json, sys, time
from pathlib import Path
import numpy as np
import trimesh

HERE = Path(__file__).parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from sharkgen.build import build_shark  # noqa: E402


def validate(model, cfg, glb):
    bv, bf = model["body_only"]
    tri = [(q[0], q[i], q[i + 1]) for q in bf for i in range(1, len(q) - 1)]
    body = trimesh.Trimesh(bv, tri, process=False)
    scene = trimesh.load(glb)
    meshes = list(scene.geometry.values())
    tris = sum(len(m.faces) for m in meshes)
    ext = scene.bounds[1] - scene.bounds[0]
    length = max(ext)  # glTF is Y-up; nose axis is X
    checks = {
        "body watertight": body.is_watertight,
        "body volume > 0": body.volume > 0,
        f"length ~ {cfg['length_m']} m": abs(ext[0] - cfg["length_m"]) < 0.02 * cfg["length_m"],
        "triangles <= 60k": tris <= 60000,
        "has vertex colours": any(getattr(m.visual, "kind", "") in ("vertex", "texture") or
                                  getattr(m.visual, "vertex_colors", None) is not None for m in meshes),
    }
    print(f"  triangles: {tris}  extents (m): {np.round(ext, 2)}  body volume: {body.volume:.2f} m^3")
    for k, ok in checks.items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {k}")
    return all(checks.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("species")
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--fast", action="store_true", help="low-res/low-sample preview")
    ap.add_argument("--view", default="hero,side,top")
    a = ap.parse_args()
    cfg = json.loads((HERE / "species" / f"{a.species}.json").read_text())
    models, renders = ROOT / "models", ROOT / "renders"
    models.mkdir(exist_ok=True)
    renders.mkdir(exist_ok=True)
    glb = models / f"{a.species}.glb"
    t = time.time()
    model = build_shark(cfg)
    from sharkgen.export import export_glb
    export_glb(model, cfg, glb)
    print(f"built + exported {glb.name} in {time.time() - t:.1f}s")
    ok = validate(model, cfg, glb)
    if not a.no_render:
        from sharkgen import render
        views = a.view.split(",")
        if "hero" in views:
            t = time.time()
            render.render_hero(glb, renders / f"{a.species}_hero.png",
                               res=(960, 540) if a.fast else (1920, 1080), samples=24 if a.fast else 96)
            print(f"hero render {time.time() - t:.0f}s")
        for v in ("side", "top"):
            if v in views:
                render.render_silhouette(glb, renders / f"{a.species}_{v}_silhouette.png", view=v,
                                         res=(1600, 500) if v == "side" else (1600, 600))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
