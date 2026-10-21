import { TRACKS } from '../../shared/tracks.js';

export const TILE = 1.72;
export const TRACK_FIRST_CORNER = TRACKS.mild.firstCorner;
export const TRACK_SECOND_CORNER = TRACKS.mild.secondCorner;
export const TRACK_FINISH = TRACKS.mild.finish;
const farStraight = TRACK_SECOND_CORNER - TRACK_FIRST_CORNER;
const minTrackX = Math.min(0, TRACK_FIRST_CORNER - (TRACK_FINISH - TRACK_SECOND_CORNER));
const centerTrackX = (minTrackX + TRACK_FIRST_CORNER) / 2;
/** Distance between the outermost tile centers; add one tile for board edges. */
export const BOARD_CENTER_SPAN = { width: (TRACK_FIRST_CORNER - minTrackX) * TILE, depth: farStraight * TILE } as const;

/**
 * One continuous U track with right-angle bends at 12 and 15. Both viewports
 * use the same track: compact view rotates it 90 degrees without refolding.
 */
export function boardPoint(position: number, compact: boolean): [number, number, number] {
  const index = Number.isFinite(position) ? Math.max(0, Math.min(TRACK_FINISH, position)) : 0;
  const x = (index <= TRACK_FIRST_CORNER ? index : index <= TRACK_SECOND_CORNER ? TRACK_FIRST_CORNER : TRACK_FIRST_CORNER - (index - TRACK_SECOND_CORNER)) - centerTrackX;
  const z = (index <= TRACK_FIRST_CORNER ? 0 : index <= TRACK_SECOND_CORNER ? index - TRACK_FIRST_CORNER : farStraight) - farStraight / 2;
  return compact ? [-z * TILE, .22, x * TILE] : [x * TILE, .22, z * TILE];
}

/**
 * Toy die face normals: +Y=1, -Y=6, +Z=2, -Z=5, +X=3, -X=4.
 * These XYZ Euler rotations put the confirmed face exactly along world +Y.
 */
export function diceTopRotation(face: number): [number, number, number] {
  switch (face) {
    case 2: return [-Math.PI / 2, 0, 0];
    case 3: return [0, 0, Math.PI / 2];
    case 4: return [0, 0, -Math.PI / 2];
    case 5: return [Math.PI / 2, 0, 0];
    case 6: return [Math.PI, 0, 0];
    default: return [0, 0, 0];
  }
}
