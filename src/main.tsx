import { render } from "preact";
import { Services, type AppServices } from "./app/context";
import { nodeFromHash, syncHash } from "./app/hash";
import { Navigator } from "./core/nav";
import { Tree } from "./core/tree";
import { DetailStore, loadIndex } from "./data/loader";
import { ModelLibrary } from "./scene/models";
import { App } from "./ui/App";
import "./styles/base.css";
import "./styles/info.css";
import "./styles/rail.css";
import "./styles/map.css";

const root = document.getElementById("app")!;

async function boot() {
  const index = await loadIndex();
  const tree = new Tree(index);
  const nav = new Navigator(tree, nodeFromHash(tree) ?? tree.root);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const services: AppServices = {
    tree,
    nav,
    details: new DetailStore(),
    models: new ModelLibrary(),
    reducedMotion,
    moveMs: 1300,
    labels: new Map(),
    sceneRef: { current: null },
    safe: { bottom: 0 },
  };
  syncHash(nav);
  render(
    <Services.Provider value={services}>
      <App />
    </Services.Provider>,
    root,
  );
  (window as unknown as { __nav?: Navigator }).__nav = nav;
}

boot().catch((e) => {
  console.error(e);
  root.textContent = "Could not load Shark Fam. Please refresh.";
});
