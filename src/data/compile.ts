import { CladeSource, SpeciesSource, type IndexNode, type SpeciesDetail, type TaxonomyIndex } from "./schema";

export interface CompileInput {
  clades: { file: string; data: unknown }[];
  species: { file: string; data: unknown }[];
  /** Optional: names of model files that exist, for a reference check. */
  models?: Set<string>;
}

export interface CompileResult {
  index: TaxonomyIndex;
  details: SpeciesDetail[];
  warnings: string[];
}

export class ContentError extends Error {
  constructor(public problems: string[]) {
    super(`Content has ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n- ${problems.join("\n- ")}`);
  }
}

const RANK_BELOW: Record<string, string> = { order: "family", family: "genus", genus: "species" };

/** Validate the content files and compile them into the index plus per-species detail. Pure: no file access. */
export function compileContent(input: CompileInput): CompileResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const clades: CladeSource[] = [];
  const species: SpeciesSource[] = [];

  for (const { file, data } of input.clades) {
    const r = CladeSource.safeParse(data);
    if (!r.success) problems.push(...r.error.issues.map((i) => `${file}: ${i.path.join(".") || "(root)"} ${i.message}`));
    else {
      if ((file.split("/").pop() ?? file).replace(/\.json$/, "") !== r.data.id) problems.push(`${file}: file name must match id "${r.data.id}"`);
      clades.push(r.data);
    }
  }
  for (const { file, data } of input.species) {
    const r = SpeciesSource.safeParse(data);
    if (!r.success) problems.push(...r.error.issues.map((i) => `${file}: ${i.path.join(".") || "(root)"} ${i.message}`));
    else {
      if ((file.split("/").pop() ?? file).replace(/\.json$/, "") !== r.data.id) problems.push(`${file}: file name must match id "${r.data.id}"`);
      species.push(r.data);
    }
  }

  const byId = new Map<string, CladeSource | SpeciesSource>();
  for (const n of [...clades, ...species]) {
    if (byId.has(n.id)) problems.push(`duplicate id "${n.id}"`);
    byId.set(n.id, n);
  }

  const roots = clades.filter((c) => c.parent === null);
  if (!roots.length) problems.push("expected at least one order with parent: null");
  for (const r of roots) if (r.rank !== "order") problems.push(`${r.id}: only an order can have parent: null, not a ${r.rank}`);

  // Parent links and ranks.
  const kids = new Map<string, (CladeSource | SpeciesSource)[]>();
  const link = (child: CladeSource | SpeciesSource, parentId: string | null, rank: string) => {
    if (parentId === null) return;
    const p = byId.get(parentId);
    if (!p || !("rank" in p)) {
      problems.push(`${child.id}: parent "${parentId}" is not a known clade`);
      return;
    }
    if (RANK_BELOW[p.rank] !== rank) problems.push(`${child.id}: a ${rank} cannot sit under ${p.rank} "${p.id}"`);
    (kids.get(parentId) ?? kids.set(parentId, []).get(parentId)!).push(child);
  };
  for (const c of clades) link(c, c.parent, c.rank);
  for (const s of species) link(s, s.genus, "species");

  if (input.models) {
    for (const s of species) if (s.model && !input.models.has(s.model)) problems.push(`${s.id}: model "${s.model}" not found in public/models/ (run: npm run models ${s.model})`);
  }

  const rankOf = (n: CladeSource | SpeciesSource) => ("rank" in n ? n.rank : "species");
  const cmp = (a: CladeSource | SpeciesSource, b: CladeSource | SpeciesSource) =>
    (a.order ?? Infinity) - (b.order ?? Infinity) || a.latin.localeCompare(b.latin);

  const nodes: IndexNode[] = [];
  const details: SpeciesDetail[] = [];
  const seen = new Set<string>();
  const walk = (n: CladeSource | SpeciesSource): number => {
    if (seen.has(n.id)) return 0; // a cycle; reported below
    seen.add(n.id);
    const ordered = (kids.get(n.id) ?? []).slice().sort(cmp);
    const node: IndexNode = {
      id: n.id,
      rank: rankOf(n),
      parent: "rank" in n ? n.parent : n.genus,
      latin: n.latin,
      common: n.common,
      children: ordered.map((k) => k.id),
      speciesCount: 0,
    };
    nodes.push(node);
    if ("rank" in n) {
      node.description = n.description;
    } else {
      node.lengthM = n.lengthM;
      if (n.model) node.model = n.model;
      else warnings.push(`${n.id}: no model yet; it will appear in the tree but not in lineups`);
      if (n.swim) node.swim = n.swim;
      if (n.representative) node.representative = true;
      details.push({ id: n.id, description: n.description, depth: n.depth, eats: n.eats, wikipedia: n.wikipedia, distribution: n.distribution });
    }
    let count = "rank" in n ? 0 : 1;
    for (const k of ordered) count += walk(k);
    node.speciesCount = count;
    return count;
  };
  const orderedRoots = roots.slice().sort(cmp);
  for (const r of orderedRoots) walk(r);

  for (const n of [...clades, ...species]) if (!seen.has(n.id) && roots.length) problems.push(`${n.id}: not reachable from the root`);
  for (const n of nodes) {
    if (n.rank !== "species" && n.children.length === 0) warnings.push(`${n.id}: ${n.rank} has no children yet`);
  }

  if (problems.length) throw new ContentError(problems);
  return { index: { version: 1, roots: orderedRoots.map((r) => r.id), nodes }, details, warnings };
}
