import { School } from "./school";
import type { CreatureFactory } from "./types";

/** A school of small silvery fish that scatters from the shark. About 18 cm each. */
export const create: CreatureFactory = () => new School({ count: 110, lengthM: 0.18, thickness: [0.131, 0.167], color: 0xcfe3e3, emissive: 0x2c4547 });
