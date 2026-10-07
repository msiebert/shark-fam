import type { IndexNode, Rank, TaxonomyIndex } from "../data/schema";

export interface TreeNode extends IndexNode {
  depth: number;
  parentNode: TreeNode | null;
  childNodes: TreeNode[];
  /** Position among its siblings. */
  index: number;
  /** Left-to-right position of the first species under this node; used to pick a direction for jumps. */
  order: number;
}

export class Tree {
  readonly root: TreeNode;
  private readonly byId = new Map<string, TreeNode>();

  constructor(index: TaxonomyIndex) {
    for (const n of index.nodes) this.byId.set(n.id, { ...n, depth: 0, parentNode: null, childNodes: [], index: 0, order: 0 });
    let order = 0;
    const link = (n: TreeNode, depth: number): void => {
      n.depth = depth;
      n.order = order;
      if (!n.children.length) order++;
      n.childNodes = n.children.map((id, i) => {
        const c = this.must(id);
        c.parentNode = n;
        c.index = i;
        link(c, depth + 1);
        return c;
      });
    };
    this.root = this.must(index.root);
    link(this.root, 0);
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
    return n.parentNode ? n.parentNode.childNodes : [n];
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

  /** Lowest common ancestor. */
  lca(a: TreeNode, b: TreeNode): TreeNode {
    let x = a;
    let y = b;
    while (x.depth > y.depth) x = x.parentNode!;
    while (y.depth > x.depth) y = y.parentNode!;
    while (x !== y) {
      x = x.parentNode!;
      y = y.parentNode!;
    }
    return x;
  }

  /** Every species under a node, left to right. */
  species(n: TreeNode): TreeNode[] {
    if (n.rank === "species") return [n];
    return n.childNodes.flatMap((c) => this.species(c));
  }

  /** Levels from the root's rank down, used for rank labels. */
  rankAt(depth: number): Rank {
    let n = this.root;
    while (n.depth < depth && n.childNodes[0]) n = n.childNodes[0];
    return n.rank;
  }

  /** Number of levels below and including the root. */
  get levels(): number {
    let d = 0;
    for (let n: TreeNode | undefined = this.root; n; n = n.childNodes[0]) d++;
    return d;
  }
}
