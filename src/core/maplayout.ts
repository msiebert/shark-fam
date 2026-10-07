import type { Tree, TreeNode } from "./tree";

export interface MapSlot {
  node: TreeNode;
  /** Horizontal position in slot units (a leaf is one slot wide). */
  x: number;
  depth: number;
}

export interface MapLayout {
  slots: MapSlot[];
  byNode: Map<TreeNode, MapSlot>;
  /** Total width in slot units. */
  width: number;
}

/**
 * Lay out only the unfolded part of the tree. Leaves of the visible tree are spread evenly and every parent
 * sits over the middle of its visible children. Folded branches cost nothing, so a huge tree stays cheap.
 */
export function layoutMap(tree: Tree, open: ReadonlySet<TreeNode>): MapLayout {
  const slots: MapSlot[] = [];
  const byNode = new Map<TreeNode, MapSlot>();
  let leaf = 0;
  const walk = (n: TreeNode): number => {
    const kids = open.has(n) ? n.childNodes : [];
    let x: number;
    if (!kids.length) x = leaf++ + 0.5;
    else {
      const xs = kids.map(walk);
      x = (xs[0]! + xs[xs.length - 1]!) / 2;
    }
    const slot: MapSlot = { node: n, x, depth: n.depth };
    slots.push(slot);
    byNode.set(n, slot);
    return x;
  };
  walk(tree.root);
  slots.sort((a, b) => a.node.order - b.node.order || a.depth - b.depth);
  return { slots, byNode, width: leaf };
}

/** The set of nodes to unfold so the current node is visible: its ancestors, and itself. */
export function pathOpenSet(n: TreeNode): Set<TreeNode> {
  const s = new Set<TreeNode>();
  for (let x: TreeNode | null = n; x; x = x.parentNode) s.add(x);
  return s;
}
