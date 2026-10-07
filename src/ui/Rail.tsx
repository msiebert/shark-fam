import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { buildRail, RAIL_WIDTH, railX, railY, type RailModel } from "../core/rail";
import type { TreeNode } from "../core/tree";
import { useNav, useServices } from "../app/context";
import { isBinomial, rankLabel } from "./format";

const easeIO = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/**
 * The tree in miniature. Levels above are single dots named for the ancestor, the current level fans out its
 * siblings, the next level is one dot. A light travels the branch on each move: up the old spine to the shared
 * ancestor, then down the new one.
 */
export function Rail() {
  const { tree, nav, reducedMotion, moveMs } = useServices();
  const { current, move } = useNav();
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(240);
  const [shown, setShown] = useState<TreeNode>(current);
  const links = useRef(new Map<TreeNode, SVGPathElement>());
  const pulse = useRef<SVGCircleElement>(null);
  const anim = useRef({ raf: 0, pendingDown: null as null | (() => void) });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(Math.max(el.clientHeight, 120)));
    ro.observe(el);
    setHeight(Math.max(el.clientHeight, 120));
    return () => ro.disconnect();
  }, []);

  const rows = tree.levels;
  const model = useMemo<RailModel>(() => buildRail(shown, rows, nav.childToVisit(shown)), [shown, rows, nav, current]);

  const runPulse = (chain: { node: TreeNode; rev: boolean }[], ms: number, done?: () => void) => {
    const segs = chain.map((c) => ({ p: links.current.get(c.node), rev: c.rev })).filter((s): s is { p: SVGPathElement; rev: boolean } => !!s.p);
    const dot = pulse.current;
    if (!segs.length || !dot || ms < 30) return done?.();
    const lens = segs.map((s) => s.p.getTotalLength());
    const total = lens.reduce((a, b) => a + b, 0);
    const t0 = performance.now();
    dot.style.opacity = "1";
    const tick = (now: number) => {
      const u = Math.min((now - t0) / ms, 1);
      let d = easeIO(u) * total;
      let i = 0;
      while (i < segs.length - 1 && d > lens[i]!) d -= lens[i++]!;
      const s = segs[i]!;
      const len = lens[i]!;
      const pt = s.p.getPointAtLength(Math.max(0, Math.min(s.rev ? len - d : d, len)));
      dot.setAttribute("cx", String(pt.x));
      dot.setAttribute("cy", String(pt.y));
      if (u < 1) anim.current.raf = requestAnimationFrame(tick);
      else {
        dot.style.opacity = "0";
        done?.();
      }
    };
    anim.current.raf = requestAnimationFrame(tick);
  };

  // React to a move: pulse up the old spine, swap the rail, pulse down the new one.
  useEffect(() => {
    cancelAnimationFrame(anim.current.raf);
    anim.current.pendingDown = null;
    if (pulse.current) pulse.current.style.opacity = "0";
    const from = move.from;
    if (!from || reducedMotion || from === current || shown !== from) {
      setShown(current);
      return;
    }
    const up = move.up;
    const total = move.up + move.down;
    const tUp = (moveMs * up) / total;
    const upChain: { node: TreeNode; rev: boolean }[] = [];
    for (let x: TreeNode = from; x !== move.via; x = x.parentNode!) upChain.push({ node: x, rev: true });
    anim.current.pendingDown = () => {
      const chain: { node: TreeNode; rev: boolean }[] = [];
      for (let x: TreeNode = current; x !== move.via; x = x.parentNode!) chain.unshift({ node: x, rev: false });
      runPulse(chain, moveMs - tUp);
    };
    runPulse(upChain, tUp, () => setShown(current));
    return () => cancelAnimationFrame(anim.current.raf);
  }, [move]);

  useLayoutEffect(() => {
    const run = anim.current.pendingDown;
    if (run && shown === current) {
      anim.current.pendingDown = null;
      run();
    }
  }, [shown]);

  const y = (row: number) => railY(row, rows, height);
  const dotOf = (n: TreeNode) => model.dots.find((d) => d.node === n);
  const posOf = (n: TreeNode) => {
    const d = dotOf(n)!;
    return { x: railX(d.col), y: y(d.row) };
  };
  const spine = new Set<TreeNode>(tree.path(shown));

  return (
    <nav class="ui gauge" ref={box} aria-label="Position in the tree">
      <svg class="railsvg" width={RAIL_WIDTH} height={height} viewBox={`0 0 ${RAIL_WIDTH} ${height}`} key={shown.id}>
        {model.links.map(({ child, parent }) => {
          const a = posOf(parent);
          const b = posOf(child);
          const my = (a.y + b.y) / 2;
          return (
            <path
              key={child.id}
              ref={(el) => {
                if (el) links.current.set(child, el);
                else links.current.delete(child);
              }}
              class={"rl" + (spine.has(child) ? " path" : "")}
              d={`M${a.x} ${a.y} C${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`}
            />
          );
        })}
        {model.more.map((m) => (
          <circle key={`${m.row}${m.side}`} class="rm" cx={m.side < 0 ? 2 : RAIL_WIDTH - 2} cy={y(m.row)} r={1.3} />
        ))}
        {model.dots.map((d) => {
          const cx = railX(d.col);
          const cy = y(d.row);
          return (
            <g
              key={d.node.id}
              role="button"
              tabIndex={d.kind === "current" ? -1 : 0}
              aria-label={`${d.kind === "next" ? "Down to" : "Go to"} ${d.node.rank} ${d.node.latin}`}
              aria-current={d.kind === "current" ? "location" : undefined}
              data-testid={`rail-${d.node.id}`}
              onClick={() => nav.go(d.node)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  nav.go(d.node);
                }
              }}
            >
              <circle class={"rn" + (d.kind === "current" ? " on" : d.kind === "path" ? " path" : "")} cx={cx} cy={cy} r={3} />
              <circle class="rh" cx={cx} cy={cy} r={7} />
            </g>
          );
        })}
        <circle ref={pulse} class="pulse" r={3.8} cx={-20} cy={-20} />
      </svg>
      <span class="rlab" style={{ top: `${posOf(shown).y}px` }} aria-hidden="true">
        {rankLabel(shown)}
      </span>
      {[...spine]
        .filter((n) => n !== shown)
        .map((n) => (
          <span key={n.id} class={"rlab anc" + (isBinomial(n) ? " sp" : "")} style={{ top: `${y(n.depth)}px` }} aria-hidden="true">
            {n.latin}
          </span>
        ))}
    </nav>
  );
}
