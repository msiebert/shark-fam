import * as THREE from "three";
import type { CompanionContext, Creature, CreatureFactory } from "./types";

/** Disc width of a stingray, in metres. */
const SPAN_M = 1.5;
const DISC = 0.4; // half the disc width, in model units where the disc is 0.7 long
const SPEED = 0.1; // world units per second at scale 1

/** A flat diamond with a thin tail, nose toward +x, one unit across including the tail. */
function rayGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const NU = 28;
  const NV = 14;
  const grid = (point: (u: number, v: number) => [number, number, number]) => {
    const base = pos.length / 3;
    for (let i = 0; i <= NU; i++)
      for (let j = 0; j <= NV; j++) pos.push(...point(i / NU, j / NV));
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NV; j++) {
        const a = base + i * (NV + 1) + j;
        const b = a + NV + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
  };
  // The disc: a rounded diamond, thickest at the middle, pointing along +x.
  grid((u, v) => {
    const t = u * 2 - 1;
    const s = v * 2 - 1;
    const w = DISC * Math.pow(1 - Math.pow(Math.abs(t), 1.4), 1 / 1.4);
    const bulge = 0.07 * (1 - t * t) * Math.sqrt(Math.max(0, 1 - s * s));
    return [t * 0.35, bulge, s * w];
  });
  // The tail: a thin cone trailing behind.
  const SIDES = 6;
  const base = pos.length / 3;
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    const r = 0.018 * (1 - f * 0.8);
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      pos.push(-0.3 - f * 0.65, 0.01 + Math.sin(a) * r, Math.cos(a) * r);
    }
  }
  for (let i = 0; i < 8; i++)
    for (let k = 0; k < SIDES; k++) {
      const a = base + i * SIDES + k;
      const b = base + i * SIDES + ((k + 1) % SIDES);
      idx.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A stingray cruising along the bottom of the band, flapping its wings. It keeps clear of the shark that hunts it. */
class Ray implements Creature {
  readonly object: THREE.Mesh;
  readonly materials: THREE.Material[];
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly flap = { value: 0 };
  private x = -99;
  private z = -0.6;
  private dir = 1;
  private scale = 0.3;

  constructor() {
    this.mat = new THREE.MeshStandardMaterial({ color: 0x7c746a, emissive: 0x15120f, roughness: 0.85, metalness: 0, transparent: true, opacity: 0, side: THREE.DoubleSide });
    this.mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFlap = this.flap;
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "uniform float uFlap;\nvoid main() {")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed.y += sin(uFlap - abs(position.z) * 6.0) * abs(position.z) * 0.32;");
    };
    this.mat.customProgramCacheKey = () => "ray-v1";
    this.materials = [this.mat];
    this.object = new THREE.Mesh(rayGeometry(), this.mat);
    this.object.frustumCulled = false;
  }

  update(c: CompanionContext): void {
    const { dt, t } = c;
    const target = (SPAN_M * c.unitsPerM) / (DISC * 2);
    this.scale += (target - this.scale) * Math.min(1, dt * 3);
    const edge = c.halfW * 1.15;
    if (this.x < -90) {
      // Already somewhere in view when the page opens, heading either way.
      this.dir = Math.random() < 0.5 ? 1 : -1;
      this.x = (Math.random() - 0.5) * c.halfW;
    }
    this.x += this.dir * SPEED * Math.max(0.6, this.scale * 3) * dt;
    if (Math.abs(this.x) > edge * 1.1) this.x = -Math.sign(this.x) * edge;
    // It cruises low in the band and eases away from the shark when it comes close.
    let y = c.floorY + (c.ceilY - c.floorY) * 0.1 + Math.sin(t * 0.4) * 0.02;
    const s = c.shark;
    if (s) {
      const dx = this.x - s.pos.x;
      const near = s.length * 0.6;
      if (Math.abs(dx) < near) y -= (1 - Math.abs(dx) / near) * 0.05;
    }
    this.flap.value = t * 5;
    this.object.position.set(this.x, Math.max(y, c.floorY), this.z);
    this.object.rotation.set(0, this.dir > 0 ? 0 : Math.PI, Math.sin(t * 0.7) * 0.04);
    this.object.scale.setScalar(this.scale);
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.mat.dispose();
  }
}

export const create: CreatureFactory = () => new Ray();
