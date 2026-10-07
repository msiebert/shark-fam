import { useEffect, useState } from "preact/hooks";
import type { TreeNode } from "../core/tree";
import type { SpeciesDetail } from "../data/schema";
import { useServices } from "../app/context";

/** Species detail for a node, or undefined while it loads (or for clades). */
export function useDetail(node: TreeNode): SpeciesDetail | undefined {
  const { details } = useServices();
  const [d, setD] = useState<SpeciesDetail | undefined>(() => (node.rank === "species" ? details.peek(node.id) : undefined));
  useEffect(() => {
    if (node.rank !== "species") return setD(undefined);
    const hit = details.peek(node.id);
    setD(hit);
    if (hit) return;
    let live = true;
    details.get(node.id).then((x) => live && setD(x), (e) => console.error(e));
    return () => {
      live = false;
    };
  }, [node, details]);
  return d;
}
