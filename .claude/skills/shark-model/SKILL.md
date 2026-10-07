---
name: shark-model
description: Generate a new 3D shark species (GLB + hero/head/silhouette renders) with this repo's parametric Blender pipeline in pipeline/. Use when asked to add, tweak, or re-render a shark model, or to fix how a shark looks (eyes, mouth, skin, fins, spots, head shape).
---

# Generating shark models

Sharks are built procedurally, not by AI 3D generators. Those were researched and rejected
(see `docs/3D_GENERATION_OPTIONS.md`): free tiers have no API or no usable license, and nothing
is tuned for sharks. A species is one JSON file; the pipeline turns it into a GLB plus renders
in the house style (`docs/STYLE_GUIDE.md`). Existing species are the best templates:
`great_white` (conical snout), `great_hammerhead` (flat cephalofoil), `whale_shark` (spots, ridges).

## Setup (once per container)
```bash
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt   # bpy wheel is ~400 MB, needs Python 3.13
```
No GPU, display, or Hugging Face access is needed. Cycles runs on CPU. Run with `python -I` (isolated mode)
from inside `pipeline/`, so stray files in the working directory are never imported.

## The loop
```bash
cd pipeline
../.venv/bin/python -I make.py <species> --fast --view hero,head   # ~45 s first time (paints texture), ~20 s after
../.venv/bin/python -I make.py <species>                            # final: ~3-4 min, all four renders
```
Outputs: `models/<species>.glb`, `renders/<species>_{hero,head,side_silhouette,top_silhouette}.png`.
`make.py` validates and exits non-zero on failure (watertight body, volume > 0, length within 2%,
triangle budget, albedo+normal+roughness textures present, GLB size).

**Always look at the renders before reporting** (Read the PNGs). Iterate on `--fast`, and only do the
full render once the fast one looks right. Check silhouettes first (top + side), then hero, then head.
The silhouette test is the style guide's first quality gate. Textures are cached in
`pipeline/.cache/` (keyed by config), so tweaks to fins/camera/lighting are cheap; changing
body/palette/gills/mouth/eye/nostrils/paint/spots/ridges repaints (~20 s).

## Adding a species
1. Copy the closest existing `pipeline/species/*.json`.
2. All lengths are **fractions of total length**; x = 0 at the nose, increasing toward the tail,
   y lateral (+ = right), z up. `length_m` sets real size.
3. Fill in, in this order: `body` -> `fins` -> `gills`/`eye`/`mouth` -> `palette` -> extras
   (`nostrils`, `ridges`, `spots`) -> `render` overrides.
4. Render fast, compare silhouettes against what you know of the species, fix proportions, then details.

### Config reference
- `body`: `x`, `up`, `down`, `half_width` (parallel arrays of half-extents, smooth-interpolated),
  `z0` (centreline height), `exponent` (superellipse, 2.3-2.5), optional `stations` =
  `[[x0, x1, n], ...]` to put vertex density where detail is (gills, steep head profile).
  Keep the nose pole honest: first points near x=0 should rise fast but start at 0.
  End the body (last x) *inside* the tail web and taper width to ~0.005-0.01 or you get a visible
  blunt cap where the peduncle meets the caudal fin.
- `fins`: each has `attach` (`{x, theta}` on the body surface, theta in degrees from the dorsal
  midline: 0 top, 90 flank, 180 belly; or `{x, axis: true}` for the caudal lobes), `span_dir`,
  `chord_root`, `span`, `sweep`, `tip_chord`, `le_pow` (>1 convex leading edge), `te_pow` (<1 concave
  trailing edge, falcate), `thickness`, `paired` (mirrors), `color` (`dorsal`|`ventral`),
  `underside: "pearl"`, `tip_patch`, `edge_dark`, `emb` (root embed depth). The caudal fin is two
  lobes (`caudal_upper`, `caudal_lower`) rooted on the axis with `emb ~0.03` so they overlap.
- `bend`: cruise-pose S-curve (`amp ~0.025-0.03`).
- `gills`, `eye`, `mouth` (see "Face" below), `nostrils`, `ridges`, `spots` (whale shark pattern),
  `paint` (texture tuning), `tri_budget` (default 60000).
- `palette`: tokens from the style guide or hex; `demarcation` = countershading boundary as
  `[x, degrees]` points plus `softness` (radians; ~0.03 sharp great white, ~0.09 soft hammerhead).
- `render.hero` / `render.head`: camera overrides (`yaw`, `cam_z` in length fractions; head also
  `focus`, `dist_frac`). Flat-headed species need a **higher camera** or the head is seen edge-on.

## How it works (so you can fix it, not just run it)
- `sharkgen/body.py` lofts superellipse cross-sections along the spine; poles at nose/tail; a duplicate
  seam column makes the UV wrap. `sharkgen/fins.py` sweeps a NACA-style section along a planform.
  `sharkgen/skin.py` paints the body albedo analytically in body space (2048x4096) and generates tiling
  normal/roughness grain. `sharkgen/export.py` (bpy) builds materials and exports GLB.
  `sharkgen/render.py` is the Cycles studio rig. Geometry is pure numpy, so it is testable without bpy.
- Body = textured UV mesh; fins = vertex colours + the shared micro-detail maps; eyes = separate mesh.
- Fine features (gill lines, mouth, nostrils, spots) are **painted into the texture**, with only a shallow
  geometric dent for depth. Vertex colours at mesh resolution were too blurry for crisp lines.

## Hard-won lessons (do not relearn these)
**Face**
- A glossy sphere with a catchlight looks cartoonish ("derpy"). Eyes must be matte-black, low,
  slightly elongated ellipsoids sunk into a shadowed socket (`inset` large, `socket_k` ~0.05-0.09,
  roughness ~0.5, low specular). Smaller is better.
- Mouth lines read as smiles if the corner turns up. Use the `mouth` path: it rises from the belly
  midline to `theta_peak`, then droops to `theta_corner` (corner lower than peak), both mid-flank.
  Keep the arc gentle; an abrupt droop looks like a hook. Define it in theta space; a y-based
  curve hid on the belly. Hammerhead needs theta ~150-160 (flat head), great white ~115-130.
- Add nostrils and a darker eye ring/brow, or the face looks blank.
**Skin**
- Plastic look = no variation. Fixes that worked: painted two-scale mottling + fine speckle, a ragged
  demarcation line (keep `ragged_deg` ~1-1.5; 3 looked like paint splatter), tiling normal + roughness.
- Micro-normal must be *weak* (strength ~1.6 in `micro_maps`, material strength 0.6). A regular
  denticle-cell pattern at real scale reads as woven fabric and moire; keep cells faint and large.
- Texture streaking on blunt noses (whale shark): texture v must follow **surface distance**, not x
  (`Body.v_of_x`), and any pattern lattice must use arc length around the section, not theta.
- Pale stripes: vertical + horizontal broken lines look like "+" signs. Use long horizontal lines only.
**Silhouette and fins**
- Caudal crescent needs the lobe tips well behind the notch: raise `sweep`, lower `chord_root`, and
  taper the body end. Keep span ~0.2 of length (hammerhead upper lobe is longer, ~0.27).
- Pelvic/anal fins look like white spikes if they point straight down; tilt `span_dir` back and out
  and keep them small.
- Falcate pectorals: `te_pow` ~0.5-0.6, tiny `tip_chord`.
**Rendering**
- First lighting was ~3x overexposed (dorsal looked pale). Current key/rim/fill energies are scaled by
  length^2 so any size works; close-ups need about half the light.
- Camera: 3/4, low, ~62 deg yaw, head toward the right. Frame the whole animal with margin.
- `bend` shears the whole mesh after build, so fins stay consistent; keep angles small.
**Budget**
- Triangles ~ stations x ring x 2 + ~14-19k for fins. Over budget -> cut stations in the mid-body first
  (ring 64 is enough when the texture carries detail; ring 80-96 only if geometric ridges need it).

## Verification checklist before telling the user it is done
1. `make.py` exits 0 and all PASS lines show.
2. Silhouettes (top + side) identify the species.
3. Hero and head renders viewed; eyes recessed, mouth calm, no streaking, no floating dark smudges.
4. `README.md` species list updated; commit GLB + renders + config; push to the working branch.
5. Send the hero and head PNGs to the user and list real weaknesses plainly. Known gaps: no
   fin-ray texture, no scars/individual marks, no teeth/open mouth, proportions are from memory and
   have not been checked against reference photos.

## Ideas not yet done
Hammerhead front-view render; fin-ray striations; scars and per-individual marks; LOD variants (5-10k
tris); a spine rig for swim animation; whale-shark mouth as a true wide front slot; thresher (very long
upper tail lobe) and nurse shark (barbels, rounded fins) as the next stress tests.
