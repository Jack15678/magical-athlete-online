export interface TrackSpace { kind: 'star' | 'trip' | 'arrow'; move?: number }
export interface TrackDefinition { id: 'mild' | 'wild'; name: string; length: number; finish: number; secondCorner: number; specials: Record<number, TrackSpace>; verified: boolean; source: string }
export const TRACKS: Record<'mild' | 'wild', TrackDefinition> = {
  mild: { id: 'mild', name: '温和一英里', length: 30, finish: 30, secondCorner: 15, specials: {}, verified: true, source: 'https://www.cmyk.games/cdn/shop/files/MA_29069_wide_1024x1024.jpg?v=1758033995' },
  // Numbered from Start=0: upper straight left-to-right, far bend 12..15,
  // lower straight right-to-left, then Finish=30 in the inner loop.
  // Independently read and cross-reviewed 2026-10-21 from IELLO shop photos
  // 4182 (whole track), 4180 (arrow close-up), 4184 (finish-side cross-check),
  // plus Photo_Athletes_light-2.jpg. Rulebook FR p21: follow the arrow's
  // physical direction. In particular a right arrow on the lower straight
  // is backwards; its printed positive number is NOT forward distance.
  wild: {
    id: 'wild', name: '狂野荒野', length: 30, finish: 30, secondCorner: 15,
    specials: {
      1: { kind: 'star' },
      5: { kind: 'trip' },
      7: { kind: 'arrow', move: 3 },
      11: { kind: 'arrow', move: 1 },
      13: { kind: 'star' },
      16: { kind: 'arrow', move: -4 },
      17: { kind: 'trip' },
      23: { kind: 'arrow', move: 2 },
      24: { kind: 'arrow', move: -2 },
      26: { kind: 'trip' },
    },
    verified: true,
    source: 'https://iello.shop/4182-product_large/athletes-de-compete.jpg',
  },
};
export const RACE_POINTS = [[3, 1], [4, 2], [5, 3], [6, 4]] as const;
