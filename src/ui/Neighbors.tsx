import { useNav, useServices } from "../app/context";
import { isBinomial } from "./format";

/** The previous and next sibling at the current level only. They never lead into cousins. */
export function Neighbors() {
  const { nav, tree } = useServices();
  const { current } = useNav();
  const sibs = tree.siblings(current);
  const prev = current.parentNode ? sibs[current.index - 1] : undefined;
  const next = current.parentNode ? sibs[current.index + 1] : undefined;
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
  return (
    <>
      {one("left", prev)}
      {one("right", next)}
    </>
  );
}
