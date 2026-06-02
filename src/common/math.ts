/** Small shared math helpers. Kept dependency-free so any module can import them. */

/** Normalize an angle (radians) into the range (-π, π]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

/** Clamp `v` into the inclusive range [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Linear interpolation from `a` to `b` by `t` (0..1, unclamped). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
