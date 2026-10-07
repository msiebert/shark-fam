"""Build a species: python make.py great_white [--no-render] [--fast]"""
import argparse, json, sys, time
from pathlib import Path
import numpy as np
import trimesh

HERE = Path(__file__).parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from sharkgen.build import build_shark  # noqa: E402


def get_textures(cfg, species):
    """Paint (or load cached) body albedo + micro-detail maps; returns file paths."""
    import hashlib
    from PIL import Image
    from sharkgen import skin
    from sharkgen.body import Body
    cache = HERE / ".cache"
    cache.mkdir(exist_ok=True)
    key = hashlib.md5(json.dumps({k: cfg.get(k) for k in ("body", "palette", "gills", "mouth", "eye", "nostrils", "paint")},
                                 sort_keys=True).encode() + Path(skin.__file__).read_bytes()).hexdigest()[:10]
    paths = {"albedo": cache / f"{species}_{key}_albedo.png",
             "normal": cache / "micro_normal.png", "rough": cache / "micro_rough.png"}
    if not paths["albedo"].exists():
        t = time.time()
        img = skin.paint_body(Body(cfg), cfg)
        enc = (skin.srgb_encode(img[::-1]) * 255 + 0.5).astype(np.uint8)   # nose row at the bottom
        Image.fromarray(enc).save(paths["albedo"])
        print(f"painted albedo in {time.time() - t:.0f}s")
    if not paths["normal"].exists():
        n, r = skin.micro_maps()
        Image.fromarray((n * 255 + 0.5).astype(np.uint8)).save(paths["normal"])
        Image.fromarray((r * 255 + 0.5).astype(np.uint8)).save(paths["rough"])
    return {k: str(v) for k, v in paths.items()}


def validate(model, cfg, glb):
    import struct
    bv, bf, _ = model["body"]
    tri = [(q[0], q[i], q[i + 1]) for q in bf for i in range(1, len(q) - 1)]
    body = trimesh.Trimesh(bv, tri, process=True)      # merges the UV-seam duplicates
    scene = trimesh.load(glb)
    meshes = list(scene.geometry.values())
    tris = sum(len(m.faces) for m in meshes)
    ext = scene.bounds[1] - scene.bounds[0]
    raw = Path(glb).read_bytes()
    gl = json.loads(raw[20:20 + struct.unpack("<I", raw[12:16])[0]])
    mats = gl.get("materials", [])
    checks = {
        "body watertight": body.is_watertight,
        "body volume > 0": body.volume > 0,
        f"length ~ {cfg['length_m']} m": abs(ext[0] - cfg["length_m"]) < 0.02 * cfg["length_m"],
        "triangles <= 60k": tris <= 60000,
        "albedo + normal + roughness textures exported":
            any("baseColorTexture" in m.get("pbrMetallicRoughness", {}) for m in mats)
            and any("normalTexture" in m for m in mats)
            and any("metallicRoughnessTexture" in m.get("pbrMetallicRoughness", {}) for m in mats),
        f"glb size {len(raw) / 1e6:.1f} MB <= 25 MB": len(raw) <= 25e6,
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
    ap.add_argument("--view", default="hero,head,side,top")
    a = ap.parse_args()
    cfg = json.loads((HERE / "species" / f"{a.species}.json").read_text())
    models, renders = ROOT / "models", ROOT / "renders"
    models.mkdir(exist_ok=True)
    renders.mkdir(exist_ok=True)
    glb = models / f"{a.species}.glb"
    t = time.time()
    model = build_shark(cfg)
    from sharkgen.export import export_glb
    export_glb(model, cfg, glb, get_textures(cfg, a.species))
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
        if "head" in views:
            render.render_closeup(glb, renders / f"{a.species}_head.png",
                                  res=(1000, 640) if a.fast else (1800, 1150), samples=24 if a.fast else 96)
        for v in ("side", "top"):
            if v in views:
                render.render_silhouette(glb, renders / f"{a.species}_{v}_silhouette.png", view=v,
                                         res=(1600, 500) if v == "side" else (1600, 600))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
