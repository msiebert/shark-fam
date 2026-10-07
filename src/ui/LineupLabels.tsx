import { useEffect, useMemo, useState } from "preact/hooks";
import { selectLineup } from "../core/lineup";
import { useNav, useServices } from "../app/context";

/** Clickable names that follow each shark in a lineup. The scene moves them every frame, so they are not re-rendered. */
export function LineupLabels() {
  const { tree, nav, labels, sceneRef } = useServices();
  const { current } = useNav();
  const species = useMemo(() => (current.rank === "species" ? [] : selectLineup(tree, current)), [tree, current]);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.onHover = setHover;
    return () => {
      s.onHover = undefined;
    };
  }, [sceneRef.current]);
  return (
    <>
      {species.map((s) => (
        <button
          key={s.id}
          type="button"
          class={"ui lbl off" + (hover === s.id ? " hov" : "")}
          data-testid={`lbl-${s.id}`}
          ref={(el) => {
            if (el) labels.set(s.id, el);
            else labels.delete(s.id);
          }}
          onClick={() => nav.go(s)}
          aria-label={`${s.latin}, ${s.common}`}
        >
          <span class="n">{s.latin}</span>
          <span class="c">{s.common}</span>
        </button>
      ))}
    </>
  );
}
