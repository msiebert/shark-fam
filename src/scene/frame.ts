export const FOV = 36;
export const TAN = Math.tan((FOV * Math.PI) / 360);
/** Depth the sharks swim at, relative to the world origin. */
export const ZS = -0.25;

export interface Framing {
  camZ: number;
  /** Half height and width of the view at the swim depth, in world units. */
  halfH: number;
  halfW: number;
  /** World y that lands a shark about a quarter of the way down the screen. */
  swimY: number;
}

export const SHARK_UP = 0.46 * TAN;

/** The camera backs off on tall, narrow screens so a shark still fits. */
export function framing(aspect: number): Framing {
  const camZ = aspect < 0.8 ? 5.4 : 3.9;
  const halfH = (camZ - ZS) * TAN;
  return { camZ, halfH, halfW: halfH * aspect, swimY: SHARK_UP * (camZ - ZS) + 0.12 };
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 4);
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
