import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Move } from "../core/nav";
import type { TreeNode } from "../core/tree";
import { useNav, useServices } from "../app/context";
import { DistributionMap } from "./DistributionMap";
import { isBinomial, rankLabel, sizeText, wikiUrl } from "./format";
import { useDetail } from "./useDetail";

const OUT_MS = 300;

function Content({ node, ghost }: { node: TreeNode; ghost?: boolean }) {
  const d = useDetail(node);
  const species = node.rank === "species";
  return (
    <>
      <p class="rank">{rankLabel(node)}</p>
      <h1 class={"latin" + (isBinomial(node) ? " sp" : "")} {...(ghost ? { "aria-hidden": true } : {})}>
        {node.latin}
        {species && d && (
          <>
            {" "}
            <a class="wiki" href={wikiUrl(d.wikipedia)} target="_blank" rel="noopener noreferrer" aria-label={`Wikipedia article: ${node.latin} (opens in a new tab)`} title="Read on Wikipedia">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
              </svg>
            </a>
          </>
        )}
      </h1>
      <p class="common">{node.common}</p>
      <p class="desc">{species ? d?.description : node.description}</p>
      {species && d && (
        <ul class="facts">
          <li>
            <b>Depth</b> {d.depth}
          </li>
          <li>
            <b>Eats</b> {d.eats}
          </li>
        </ul>
      )}
      {species && d && (
        <figure class="range">
          <DistributionMap distribution={d.distribution} />
        </figure>
      )}
      {species && node.lengthM && <p class="sr">About {sizeText(node.lengthM)} long, shown beside a six-foot diver for scale. A map shows where it lives.</p>}
    </>
  );
}

/**
 * The name block. When the node changes the old text leaves first (0.3 s), then the new text arrives (about 1 s),
 * with no overlap. The old copy is a frozen, hidden-from-AT ghost that is removed once it has gone.
 */
export function InfoPanel() {
  const { reducedMotion, safe, sceneRef } = useServices();
  const { current, move } = useNav();
  const stageW = () => document.getElementById("stage")?.clientWidth ?? 800;
  const prev = useRef<TreeNode | null>(null);
  const [ghost, setGhost] = useState<{ node: TreeNode; move: Move; key: number } | null>(null);
  const el = useRef<HTMLElement>(null);
  const seq = !!prev.current && prev.current !== current && !reducedMotion;

  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = current;
    if (!before || before === current || reducedMotion) return;
    setGhost({ node: before, move, key: Math.random() });
    const t = setTimeout(() => setGhost(null), OUT_MS + 40);
    return () => clearTimeout(t);
  }, [current]);

  useEffect(() => {
    document.title = `${current.latin} · Shark Fam`;
  }, [current]);

  // Tell the scene where the text starts, so sharks and fish stay above it.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const report = () => {
      safe.bottom = node.offsetTop - node.offsetHeight / 2;
      sceneRef.current?.setSafeBottom(safe.bottom);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(node);
    return () => ro.disconnect();
  }, [current]);

  const lateral = move.up > 0 && move.down > 0;
  const W = stageW();
  const vars = (m: Move, out: boolean) => {
    const dx = m.dx * W * 0.6;
    const dy = out ? (lateral ? m.up * 45 : m.dy * 150) : lateral ? -m.down * 45 : m.dy ? m.dy * 150 : 30;
    return { "--dx": `${dx}px`, "--dy": `${dy}px` } as Record<string, string>;
  };

  return (
    <>
      {ghost && (
        <section key={ghost.key} class="ui info out" aria-hidden="true" style={vars(move, true)}>
          <Content node={ghost.node} ghost />
        </section>
      )}
      <section
        ref={el}
        key={current.id}
        id="info"
        data-testid="info"
        class={"ui info in" + (seq ? " seq" : "") + (current.rank === "species" ? " sp" : "")}
        aria-live="polite"
        style={vars(move, false)}
      >
        <Content node={current} />
      </section>
    </>
  );
}
