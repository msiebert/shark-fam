# Shark pipeline

Species JSON -> procedural geometry (numpy) -> GLB (Blender `bpy`) -> validation (trimesh) -> studio renders (Cycles CPU).

```bash
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
cd pipeline
../.venv/bin/python -I make.py great_white            # full quality (~70 s)
../.venv/bin/python -I make.py great_white --fast     # 960x540 preview (~15 s)
```

Outputs: `models/<species>.glb`, `renders/<species>_hero.png`, `renders/<species>_{side,top}_silhouette.png`.
Requires Python 3.13 (the pinned `bpy` wheel is cp313) and no GPU or display.

## Layout
- `species/*.json` – one file per species. All lengths are fractions of total length; nose = x 0.
  - `body`: stations (`x`, `up`, `down`, `half_width`, `z0`) lofted as superellipse sections
  - `gills`, `mouth`, `eye`: surface features
  - `fins`: swept planform + NACA-style section; `paired` fins are mirrored
  - `palette`: tokens from `docs/STYLE_GUIDE.md` + countershading `demarcation` curve (degrees from dorsal midline)
- `sharkgen/body.py`, `fins.py`, `build.py` – pure numpy geometry and vertex colours
- `sharkgen/export.py` – bpy: materials + GLB export; `sharkgen/render.py` – studio rig
- `make.py` – build, validate, render

## Adding a species
Copy `species/great_white.json`, change the numbers, run `make.py <name>`, and check the silhouettes first.
