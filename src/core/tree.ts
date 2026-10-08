import type { IndexNode, Rank, TaxonomyIndex } from "../data/schema";

export interface TreeNode extends IndexNode {
  depth: number;
  parentNode: TreeNode | null;
  childNodes: TreeNode[];
  /** Position among its siblings. */
  index: number;
  /** Left-to-right position of the first species under this node; used to pick a direction for jumps. */
  order: number;
  /** This node and its siblings. For an order, all the orders. */
  siblingNodes: TreeNode[];
}

export class Tree {
  /** The orders, left to right: the top of the tree as the person sees it. */
  readonly roots: TreeNode[];
  /**
   * An invisible node above the orders (depth -1, no parent link from them). It exists so that moves between
   * orders have a shared ancestor and whole-tree walks have one start. It is never shown or navigated to.
   */
  readonly root: TreeNode;
  private readonly byId = new Map<string, TreeNode>();

  constructor(index: TaxonomyIndex) {
    for (const n of index.nodes) this.byId.set(n.id, { ...n, depth: 0, parentNode: null, childNodes: [], index: 0, order: 0, siblingNodes: [] });
    let order = 0;
    const attach = (ids: string[], parent: TreeNode | null, depth: number): TreeNode[] => {
      const kids = ids.map((id) => this.must(id));
      kids.forEach((c, i) => {
        c.depth = depth;
        c.parentNode = parent;
        c.index = i;
        c.siblingNodes = kids;
        c.order = order;
        if (!c.children.length) order++;
        c.childNodes = attach(c.children, c, depth + 1);
      });
      return kids;
    };
    this.roots = attach(index.roots, null, 0);
    this.root = {
      id: "",
      rank: "order",
      parent: null,
      latin: "",
      common: "",
      children: index.roots,
      speciesCount: this.roots.reduce((n, r) => n + r.speciesCount, 0),
      depth: -1,
      parentNode: null,
      childNodes: this.roots,
      index: 0,
      order: 0,
      siblingNodes: [],
    };
  }

  get size(): number {
    return this.byId.size;
  }

  get(id: string): TreeNode | undefined {
    return this.byId.get(id);
  }

  private must(id: string): TreeNode {
    const n = this.byId.get(id);
    if (!n) throw new Error(`Unknown node "${id}" in taxonomy index`);
    return n;
  }

  siblings(n: TreeNode): TreeNode[] {
    return n.siblingNodes;
  }

  /** Root to node, inclusive. */
  path(n: TreeNode): TreeNode[] {
    const out: TreeNode[] = [];
    for (let x: TreeNode | null = n; x; x = x.parentNode) out.unshift(x);
    return out;
  }

  isAncestor(a: TreeNode, n: TreeNode): boolean {
    for (let x: TreeNode | null = n; x; x = x.parentNode) if (x === a) return true;
    return false;
  }

  /** Lowest common ancestor. Two different orders meet at the invisible `root`. */
  lca(a: TreeNode, b: TreeNode): TreeNode {
    const up = (n: TreeNode) => n.parentNode ?? this.root;
    let x = a;
    let y = b;
    while (x.depth > y.depth) x = up(x);
    while (y.depth > x.depth) y = up(y);
    while (x !== y) {
      x = up(x);
      y = up(y);
    }
    return x;
  }

  /** Every species under a node, left to right. */
  species(n: TreeNode): TreeNode[] {
    if (n.rank === "species") return [n];
    return n.childNodes.flatMap((c) => this.species(c));
  }

  /** Levels from the first order down, used for rank labels. */
  rankAt(depth: number): Rank {
    let n = this.roots[0]!;
    while (n.depth < depth && n.childNodes[0]) n = n.childNodes[0];
    return n.rank;
  }

  /** Number of levels, from order to species. */
  get levels(): number {
    let d = 0;
    for (let n: TreeNode | undefined = this.roots[0]; n; n = n.childNodes[0]) d++;
    return d;
  }
}
