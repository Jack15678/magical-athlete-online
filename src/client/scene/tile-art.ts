import * as THREE from 'three';

/** Original vector markings fill the space, including corners left visible by pawns. */
export function specialTileTexture(kind: 'star' | 'trip' | 'arrow', move: number | undefined, index: number, angle: number) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d')!;
  const backward = kind === 'arrow' && (move ?? 0) < 0;
  const ink = kind === 'star' ? '#78530b' : kind === 'trip' ? '#8b2929' : backward ? '#502777' : '#155b50';
  const paper = kind === 'star' ? '#fff8bc' : kind === 'trip' ? '#fff1d7' : backward ? '#f1e1ff' : '#e1fff0';
  const background = kind === 'star' ? '#ffd34f' : kind === 'trip' ? '#ef7463' : backward ? '#bf94eb' : '#69d0b6';
  context.fillStyle = background; context.fillRect(0, 0, 512, 512);
  context.strokeStyle = ink; context.lineWidth = 10;
  context.strokeRect(12, 12, 488, 488);
  // Edge stripes remain visible even with the maximum crowd in the middle.
  context.save(); context.beginPath(); context.rect(20, 20, 472, 472); context.clip();
  context.strokeStyle = ink; context.globalAlpha = .14; context.lineWidth = 17;
  for (let offset = -520; offset <= 1040; offset += 70) { context.beginPath(); context.moveTo(offset, 0); context.lineTo(offset + 512, 512); context.stroke(); }
  context.restore();
  context.save(); context.translate(256, 256);
  context.fillStyle = paper; context.strokeStyle = ink; context.lineJoin = 'round'; context.lineWidth = 12;
  if (kind === 'star') {
    context.beginPath();
    for (let point = 0; point < 10; point++) { const theta = -Math.PI / 2 + point * Math.PI / 5, radius = point % 2 ? 88 : 192; const x = Math.cos(theta) * radius, y = Math.sin(theta) * radius; if (!point) context.moveTo(x, y); else context.lineTo(x, y); }
    context.closePath(); context.fill(); context.stroke();
    context.fillStyle = ink; context.font = '950 94px "Microsoft YaHei",sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('+1', 0, 10);
  } else if (kind === 'trip') {
    context.beginPath(); context.moveTo(0, -180); context.lineTo(192, 156); context.lineTo(-192, 156); context.closePath(); context.fill(); context.stroke();
    context.fillStyle = ink; context.fillRect(-25, -82, 50, 124); context.beginPath(); context.arc(0, 98, 28, 0, Math.PI * 2); context.fill();
  } else {
    // The printed arrow follows the actual board direction, including backwards.
    context.rotate(-angle);
    context.beginPath(); context.moveTo(0, -190); context.lineTo(180, -10); context.lineTo(78, -10); context.lineTo(78, 178); context.lineTo(-78, 178); context.lineTo(-78, -10); context.lineTo(-180, -10); context.closePath(); context.fill(); context.stroke();
  }
  context.restore();
  const badge = (text: string, x: number, y: number, width: number, inverted = false) => {
    context.fillStyle = inverted ? ink : paper; context.beginPath(); context.roundRect(x, y, width, 72, 13); context.fill();
    context.strokeStyle = ink; context.lineWidth = 4; context.stroke(); context.fillStyle = inverted ? paper : ink;
    context.font = `950 ${text.length > 2 ? 39 : 48}px "Microsoft YaHei",sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, x + width / 2, y + 38);
  };
  const value = kind === 'star' ? '+1' : kind === 'trip' ? '绊倒' : `${(move ?? 0) > 0 ? '+' : ''}${move ?? 0}`;
  badge(String(index), 24, 24, 86); badge(value, 356, 24, 132, true);
  badge(value, 24, 416, 132, true); badge(String(index), 402, 416, 86);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
