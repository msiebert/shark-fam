import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const BASE = import.meta.env.BASE_URL;

/**
 * A six-foot scuba diver from `public/models/diver.glb` (built by `pipeline/make_diver.py`), in metres with the head at
 * 1.83 m, laid flat to swim to the right. One diver lives for the whole session: it moves between poses, it is never
 * rebuilt. The model is a small joint hierarchy (shoulders, elbows, hips, knees) that is posed here, with no skeleton.
 */
export class Diver {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly joint: Partial<Record<"ArmL" | "ArmR" | "ForearmL" | "ForearmR" | "LegL" | "LegR" | "ShinL" | "ShinR", THREE.Object3D>> = {};
  private model: THREE.Object3D | null = null;
  private disposed = false;
  /** 0 hidden, 1 fully shown. */
  presence = 0;
  pose: { x: number; y: number; z: number; s: number } | null = null;

  constructor() {
    this.group.add(this.body);
    this.body.rotation.set(0.95, 0, -Math.PI / 2);
    this.group.visible = false;
  }

  /** Fetch the model. The diver stays hidden until it arrives; a failed load just leaves the shark on its own. */
  load(): Promise<void> {
    return new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(`${BASE}models/diver.glb`)
      .then((g) => this.attach(g.scene))
      .catch((e) => console.warn("diver model failed to load", e));
  }

  private attach(root: THREE.Object3D): void {
    if (this.disposed) return;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      const mat = m.material as THREE.MeshStandardMaterial;
      // A little self-light keeps the suit readable against dark water; the mask lens glows a touch more.
      if (mat.name === "Glass") {
        mat.emissive.setHex(0x2f6e69);
        mat.emissiveIntensity = 0.7;
      } else mat.emissive.setHex(0x1b2b30);
    });
    for (const k of Object.keys(this.joint) as (keyof typeof this.joint)[]) this.joint[k] = undefined;
    for (const k of ["ArmL", "ArmR", "ForearmL", "ForearmR", "LegL", "LegR", "ShinL", "ShinR"] as const) {
      this.joint[k] = root.getObjectByName(k) ?? undefined;
    }
    this.model = root;
    this.body.add(root);
  }

  /** Ease toward a pose; the first call snaps. */
  update(dt: number, t: number, target: { x: number; y: number; z: number; s: number } | null, bob: boolean): void {
    const want = target ? 1 : 0;
    this.presence += (want - this.presence) * Math.min(1, dt * 3);
    if (target) {
      if (!this.pose) this.pose = { ...target };
      const e = 1 - Math.exp(-dt * 4);
      const p = this.pose;
      p.x += (target.x - p.x) * e;
      p.y += (target.y - p.y) * e;
      p.z += (target.z - p.z) * e;
      p.s += (target.s - p.s) * e;
    }
    this.group.visible = this.presence > 0.03 && !!this.pose && !!this.model;
    if (!this.group.visible || !this.pose) return;
    const p = this.pose;
    this.group.scale.setScalar(p.s * this.presence);
    this.group.position.set(p.x + (bob ? Math.sin(t * 0.35) * 0.03 : 0), p.y + (bob ? Math.sin(t * 0.6) * 0.025 : 0), p.z);
    this.body.rotation.z = -Math.PI / 2 + Math.sin(t * 0.7) * 0.05;

    // A slow, relaxed flutter kick: the thighs swing, the knees bend a little and follow through. Arms hang forward
    // and slightly out, elbows soft.
    const { ArmL, ArmR, ForearmL, ForearmR, LegL, LegR, ShinL, ShinR } = this.joint;
    const kick = Math.sin(t * 2.2);
    if (LegL) LegL.rotation.set(kick * 0.3, 0, 0.03);
    if (LegR) LegR.rotation.set(-kick * 0.3, 0, -0.03);
    if (ShinL) ShinL.rotation.x = 0.3 + 0.22 * Math.sin(t * 2.2 - 1.1);
    if (ShinR) ShinR.rotation.x = 0.3 + 0.22 * Math.sin(t * 2.2 + Math.PI - 1.1);
    if (ArmL) ArmL.rotation.set(-0.3 + Math.sin(t * 0.9) * 0.1, 0, -0.16);
    if (ArmR) ArmR.rotation.set(-0.3 - Math.sin(t * 0.9) * 0.1, 0, 0.16);
    if (ForearmL) ForearmL.rotation.x = -0.55 + Math.sin(t * 0.9 + 1) * 0.08;
    if (ForearmR) ForearmR.rotation.x = -0.55 - Math.sin(t * 0.9 + 1) * 0.08;
  }

  dispose(): void {
    this.disposed = true;
    this.group.removeFromParent();
    this.model?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
  }
}
