# Shark Fam — 3D Style Guide

**Tagline: "Sleek, elegant, anatomically honest."**

Every shark in this project should look like a studio specimen photographed by a
naturalist: restrained, smooth, and believable. Realism comes from *correct
proportions and form*, not from noisy detail.

## 1. Design principles

1. **Form first.** Silhouette and proportion carry the model. A shark should be
   recognizable from a flat black silhouette alone (hammerhead cephalofoil,
   whale shark's wide mouth, thresher's tail, etc.).
2. **Smooth, continuous surfaces.** One watertight body mesh with a gentle
   subdivision-smoothed finish. No faceting, no visible polygon edges, no
   cartoon outlines.
3. **Restrained detail.** Detail is limited to features that read at viewing
   distance: gill slits, eyes, nostrils, mouth line, fin edges, lateral line.
   Skin is *implied* through material (roughness, subtle sheen) rather than
   modelled denticle-by-denticle.
4. **One house look.** Every species shares the same pose, camera, lighting and
   material pipeline so the collection reads as a family.

## 2. Geometry

| Aspect | Standard |
|---|---|
| Construction | Body lofted from elliptical cross-sections along a spline spine; fins as separate thin-airfoil meshes blended at the root |
| Topology | Body is one quad-dominant, watertight, manifold mesh; fins are separate closed airfoil shells with roots buried in the body (merged into one skin mesh on export) |
| Smoothing | Body is lofted dense enough (~300 stations x 64) to need no subdivision; smooth shading everywhere |
| Fin profile | Tapered airfoil section — thick leading edge, razor-thin trailing edge; slight sweep and curved trailing edge (falcate) |
| Budget | <= 60k triangles hero model (currently ~57k); 5k–10k low-poly LOD planned |
| Scale | 1 unit = 1 metre, real species length (e.g. great white ≈ 4.5 m); origin at centre of mass, nose along +X, up is +Z (Blender) / +Y (glTF export) |
| Format | glTF 2.0 binary (`.glb`), embedded textures, plus `.blend`/source script kept in repo |

### Anatomy checklist (must be present on every model)
- Two dorsal fins (or one, per species), pectoral, pelvic, anal (if present), caudal fin
- Heterocercal tail (upper lobe longer) unless species differs
- 5–7 gill slits per side, correct count per species
- Eyes: dark, slightly recessed, no cartoon highlights; nictitating membrane optional
- Nostrils, mouth line with subtle jaw shape; teeth *only* if the mouth is open
- Ventral claspers on males only (default model: female/neutral)
- Faint lateral-line ridge

## 3. Pose

- **Neutral cruise pose**: body with a gentle S-curve (≈ 6–10° lateral sweep),
  pectoral fins slightly down and back, mouth closed, tail relaxed.
- Same pose family for all species so the lineup is comparable.
- Rigged variants (optional later): simple spine chain of ~12 bones for
  swim-cycle animation.

## 4. Materials & colour

Surface should look like wet, matte-satin skin.

- **Countershading**: dark dorsal → light ventral with a soft, slightly wavy
  transition at the lateral line. Gradient, never a hard line (except species
  that genuinely have one, e.g. great white's sharp demarcation).
- **PBR**: roughness 0.35–0.5, specular ~0.5, subtle clearcoat 0.1–0.2 for wet
  sheen, very faint micro-normal (denticle suggestion) — no heavy bump.
- Species markings (spots, stripes, fin tip marks) as *soft-edged* painted masks.
- No emissive, no outlines, no toon shading.

### Core palette
Muted, desaturated, natural. Pick a species colour from these, then adjust a
little for the species.

| Token | Hex | Use |
|---|---|---|
| `slate-dorsal` | `#3A4750` | typical dorsal grey-blue |
| `deep-dorsal` | `#25303A` | dark species (blue shark upper, tiger markings) |
| `steel-flank` | `#6E7F8A` | flank mid-tone |
| `pearl-ventral` | `#E9ECEA` | belly (never pure white) |
| `sand-warm` | `#A89880` | bottom dwellers (nurse, wobbegong base) |
| `abyss-blue` | `#2E4A68` | blue/oceanic species |
| `fin-edge-dark` | `#1A2229` | fin tip / trailing-edge accent |

## 5. Presentation (renders & previews)

- **Background**: soft gradient from `#0E1A24` (deep) to `#1F3446` (mid) — calm
  deep-water feeling, no clutter, no bubbles/rays by default.
- **Lighting**: three-point studio — large soft key from upper-front-left,
  cool rim light from behind-right for silhouette separation, faint fill.
  Optional very subtle caustic pattern on dorsal surface.
- **Camera**: 35° side-three-quarter view, 50–85 mm equivalent lens, slight
  low angle for gravitas. Full body in frame with 10% margin.
- **Turntable**: 360° over 8 s, ease-in-out, 30 fps.
- **Typography / UI** (when shown in-app): light weight sans-serif, generous
  spacing, muted palette above, accent `#5FB3C6` (shallow-water teal).

## 6. Per-species spec (parametric)

Each species is a small JSON file (`pipeline/species/*.json`) so the style stays consistent and
new sharks are cheap to add:

```text
name: Great White
latin: Carcharodon carcharias
length_m: 4.5
body: { girth: 0.22, snout: conical, taper: 0.8 }   # girth = max diameter / length
fins:  { dorsal1: {h: 0.14, sweep: 38}, pectoral: {len: 0.2}, caudal: {lunate: 0.85} }
gills: 5
palette: { dorsal: slate-dorsal, ventral: pearl-ventral, demarcation: sharp }
markings: []
```

## 7. Don'ts
- No cartoon eyes, big smiles, or exaggerated teeth.
- No hard-edged flat colour fills or cel shading.
- No noisy displacement or reptile-like scales.
- No pure `#000` or `#FFF` anywhere in materials.
- No inconsistent scale or orientation between species.

## 8. Quality gates (before a model is "done")
1. Silhouette test: flat-black side and top view is identifiable.
2. Watertight + manifold check passes; no flipped normals.
3. Within triangle budget; GLB loads in a stock glTF viewer with correct scale.
4. Matches palette tokens and pose standard.
5. Rendered with the standard presentation rig (`pipeline/make.py`) and compared
   against reference photos of the species.
