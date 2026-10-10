import type { Tree, TreeNode } from "./tree";

export const MAX_LINEUP = 3;

/**
 * Choose which species a clade's lineup shows.
 *
 * Only species with a model can be drawn. When there are more than `max`, take one from each child clade
 * first (so every branch is represented), best candidate first: curated `representative`, then the largest.
 * Remaining slots go round again. The result is sorted shortest first for drawing.
 */
export function selectLineup(tree: Tree, node: TreeNode, max = MAX_LINEUP): TreeNode[] {
  const drawable = (s: TreeNode) => !!s.model;
  const best = (a: TreeNode, b: TreeNode) => Number(!!b.representative) - Number(!!a.representative) || (b.lengthM ?? 0) - (a.lengthM ?? 0);

  let picked: TreeNode[];
  if (node.rank === "species") {
    picked = drawable(node) ? [node] : [];
  } else {
    const groups = (node.rank === "genus" ? node.childNodes.map((c) => [c]) : node.childNodes.map((c) => tree.species(c)))
      .map((g) => g.filter(drawable).sort(best))
      .filter((g) => g.length);
    const total = groups.reduce((n, g) => n + g.length, 0);
    if (total <= max) picked = groups.flat();
    else {
      // Strongest groups first, so a crowded clade drops its weakest branches rather than its best ones.
      const order = groups.slice().sort((a, b) => best(a[0]!, b[0]!));
      picked = [];
      for (let round = 0; picked.length < max; round++) {
        let added = false;
        for (const g of order) {
          const s = g[round];
          if (s && picked.length < max) {
            picked.push(s);
            added = true;
          }
        }
        if (!added) break;
      }
    }
  }
  return picked.sort((a, b) => (a.lengthM ?? 0) - (b.lengthM ?? 0) || a.latin.localeCompare(b.latin));
}

/* ---------- Layout of the bar chart ---------- */

export interface LineupInput {
  /** Real lengths in metres, shortest first. */
  lengthsM: number[];
  /** Half extents of the view at the swim depth, in world units. */
  halfW: number;
  halfH: number;
  /** Screen height in px, to size the label gaps. */
  viewH: number;
  /** Fractions of screen height (from the top) bounding the chart. */
  top: number;
  bottom: number;
  /** Height reserved above each shark for its name, in px. */
  labelPx: number;
  /** Fraction of the view width the longest bar may fill. */
  widthFrac?: number;
}

export interface LineupRow {
  /** Tail end of the bar, world x. */
  tailX: number;
  /** Centre line of the bar, world y. */
  y: number;
  /** World units per metre; multiply a length in metres to get the bar's length. */
  unitsPerM: number;
  /** Top of the bar's label zone, world y. */
  labelY: number;
}

export interface LineupLayout {
  unitsPerM: number;
  rows: LineupRow[];
}

/** Bars share a baseline at their tails, so the length of each body is its size, drawn to scale. */
export function layoutLineup(i: LineupInput): LineupLayout {
  const { halfW, halfH, viewH } = i;
  const wpp = (2 * halfH) / viewH; // world units per pixel
  const lab = i.labelPx * wpp;
  const gap = 0.06 * halfH;
  const yAt = (f: number) => (0.5 - f) * 2 * halfH;
  const top = yAt(i.top);
  const zoneH = top - yAt(i.bottom);
  // Body thickness in metres: a shark is roughly a fifth as deep as it is long.
  const items = i.lengthsM.map((m) => ({ m, th: 0.2 * m, lab }));
  const fixed = gap * (items.length - 1) + items.reduce((n, x) => n + x.lab, 0);
  const sumTh = items.reduce((n, x) => n + x.th, 0);
  const maxM = Math.max(...items.map((x) => x.m));
  const k = Math.min((2 * halfW * (i.widthFrac ?? 0.6)) / maxM, (zoneH - fixed) / sumTh, 0.19 * halfH);
  const total = sumTh * k + fixed;
  const x0 = (-maxM * k) / 2;
  let y = top - (zoneH - total) / 2;
  const rows = items.map((it) => {
    const labelY = y;
    const row: LineupRow = { tailX: x0, y: y - it.lab - (it.th * k) / 2, unitsPerM: k, labelY };
    y -= it.lab + it.th * k + gap;
    return row;
  });
  return { unitsPerM: k, rows };
}
