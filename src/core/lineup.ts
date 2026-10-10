import type { Tree, TreeNode } from "./tree";

export const MAX_LINEUP = 3;

/**
 * Choose which species a clade's lineup shows.
 *
 * Only species with a model can be drawn. A clade with more than `max` of them is too crowded to show: it gets no
 * lineup. Otherwise every one is shown, sorted shortest first for drawing.
 */
export function selectLineup(tree: Tree, node: TreeNode, max = MAX_LINEUP): TreeNode[] {
  const all = node.rank === "species" ? [node] : tree.species(node);
  const picked = all.filter((s) => !!s.model);
  if (picked.length > max) return [];
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
