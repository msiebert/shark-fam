import { createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import type { Move, Navigator } from "../core/nav";
import type { Tree } from "../core/tree";
import type { DetailStore } from "../data/loader";
import type { ModelLibrary } from "../scene/models";

export interface AppServices {
  tree: Tree;
  nav: Navigator;
  details: DetailStore;
  models: ModelLibrary;
  reducedMotion: boolean;
  /** Time a move takes to settle, in ms. */
  moveMs: number;
  /** Label elements the scene positions every frame, by species id. */
  labels: Map<string, HTMLElement>;
  /** Filled in once WebGL is up. */
  sceneRef: { current: import("../scene/director").SharkScene | null };
  /** Bottom of the free area above the text, px from the top of the stage; the scene keeps sharks and fish above it. */
  safe: { bottom: number };
}

export const Services = createContext<AppServices>(null as unknown as AppServices);
export const useServices = () => useContext(Services);

/** The current node and the move that got there. Re-renders on every move. */
export function useNav(): { current: Move["to"]; move: Move } {
  const { nav } = useServices();
  const [state, setState] = useState<{ move: Move; n: number }>(() => ({
    move: { kind: "init", from: null, to: nav.current, via: nav.current, up: 0, down: 0, dx: 0, dy: 0 },
    n: 0,
  }));
  useEffect(() => {
    const off = nav.subscribe((move) => setState((s) => ({ move, n: s.n + 1 })));
    // A move may have happened between the first render and this subscription.
    setState((s) => (s.move.to === nav.current ? s : { move: { ...s.move, kind: "jump", to: nav.current, via: nav.current }, n: s.n + 1 }));
    return off;
  }, [nav]);
  return { current: state.move.to, move: state.move };
}
