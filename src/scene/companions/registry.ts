import type { CompanionId } from "../../core/companions";
import type { CreatureFactory } from "./types";

/**
 * Each creature is its own module, fetched the first time a species that uses it is shown. A creature that needs a
 * model should load it inside its factory the same way (see `ModelLibrary`), so nothing is downloaded ahead of use.
 */
export const REGISTRY: Record<CompanionId, () => Promise<CreatureFactory>> = {
  baitfish: () => import("./baitfish").then((m) => m.create),
  plankton: () => import("./plankton").then((m) => m.create),
  remora: () => import("./remora").then((m) => m.create),
};
