import { CatmullRomCurve3, Vector3 } from 'three';

/** Centripetal curves pass through the confirmed cell centres, without cutting
 * a U-turn across the board. Arc-length sampling keeps each stride even. */
export function pawnRoute(points: readonly (readonly number[])[]) {
  const route = points.map(point => new Vector3(point[0], 0, point[2]));
  if (route.length === 1) route.push(route[0]!.clone());
  return new CatmullRomCurve3(route, false, 'centripetal');
}
export function strideProgress(t: number) {
  const value = Math.max(0, Math.min(1, t));
  return value * value * (3 - 2 * value);
}
export function strideLift(progress: number, steps: number) {
  // Squared sine lands with zero vertical velocity at every cell boundary.
  return Math.sin(progress * Math.max(1, steps) * Math.PI) ** 2 * .075;
}
