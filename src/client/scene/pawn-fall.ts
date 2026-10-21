const HALF_PI = Math.PI / 2;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** One short loss of balance, one fall, then a held rules-driven pose. */
export function pawnFallPose(progress: number, phase: 'trip' | 'recover' | 'down', reducedMotion = false) {
  const t = clamp01(progress);
  let tilt: number;
  if (phase === 'down') tilt = -HALF_PI;
  else if (phase === 'recover') tilt = -HALF_PI * (1 - smooth(t));
  else if (reducedMotion) tilt = -HALF_PI;
  else if (t < .16) tilt = Math.sin(t / .16 * Math.PI) * .1;
  else tilt = -HALF_PI * smooth(clamp01((t - .16) / .49));
  // The ownership base has radius .33. This support-height follows the
  // rotation, so its back rim and the model never rotate through the tile.
  const support = Math.sin(Math.abs(tilt)) * .34;
  const contact = phase === 'trip' && !reducedMotion && t > .65 && t < .86
    ? Math.sin((t - .65) / .21 * Math.PI) * .028 : 0;
  return { tilt, lift: support + contact };
}
