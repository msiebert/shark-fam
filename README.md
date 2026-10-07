# Shark Fam

An interactive explorer for the shark family tree. One thing is on screen at a time; you move through the tree by click, arrow keys, swipe or scroll. Clades show a to-scale lineup of the sharks below them. At species level a 3D shark swims past a diver of known size.

## Run it

```bash
npm install
npm run dev        # validates content, then starts Vite
npm run build      # validates content, typechecks, builds to dist/
npm test           # unit tests (tree, navigation, lineup, racetrack, rail, map)
npm run build && npm run e2e   # browser checks at desktop and phone sizes (needs Chromium)
```

Controls: arrow keys (up/down change rank, left/right move between siblings), Enter (down), Esc (up), swipe or drag, wheel or trackpad, pinch or `M`/`T` for the tree map. The URL hash (`#carcharodon-carcharias`) is the current node.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it is built and why.

## Add a species

Everything about a species is data. You need an ancestor chain, one JSON file, and (to draw it) a model.

**1. Make sure its genus, family and order exist.** Each is a file in `content/clades/` named after its `id`:

```json
{
  "id": "galeocerdo",
  "rank": "genus",
  "parent": "galeocerdonidae",
  "latin": "Galeocerdo",
  "common": "Tiger shark genus",
  "description": "One or two sentences."
}
```

`rank` is `superorder`, `order`, `family` or `genus`; `parent` is the id of the clade one rank up. Siblings sort by the optional `order` number, then by Latin name.

**2. Add the species** as `content/species/<id>.json` (the id is the Latin name, lowercase, dashed):

```json
{
  "id": "galeocerdo-cuvier",
  "genus": "galeocerdo",
  "latin": "Galeocerdo cuvier",
  "common": "Tiger shark",
  "description": "A few sentences for the screen.",
  "lengthM": 4.0,
  "depth": "Surface to about 350 m",
  "eats": "Fish, turtles, seabirds, rays",
  "wikipedia": "Tiger_shark",
  "model": "tiger_shark",
  "representative": true,
  "swim": { "cruise": 0.5, "beatHz": 0.6, "amplitude": 0.1 },
  "distribution": {
    "mode": "coast",
    "polygons": [[[-180, -35], [180, -35], [180, 35], [-180, 35]]]
  }
}
```

- `lengthM`: typical adult length in metres. It sizes the shark, its lineup bar, the diver beside it and the baitfish.
- `wikipedia`: the article slug, from its URL.
- `distribution`: polygons as `[longitude, latitude]` rings. `"coast"` shades the coastlines inside them (reef and coastal species); `"open"` shades the water itself (open-ocean species). There is no label; keep it simple and approximate.
- `model`: base name of a GLB (see step 3). Leave it out if there is no model yet: the species still appears in the tree and has its page, but it is skipped in lineups.
- `swim` (optional): `cruise` in body lengths per second, `beatHz` tail beats per second, `amplitude` tail swing as a fraction of length. Slow filter feeders want small numbers; fast hunters want larger ones.
- `representative` (optional): marks it as the pick for its clade when a lineup has to choose.

**3. Add the model.** Generate it with the Blender pipeline (`.claude/skills/shark-model/SKILL.md`, `pipeline/README.md`): that writes `models/<name>.glb`. Then optimize it for the web:

```bash
npm run models tiger_shark      # writes public/models/tiger_shark.glb (about 0.5 MB)
```

The model needs its length along x; its facing direction and size are worked out when it loads.

**4. Check it.**

```bash
npm run content      # validates everything and tells you exactly what is wrong
npm run dev          # then open http://localhost:5173/#galeocerdo-cuvier
```

The build fails if an id is duplicated, a parent is missing, a rank is in the wrong place, a file name does not match its id, or a model file cannot be found.

## Layout

```
content/       clades and species (data only)
src/core       tree, navigation, lineup, racetrack, rail and map layout (pure, tested)
src/data       schema, compiler, loader
src/scene      three.js scene
src/ui         Preact components
pipeline/      Blender pipeline that makes the models (Python)
models/        source GLBs from the pipeline
public/models  web-optimized GLBs the app loads
scripts/       content build, model optimizer, e2e
```
