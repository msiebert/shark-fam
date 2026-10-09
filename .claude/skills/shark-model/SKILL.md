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

## Compare against reference photos (do this before calling a model done)
Proportions from memory are the biggest weakness, so check every new or reworked species against real photos.
Photos are references only: keep them in the scratchpad, never commit them (licences), and note each one's
source, author and licence in the scratch note.

**What this check has missed before** (sand tiger): fin and gill positions, eye and total depth were compared, but
the *outline* was not, so a model with a symmetric back and belly (no dorsal hump) passed. A uniform "make it
deeper" scale does not fix that. Compare the back line and the belly line separately, and use at least three photos
of different animals, because one animal can be fat, pregnant, bent or turned toward the camera.

1. **Find photos.** Need 3+ near-lateral, full-body, in-water shots (nose to tail tip visible, not foreshortened,
   tail not curled) plus a head-on or three-quarter one for the face. Reject angled, breaching, surface and
   carcass shots; aquarium glass magnifies slightly. Sources, in the order to try them:
   - **Wikimedia Commons**: WebSearch with `allowed_domains: ["commons.wikimedia.org"]` for `<species> side`, and the species
     category page (curl it and grep `File:` links). Downloads start returning HTTP 429 after a handful; that is rate limiting,
     not a block, so space requests about 10 s apart and retry later. Good for aquarium laterals.
   - **iNaturalist** (more variety, many divers' laterals):
     `https://api.inaturalist.org/v1/observations?taxon_name=<Latin name>&quality_grade=research&photo_license=cc0,cc-by,cc-by-sa&per_page=30&order_by=votes&photos=true`.
     `static.inaturalist.org` is blocked here; fetch `https://inaturalist-open-data.s3.amazonaws.com/photos/<photo id>/large.jpg`
     (`medium.jpg` if that 404s). Download thumbnails for all hits, paste them on one contact sheet with their file names,
     look at it once, then fetch the good ones large. Keep the `attribution` field for each.
   Records are community-identified; if a shark looks wrong for the species, drop it.
2. **Download** Commons files with `curl -sSL --max-time 60 -o ref.jpg "https://commons.wikimedia.org/wiki/Special:FilePath/<File_name>?width=1600"`
   (redirects to upload.wikimedia.org) and Read each image to look at it.
3. **If every source fails** (`CONNECT tunnel failed, response 403/502`), the environment's network policy blocks the hosts.
   Do not retry, and do not substitute descriptions for a comparison. Tell the user which hosts must be added under Allowed
   domains in the environment's Network access settings, carry on with the rest, and say in the report and commit message that
   proportions were **not** checked against photos.
4. **Fit the outline** (the main check). Read each photo, note pixel coordinates of the nose tip and of the tip of the
   upper caudal lobe, then
   ```bash
   cd pipeline && ../.venv/bin/python -I fit.py <species> <photo> "$SCRATCH"/fit_<n> --nose x,y --tail x,y [--flip] [--norot]
   ```
   (`--flip` when the shark faces left; `--norot` when the tail is swung far off the body axis.) It projects
   `models/<species>.glb`, scales and rotates it onto your two points, cuts the shark out of the photo with GrabCut,
   and prints, at fixed fractions from the nose, how far the photo's back line (`d_back`) and belly line (`d_belly`)
   are from the model's, as fractions of length (positive = raise `up` / `down` there). Read `<out>_fit.png` first: red
   is the model, green the cut-out, yellow ticks are tenths of length from the nose. If the green outline does not
   follow the animal, fix the points or ignore that photo. Columns where the model has a fin are skipped, and columns
   where a fin of the *photo* hangs out (pelvic/anal region, x of about 0.55 and beyond) are not reliable, so judge the
   head and trunk from those numbers and the tail end from the picture.
   The ticks also give you every fin's position: read first dorsal origin and apex, second dorsal, anal, pelvic and
   pectoral off them, as fractions, for each photo.
5. **Fix what is off.** Anything over about 0.02 of length in the outline, or 0.03 in a landmark, or any wrong
   shape, gets fixed in the config (reshape `up`/`down` at the stations, not by a uniform scale; move `attach.x`; gills),
   rebuilt with `make.py --fast`, and fitted again on every photo. Average the photos where they disagree, weighting
   the cleanest lateral most. Stop after three rounds and report what is still off.
6. **Also check by eye**, as photo vs model, as fractions of length: first dorsal origin and height; second dorsal and anal
   positions and sizes; pectoral origin and length; pelvic position; caudal lobe lengths and ratio; where the body is deepest
   and how the **back and belly lines differ** (nape rise, hump, belly sag, taper to the peduncle); snout length and profile
   (conical, blunt, flat); eye position and size; mouth length against the eye; gill count and first-slit position; countershading
   line height; colour and markings. `compare.py` still makes a quick side-by-side sheet for colour and markings:
   ```bash
   cd pipeline && ../.venv/bin/python -I compare.py <photo> ../renders/<species>_hero.png "$SCRATCH"/sheet.png \
       --crop-photo x0,y0,x1,y1 --crop-render x0,y0,x1,y1 [--flip-photo]
   ```
   (the hero is a three-quarter view, so use it for colour only, not for proportions).
7. Check the head against the head-on or three-quarter photo the same way (snout shape from above, eye placement, mouth).

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
- `up` and `down` are separate on purpose. Real sharks are not symmetric top to bottom: sand tiger has a deep back that climbs behind the
  head to the first dorsal (+0.04 of length over a symmetric loft) and a flatter belly; hammerheads and whale sharks differ again.
  A symmetric spindle looks like a generic shark. Reshape each side from the photo fit, never with one uniform scale.
- Fin and gill positions drift in config because they are typed from memory: the sand tiger's gills were 0.08 too far forward and
  every fin 0.04-0.10. Do not trust remembered numbers; fit them.
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
2. Silhouettes (top + side) identify the species, and `fit.py` has been run against at least three lateral photos
   (see above): the back and belly lines are within about 0.02 of length on the trunk, fin and gill landmarks within 0.03, and the
   remaining differences are listed. If that was not possible, say the proportions are unchecked.
3. Hero and head renders viewed; eyes recessed, mouth calm, no streaking, no floating dark smudges.
4. `README.md` species list updated; commit GLB + renders + config; push to the working branch.
5. Send the hero and head PNGs to the user and list real weaknesses plainly. Known gaps: no
   fin-ray texture, no scars/individual marks, no teeth/open mouth, proportions are only as good as the photo fit; if it could not be done, say they are unchecked.

## The diver (and other props)
The scale-reference diver is built by the same pipeline: `pipeline/make_diver.py` (geometry in `sharkgen/human.py`,
hierarchy export in `sharkgen/export.py:export_diver_glb`, studio shots via `render.render_prop`). Run it from `pipeline/`
with `python -I`, then `npm run models diver` for the web copy. Lessons: author in the app's space (+y up, +z front,
head 1.83 m) and give Blender Z-up coordinates so the glTF exporter's Y-up conversion is a no-op; keep joints as nodes
with pivots at the joint (the app animates `ArmL/R`, `ForearmL/R`, `LegL/R`, `ShinL/R` by rotation); weld the loft's UV-seam
duplicates or shading splits along it; overlapping shells (a BCD over a torso) must be larger than what they cover or the
inner colour pokes through; fit straps and masks to the real head width or they float; `render_prop`'s `focus` is in
Blender axes (z is up). A diver in swim trim extends about 0.57 m of fin below the origin; that is expected.

## App-side behaviour tied to the models (`src/scene/`)
- Swim = vertex-shader wave (`sharkMaterial.ts`, amplitude per species in `content/species/*.json`, typically 0.12-0.17).
- Turns bend the body, bank it and strengthen the beat, driven by turn tightness (`actor.ts`); the e2e script checks it.
- Speeds are scaled with visible width (`speedScale`) so phones are not frantic. If you add motion, test at a phone size.

## Ideas not yet done
Hammerhead front-view render; fin-ray striations; scars and per-individual marks; LOD variants (5-10k
tris); a spine rig for swim animation; whale-shark mouth as a true wide front slot; thresher (very long
upper tail lobe) and nurse shark (barbels, rounded fins) as the next stress tests.
