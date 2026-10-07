/**
 * The path one shark swims at species level: a pass in the far lane, a U-turn toward the camera on screen,
 * a pass back in the near lane, and a turn away. Depth (screen y) stays roughly constant.
 * Everything here is in world units and seconds; `z` runs toward the camera.
 */
export interface TrackShape {
  /** Straight half-length of each lane. */
  xs: number;
  /** Turn radius. */
  r: number;
  /** Speed, world units per second. */
  v: number;
  /** Distance from the left edge of the view to the start of the first lane: where it enters from. */
  lead: number;
  /** Seconds for one full lap. */
  period: number;
}

export interface TrackPose {
  x: number;
  z: number;
  yaw: number;
}

export function trackShape(length: number, cruiseBodyLengths: number, halfW: number): TrackShape {
  const half = length * 0.55;
  const r = 0.28 * length;
  const v = cruiseBodyLengths * length;
  // On a narrow screen the shark is wider than the view, so the turns run partly off screen.
  const ext = Math.max(0.3 * halfW, halfW - half - 0.08, Math.min(0.75 * length, halfW));
  const xs = Math.max(0.05, ext - r);
  return { xs, r, v, lead: Math.max(0, halfW + half + 0.05 - xs), period: (4 * xs + 2 * Math.PI * r) / v };
}

/** Pose after swimming for `tau` seconds. Negative `tau` is the approach from off screen, left of the first lane. */
export function trackPose(s: TrackShape, tau: number): TrackPose {
  const t = tau >= 0 ? tau % s.period : tau;
  const d = t * s.v;
  const lane = 2 * s.xs;
  const arc = Math.PI * s.r;
  if (d < lane) return { x: -s.xs + d, z: -s.r, yaw: 0 };
  if (d < lane + arc) {
    const f = (d - lane) / s.r;
    return { x: s.xs + s.r * Math.sin(f), z: s.r * -Math.cos(f), yaw: -f };
  }
  if (d < 2 * lane + arc) return { x: s.xs - (d - lane - arc), z: s.r, yaw: -Math.PI };
  const f = (d - 2 * lane - arc) / s.r;
  return { x: -s.xs - s.r * Math.sin(f), z: s.r * Math.cos(f), yaw: -Math.PI - f };
}

/** World length of a shark on screen: gently compressed so a whale shark is bigger than a great white but fits. */
export function displayLength(lengthM: number): number {
  return 1.15 * Math.pow(lengthM / 4.5, 0.35);
}
