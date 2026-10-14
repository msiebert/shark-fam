import { useEffect, useRef, useState } from "preact/hooks";
import { selectLineup } from "../core/lineup";
import type { Move } from "../core/nav";
import type { TreeNode } from "../core/tree";
import { useNav, useServices } from "../app/context";
import { SharkScene } from "../scene/director";
import type { SceneView, SharkSpec } from "../scene/types";

const specOf = (n: TreeNode): SharkSpec => ({
  id: n.id,
  model: n.model!,
  lengthM: n.lengthM!,
  cruise: n.swim?.cruise ?? 0.5,
  beatHz: n.swim?.beatHz ?? 0.6,
  amplitude: n.swim?.amplitude ?? 0.1,
});

/** Turn a node into what the scene should draw. */
export function viewFor(tree: import("../core/tree").Tree, node: TreeNode): SceneView {
  if (node.rank === "species") return node.model ? { kind: "species", sharks: [specOf(node)] } : { kind: "none" };
  return { kind: "lineup", sharks: selectLineup(tree, node).map(specOf) };
}

/** Owns the canvas and keeps the scene in step with navigation. If WebGL is unavailable the rest of the app still works. */
export function SceneBridge() {
  const svc = useServices();
  const { tree, nav, models, labels, details, sceneRef, reducedMotion, safe } = svc;
  const { current, move } = useNav();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = canvas.current?.parentElement;
    if (!canvas.current || !host) return;
    try {
      const scene = new SharkScene({ canvas: canvas.current, host, reducedMotion, models, labels });
      scene.setSafeBottom(safe.bottom);
      sceneRef.current = scene;
      const onMove = (e: PointerEvent) => scene.setPointer(e.clientX, e.clientY);
      host.addEventListener("pointermove", onMove);
      // Expose for end-to-end tests.
      (window as unknown as { __scene?: SharkScene }).__scene = scene;
      return () => {
        host.removeEventListener("pointermove", onMove);
        sceneRef.current = null;
        scene.dispose();
      };
    } catch (e) {
      console.warn("WebGL is unavailable; showing the tree without 3D.", e);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setView(viewFor(tree, current), changeOf(move));
    // Look one step ahead on the path the user is most likely to take.
    const next = nav.childToVisit(current);
    if (next) {
      const ahead = next.rank === "species" ? [next] : selectLineup(tree, next);
      models.prefetch(ahead.filter((s) => s.model).map((s) => s.model!));
      details.prefetch(ahead.map((s) => s.id).filter((id) => tree.get(id)?.rank === "species"));
    }
    const sibs = tree.siblings(current).filter((s) => s.rank === "species");
    details.prefetch(sibs.map((s) => s.id));
  }, [current, failed]);

  if (failed) return <p class="nogl">3D view unavailable on this device. The tree still works.</p>;
  return <canvas ref={canvas} id="gl" aria-hidden="true" />;
}

const changeOf = (m: Move) => ({ dx: m.dx, up: m.up, down: m.down, animate: m.kind !== "init" });
