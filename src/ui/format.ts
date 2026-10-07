import type { TreeNode } from "../core/tree";

/** Genus and species names are written in italics. */
export const isBinomial = (n: Pick<TreeNode, "rank">) => n.rank === "genus" || n.rank === "species";

export const rankLabel = (n: Pick<TreeNode, "rank">) => n.rank[0]!.toUpperCase() + n.rank.slice(1);

export const wikiUrl = (slug: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`;

export function sizeText(m: number): string {
  const ft = m / 0.3048;
  return `${m >= 10 ? m.toFixed(0) : m.toFixed(1)} m (${ft.toFixed(0)} ft)`;
}
