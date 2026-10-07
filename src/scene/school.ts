import * as THREE from "three";
import { clamp } from "./frame";

const COUNT = 110;
const BASE_LENGTH = 0.084; // world length of one fish at scale 1
const FISH_METRES = 0.18; // a baitfish is about this long

export interface SchoolContext {
  dt: number;
  t: number;
  /** Where the school wants to be. */
  centre: THREE.Vector3;
  /** Sharks the fish flee from, with their body radius. */
  threats: { pos: THREE.Vector3; radius: number }[];
  /** World units per metre of the shark on screen, so fish look small next to a whale shark. */
  unitsPerM: number;
  /** Keep every fish above this world y, so the school never drifts behind the text. */
  floorY: number;
  ceilY: number;
  halfW: number;
}

/** Small spheroids oriented by velocity. They hold near a centre and scatter from sharks. */
export class School {
  readonly mesh: THREE.InstancedMesh;
  private readonly pos = new Float32Array(COUNT * 3);
  private readonly vel = new Float32Array(COUNT * 3);
  private readonly home: THREE.Vector3[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly geo = new THREE.SphereGeometry(1, 8, 6);
  private readonly mat: THREE.MeshStandardMaterial;
  private opacity = 0;
  private scale = 0.6;
  /** Seconds to keep the school hidden after a change of view. */
  hold = 0;
  wanted = false;

  constructor() {
    this.geo.scale(BASE_LENGTH / 2, 0.011, 0.014);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xcfe3e3, emissive: 0x2c4547, roughness: 0.35, metalness: 0.5, transparent: true, opacity: 0 });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, COUNT);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.dummy.rotation.order = "YZX";
    for (let i = 0; i < COUNT; i++) {
      const o = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).multiplyScalar(0.9);
      this.home.push(o);
      this.pos.set([o.x - 1.1, o.y, o.z - 0.4], i * 3);
    }
  }

  update(c: SchoolContext): void {
    const { dt } = c;
    this.hold -= dt;
    const on = this.wanted && this.hold <= 0;
    this.opacity = clamp(this.opacity + (on ? dt / 0.8 : -dt / 0.4), 0, 1);
    this.mat.opacity = this.opacity;
    this.mesh.visible = this.opacity > 0.01;
    if (!this.mesh.visible) return;

    const target = clamp((FISH_METRES * c.unitsPerM) / BASE_LENGTH, 0.3, 1.2);
    this.scale += (target - this.scale) * Math.min(1, dt * 3);
    const flee = 0.83;
    const { pos, vel } = this;
    for (let i = 0; i < COUNT; i++) {
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
    for (let i = 0; i < COUNT; i++) {
      const b = i * 3;
      const vx = vel[b]!;
      const vy = vel[b + 1]!;
      const vz = vel[b + 2]!;
      this.dummy.position.set(pos[b]!, pos[b + 1]!, pos[b + 2]!);
      this.dummy.scale.setScalar(this.scale);
      this.dummy.rotation.set(0, Math.atan2(-vz, vx), Math.atan2(vy, Math.hypot(vx, vz)));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
