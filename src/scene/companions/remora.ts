import * as THREE from "three";
import { clamp } from "../frame";
import type { CompanionContext, Creature, CreatureFactory } from "./types";

const REMORA_M = 0.7;
const BASE_LENGTH = 1;

/**
 * Where each remora rides, in the shark's own units (its length is 1, nose toward +x): along the body, below the
 * midline, and to the side. They sit just under the belly and sway a little, as if holding on.
 */
const SPOTS = [
  { x: 0.12, y: -0.088, z: 0.02 },
  { x: -0.02, y: -0.094, z: -0.02 },
  { x: -0.16, y: -0.082, z: 0.025 },
];

/** Suckerfish that ride the underside of a large shark. */
class Remora implements Creature {
  readonly object: THREE.InstancedMesh;
  readonly materials: THREE.Material[];
  readonly tied = true;
  private readonly geo = new THREE.SphereGeometry(1, 8, 6);
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly local = new THREE.Object3D();
  private readonly world = new THREE.Matrix4();

  constructor() {
    this.geo.scale(BASE_LENGTH / 2, 0.075 * BASE_LENGTH, 0.085 * BASE_LENGTH);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x7d8887, emissive: 0x182020, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0 });
    this.materials = [this.mat];
    this.object = new THREE.InstancedMesh(this.geo, this.mat, SPOTS.length);
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.frustumCulled = false;
    this.object.matrixAutoUpdate = false; // placed in world space from the shark's matrix
  }

  update(c: CompanionContext): void {
    const shark = c.shark;
    if (!shark) return;
    shark.object.updateMatrixWorld(true);
    // The shark's group is scaled to its world length, so its local units are body lengths.
    const size = clamp(REMORA_M / shark.lengthM, 0.01, 0.2);
    SPOTS.forEach((s, i) => {
      const sway = Math.sin(c.t * 1.3 + i * 2.1);
      this.local.position.set(s.x + sway * 0.006, s.y + Math.sin(c.t * 0.9 + i) * 0.003, s.z);
      this.local.rotation.set(0, 0, sway * 0.05 + 0.04);
      this.local.scale.setScalar(size);
      this.local.updateMatrix();
      this.world.multiplyMatrices(shark.object.matrixWorld, this.local.matrix);
      this.object.setMatrixAt(i, this.world);
    });
    this.object.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

export const create: CreatureFactory = () => new Remora();
