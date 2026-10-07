import * as THREE from "three";
import { DIVER_M } from "../core/lineup";

/**
 * A six-foot diver, built in metres with the feet at the origin and the head at 1.83 m, then laid flat to swim
 * to the right. One diver lives for the whole session: it moves between poses, it is never rebuilt.
 */
export class Diver {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  /** 0 hidden, 1 fully shown. */
  presence = 0;
  pose: { x: number; y: number; z: number; s: number } | null = null;

  constructor() {
    const { body, group } = this;
    group.add(body);
    body.rotation.set(0.95, 0, -Math.PI / 2);
    // Muted grey-blue suit with ochre fins and tank: readable against dark water without shouting.
    const mat = (color: number, emissive: number, roughness: number) => {
      const m = new THREE.MeshStandardMaterial({ color, emissive, roughness, metalness: 0 });
      this.mats.push(m);
      return m;
    };
    const suit = mat(0x8097a0, 0x142428, 0.6);
    const hood = mat(0x26363c, 0x0a161a, 0.6);
    const ochre = mat(0xa88f55, 0x201a0a, 0.5);
    const glass = mat(0x9fd0cc, 0x2f6e69, 0.25);
    const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
      this.geos.push(geo);
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    const cyl = (rt: number, rb: number, h: number) => new THREE.CylinderGeometry(rt, rb, h, 16);
    put(cyl(0.17, 0.14, 0.56), suit, 0, 1.3, 0).scale.z = 0.68;
    put(new THREE.SphereGeometry(0.115, 18, 14), hood, 0, DIVER_M - 0.13, 0);
    put(new THREE.BoxGeometry(0.15, 0.07, 0.05), glass, 0, DIVER_M - 0.12, 0.1);
    put(cyl(0.085, 0.085, 0.64), ochre, 0, 1.3, -0.2);
    put(cyl(0.03, 0.03, 0.08), hood, 0, DIVER_M - 0.17, -0.2);
    const limb = (x: number, y: number, rx: number, rz: number, len: number, r0: number, r1: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      pivot.rotation.set(rx, 0, rz);
      body.add(pivot);
      put(cyl(r0, r1, len), suit, 0, -len / 2, 0, pivot);
      return pivot;
    };
    this.arms.push(limb(-0.21, 1.5, -0.35, 0.22, 0.56, 0.055, 0.045), limb(0.21, 1.5, -0.35, -0.22, 0.56, 0.055, 0.045));
    this.legs.push(limb(-0.09, 1.04, 0, 0.04, 0.62, 0.078, 0.055), limb(0.09, 1.04, 0, -0.04, 0.62, 0.078, 0.055));
    for (const leg of this.legs) put(new THREE.BoxGeometry(0.2, 0.46, 0.025), ochre, 0, -0.84, -0.04, leg).rotation.x = 0.3;
    group.visible = false;
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
    this.group.visible = this.presence > 0.03 && !!this.pose;
    if (!this.group.visible || !this.pose) return;
    const p = this.pose;
    this.group.scale.setScalar(p.s * this.presence);
    this.group.position.set(p.x + (bob ? Math.sin(t * 0.35) * 0.03 : 0), p.y + (bob ? Math.sin(t * 0.6) * 0.025 : 0), p.z);
    this.body.rotation.z = -Math.PI / 2 + Math.sin(t * 0.7) * 0.05;
    this.legs[0]!.rotation.x = Math.sin(t * 2.2) * 0.3;
    this.legs[1]!.rotation.x = -Math.sin(t * 2.2) * 0.3;
    this.arms[0]!.rotation.x = -0.35 + Math.sin(t * 0.9) * 0.1;
    this.arms[1]!.rotation.x = -0.35 - Math.sin(t * 0.9) * 0.1;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
  }
}
