import type { CompanionId } from "../core/companions";

export interface SharkSpec {
  id: string;
  /** Base name of the GLB in `public/models/`. */
  model: string;
  lengthM: number;
  cruise: number;
  beatHz: number;
  amplitude: number;
  /** What shares the water with it on its own page. */
  companions: CompanionId[];
}

/** What the scene should show for the current node. */
export type SceneView =
  | { kind: "none" }
  | { kind: "lineup"; sharks: SharkSpec[] }
  | { kind: "species"; sharks: [SharkSpec] };

/** Where a shark is. `s` is its world length (the normalized model is one unit long, nose toward +x). */
export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  s: number;
}

export interface LabelHandle {
  el: HTMLElement;
}
