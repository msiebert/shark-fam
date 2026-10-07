import { useEffect } from "preact/hooks";
import { lerp } from "../scene/frame";
import { useNav, useServices } from "../app/context";

const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** The water is brighter near the surface. A move brightens toward the shared ancestor and darkens again. */
export function useAmbient(target: HTMLElement | null) {
  const { tree, reducedMotion, moveMs } = useServices();
  const { current, move } = useNav();
  useEffect(() => {
    if (!target) return;
    const levels = Math.max(1, tree.levels - 1);
    const paint = (d: number) => {
      const k = Math.max(0, Math.min(1, d / levels));
      const c = (a: number, b: number) => Math.round(lerp(a, b, k));
      target.style.setProperty("--w1", `rgb(${c(11, 8)},${c(71, 52)},${c(86, 62)})`);
      target.style.setProperty("--w2", `rgb(${c(4, 3)},${c(32, 22)},${c(43, 30)})`);
    };
    const from = move.from?.depth ?? current.depth;
    const via = move.via.depth;
    const to = current.depth;
    if (reducedMotion || !move.from || (from === to && via === from)) return paint(to);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / moveMs, 1);
      paint(p < 0.5 ? lerp(from, via, ease(p * 2)) : lerp(via, to, ease(p * 2 - 1)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, current, move]);
}
