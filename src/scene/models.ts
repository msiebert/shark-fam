import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/** A shark model normalized to one unit long, nose toward +x, centred on the origin. */
export interface SharkTemplate {
  name: string;
  root: THREE.Group;
}

const BASE = import.meta.env.BASE_URL;

function toFloat(geo: THREE.BufferGeometry, name: string): void {
  const a = geo.getAttribute(name);
  if (!a || a.array instanceof Float32Array) return;
  const f = new THREE.BufferAttribute(new Float32Array(a.count * a.itemSize), a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f.setComponent(i, k, a.getComponent(i, k));
  geo.setAttribute(name, f);
}

/**
 * Loads GLBs once and hands out templates. Normalizing here (instead of per species in data) means a new model
 * only needs its real length, which lives in the species record.
 */
export class ModelLibrary {
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly cache = new Map<string, Promise<SharkTemplate>>();

  load(name: string): Promise<SharkTemplate> {
    let p = this.cache.get(name);
    if (!p) {
      p = this.loader.loadAsync(`${BASE}models/${name}.glb`).then((g) => normalize(name, g.scene));
      p.catch(() => this.cache.delete(name));
      this.cache.set(name, p);
    }
    return p;
  }

  /** Warm the cache without blocking anything. */
  prefetch(names: Iterable<string>): void {
    const run = () => {
      for (const n of names) this.load(n).catch(() => {});
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 300);
  }

  /** A fresh copy that shares geometry and textures but owns its materials, so each shark fades on its own. */
  instantiate(t: SharkTemplate): THREE.Group {
    const copy = t.root.clone(true);
    copy.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = (m.material as THREE.Material).clone();
    });
    return copy;
  }
}

function normalize(name: string, scene: THREE.Group): SharkTemplate {
  scene.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  if (!meshes.length) throw new Error(`model "${name}" has no meshes`);

  // Bake node transforms into the geometry so the bend shader sees plain model-space coordinates.
  const root = new THREE.Group();
  root.name = name;
  for (const m of meshes) {
    const g = m.geometry;
    toFloat(g, "position");
    toFloat(g, "normal");
    g.applyMatrix4(m.matrixWorld);
    m.removeFromParent();
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    m.updateMatrix();
    m.frustumCulled = false; // the shader moves vertices outside their bounds
    root.add(m);
  }

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (size.x < size.y || size.x < size.z) throw new Error(`model "${name}": expected its length along x, got ${size.toArray().map((n) => n.toFixed(2))}`);
  const centre = box.getCenter(new THREE.Vector3());

  // The eyes sit toward the nose; use them to find which way the shark faces.
  const eyes = meshes.find((m) => /eye/i.test(m.name) || /eye/i.test((m.material as THREE.Material).name));
  let flip = false;
  if (eyes) {
    const ec = new THREE.Box3().setFromObject(eyes).getCenter(new THREE.Vector3());
    flip = ec.x < centre.x;
  }
  const m4 = new THREE.Matrix4()
    .makeScale(1 / size.x, 1 / size.x, 1 / size.x)
    .multiply(new THREE.Matrix4().makeRotationY(flip ? Math.PI : 0))
    .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
  for (const m of meshes) {
    m.geometry.applyMatrix4(m4);
    m.geometry.computeBoundingBox();
    m.geometry.computeBoundingSphere();
  }
  return { name, root };
}
