import * as THREE from "three";
import { clamp } from "../frame";
import { softDot } from "./sprite";
import type { CompanionContext, Creature, CreatureFactory } from "./types";

const COUNT = 420;
/** Where a mouthful is drawn in from, as a fraction of the shark's length ahead of the nose. */
const REACH = 0.5;

/**
 * A glowing cloud that hangs in the water and drifts. Near a shark it is drawn toward the mouth and eaten, then a new
 * speck appears elsewhere, so a filter feeder is seen feeding.
 */
class Plankton implements Creature {
  readonly object: THREE.Points;
  readonly materials: THREE.Material[];
  private readonly p = new Float32Array(COUNT * 3);
  private readonly seed = new Float32Array(COUNT);
  private readonly tex = softDot();
  private readonly mouth = new THREE.Vector3();

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.p, 3));
    const mat = new THREE.PointsMaterial({ map: this.tex, color: 0xd7f2a6, size: 0.04, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.materials = [mat];
    this.object = new THREE.Points(geo, mat);
    this.object.frustumCulled = false;
    for (let i = 0; i < COUNT; i++) this.seed[i] = Math.random() * 100;
    this.scatter(null);
  }

  /** Put every speck somewhere in the band, or (before the first frame) anywhere near the middle of the view. */
  private scatter(c: CompanionContext | null): void {
    for (let i = 0; i < COUNT; i++) this.respawn(i, c, true);
  }

  private respawn(i: number, c: CompanionContext | null, anywhere: boolean): void {
    const b = i * 3;
    const halfW = c?.halfW ?? 2.4;
    const lo = c?.floorY ?? -0.6;
    const hi = c?.ceilY ?? 1.4;
    // Fresh specks arrive from the left, where the shark is heading from, so the cloud keeps filling in.
    this.p[b] = anywhere ? (Math.random() * 2 - 1) * halfW : -halfW * (1 + Math.random() * 0.1);
    this.p[b + 1] = lo + Math.random() * (hi - lo);
    this.p[b + 2] = -0.25 + (Math.random() - 0.5) * 1.1;
  }

  update(c: CompanionContext): void {
    const { dt, t, shark } = c;
    const p = this.p;
    if (shark) {
      this.mouth.copy(shark.dir).multiplyScalar(shark.length * 0.5).add(shark.pos);
    }
    const suck = shark ? shark.length * REACH : 0;
    const eat = shark ? shark.length * 0.05 : 0;
    for (let i = 0; i < COUNT; i++) {
      const b = i * 3;
      const s = this.seed[i]!;
      // A slow, aimless drift with a little current toward the right.
      p[b] = p[b]! + (0.02 + Math.sin(t * 0.3 + s) * 0.012) * dt;
      p[b + 1] = p[b + 1]! + Math.sin(t * 0.25 + s * 1.7) * 0.012 * dt;
      p[b + 2] = p[b + 2]! + Math.cos(t * 0.2 + s * 2.3) * 0.01 * dt;
      if (shark && shark.alpha > 0.3) {
        const dx = this.mouth.x - p[b]!;
        const dy = this.mouth.y - p[b + 1]!;
        const dz = this.mouth.z - p[b + 2]!;
        const d = Math.hypot(dx, dy, dz) + 1e-4;
        if (d < eat) {
          this.respawn(i, c, false);
          continue;
        }
        if (d < suck) {
          const pull = (1 - d / suck) * 0.9 * dt;
          p[b] = p[b]! + dx * pull;
          p[b + 1] = p[b + 1]! + dy * pull;
          p[b + 2] = p[b + 2]! + dz * pull;
        }
      }
      if (p[b]! > c.halfW * 1.05) this.respawn(i, c, false);
      p[b + 1] = clamp(p[b + 1]!, c.floorY, c.ceilY);
    }
    (this.object.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.materials[0]!.dispose();
    this.tex.dispose();
  }
}

export const create: CreatureFactory = () => new Plankton();
