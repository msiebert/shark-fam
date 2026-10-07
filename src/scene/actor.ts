import * as THREE from "three";
import type { Pose, SharkSpec } from "./types";
import { addSwim, makeSwimUniforms, type SwimUniforms } from "./sharkMaterial";
import { clamp, lerp, smooth, wrapAngle } from "./frame";

const FADE_IN = 0.6;
const EXIT_TIME = 0.7;
const GLIDE_TIME = 1.1;

const copyPose = (p: Pose): Pose => ({ ...p });

function blend(a: Pose, b: Pose, w: number): Pose {
  return {
    x: lerp(a.x, b.x, w),
    y: lerp(a.y, b.y, w),
    z: lerp(a.z, b.z, w),
    s: lerp(a.s, b.s, w),
    pitch: lerp(a.pitch, b.pitch, w),
    yaw: a.yaw + wrapAngle(b.yaw - a.yaw) * w,
  };
}

export type Mode = "line" | "swim";

/**
 * One shark in the scene. It owns its materials (so it can fade alone) and its pose, and it knows how to
 * glide, fade and leave. The director only tells it where it should be.
 */
export class SharkActor {
  readonly group = new THREE.Group();
  readonly uniforms: SwimUniforms;
  readonly materials: THREE.Material[] = [];
  mode: Mode = "line";
  alpha = 0;
  /** Time at which the racetrack lap starts (seconds on the scene clock); negative lead means it is still off screen. */
  trackStart = 0;
  pose: Pose | null = null;
  leaving = false;
  gone = false;
  private fade: { from: number; to: number; t: number; dur: number } | null = null;
  private glide: { from: Pose; t: number } | null = null;
  private exit: { t: number; pose: Pose } | null = null;
  private applied = -1;

  constructor(
    readonly spec: SharkSpec,
    model: THREE.Object3D,
  ) {
    this.uniforms = makeSwimUniforms(spec.amplitude);
    this.group.add(model);
    this.group.rotation.order = "YZX";
    this.group.visible = false;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      addSwim(mat, this.uniforms);
      this.materials.push(mat);
    });
  }

  get id(): string {
    return this.spec.id;
  }
  /** Not on its way out, and visible enough to click. */
  get interactive(): boolean {
    return !this.leaving && this.alpha > 0.5;
  }

  fadeTo(to: number, dur: number): void {
    this.fade = { from: this.alpha, to, t: 0, dur };
  }

  /** Appear at `pose` and fade in. */
  appear(pose: Pose, fade: boolean): void {
    this.leaving = false;
    this.gone = false;
    this.exit = null;
    this.glide = null;
    this.pose = copyPose(pose);
    this.group.visible = true;
    this.alpha = fade ? 0 : 1;
    this.applied = -1;
    this.fade = null;
    if (fade) this.fadeTo(1, FADE_IN);
  }

  /** Called when the same shark stays on screen across a change of view. */
  recall(): void {
    if (this.leaving) {
      this.leaving = false;
      this.exit = null;
    }
    if (this.alpha < 1) this.fadeTo(1, FADE_IN);
  }

  /** Start a smooth glide from the current pose into whatever the new mode asks for. */
  beginGlide(): void {
    if (this.pose) this.glide = { from: copyPose(this.pose), t: 0 };
  }

  /** Swim off to the right while fading out. */
  leave(): void {
    if (this.leaving || !this.pose) return;
    this.leaving = true;
    this.glide = null;
    this.exit = { t: 0, pose: copyPose(this.pose) };
    this.fadeTo(0, EXIT_TIME);
  }

  update(dt: number, time: number, target: Pose, smoothing: number): void {
    if (this.fade) {
      this.fade.t += dt / this.fade.dur;
      this.alpha = lerp(this.fade.from, this.fade.to, smooth(this.fade.t));
      if (this.fade.t >= 1) {
        this.fade = null;
        if (this.leaving) {
          this.gone = true;
          this.group.visible = false;
        }
      }
    }
    if (!this.group.visible) return;
    this.applyAlpha();

    let p: Pose;
    if (this.exit) {
      this.exit.t += dt / EXIT_TIME;
      const u = Math.min(this.exit.t, 1);
      const turn = smooth(u * 3);
      const e = this.exit.pose;
      p = { ...e, x: e.x + e.s * 1.6 * u * u, yaw: e.yaw + wrapAngle(-e.yaw) * turn, pitch: e.pitch * (1 - turn) };
    } else {
      if (!this.pose) this.pose = copyPose(target);
      if (this.glide) {
        this.glide.t += dt / GLIDE_TIME;
        this.pose = blend(this.glide.from, target, smooth(this.glide.t));
        if (this.glide.t >= 1) this.glide = null;
      } else if (this.mode === "swim") this.pose = copyPose(target);
      else this.pose = blend(this.pose, target, smoothing);
      p = this.pose;
    }
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.set(0, p.yaw, p.pitch);
    this.group.scale.setScalar(p.s);
    this.uniforms.uPhase.value = 2 * Math.PI * this.spec.beatHz * time;
    this.shown = p;
  }

  /** The pose actually drawn this frame. */
  shown: Pose | null = null;

  private applyAlpha(): void {
    if (this.applied === this.alpha) return;
    const transparent = this.alpha < 0.999;
    for (const m of this.materials) {
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = clamp(this.alpha, 0, 1);
    }
    this.applied = this.alpha;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of this.materials) m.dispose();
  }
}
