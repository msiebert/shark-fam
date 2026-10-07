import type { TreeNode } from "./tree";

/** The rail is the tree in miniature, laid out in a fixed-width column however large the real tree is. */
export const RAIL_WIDTH = 56;
const COL = 11;
/** Siblings shown on each side of the current node on its own level. */
const REACH = 2;

export type RailKind = "current" | "path" | "sibling" | "next";

export interface RailDot {
  node: TreeNode;
  /** Row (0 = root). */
  row: number;
  /** Column offset from the spine. */
  col: number;
  kind: RailKind;
}

export interface RailModel {
  dots: RailDot[];
  /** Child -> parent links, by child node. */
  links: { child: TreeNode; parent: TreeNode }[];
  /** Rows where more siblings exist beyond the fan, on each side. */
  more: { row: number; side: -1 | 1 }[];
  /** Rows in total, root to species. */
  rows: number;
}

/**
 * Levels above the current one are single dots with the ancestor's name, the current level fans out its siblings,
 * and the next level is a single dot for where "down" would go.
 */
export function buildRail(current: TreeNode, rows: number, next: TreeNode | undefined): RailModel {
  const dots: RailDot[] = [];
  const links: RailModel["links"] = [];
  const more: RailModel["more"] = [];
  const spine = new Set<TreeNode>();
  for (let x: TreeNode | null = current; x; x = x.parentNode) spine.add(x);

  for (const x of spine) {
    if (x === current) {
      const sibs = x.parentNode ? x.parentNode.childNodes : [x];
      for (let k = -REACH; k <= REACH; k++) {
        const s = sibs[x.index + k];
        if (s) dots.push({ node: s, row: s.depth, col: k, kind: k === 0 ? "current" : "sibling" });
      }
      if (x.index - REACH > 0) more.push({ row: x.depth, side: -1 });
      if (x.index + REACH < sibs.length - 1) more.push({ row: x.depth, side: 1 });
    } else {
      dots.push({ node: x, row: x.depth, col: 0, kind: "path" });
    }
  }
  if (next) dots.push({ node: next, row: next.depth, col: 0, kind: "next" });

  const have = new Set(dots.map((d) => d.node));
  for (const d of dots) if (d.node.parentNode && have.has(d.node.parentNode)) links.push({ child: d.node, parent: d.node.parentNode });
  return { dots, links, more, rows };
}

export const railX = (col: number) => RAIL_WIDTH / 2 + col * COL;
export const railY = (row: number, rows: number, height: number) => 6 + (row * (height - 12)) / Math.max(1, rows - 1);
