# Shark pipeline

Species JSON -> procedural geometry + painted skin textures (numpy) -> GLB (Blender `bpy`) -> validation (trimesh) -> studio renders (Cycles CPU).

```bash
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
cd pipeline
../.venv/bin/python -I make.py great_white            # full quality (~4 min; first run also paints textures, cached in .cache/)
../.venv/bin/python -I make.py great_white --fast     # 960x540 preview (~15 s)
```

Outputs: `models/<species>.glb`, `renders/<species>_{hero,head}.png`, `renders/<species>_{side,top}_silhouette.png`.
`--view head` renders just the face close-up (best for iterating on eyes/mouth).
Requires Python 3.13 (the pinned `bpy` wheel is cp313) and no GPU or display.

## Layout
- `species/*.json` – one file per species. All lengths are fractions of total length; nose = x 0.
  - `body`: stations (`x`, `up`, `down`, `half_width`, `z0`) lofted as superellipse sections
  - `gills`, `mouth`, `eye`: surface features
  - `fins`: swept planform + NACA-style section; `paired` fins are mirrored
  - `palette`: tokens from `docs/STYLE_GUIDE.md` + countershading `demarcation` curve (degrees from dorsal midline)
- `sharkgen/body.py`, `fins.py`, `build.py` – pure numpy geometry and vertex colours
- `sharkgen/skin.py` – body albedo painted in body space at 2048x4096 (countershading, mottling, gills, mouth, nostrils, eye socket) + tiling normal/roughness grain
- `sharkgen/export.py` – bpy: materials + GLB export; `sharkgen/render.py` – studio rig
- `make.py` – build, validate, render; `compare.py` – side-by-side sheet of a reference photo and a render

## Species
- `great_white` (4.5 m)
- `great_hammerhead` (4.2 m) – uses per-species `stations` density and `render.hero` / `render.head` camera overrides

- `whale_shark` (10 m) – uses `ridges`, `spots` (pale spot/stripe painter) and a terminal mouth; texture v follows surface distance so blunt noses stay sharp
- `sand_tiger_shark` (2.5 m) – stout grey-brown body, near-equal dorsals set well back, long upper caudal lobe with a short lower lobe; no painted spots yet
- `tiger_shark` (3.9 m) – blunt broad head, tall first dorsal, long upper caudal lobe; uses `bars` (broken dark vertical bars painted on back and flanks, fading toward the belly)
- `bull_shark` (2.4 m) – stocky grey body, short blunt snout, small eyes, tall first dorsal, no interdorsal ridge; plain grey over white with no pattern
- `blue_shark` (3.0 m) – slender indigo-blue body, long conical snout, large eye, very long narrow pectorals, small first dorsal set well back, long lower caudal lobe; deep blue over white with a sharp demarcation, no pattern
- `shortfin_mako` (2.8 m) – slim torpedo body with a sharp conical snout, large dark eye, tall first dorsal, short broad pectorals, tiny second dorsal and anal, narrow tail stalk and a near-symmetric crescent tail; metallic blue over white with a sharp demarcation, no pattern. Outline fitted to three iNaturalist photos (trunk within about 0.02 of length)
- `oceanic_whitetip` (2.7 m) – stocky bronze-grey body, rounded snout, very large rounded first dorsal, long broad paddle pectorals; uses `tip_white` (pale tips on every fin, a general fin option). Outline fitted to three iNaturalist photos (back line within about 0.02 of length, belly less certain)
- `blacktip_reef_shark` (1.6 m) – slim grey-brown body, short rounded snout, tall pointed first dorsal, falcate pectorals; uses `tip_black` (black fin tips, with an optional pale band just inside, a general fin option) and a high white flank band. Outline fitted to two clean iNaturalist laterals (trunk within about 0.01 of length)
- `whitetip_reef_shark` (1.6 m) – slender grey-brown body, short broad flattened head with a blunt snout, small eye, upright first dorsal, near-equal second dorsal and anal; uses `tip_white` with `tip_white_from` (a small white cap on the first dorsal and upper caudal tip). Outline fitted to three iNaturalist photos (trunk within about 0.01 of length on the one clean lateral; the other two are foreshortened or on cluttered coral, so only roughly checked); no flank spots
- `caribbean_reef_shark` (2.2 m) – heavy streamlined grey body with a deep back, short blunt snout, tall sickle-shaped first dorsal, long narrow pectorals and plain, unmarked fins. Outline fitted to three iNaturalist photos (back and belly within about 0.02 of length on the trunk; two of the photos stand on reef so their belly cut-outs are unreliable)
- `grey_reef_shark` (1.8 m) – streamlined grey body with a long, broadly rounded snout and large eye, medium triangular first dorsal; uses `tip_black` on the tail lobes and the smaller fins (approximating the broad black rear margin of the tail). Front half of the outline fitted to three iNaturalist photos (head and trunk within about 0.02 of length; rear trunk only roughly checked)
- `lemon_shark` (2.7 m) – stocky yellow-brown body with a short, broad, flattened snout, small eye and two near-equal dorsal fins; plain colouring with a pale belly. Outline checked against two iNaturalist photos (back and belly within about 0.02 of length on the head and trunk, rear trunk up to 0.03 deeper in one)
- `nurse_shark` (2.4 m) – stout tan-brown body with a broad blunt head, tiny eye, two rounded dorsal fins of similar size and a long tail with only a small lower lobe; plain colouring, no barbels yet. Outline fitted to one clean iNaturalist lateral (head and trunk within about 0.02 of length) and checked against a second blurrier one
- `common_thresher` (4.5 m) – slender grey-purple body with a short conical snout, large eye, first dorsal set well forward, long pectorals, tiny second dorsal and anal, and a whip-like upper caudal lobe about half the total length with a small lower lobe; white belly rising over the pectoral bases. Head and trunk checked against one deck photo of a whole animal (back and belly within about 0.02 of length except the deep head and pectoral region, about 0.02-0.03 shallower) and a second photo for fin positions; no clean in-water lateral exists, so the tail curve and posture are less certain
- `basking_shark` (7 m) – stout grey-brown body with a short conical snout, small eye, five long gill slits that nearly circle the head, a large mouth line, a tall triangular first dorsal, small second dorsal and anal, and a lunate tail; plain mottled skin, no pattern. Proportions were judged by eye against three Wikimedia Commons photos (two head-on, one oblique from above); no clean lateral photo was found, so `fit.py` was not run and the outline is unchecked. The caudal keel and the open mouth with gill rakers are not modelled

## The diver
`../.venv/bin/python -I make_diver.py` builds `models/diver.glb`: a six-foot scuba diver (mask, hooded face, regulator and hoses, BCD, tank, gloves, fins) as a small joint hierarchy (`Torso`, `ArmL/R` > `ForearmL/R`, `LegL/R` > `ShinL/R`, pivots at shoulder, elbow, hip, knee) that the app poses. Geometry lives in `sharkgen/human.py` (it reuses the shark `Body` loft plus a hose `tube`); colours are per-vertex. Then `npm run models diver` writes the web copy to `public/models/`. Previews: `renders/diver_{standing,swim,head}.png`. The app authors the diver upright (+y up, +z front); `make_diver.py` checks head height 1.83 m, size, node names and budget.

## Adding a species
Copy `species/great_white.json`, change the numbers, run `make.py <name>`, and check the silhouettes first.
