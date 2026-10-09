import { useNav, useServices } from "../app/context";
import { isBinomial } from "./format";

/** The previous and next sibling at the current level only. They never lead into cousins. */
export function Neighbors() {
  const { nav, tree } = useServices();
  const { current } = useNav();
  const sibs = tree.siblings(current);
  const prev = sibs[current.index - 1];
  const next = sibs[current.index + 1];
  const one = (side: "left" | "right", n: typeof prev) =>
    n && (
      <button
        key={n.id}
        type="button"
        class={`ui nb ${side} nbin`}
        data-testid={`nb-${side}`}
        onClick={() => nav.step(side === "left" ? -1 : 1)}
        aria-label={`${side === "left" ? "Previous" : "Next"} ${n.rank}: ${n.latin}`}
      >
        <span class="chev" aria-hidden="true">
          {side === "left" ? "‹" : "›"}
        </span>
        <span class={"name" + (isBinomial(n) ? " sp" : "")}>{n.latin}</span>
        <span class="com">{n.common}</span>
      </button>
    );
  // Where you are among the siblings: dots when they fit, otherwise a count.
  const total = sibs.length;
  const pos = (
    <div class="sibpos ui" data-testid="sibpos" aria-hidden="true">
      {total <= 9 ? (
        sibs.map((s, i) => <i key={s.id} class={i === current.index ? "on" : ""} />)
      ) : (
        <span>
          {current.index + 1} / {total}
        </span>
      )}
    </div>
  );
  return (
    <>
      {one("left", prev)}
      {one("right", next)}
      {total > 1 && pos}
    </>
  );
}
