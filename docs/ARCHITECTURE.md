# Architecture

Shark Fam is a static single-page app. Content is data, the tree is a pure model, and three.js draws the water.

## Stack and why

| Choice | Why |
| --- | --- |
| **Vite + TypeScript (strict)** | Fast dev loop, static output, no server to run. |
| **three.js, used directly** | The scene is one animated world, not a tree of components. Every shark, the diver and the school move on their own clocks every frame. React Three Fiber would add a reconciler between us and that loop without buying anything here. |
| **Preact** (3 KB) for the UI | The DOM around the scene (text, rail, tree map, labels) is a handful of components that re-render on a move. Preact gives declarative rendering without a framework tax. No router, no state library: one `Navigator` and a hook. |
| **A small custom state machine** for navigation | The rules are specific (siblings only, last-visited child, shared-ancestor travel). `core/nav.ts` is 100 lines of plain TypeScript with tests, no DOM. |
| **glTF models + a vertex-shader swim** | See below. |
| **zod** at build time | Content mistakes fail the build with a file name and a path, not at runtime. |
| **Vitest** for the model, **Playwright (core) + Chromium** for the browser | The tree, lineup layout and racetrack are pure functions and are unit tested. Timing and layout are checked in a real browser. |

Pushback on the brief: the lean toward Vite + TS + three + a custom state machine is right. The one addition is Preact, only so the overlay UI stays declarative.

## 3D: glTF with a GPU swim

The repo already has a parametric Blender pipeline (`pipeline/`) that writes a GLB per species. We use those, not the prototype's hand-built geometry.

- **No skeleton.** The GLBs are static meshes. Swimming is a travelling sine wave applied in the vertex shader (`scene/sharkMaterial.ts`): sideways offset that grows from nose to tail, with matching normal tilt. It costs nothing on the CPU, works for any model, and needs no rig per species. The prototype did this on the CPU with `computeVertexNormals` every frame, which would not survive six sharks.
- **Normalized at load** (`scene/models.ts`): bake node transforms, find which way the shark faces from its eye mesh, scale to one unit long, centre it. A new model needs no per-species orientation or scale data; the real length lives in the species record.
- **Optimized for the web** (`scripts/optimize-models.ts`): textures to WebP at 1024x2048 (albedo) and 512 (micro detail), geometry meshopt-compressed. About 2 MB per GLB becomes about 0.5 MB. A six-shark lineup is about 3 MB, loaded in parallel, cached, and prefetched one step ahead along the path you are most likely to take.
- **Materials are cloned per shark** (textures and geometry stay shared) so each fades on its own.

If a species has no model yet it still appears in the tree and has its text; it is skipped in lineups and shows only the diver.

## Data

```
content/clades/<id>.json     one file per superorder, order, family, genus
content/species/<id>.json    one file per species
        |  npm run content  (validate with zod, check references, sort, compile)
        v
public/data/index.json              the whole tree, compact, loaded once (a few hundred bytes per node)
public/data/species/<id>.json       description, facts, distribution, Wikipedia slug: fetched on demand
```

The index holds only what navigation and the lineup need: names, ranks, children, size, model, representative flag, and clade descriptions. Species detail is fetched when a species is first opened, and the current node's siblings and likely next step are prefetched, so text almost never waits on the network. With thousands of species the index stays small and the detail never loads until it is wanted.

## Source layout

```
src/core/      pure TypeScript, no DOM, unit tested
  tree.ts        the tree, ancestors, lowest common ancestor
  nav.ts         Navigator: up/down/left/right/go, last-visited memory, Move descriptions
  lineup.ts      which species a clade shows, and the bar-chart layout
  racetrack.ts   the species swim path
  rail.ts        the rail model; maplayout.ts  the tree map layout
src/data/      schema (zod), compile (pure), loader (fetch + cache)
src/scene/     three.js: director, actor, models, swim shader, diver, school, snow
src/ui/        Preact components; src/input/ keyboard, swipe, wheel, pinch
src/styles/    plain CSS
scripts/       build-content, optimize-models, e2e
```

The director owns all motion. The UI says what to show (`setView`) and how the move felt (`dx`, levels climbed and descended); the director decides where each shark goes.

## Navigation and transitions

- Up/down change rank; down goes to the last visited child, or the first. The whole path of any jump is remembered.
- Left/right stop at the ends of the siblings. Cousins are reached by going up, stepping, and coming down, or through the rail and the tree map.
- A move is described as "up N to the shared ancestor, then down M". The rail pulse, the water brightness and the camera dolly all follow that same description.
- Text: the old copy leaves in 0.3 s, then the new copy arrives over about 1 s, never overlapping.
- Sharks fade, they never slide. A departing shark swims off to the right while it fades. A shark that is in both views (a genus lineup and its species) is the same actor: it glides from its lineup pose onto its racetrack.
- `prefers-reduced-motion`: no ghost text, no dolly, no camera swing, no pulse, half-speed scene.

## Performance

- Species detail and models load lazily; models are compressed and cached; neighbours are prefetched when the browser is idle.
- The tree map lays out only the unfolded part of the tree and puts only nodes near the viewport in the DOM, so unfolding a clade with hundreds of species stays smooth (checked in `tests/core.test.ts` with 2,048 species).
- The scene allocates nothing per frame on the hot path, never recomputes normals, and pauses when the tab is hidden.

## Lineup: which sharks does a big clade show?

A lineup draws at most six sharks (`MAX_LINEUP` in `core/lineup.ts`) because each needs a row. When a clade has more, the rule today is:

1. Only species with a model are candidates.
2. **One from each child clade first**, so every branch is represented. Within a branch, a curated `"representative": true` wins, then the largest.
3. If slots remain, go round again.
4. Draw the result shortest first.

Options considered: largest only (boring, and every order looks like "the big ones"), most famous only (needs a popularity source, and one branch can hog the lineup), or curated per clade. The rule above is curated-first with a size fallback, which keeps it working before anyone has curated anything. It is a one-function change if you prefer another.

**Open question for you:** is "one per branch, curated first, largest second" the right default? Or should an order's lineup be a hand-written list per clade?
