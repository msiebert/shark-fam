import * as THREE from "three";
import { clamp } from "../frame";
import type { CompanionContext, Creature } from "./types";

export interface SchoolOptions {
  count: number;
  /** How long one fish is, in metres. */
  lengthM: number;
  /** Half height and half width of the body, as a fraction of its length. */
  thickness: [number, number];
  color: number;
  emissive: number;
}

/** World length of one fish at scale 1. */
const BASE_LENGTH = 0.084;

/** Small spheroids oriented by velocity. They hold near a centre and scatter from sharks. */
export class School implements Creature {
  readonly object: THREE.InstancedMesh;
  readonly materials: THREE.Material[];
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly home: THREE.Vector3[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly geo = new THREE.SphereGeometry(1, 8, 6);
  private readonly mat: THREE.MeshStandardMaterial;
  private scale = 0.6;

  constructor(private readonly o: SchoolOptions) {
    this.pos = new Float32Array(o.count * 3);
    this.vel = new Float32Array(o.count * 3);
    this.geo.scale(BASE_LENGTH / 2, o.thickness[0] * BASE_LENGTH, o.thickness[1] * BASE_LENGTH);
    this.mat = new THREE.MeshStandardMaterial({ color: o.color, emissive: o.emissive, roughness: 0.35, metalness: 0.5, transparent: true, opacity: 0 });
    this.materials = [this.mat];
    this.object = new THREE.InstancedMesh(this.geo, this.mat, o.count);
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.frustumCulled = false;
    this.dummy.rotation.order = "YZX";
    for (let i = 0; i < o.count; i++) {
      const h = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).multiplyScalar(0.9);
      this.home.push(h);
      this.pos.set([h.x - 1.1, h.y, h.z - 0.4], i * 3);
    }
  }

  update(c: CompanionContext): void {
    const { dt } = c;
    const target = clamp((this.o.lengthM * c.unitsPerM) / BASE_LENGTH, 0.3, 1.2);
    this.scale += (target - this.scale) * Math.min(1, dt * 3);
    const flee = 0.83;
    const { pos, vel } = this;
    const count = this.o.count;
    for (let i = 0; i < count; i++) {
      const b = i * 3;
      const h = this.home[i]!;
      let ax = (c.centre.x + h.x - pos[b]!) * 0.9;
      let ay = (c.centre.y + h.y - pos[b + 1]!) * 0.9;
      let az = (c.centre.z + h.z - pos[b + 2]!) * 0.9;
      for (const th of c.threats) {
        const dx = pos[b]! - th.pos.x;
        const dy = pos[b + 1]! - th.pos.y;
        const dz = pos[b + 2]! - th.pos.z;
        const d = Math.hypot(dx, dy, dz) + 0.001;
        const r = th.radius * flee;
        if (d < r) {
          const f = ((r - d) * 11) / d;
          ax += dx * f;
          ay += dy * f;
          az += dz * f;
        }
      }
      vel[b] = (vel[b]! + ax * dt) * 0.965;
      vel[b + 1] = (vel[b + 1]! + ay * dt) * 0.965;
      vel[b + 2] = (vel[b + 2]! + az * dt) * 0.965;
      pos[b] = pos[b]! + vel[b]! * dt * 3;
      pos[b + 1] = pos[b + 1]! + vel[b + 1]! * dt * 3;
      pos[b + 2] = pos[b + 2]! + vel[b + 2]! * dt * 3;
      // Soft walls: bounce off the band the school is allowed to use.
      if (pos[b + 1]! < c.floorY) {
        pos[b + 1] = c.floorY;
        vel[b + 1] = Math.abs(vel[b + 1]!) * 0.5;
      } else if (pos[b + 1]! > c.ceilY) {
        pos[b + 1] = c.ceilY;
        vel[b + 1] = -Math.abs(vel[b + 1]!) * 0.5;
      }
      const wall = c.halfW * 1.1;
      if (Math.abs(pos[b]!) > wall) {
        pos[b] = Math.sign(pos[b]!) * wall;
        vel[b] = -vel[b]! * 0.5;
      }
    }
    for (let i = 0; i < count; i++) {
      const b = i * 3;
      const vx = vel[b]!;
      const vy = vel[b + 1]!;
      const vz = vel[b + 2]!;
      this.dummy.position.set(pos[b]!, pos[b + 1]!, pos[b + 2]!);
      this.dummy.scale.setScalar(this.scale);
      this.dummy.rotation.set(0, Math.atan2(-vz, vx), Math.atan2(vy, Math.hypot(vx, vz)));
      this.dummy.updateMatrix();
      this.object.setMatrixAt(i, this.dummy.matrix);
    }
    this.object.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
