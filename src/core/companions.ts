/**
 * Which creatures share the water with a shark. Pure data and logic, so the content compiler can validate and resolve
 * them without three.js. The creatures themselves live in `src/scene/companions/`.
 */

/** Every creature the scene knows how to draw. Adding one means a new entry here and one in the scene registry. */
export const COMPANION_IDS = ["baitfish", "plankton", "remora", "ray"] as const;
export type CompanionId = (typeof COMPANION_IDS)[number];

/** Most kinds on screen at once, so a species page never costs more than a few flocks. */
export const MAX_COMPANIONS = 3;

/**
 * What a species eats decides its companions unless something says otherwise. Each rule is tested against the
 * species' `eats` text. A creature that is not drawn yet (a seal, say) simply has no rule until it exists.
 */
const EATS_RULES: readonly { id: CompanionId; test: RegExp }[] = [
  { id: "plankton", test: /plankton|krill/i },
  { id: "ray", test: /rays?\b|skates?\b/i },
  { id: "baitfish", test: /\bfish\b|squid|sardine|anchov/i },
];

export function companionsFromEats(eats: string): CompanionId[] {
  return EATS_RULES.filter((r) => r.test.test(eats)).map((r) => r.id);
}

/**
 * The companions for one species.
 *   1. The species' own list, if it has one, is used as written.
 *   2. Otherwise the nearest ancestor clade with a list supplies companions that go with the whole group
 *      (remoras for the big filter feeders), followed by whatever its diet suggests.
 * Duplicates are dropped and the result is capped at `MAX_COMPANIONS`.
 */
export function resolveCompanions(own: readonly CompanionId[] | undefined, inherited: readonly CompanionId[] | undefined, eats: string): CompanionId[] {
  const list = own ?? [...(inherited ?? []), ...companionsFromEats(eats)];
  return [...new Set(list)].slice(0, MAX_COMPANIONS);
}
