import type { Navigator } from "../core/nav";
import type { Tree } from "../core/tree";
import type { SharkScene } from "../scene/director";

export interface ControlTargets {
  stage: HTMLElement;
  nav: Navigator;
  tree: Tree;
  scene: () => SharkScene | null;
  isMapOpen: () => boolean;
  openMap: () => void;
  closeMap: () => void;
}

const SWIPE_PX = 44;
const WHEEL_LOCK_MS = 1100;
const WHEEL_MIN = 18;
const INTERACTIVE = ".nb, .lbl, .wiki, .gauge, .map, button, a, input, textarea";

/**
 * Every way of moving: arrow keys, Enter, Esc, M/T, swipe and mouse drag, wheel and trackpad, pinch for the map.
 * Returns a function that removes the listeners.
 */
export function attachControls(c: ControlTargets): () => void {
  const { stage, nav } = c;
  const off: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Document, ev: string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
    el.addEventListener(ev, fn as EventListener, opts);
    off.push(() => el.removeEventListener(ev, fn as EventListener, opts));
  };

  on(document, "keydown", (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "m" || e.key === "M" || e.key === "t" || e.key === "T") {
      e.preventDefault();
      if (c.isMapOpen()) c.closeMap();
      else c.openMap();
      return;
    }
    if (c.isMapOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        c.closeMap();
      }
      return;
    }
    const onButton = tag === "BUTTON" || tag === "A";
    if (e.key === "ArrowDown" || (e.key === "Enter" && !onButton)) {
      e.preventDefault();
      nav.down();
    } else if (e.key === "ArrowUp" || e.key === "Escape") {
      e.preventDefault();
      nav.up();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nav.step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nav.step(1);
    }
  });

  // Pointer gestures: swipe or drag, plus a two-finger pinch for the map.
  const pts = new Map<number, { x: number; y: number }>();
  let id: number | null = null;
  let sx = 0;
  let sy = 0;
  let pinch0 = 0;
  let down: { x: number; y: number } | null = null;
  const spread = () => {
    const a = [...pts.values()];
    return a.length < 2 ? 0 : Math.hypot(a[0]!.x - a[1]!.x, a[0]!.y - a[1]!.y);
  };
  on(stage, "pointerdown", (e: PointerEvent) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    down = { x: e.clientX, y: e.clientY };
    c.scene()?.setPointer(e.clientX, e.clientY);
    if (pts.size === 2) {
      id = null;
      pinch0 = spread();
      return;
    }
    if ((e.target as HTMLElement).closest(INTERACTIVE)) {
      id = null;
      return;
    }
    id = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
  });
  on(stage, "pointermove", (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch0) {
      const r = spread() / pinch0;
      if (!c.isMapOpen() && r < 0.72) {
        c.openMap();
        pinch0 = 0;
      } else if (c.isMapOpen() && r > 1.35) {
        c.closeMap();
        pinch0 = 0;
      }
    }
  });
  const lift = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = 0;
  };
  on(stage, "pointerup", (e: PointerEvent) => {
    lift(e);
    if (e.pointerId !== id) return;
    id = null;
    if (c.isMapOpen()) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < SWIPE_PX) return;
    if (ax > ay) nav.step(dx < 0 ? 1 : -1);
    else if (dy < 0) nav.down();
    else nav.up();
  });
  on(stage, "pointercancel", (e: PointerEvent) => {
    lift(e);
    id = null;
  });

  // A tap on a shark in a lineup dives to it.
  on(stage, "click", (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE) || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    if (c.isMapOpen() || nav.current.rank === "species") return;
    const scene = c.scene();
    if (!scene) return;
    scene.setPointer(e.clientX, e.clientY);
    const hit = scene.pick();
    const target = hit && c.tree.get(hit);
    if (target) nav.go(target);
  });

  let lock = 0;
  on(
    stage,
    "wheel",
    (e: WheelEvent) => {
      if (c.isMapOpen()) return;
      e.preventDefault();
      const now = Date.now();
      const ax = Math.abs(e.deltaX);
      const ay = Math.abs(e.deltaY);
      if (now < lock || Math.max(ax, ay) < WHEEL_MIN) return;
      lock = now + WHEEL_LOCK_MS;
      if (ax > ay) nav.step(e.deltaX > 0 ? 1 : -1);
      else if (e.deltaY > 0) nav.down();
      else nav.up();
    },
    { passive: false },
  );

  return () => off.forEach((f) => f());
}
