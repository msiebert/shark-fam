import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { attachControls } from "../input/controls";
import { useNav, useServices } from "../app/context";
import { useAmbient } from "./Ambient";
import { InfoPanel } from "./InfoPanel";
import { LineupLabels } from "./LineupLabels";
import { Neighbors } from "./Neighbors";
import { Rail } from "./Rail";
import { SceneBridge } from "./SceneBridge";
import { TreeMap } from "./TreeMap";

const CLOSE_MS = 500;

export function App() {
  const svc = useServices();
  const { nav, tree, sceneRef } = svc;
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [mapState, setMapState] = useState<"closed" | "open" | "closing">("closed");
  const mapOpen = mapState !== "closed";
  const mapRef = useRef(false);
  const mapBtn = useRef<HTMLButtonElement>(null);
  const closing = useRef(0);
  const { current } = useNav();
  useAmbient(stage);

  const openMap = useCallback(() => {
    clearTimeout(closing.current);
    mapRef.current = true;
    setMapState("open");
  }, []);
  const closeMap = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current = false;
    setMapState("closing"); // leave the overlay mounted while it fades out
    closing.current = window.setTimeout(() => {
      setMapState("closed");
      mapBtn.current?.focus();
    }, CLOSE_MS);
  }, []);

  useEffect(() => {
    if (!stage) return;
    return attachControls({ stage, nav, tree, scene: () => sceneRef.current, isMapOpen: () => mapRef.current, openMap, closeMap });
  }, [stage]);

  return (
    <main id="stage" ref={setStage} class={mapOpen ? "maping" : ""} aria-label="Shark family tree explorer">
      <SceneBridge />
      <div class="shafts" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div class="vignette" aria-hidden="true" />
      <button type="button" class="ui" id="mapBtn" ref={mapBtn} aria-haspopup="dialog" aria-expanded={mapState === "open"} onClick={openMap}>
        Tree map
      </button>
      <Neighbors />
      <LineupLabels />
      <InfoPanel />
      <Rail />
      <p class="sr" aria-live="polite" data-testid="where">
        {current.rank} {current.latin}
      </p>
      <p class="sr">Arrow keys move through the tree: up and down change rank, left and right move between siblings. Press M for the tree map.</p>
      {mapOpen && <TreeMap closing={mapState === "closing"} onClose={closeMap} />}
    </main>
  );
}
