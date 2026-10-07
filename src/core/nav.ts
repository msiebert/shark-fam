import type { Tree, TreeNode } from "./tree";

export type MoveKind = "init" | "down" | "up" | "sibling" | "jump";

/** How the view travels from one node to another: up to the shared ancestor, then down. */
export interface Move {
  kind: MoveKind;
  from: TreeNode | null;
  to: TreeNode;
  /** Shared ancestor the move passes through. */
  via: TreeNode;
  up: number;
  down: number;
  /** Sideways direction, only for moves that climb and then descend. */
  dx: -1 | 0 | 1;
  /** Change of rank: 1 deeper, -1 shallower. */
  dy: -1 | 0 | 1;
}

export type NavListener = (move: Move) => void;

const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);

/**
 * Navigation state machine.
 *
 * - up/down change rank; down returns to the last visited child, or the first.
 * - left/right (`step`) move among siblings of one parent and stop at the ends.
 * - `go` reaches any node (tree map, rail dots, lineup labels, URL hash).
 */
export class Navigator {
  private cur: TreeNode;
  private readonly lastChild = new Map<TreeNode, TreeNode>();
  private readonly listeners = new Set<NavListener>();

  constructor(readonly tree: Tree, start: TreeNode = tree.root) {
    this.cur = start;
    this.remember(start);
  }

  get current(): TreeNode {
    return this.cur;
  }

  /** The child that `down` would reach from `n`. */
  childToVisit(n: TreeNode): TreeNode | undefined {
    return this.lastChild.get(n) ?? n.childNodes[0];
  }

  subscribe(fn: NavListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Announce the starting node to listeners. */
  start(): void {
    this.emit(this.describe(null, this.cur));
  }

  canUp(): boolean {
    return !!this.cur.parentNode;
  }
  canDown(): boolean {
    return this.cur.childNodes.length > 0;
  }
  sibling(dir: -1 | 1): TreeNode | undefined {
    return this.tree.siblings(this.cur)[this.cur.index + dir];
  }

  up(): boolean {
    return this.cur.parentNode ? this.go(this.cur.parentNode) : false;
  }
  down(): boolean {
    const t = this.childToVisit(this.cur);
    return t ? this.go(t) : false;
  }
  step(dir: -1 | 1): boolean {
    const t = this.sibling(dir);
    return t ? this.go(t, dir) : false;
  }

  /** `dir` forces the sideways direction when a hop needs one. */
  go(target: TreeNode, dir?: -1 | 1): boolean {
    if (target === this.cur) return false;
    const move = this.describe(this.cur, target, dir);
    this.cur = target;
    this.remember(target);
    this.emit(move);
    return true;
  }

  private remember(n: TreeNode): void {
    for (let x: TreeNode = n; x.parentNode; x = x.parentNode) this.lastChild.set(x.parentNode, x);
  }

  private emit(m: Move): void {
    for (const l of [...this.listeners]) l(m);
  }

  private describe(from: TreeNode | null, to: TreeNode, dir?: -1 | 1): Move {
    if (!from) return { kind: "init", from, to, via: to, up: 0, down: 0, dx: 0, dy: 0 };
    const via = this.tree.lca(from, to);
    const up = from.depth - via.depth;
    const down = to.depth - via.depth;
    const lateral = up > 0 && down > 0;
    const kind: MoveKind = lateral ? (up === 1 && down === 1 ? "sibling" : "jump") : down > 0 ? "down" : "up";
    return {
      kind,
      from,
      to,
      via,
      up,
      down,
      dx: lateral ? (dir ?? (sign(to.order - from.order) || 1)) : 0,
      dy: sign(to.depth - from.depth),
    };
  }
}
