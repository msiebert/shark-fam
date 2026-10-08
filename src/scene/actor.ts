import * as THREE from "three";
import type { Pose, SharkSpec } from "./types";
import { addSwim, makeSwimUniforms, type SwimUniforms } from "./sharkMaterial";
import { clamp, lerp, smooth, wrapAngle } from "./frame";

const FADE_IN = 0.6;
const EXIT_TIME = 0.7;
const GLIDE_TIME = 1.1;
/**
 * How tight a turn is, in radians of heading change per body length swum (the racetrack arcs are about 3.6). The bend
 * and bank depend on this, not on the turn rate, so a shark that is slowed on a phone still bends as far.
 */
const BEND_PER_TIGHT = 0.0375; // body bend (fraction of length at nose and tail)
const BEND_MAX = 0.14;
const BANK_PER_TIGHT = 0.035; // roll into the turn, radians
const BANK_MAX = 0.22;
/** How fast the body follows the turn (1/s): it bends a moment before and after the arc, not as a switch. */
const TURN_RESPONSE = 3.2;

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
  private lastYaw: number | null = null;
  private lastX = 0;
  private lastZ = 0;
  private lastTime: number | null = null;
  /** Smoothed turn tightness (rad per body length): negative turns toward the shark's local +z side. */
  private turn = 0;
  private phase = 0;

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
    this.lastYaw = null;
    this.turn = 0;
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
    this.swim(dt, time, p);
    this.group.position.set(p.x, p.y, p.z);
    this.group.scale.setScalar(p.s);
    this.shown = p;
  }

  /** The pose actually drawn this frame. */
  shown: Pose | null = null;

  /**
   * Swimming from the pose. How tight the turn is comes from how the heading changes over the distance swum, so any
   * manoeuvre (a racetrack arc, a glide, the swim-off) bends the body into the turn, rolls it inward and beats the tail harder.
   */
  private swim(dt: number, time: number, p: Pose): void {
    let tight = 0;
    if (this.lastYaw !== null && dt > 1e-5) {
      const rate = wrapAngle(p.yaw - this.lastYaw) / dt;
      const speed = Math.hypot(p.x - this.lastX, p.z - this.lastZ) / dt;
      if (speed > 1e-3 * p.s) tight = (rate * p.s) / speed;
    }
    this.lastYaw = p.yaw;
    this.lastX = p.x;
    this.lastZ = p.z;
    this.turn += (clamp(tight, -6, 6) - this.turn) * (1 - Math.exp(-dt * TURN_RESPONSE));
    const bend = clamp(-this.turn * BEND_PER_TIGHT, -BEND_MAX, BEND_MAX);
    const effort = Math.abs(bend) / BEND_MAX;
    this.uniforms.uBend.value = bend;
    this.uniforms.uAmp.value = this.spec.amplitude * (1 + 0.45 * effort);
    // The beat is integrated so that quickening it in a turn never makes the tail jump.
    const dts = this.lastTime === null ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    this.phase += 2 * Math.PI * this.spec.beatHz * (1 + 0.35 * effort) * dts;
    this.uniforms.uPhase.value = this.phase;
    this.group.rotation.set(clamp(-this.turn * BANK_PER_TIGHT, -BANK_MAX, BANK_MAX), p.yaw, p.pitch);
  }

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
