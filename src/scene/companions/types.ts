import type * as THREE from "three";

/** The shark a species page is about, as the creatures need to see it. Reused every frame. */
export interface SharkInfo {
  /** Its group in the scene, for creatures that travel on it. */
  object: THREE.Object3D;
  lengthM: number;
  /** World length on screen. */
  length: number;
  alpha: number;
  /** World position of the middle of the body. */
  pos: THREE.Vector3;
  /** Unit vector along the body toward the nose. */
  dir: THREE.Vector3;
}

export interface CompanionContext {
  dt: number;
  t: number;
  /** Where the water life wants to be: the middle of the band above the text. */
  centre: THREE.Vector3;
  /** Keep everything between these world heights, so it never drifts behind the text. */
  floorY: number;
  ceilY: number;
  halfW: number;
  /** World units per metre of the shark on screen, so a baitfish looks small next to a whale shark. */
  unitsPerM: number;
  /** Sharks the small fish flee from, with their body radius. */
  threats: { pos: THREE.Vector3; radius: number }[];
  shark: SharkInfo | null;
}

/** One kind of creature. The manager fades it; it only moves and draws itself. */
export interface Creature {
  object: THREE.Object3D;
  /** Every material the manager should fade. They must be `transparent`. */
  materials: THREE.Material[];
  /** Travels on the shark, so it also fades with it. */
  tied?: boolean;
  update(c: CompanionContext): void;
  dispose(): void;
}

export type CreatureFactory = () => Creature;
