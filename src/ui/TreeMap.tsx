import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { layoutMap, pathOpenSet } from "../core/maplayout";
import type { Tree, TreeNode } from "../core/tree";
import { useServices } from "../app/context";
import { isBinomial, rankLabel } from "./format";

const MARGIN_Y = 40;
const TWEEN_MS = 600;

interface Pt {
  x: number;
  y: number;
}

function computeTargets(tree: Tree, open: ReadonlySet<TreeNode>, W: number, H: number, slotW: number, pad: number) {
  const layout = layoutMap(tree, open);
  const w = Math.max(W, 2 * pad + layout.width * slotW);
  const off = (w - layout.width * slotW) / 2;
  const rows = Math.max(1, tree.levels - 1);
  const targets = new Map<TreeNode, Pt>();
  for (const s of layout.slots) targets.set(s.node, { x: off + s.x * slotW, y: MARGIN_Y + (s.depth * (H - 2 * MARGIN_Y)) / rows });
  return { layout, targets, width: w };
}

/**
 * The whole tree, with branches you are not on folded. Only the unfolded part is laid out and only the part near
 * the viewport is in the DOM, so it stays fast with hundreds of nodes. Positions are tweened by hand so links and
 * nodes move together.
 */
export function TreeMap({ onClose, closing }: { onClose: () => void; closing: boolean }) {
  const { tree, nav, reducedMotion } = useServices();
  const [open, setOpen] = useState<ReadonlySet<TreeNode>>(() => pathOpenSet(nav.current));
  const [size, setSize] = useState({ W: 0, H: 0 });
  const [scrollX, setScrollX] = useState(0);
  const [shown, setShown] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pos = useRef(new Map<TreeNode, Pt>());
  const els = useRef(new Map<TreeNode, HTMLElement>());
  const linkEls = useRef(new Map<TreeNode, SVGPathElement>());
  const raf = useRef(0);
  const centred = useRef(false);

  const compact = size.W < 520;
  const slotW = compact ? 114 : 150;
  const pad = compact ? 24 : 80;
  const { layout, targets, width } = useMemo(() => computeTargets(tree, open, size.W, size.H, slotW, pad), [tree, open, size, slotW, pad]);

  // Nodes the map has not drawn yet start at their parent (so a branch unfolds out of it) or at their target.
  for (const [n, t] of targets) if (!pos.current.has(n)) pos.current.set(n, { ...(n.parentNode && pos.current.get(n.parentNode) ? pos.current.get(n.parentNode)! : t) });
  for (const n of [...pos.current.keys()]) if (!targets.has(n)) pos.current.delete(n);

  const paint = () => {
    for (const [n, el] of els.current) {
      const p = pos.current.get(n);
      if (p) el.style.transform = `translate(${p.x}px,${p.y}px)`;
    }
    for (const [n, path] of linkEls.current) {
      const a = n.parentNode && pos.current.get(n.parentNode);
      const b = pos.current.get(n);
      if (a && b) {
        const m = (a.y + b.y) / 2;
        path.setAttribute("d", `M${a.x} ${a.y} C${a.x} ${m} ${b.x} ${m} ${b.x} ${b.y}`);
      }
    }
  };

  useLayoutEffect(() => {
    cancelAnimationFrame(raf.current);
    const from = new Map([...pos.current].map(([n, p]) => [n, { ...p }]));
    const t0 = performance.now();
    const ms = reducedMotion ? 0 : TWEEN_MS;
    const tick = (now: number) => {
      const u = ms ? Math.min((now - t0) / ms, 1) : 1;
      const e = 1 - Math.pow(1 - u, 3);
      for (const [n, t] of targets) {
        const f = from.get(n) ?? t;
        pos.current.set(n, { x: f.x + (t.x - f.x) * e, y: f.y + (t.y - f.y) * e });
      }
      paint();
      if (u < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [targets]);

  // Size, first centring, scroll tracking.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setSize({ W: el.clientWidth, H: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    let pending = 0;
    const onScroll = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        setScrollX(el.scrollLeft);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const id = requestAnimationFrame(() => setShown(true));
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(id);
      cancelAnimationFrame(pending);
    };
  }, []);
  useLayoutEffect(() => {
    const el = scroller.current;
    const t = targets.get(nav.current);
    if (!el || !size.W || centred.current || !t) return;
    centred.current = true;
    el.scrollLeft = Math.max(0, t.x - size.W / 2);
    setScrollX(el.scrollLeft);
  }, [targets, size.W]);

  // Focus the dialog when it opens, and hand focus back when it closes.
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    return () => before?.focus?.();
  }, []);

  const toggle = (n: TreeNode) => {
    const next = new Set(open);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    // Keep the branch you tapped where it is on screen while the rest makes room.
    const before = (pos.current.get(n)?.x ?? 0) - (scroller.current?.scrollLeft ?? 0);
    const after = computeTargets(tree, next, size.W, size.H, slotW, pad).targets.get(n);
    setOpen(next);
    if (after) requestAnimationFrame(() => scroller.current && (scroller.current.scrollLeft = Math.max(0, after.x - before)));
  };

  const onPath = (n: TreeNode) => tree.isAncestor(n, nav.current);
  const lo = scrollX - size.W;
  const hi = scrollX + 2 * size.W;
  const visible = layout.slots.filter((s) => {
    const t = targets.get(s.node)!;
    return t.x >= lo && t.x <= hi;
  });
  const visibleSet = new Set(visible.map((s) => s.node));
  const rows = Math.max(1, tree.levels - 1);
  const ranks = Array.from({ length: tree.levels }, (_, d) => tree.rankAt(d));

  return (
    <section
      class={"ui map" + (shown && !closing ? " open" : "")}
      role="dialog"
      aria-modal="true"
      aria-label="Tree map"
      data-testid="map"
      onKeyDown={(e) => {
        if (e.key === "Tab") {
          const f = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("button")];
          if (!f.length) return;
          const first = f[0]!;
          const last = f[f.length - 1]!;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <div class="mapbox">
        <div class="mapscroll" ref={scroller} onClick={(e) => (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("mapin")) && onClose()}>
          <div class="mapin" style={{ width: `${width}px`, height: `${size.H}px` }}>
            <svg width={width} height={size.H} viewBox={`0 0 ${width} ${size.H}`} aria-hidden="true">
              {visible
                .filter((s) => s.node.parentNode)
                .map((s) => (
                  <path
                    key={s.node.id}
                    class={"ml" + (onPath(s.node) ? " path" : "")}
                    pathLength={1}
                    style={{ "--d": s.depth }}
                    ref={(el) => {
                      if (el) {
                        linkEls.current.set(s.node, el);
                        if (visibleSet.has(s.node.parentNode!)) paint();
                      } else linkEls.current.delete(s.node);
                    }}
                  />
                ))}
            </svg>
            {visible.map((s) => {
              const n = s.node;
              const isCur = n === nav.current;
              const path = onPath(n);
              const kids = n.childNodes.length > 0;
              return (
                <div
                  key={n.id}
                  class={"mn" + (isCur ? " on" : path ? " path pin" : "")}
                  style={{ "--d": s.depth }}
                  ref={(el) => {
                    if (el) {
                      els.current.set(n, el);
                      const p = pos.current.get(n);
                      if (p) el.style.transform = `translate(${p.x}px,${p.y}px)`;
                    } else els.current.delete(n);
                  }}
                >
                  <div class="mni" style={{ maxWidth: `${slotW - 8}px` }}>
                    <button
                      type="button"
                      class="mm"
                      data-testid={`map-${n.id}`}
                      aria-current={isCur ? "location" : undefined}
                      aria-label={`${n.rank} ${n.latin}, ${n.common}`}
                      onClick={() => {
                        onClose();
                        nav.go(n);
                      }}
                    >
                      <i class="dot" />
                      <span class={"t" + (isBinomial(n) ? " sp" : "")}>{n.latin}</span>
                      <span class="c">{n.common}</span>
                    </button>
                    {kids && !path && (
                      <button
                        type="button"
                        class="mx"
                        data-testid={`fold-${n.id}`}
                        aria-expanded={open.has(n)}
                        aria-label={`${open.has(n) ? "Fold" : "Unfold"} ${n.latin}${open.has(n) ? "" : `, ${n.speciesCount} species`}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(n);
                        }}
                      >
                        {open.has(n) ? "▾" : `▸ ${n.speciesCount}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {size.H > 0 &&
          ranks.map((r, d) => (
            <span key={d} class="mrank" style={{ top: `${MARGIN_Y + (d * (size.H - 2 * MARGIN_Y)) / rows}px` }} aria-hidden="true">
              {rankLabel({ rank: r })}
            </span>
          ))}
      </div>
      <button type="button" class="mapclose" ref={closeBtn} onClick={onClose}>
        Close map
      </button>
      <p class="maphint">Tap a name to dive there. Tap ▸ to unfold a branch. Scroll sideways for more. Esc closes.</p>
    </section>
  );
}
