import * as THREE from "three";

const COUNT = 260;

/** Marine snow: soft specks that drift down and wrap around. */
export class MarineSnow {
  readonly points: THREE.Points;
  private readonly tex: THREE.CanvasTexture;

  constructor() {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    this.tex = new THREE.CanvasTexture(c);
    const p = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      p[i * 3] = (Math.random() - 0.5) * 7;
      p[i * 3 + 1] = (Math.random() - 0.5) * 4.5;
      p[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: this.tex, color: 0x9ad9d4, size: 0.03, transparent: true, opacity: 0.55, depthWrite: false }),
    );
  }

  update(dt: number, t: number): void {
    const a = this.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const p = a.array as Float32Array;
    for (let i = 0; i < p.length; i += 3) {
      p[i + 1] = p[i + 1]! - dt * 0.05;
      p[i] = p[i]! + Math.sin(t * 0.3 + i) * dt * 0.01;
      if (p[i + 1]! < -2.3) p[i + 1] = 2.3;
    }
    a.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}
