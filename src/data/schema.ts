import { z } from "zod";
import { COMPANION_IDS, type CompanionId } from "../core/companions";

/** Ranks that appear in the explorer, from the top of the tree down. */
export const RANKS = ["order", "family", "genus", "species"] as const;
export type Rank = (typeof RANKS)[number];
export const CLADE_RANKS = RANKS.slice(0, -1) as readonly Exclude<Rank, "species">[];

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lowercase letters, digits and single dashes");
const text = z.string().trim().min(1);
/** Creatures shown with a shark. See `src/core/companions.ts`. */
const companions = z.array(z.enum(COMPANION_IDS)).max(3);

/** A clade is any node above species. One file per clade in `content/clades/`. */
export const CladeSource = z.object({
  id,
  rank: z.enum(CLADE_RANKS as [Exclude<Rank, "species">, ...Exclude<Rank, "species">[]]),
  /** `null` only for an order, the top of the tree. */
  parent: id.nullable(),
  latin: text,
  common: text,
  /** What the Latin or Greek name means, shown in small text under the name. Required, and checked against a source. */
  meaning: text,
  description: text,
  /** Companions that go with every species below, before what each one eats adds its own. */
  companions: companions.optional(),
  /** Sort key among siblings (left to right). Ties fall back to the Latin name. */
  order: z.number().optional(),
});
export type CladeSource = z.infer<typeof CladeSource>;

const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const Distribution = z.object({
  /** "coast" shades the coastlines inside the polygons, "open" shades the water itself. */
  mode: z.enum(["coast", "open"]),
  polygons: z.array(z.array(lonLat).min(3)).min(1),
});
export type Distribution = z.infer<typeof Distribution>;

export const SwimParams = z.object({
  /** Cruising speed in body lengths per second. */
  cruise: z.number().positive().optional(),
  /** Tail beats per second. */
  beatHz: z.number().positive().optional(),
  /** Peak sideways swing of the tail, as a fraction of body length. */
  amplitude: z.number().positive().optional(),
});
export type SwimParams = z.infer<typeof SwimParams>;

/** One file per species in `content/species/`. */
export const SpeciesSource = z.object({
  id,
  /** Id of the genus this species belongs to. */
  genus: id,
  latin: text.refine((s) => s.trim().split(/\s+/).length === 2, "species names are two words"),
  common: text,
  /** What the Latin or Greek name means, shown in small text under the name. Required, and checked against a source. */
  meaning: text,
  description: text,
  /** Typical adult length in metres. Drives the size of the shark and the lineup bars. */
  lengthM: z.number().positive(),
  depth: text,
  eats: text,
  /** Wikipedia article slug, e.g. "Great_white_shark". */
  wikipedia: z.string().regex(/^[^\s/]+$/),
  distribution: Distribution,
  /** Base name of a GLB in `public/models/` (made from `models/` by `npm run models`). Omit if there is no model yet. */
  model: z.string().regex(/^[a-z0-9_-]+$/).optional(),
  swim: SwimParams.optional(),
  /** Overrides the companions worked out from its clade and diet. Use `[]` for none. */
  companions: companions.optional(),
  /** Hand-picked to represent its clade in lineups. See docs/ARCHITECTURE.md. */
  representative: z.boolean().optional(),
  order: z.number().optional(),
});
export type SpeciesSource = z.infer<typeof SpeciesSource>;

/* ---------- Compiled output: what the browser loads ---------- */

/** One node in the compact index that ships eagerly. */
export interface IndexNode {
  id: string;
  rank: Rank;
  parent: string | null;
  latin: string;
  common: string;
  /** What the Latin or Greek name means. */
  meaning?: string;
  /** Clades carry their description here. Species load theirs lazily. */
  description?: string;
  children: string[];
  /** Number of species at or below this node. */
  speciesCount: number;
  /** Species only. */
  lengthM?: number;
  /** Typical depth from the species' depth text, in metres. Colours the water. */
  maxDepthM?: number;
  model?: string;
  swim?: SwimParams;
  /** Resolved from the clade, the diet and any override. */
  companions?: CompanionId[];
  representative?: boolean;
}

export interface TaxonomyIndex {
  version: number;
  /** The orders, left to right. There is no single root: the tree starts at the order level. */
  roots: string[];
  /** Preorder, siblings already sorted. */
  nodes: IndexNode[];
}

/** Species data fetched on demand from `data/species/<id>.json`. */
export interface SpeciesDetail {
  id: string;
  description: string;
  depth: string;
  eats: string;
  wikipedia: string;
  distribution: Distribution;
}
