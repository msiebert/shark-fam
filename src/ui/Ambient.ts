import { useEffect } from "preact/hooks";
import { lerp } from "../scene/frame";
import { useNav, useServices } from "../app/context";
import type { Tree, TreeNode } from "../core/tree";

const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

type RGB = [number, number, number];
/** Water colour at the surface and in the dark. Centre of the glow, its falloff, and the edge. */
const SHALLOW: RGB[] = [[120, 225, 225], [38, 150, 178], [10, 92, 122]];
const DEEP: RGB[] = [[18, 40, 92], [4, 14, 38], [0, 3, 12]];
const FOG_SHALLOW: RGB = [30, 120, 145];
const FOG_DEEP: RGB = [2, 10, 26];
const DEEPEST_M = 1000;

/** 0 at the surface, 1 at ~1 km. Square root so a reef (40 m) and open water (300 m) are clearly different shades. */
export const darkness = (m: number) => Math.sqrt(Math.min(1, m / DEEPEST_M));

const metresCache = new WeakMap<Tree, Map<string, number>>();
/** Species: its deepest depth. Clades: the mean of the species beneath them. */
function metres(tree: Tree, n: TreeNode): number {
  let cache = metresCache.get(tree);
  if (!cache) metresCache.set(tree, (cache = new Map()));
  const hit = cache.get(n.id);
  if (hit !== undefined) return hit;
  let m: number;
  if (n.rank === "species") m = n.maxDepthM ?? 100;
  else {
    const kids = n.childNodes.map((c) => metres(tree, c));
    m = kids.length ? kids.reduce((a, b) => a + b, 0) / kids.length : 100;
  }
  cache.set(n.id, m);
  return m;
}

const mix = (a: RGB, b: RGB, k: number) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i]!, k))).join(",")})`;

/** The water is the colour of the depth the shark lives at; a move dives (or rises) from one to the other. */
export function useAmbient(target: HTMLElement | null) {
  const { tree, reducedMotion, moveMs, sceneRef } = useServices();
  const { current, move } = useNav();
  useEffect(() => {
    if (!target) return;
    const paint = (k: number) => {
      target.style.setProperty("--w1", mix(SHALLOW[0]!, DEEP[0]!, k));
      target.style.setProperty("--w2", mix(SHALLOW[1]!, DEEP[1]!, k));
      target.style.setProperty("--w3", mix(SHALLOW[2]!, DEEP[2]!, k));
      target.style.setProperty("--light", String(1 - 0.88 * k));
      sceneRef.current?.setFog(mix(FOG_SHALLOW, FOG_DEEP, k));
    };
    const to = darkness(metres(tree, current));
    const from = move.from ? darkness(metres(tree, move.from)) : to;
    if (reducedMotion || !move.from || from === to) return paint(to);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / moveMs, 1);
      paint(lerp(from, to, ease(p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, current, move]);
}
