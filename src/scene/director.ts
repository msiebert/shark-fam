import * as THREE from "three";
import { layoutLineup } from "../core/lineup";
import { displayLength, trackPose, trackShape } from "../core/racetrack";
import { SharkActor, type Mode } from "./actor";
import { Diver } from "./diver";
import { clamp, easeOut, framing, FOV, TAN, ZS } from "./frame";
import { ModelLibrary } from "./models";
import { School } from "./school";
import { MarineSnow } from "./snow";
import type { Pose, SceneView, SharkSpec } from "./types";

const SLIDE_TIME = 1.3;
/** Longest a shark takes to swim in from off screen at species level. */
const MAX_ENTRY_S = 3;

/** How a change of view should feel. */
export interface ViewChange {
  /** Sideways direction for hops between branches. */
  dx: -1 | 0 | 1;
  /** Levels climbed and descended. */
  up: number;
  down: number;
  /** Anything other than the first view fades the school out with the old view. */
  animate: boolean;
}

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  reducedMotion: boolean;
  models: ModelLibrary;
  labels: Map<string, HTMLElement>;
}

/**
 * Owns the renderer and everything in the water. The UI tells it what to show (`setView`); it works out where each
 * shark goes and how it gets there. Hot paths allocate nothing.
 */
export class SharkScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  private readonly actors = new Map<string, SharkActor>();
  private readonly diver = new Diver();
  private readonly school = new School();
  private readonly snow = new MarineSnow();
  private last = performance.now();
  private readonly ro: ResizeObserver;
  private readonly ray = new THREE.Raycaster();
  private readonly tmp = new THREE.Vector3();
  private readonly threats = [{ pos: new THREE.Vector3(), radius: 0 }];
  private readonly schoolCentre = new THREE.Vector3();
  private readonly localRay = new THREE.Ray();
  private readonly inv = new THREE.Matrix4();
  private readonly box = new THREE.Box3(new THREE.Vector3(-0.5, -0.12, -0.12), new THREE.Vector3(0.5, 0.12, 0.12));

  private view: SceneView = { kind: "none" };
  private viewSeq = 0;
  private raf = 0;
  private time = 0;
  private w = 1;
  private h = 1;
  private safeBottomPx = 0;
  private pointer = { x: 0, y: 0 };
  private px = 0; // smoothed camera parallax
  private pan = { from: 0, t: 1 };
  private dolly: { t: number; bump: number; settle: number } | null = null;
  private hover: string | null = null;
  private running = true;
  private disposed = false;
  onHover?: (id: string | null) => void;

  constructor(private readonly opts: SceneOptions) {
    const { canvas } = opts;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.scene.fog = new THREE.FogExp2(0x03161d, 0.1);
    this.camera.position.set(0, 0.15, 3.9);
    // Intensities are physical units (the prototype used the old scaled ones), hence the factor of pi.
    this.scene.add(new THREE.HemisphereLight(0x7fe0da, 0x021016, 0.7 * Math.PI));
    const sun = new THREE.DirectionalLight(0xd6f4f2, 1.25 * Math.PI);
    sun.position.set(-1.5, 4, 2.5);
    const rim = new THREE.DirectionalLight(0x3fb9b0, 0.55 * Math.PI);
    rim.position.set(2, 0.5, -3);
    this.scene.add(sun, rim, this.diver.group, this.school.mesh, this.snow.points);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(opts.host);
    this.resize();
    document.addEventListener("visibilitychange", this.onVisibility);
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ---------- Public API ---------- */

  /** Bottom of the area sharks and fish may use, in px from the top of the stage. Everything below is text. */
  setSafeBottom(px: number): void {
    this.safeBottomPx = px;
  }

  setPointer(clientX: number, clientY: number): void {
    const r = this.opts.host.getBoundingClientRect();
    this.pointer.x = ((clientX - r.left) / r.width - 0.5) * 2;
    this.pointer.y = ((clientY - r.top) / r.height - 0.5) * 2;
    const id = this.pick();
    if (id !== this.hover) {
      this.hover = id;
      this.onHover?.(id);
    }
  }

  /** Id of the lineup shark under the pointer, if any. */
  pick(): string | null {
    if (this.view.kind !== "lineup") return null;
    this.ray.setFromCamera(new THREE.Vector2(this.pointer.x, -this.pointer.y), this.camera);
    let best: string | null = null;
    let bestD = Infinity;
    for (const a of this.actors.values()) {
      if (!a.interactive || !this.inView(a.id)) continue;
      this.inv.copy(a.group.matrixWorld).invert();
      this.localRay.copy(this.ray.ray).applyMatrix4(this.inv);
      const hit = this.localRay.intersectBox(this.box, this.tmp);
      if (hit) {
        const d = hit.applyMatrix4(a.group.matrixWorld).distanceTo(this.ray.ray.origin);
        if (d < bestD) {
          bestD = d;
          best = a.id;
        }
      }
    }
    return best;
  }

  setView(view: SceneView, change: ViewChange): void {
    this.view = view;
    const seq = ++this.viewSeq;
    const mode: Mode = view.kind === "species" ? "swim" : "line";
    const specs = view.kind === "none" ? [] : view.sharks;
    const reduce = this.opts.reducedMotion;

    if (change.dx && !reduce) this.pan = { from: -change.dx * 0.9, t: 0 };
    if (!reduce && (change.up || change.down)) {
      const lateral = change.up > 0 && change.down > 0;
      this.dolly = { t: 0, bump: lateral ? 0.3 * change.up : 0, settle: lateral ? 0 : change.down > 0 ? 0.55 : -0.45 };
    }
    if (change.animate) this.school.hold = 0.5;
    this.school.wanted = view.kind === "species";

    // Sharks already here: carry over, glide, or leave.
    const wanted = new Set(specs.map((s) => s.id));
    for (const a of this.actors.values()) {
      if (!wanted.has(a.id)) a.leave();
    }
    specs.forEach((spec) => {
      const a = this.actors.get(spec.id);
      if (a) this.transitionExisting(a, mode, change);
      else
        void this.createActor(spec).then((actor) => {
          if (!actor || this.disposed) return;
          // Only spawn it if the view it was loaded for is still the current one.
          if (seq !== this.viewSeq && !this.inView(spec.id)) return;
          this.transitionExisting(actor, this.view.kind === "species" ? "swim" : "line", change);
        });
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.ro.disconnect();
    this.actors.forEach((a) => a.dispose());
    this.diver.dispose();
    this.school.dispose();
    this.snow.dispose();
    this.renderer.dispose();
  }

  /** For tests and tooling: where things are right now. */
  debugState() {
    return {
      time: this.time,
      view: this.view.kind,
      actors: [...this.actors.values()].map((a) => ({ id: a.id, mode: a.mode, alpha: a.alpha, leaving: a.leaving, gone: a.gone, visible: a.group.visible, pose: a.shown && { ...a.shown } })),
      diver: this.diver.pose && { ...this.diver.pose, presence: this.diver.presence },
    };
  }

  /* ---------- Internals ---------- */

  private inView(id: string): boolean {
    return this.view.kind !== "none" && this.view.sharks.some((s) => s.id === id);
  }

  private readonly onVisibility = () => {
    this.running = !document.hidden;
    if (this.running) this.last = performance.now();
  };

  private async createActor(spec: SharkSpec): Promise<SharkActor | null> {
    const existing = this.actors.get(spec.id);
    if (existing) return existing;
    try {
      const tpl = await this.opts.models.load(spec.model);
      const dup = this.actors.get(spec.id);
      if (dup) return dup;
      const actor = new SharkActor(spec, this.opts.models.instantiate(tpl));
      this.actors.set(spec.id, actor);
      this.scene.add(actor.group);
      return actor;
    } catch (e) {
      console.error(`Could not load model "${spec.model}" for ${spec.id}`, e);
      return null;
    }
  }

  private transitionExisting(a: SharkActor, mode: Mode, change: ViewChange): void {
    const visible = a.group.visible && !a.gone;
    if (!visible || a.leaving) {
      a.mode = mode;
      let fade = !visible ? change.animate && mode === "line" : true;
      if (mode === "swim") {
        // It enters from the left. A slow shark would take many seconds to arrive, so it starts closer and fades in.
        const shape = this.trackShapeFor(a.spec);
        const full = shape.lead / shape.v;
        a.trackStart = this.time + Math.min(full, MAX_ENTRY_S);
        if (full > MAX_ENTRY_S) fade = change.animate;
      } else a.trackStart = 0;
      a.appear(this.targetPose(a), fade);
      return;
    }
    if (a.mode !== mode) {
      // The same shark carries over: it glides from one pose to the other instead of fading out and back.
      a.beginGlide();
      a.mode = mode;
      if (mode === "swim") a.trackStart = this.time;
    }
    a.recall();
  }

  private trackShapeFor(spec: SharkSpec) {
    return trackShape(displayLength(spec.lengthM), spec.cruise, framing(this.w / this.h).halfW);
  }

  private compact(): boolean {
    return this.w < 700;
  }

  private lineupFor(specs: SharkSpec[]) {
    const f = framing(this.w / this.h);
    const safe = this.safeBottomPx > 0 ? clamp(this.safeBottomPx / this.h - 0.02, 0.3, 0.47) : 0.47;
    return layoutLineup({
      lengthsM: specs.map((s) => s.lengthM),
      halfW: f.halfW,
      halfH: f.halfH,
      viewH: this.h,
      top: this.compact() ? 0.1 : 0.08,
      bottom: safe,
      labelPx: this.compact() ? 24 : 36,
    });
  }

  /** Where a shark should be right now in its current mode. */
  private targetPose(a: SharkActor): Pose {
    const f = framing(this.w / this.h);
    if (a.mode === "swim") {
      const len = displayLength(a.spec.lengthM);
      const shape = this.trackShapeFor(a.spec);
      const tau = this.time - a.trackStart;
      const tp = trackPose(shape, tau);
      const ph = (2 * Math.PI * tau) / 11;
      const pitch = Math.atan(((0.07 * 2 * Math.PI) / 11) * Math.cos(ph) / shape.v);
      return { x: tp.x, y: f.swimY + 0.07 * Math.sin(ph), z: ZS + tp.z, yaw: tp.yaw, pitch, s: len };
    }
    if (this.view.kind === "lineup") {
      const i = this.view.sharks.findIndex((s) => s.id === a.id);
      const lay = this.lineupFor(this.view.sharks);
      const row = lay.rows[i];
      if (row) {
        const s = row.unitsPerM * a.spec.lengthM;
        return { x: row.tailX + s / 2, y: row.y, z: ZS, yaw: 0, pitch: 0, s };
      }
    }
    return a.pose ?? { x: 0, y: 0, z: ZS, yaw: 0, pitch: 0, s: displayLength(a.spec.lengthM) };
  }

  private resize(): void {
    const { host } = this.opts;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private readonly frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    if (!this.running || this.disposed) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.tick(dt);
    this.renderer.render(this.scene, this.camera);
  };

  /** Run the simulation ahead without drawing, in fixed steps. For tests, which cannot rely on frame rate. */
  debugAdvance(seconds: number): void {
    for (let t = 0; t < seconds; t += 0.05) this.tick(0.05);
  }

  /** Advance the world by `dt` seconds of wall time. */
  private tick(dt: number): void {
    const reduce = this.opts.reducedMotion;
    this.time += dt * (reduce ? 0.5 : 1);
    const t = this.time;
    const f = framing(this.camera.aspect);

    // Camera: parallax from the pointer, a swing on sideways moves, a dolly along the branch.
    this.pan.t = Math.min(this.pan.t + dt / SLIDE_TIME, 1);
    const pan = this.pan.from * (1 - easeOut(this.pan.t));
    const mx = reduce ? 0 : this.pointer.x;
    const my = reduce ? 0 : this.pointer.y;
    this.px += (mx * 0.3 - this.px) * 0.04;
    let zOff = 0;
    if (this.dolly) {
      this.dolly.t += dt / SLIDE_TIME;
      const p = Math.min(this.dolly.t, 1);
      zOff = this.dolly.bump * Math.sin(Math.PI * p) + this.dolly.settle * (1 - easeOut(p));
      if (p >= 1) this.dolly = null;
    }
    this.camera.position.x = this.px + pan;
    this.camera.position.z = f.camZ + zOff;
    this.camera.position.y += (0.15 - my * 0.18 - this.camera.position.y) * 0.04;
    this.camera.lookAt(pan, 0, 0);
    this.camera.updateMatrixWorld();

    // Sharks.
    const species = this.view.kind === "species" ? this.view.sharks[0] : null;
    this.threats[0]!.radius = 0;
    for (const a of this.actors.values()) {
      if (a.gone) continue;
      a.update(dt, t, this.targetPose(a), 1 - Math.exp(-dt * 5));
      if (species && a.id === species.id && a.shown) {
        this.threats[0]!.pos.set(a.shown.x, a.shown.y, a.shown.z);
        this.threats[0]!.radius = a.shown.s * 0.83;
      }
    }

    // Labels follow the lineup sharks, riding just above the back at the tail end.
    for (const [id, el] of this.opts.labels) {
      const a = this.actors.get(id);
      const on = !!a && this.view.kind === "lineup" && a.interactive && !!a.shown && this.inView(id);
      el.classList.toggle("off", !on);
      if (on && a.shown) {
        const p = a.shown;
        this.tmp.set(p.x - p.s / 2, p.y + 0.12 * p.s, p.z).project(this.camera);
        el.style.transform = `translate(${(this.tmp.x * 0.5 + 0.5) * this.w}px,${(-this.tmp.y * 0.5 + 0.5) * this.h}px) translateY(-100%)`;
      }
    }

    // The diver: always six feet. Beside one shark it floats behind and sets the scale; in a lineup it is the first bar.
    let dTarget: { x: number; y: number; z: number; s: number } | null = null;
    if (species) {
      const comp = (f.camZ + 1.15) / (f.camZ + 0.25);
      const hh = (f.camZ + 1.15) * TAN;
      const mpu = displayLength(species.lengthM) / species.lengthM;
      dTarget = { x: -hh * this.camera.aspect * 0.95 + pan, y: 0.3 * hh, z: -1.15, s: mpu * comp };
    } else if (this.view.kind === "lineup") {
      const row = this.lineupFor(this.view.sharks).diver;
      dTarget = { x: row.tailX, y: row.y + 0.06 * row.unitsPerM, z: ZS, s: row.unitsPerM };
    }
    this.diver.update(dt, t, dTarget, !!species);

    // The school lives in a band above the text.
    const topY = this.yAtScreenFraction(0.08, -0.9, f);
    const safeFrac = this.safeBottomPx > 0 ? this.safeBottomPx / this.h : 0.5;
    const floorY = this.yAtScreenFraction(clamp(safeFrac - 0.03, 0.25, 0.6), -0.9, f);
    this.schoolCentre.set(-0.2 + Math.sin(t * 0.15) * 0.7, (topY + floorY) / 2 + Math.sin(t * 0.2) * 0.08, -0.9 + Math.cos(t * 0.11) * 0.3);
    const mpu = species ? displayLength(species.lengthM) / species.lengthM : 0.25;
    this.school.update({
      dt,
      t,
      centre: this.schoolCentre,
      threats: this.threats,
      unitsPerM: mpu * ((f.camZ + 0.9) / (f.camZ + 0.25)),
      floorY,
      ceilY: topY,
      halfW: (f.camZ + 0.9) * TAN * this.camera.aspect,
    });
    this.snow.update(dt * (reduce ? 0.5 : 1), t);
  }

  /** World y at a fraction of the screen height (0 top, 1 bottom), at depth z. */
  private yAtScreenFraction(frac: number, z: number, f: ReturnType<typeof framing>): number {
    return (0.5 - frac) * 2 * (f.camZ - z) * TAN + this.camera.position.y * 0.5;
  }
}
