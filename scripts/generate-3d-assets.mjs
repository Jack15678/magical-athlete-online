/** Original toy sculptures. Rebuild: node scripts/generate-3d-assets.mjs */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Three's exporter uses the browser FileReader API even for texture-free binary data.
globalThis.FileReader ??= class FileReader {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};

const colors = {
  yellow: '#ffcf38', red: '#f45b4c', blue: '#5369dc', pink: '#f3a0bf', green: '#a7c967',
  paper: '#fff6dc', ink: '#26293e', violet: '#9778cf', orange: '#ef9a47', aqua: '#6bc6bc',
};
const materials = Object.fromEntries(Object.entries(colors).map(([id, color]) => [id,
  new T.MeshStandardMaterial({ name: `toy-${id}`, color, roughness: 0.4, metalness: 0, flatShading: false }),
]));
let root;
function mesh(geometry, color, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const m = new T.Mesh(geometry, materials[color]);
  m.position.fromArray(position); m.scale.fromArray(scale); m.rotation.fromArray(rotation); m.userData.partType = geometry.type; root.add(m); return m;
}
function orb(color, x, y, z, sx, sy = sx, sz = sx) { return mesh(new T.SphereGeometry(1, 12, 8), color, [x, y, z], [sx, sy, sz]); }
function box(color, x, y, z, sx, sy, sz, rotation = [0, 0, 0]) { return mesh(new T.BoxGeometry(sx, sy, sz, 1, 1, 1), color, [x, y, z], [1, 1, 1], rotation); }
function cone(color, x, y, z, radius, height, rotation = [0, 0, 0], vertices = 12) { return mesh(new T.ConeGeometry(radius, height, vertices), color, [x, y, z], [1, 1, 1], rotation); }
function cyl(color, x, y, z, rt, rb, height, rotation = [0, 0, 0]) { return mesh(new T.CylinderGeometry(rt, rb, height, 14), color, [x, y, z], [1, 1, 1], rotation); }
function ring(color, x, y, z, radius, tube = 0.025, rotation = [0, 0, 0]) { return mesh(new T.TorusGeometry(radius, tube, 5, 18), color, [x, y, z], [1, 1, 1], rotation); }
function rod(color, from, to, radius = 0.025) {
  const a = new T.Vector3(...from), b = new T.Vector3(...to);
  const m = mesh(new T.CylinderGeometry(radius, radius, a.distanceTo(b), 7), color);
  m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.sub(a).normalize()); return m;
}
function tube(color, points, radius = 0.04) { return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), Math.max(6, points.length * 4), radius, 7, false), color); }
function face(x = 0, y = 0.7, z = 0.21, gap = 0.09, size = 0.052) {
  for (const direction of [-1, 1]) {
    orb('paper', x + direction * gap, y, z, size, size * 1.22, size * 0.48).userData.role = 'eye-white';
    orb('ink', x + direction * gap + 0.01, y - 0.006, z + size * 0.44, size * 0.4, size * 0.58, size * 0.2).userData.role = 'eye-pupil';
  }
  tube('ink', [[x - gap * 0.5, y - size * 1.5, z], [x, y - size * 1.8, z + 0.01], [x + gap * 0.5, y - size * 1.5, z]], 0.011);
}
function feet(color = 'ink', gap = 0.12, y = 0.06) {
  orb(color, -gap, y, 0.035, 0.082, 0.055, 0.12); orb(color, gap, y, 0.035, 0.082, 0.055, 0.12);
}
function arms(color = 'paper', y = 0.43, extent = 0.27) {
  rod(color, [-0.16, y + 0.08, 0], [-extent, y, 0.04], 0.035);
  rod(color, [0.16, y + 0.08, 0], [extent, y + 0.04, 0.04], 0.035);
  orb(color, -extent, y, 0.04, 0.045); orb(color, extent, y + 0.04, 0.04, 0.045);
}
function person(bodyColor = 'blue', headColor = 'yellow') {
  feet(); cyl(bodyColor, 0, 0.32, 0, 0.13, 0.2, 0.43); orb(headColor, 0, 0.7, 0, 0.205, 0.22, 0.18); arms(headColor); face();
}
function ears(color, y = 0.91, length = 0.2, spread = 0.1) {
  for (const d of [-1, 1]) { const o = orb(color, d * spread, y, 0, 0.07, length, 0.055); o.rotation.z = -d * 0.15; }
}
function crown(y = 0.94) {
  cyl('yellow', 0, y, 0, 0.19, 0.18, 0.09);
  for (const [x, z] of [[-0.14, 0.07], [0, 0.13], [0.14, 0.07], [0, -0.12]]) {
    cone('yellow', x, y + 0.1, z, 0.065, 0.2); orb('red', x, y + 0.2, z, 0.028);
  }
}
function extrude(color, points, depth = 0.12, position = [0, 0, 0]) {
  const shape = new T.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
  return mesh(new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 1, steps: 1 }), color, position);
}

const builders = {
  alchemist() {
    feet(); orb('blue', 0, 0.38, 0, 0.23, 0.27, 0.19); cyl('green', 0, 0.68, 0, 0.065, 0.18, 0.3); cyl('green', 0, 0.86, 0, 0.095, 0.095, 0.08);
    face(0, 0.48, 0.185); arms('green'); orb('yellow', 0.23, 0.9, 0, 0.06); orb('aqua', -0.13, 0.79, 0, 0.035);
  },
  'baba-yaga'() {
    rod('orange', [-0.13, 0.3, 0], [-0.2, 0.06, 0.07], 0.04); rod('orange', [0.13, 0.3, 0], [0.2, 0.06, 0.07], 0.04); feet('orange', 0.2);
    box('yellow', 0, 0.54, 0, 0.42, 0.42, 0.31); cone('red', 0, 0.88, 0, 0.34, 0.3, [0, Math.PI / 4, 0], 4); box('blue', -0.17, 0.9, -0.04, 0.07, 0.25, 0.08); face(0, 0.59, 0.165);
    box('orange', 0, 0.39, 0.17, 0.1, 0.15, 0.025);
  },
  banana() {
    feet(); tube('yellow', [[-0.2, 0.2, 0], [-0.1, 0.22, 0], [0.12, 0.42, 0], [0.22, 0.73, 0], [0.14, 0.94, 0]], 0.11);
    tube('paper', [[-0.21, 0.27, 0.01], [-0.04, 0.36, 0.01], [0.06, 0.56, 0.01], [0.11, 0.8, 0.01]], 0.027);
    rod('orange', [0.14, 0.94, 0], [0.13, 1.02, 0], 0.04); face(0.1, 0.55, 0.1, 0.067, 0.042); arms('yellow', 0.37);
  },
  blimp() {
    cyl('blue', 0, 0.19, 0, 0.11, 0.15, 0.17); rod('ink', [-0.1, 0.28, 0], [-0.17, 0.47, 0], 0.015); rod('ink', [0.1, 0.28, 0], [0.17, 0.47, 0], 0.015);
    orb('pink', 0, 0.64, 0, 0.31, 0.22, 0.19); ring('violet', 0, 0.64, 0, 0.215, 0.018, [0, Math.PI / 2, 0]);
    cone('blue', -0.29, 0.66, 0, 0.13, 0.23, [0, 0, Math.PI / 2], 3); face(0.055, 0.66, 0.177, 0.075, 0.042);
  },
  centaur() {
    orb('red', 0, 0.31, -0.05, 0.24, 0.13, 0.26); for (const x of [-0.15, 0.15]) for (const z of [-0.19, 0.1]) { rod('red', [x, 0.29, z], [x, 0.06, z], 0.045); orb('ink', x, 0.05, z + 0.015, 0.058); }
    cyl('blue', 0, 0.55, 0.08, 0.12, 0.16, 0.34); orb('yellow', 0, 0.83, 0.08, 0.16); face(0, 0.85, 0.23, 0.066, 0.041); arms('yellow', 0.6); tube('ink', [[0, 0.4, -0.25], [0.08, 0.5, -0.32], [0.13, 0.42, -0.32]], 0.035);
  },
  cheerleader() {
    person('blue', 'pink'); for (const d of [-1, 1]) { rod('pink', [d * 0.13, 0.5, 0], [d * 0.23, 0.82, 0], 0.034); orb('red', d * 0.23, 0.84, 0, 0.1); for (let i = 0; i < 5; i++) orb(i % 2 ? 'yellow' : 'red', d * 0.23 + Math.cos(i * 1.25) * 0.09, 0.84 + Math.sin(i * 1.25) * 0.09, 0.015, 0.055); }
    cone('blue', 0, 0.29, 0, 0.23, 0.25); orb('blue', -0.18, 0.85, 0, 0.07); orb('blue', 0.18, 0.85, 0, 0.07);
  },
  coach() {
    person(); cyl('red', 0, 0.91, 0, 0.21, 0.21, 0.065); box('red', 0.04, 0.895, 0.18, 0.36, 0.035, 0.2);
    tube('paper', [[-0.12, 0.53, 0.15], [0, 0.35, 0.2], [0.12, 0.53, 0.15]], 0.012); cyl('paper', 0, 0.35, 0.21, 0.05, 0.05, 0.045, [Math.PI / 2, 0, 0]);
  },
  copycat() {
    feet('ink', 0.16); for (const [d, c] of [[-1, 'blue'], [1, 'pink']]) { orb(c, d * 0.13, 0.38, 0, 0.14, 0.25, 0.14); orb(c, d * 0.13, 0.68, 0, 0.145, 0.16, 0.145); cone(c, d * 0.13 - 0.09, 0.86, 0, 0.075, 0.18); cone(c, d * 0.13 + 0.09, 0.86, 0, 0.075, 0.18); face(d * 0.13, 0.7, 0.14, 0.052, 0.035); }
  },
  dicemonger() {
    feet(); box('yellow', 0, 0.55, 0, 0.44, 0.53, 0.39); face(0, 0.56, 0.21); arms('yellow');
    for (const x of [-0.11, 0.11]) for (const z of [-0.09, 0.09]) orb('red', x, 0.82, z, 0.038, 0.012, 0.038);
    orb('red', -0.23, 0.62, 0, 0.012, 0.04, 0.04); orb('red', -0.23, 0.4, 0, 0.012, 0.04, 0.04);
  },
  duelist() {
    person('red', 'paper'); box('ink', 0, 0.73, 0.175, 0.34, 0.025, 0.015); rod('paper', [0.22, 0.38, 0.08], [0.3, 0.99, 0.09], 0.018); rod('yellow', [0.23, 0.55, 0.03], [0.32, 0.56, 0.1], 0.021); tube('ink', [[-0.14, 0.87, 0.06], [0, 0.92, 0.07], [0.12, 0.89, 0.06]], 0.025);
  },
  egg() { feet(); orb('paper', 0, 0.48, 0, 0.24, 0.36, 0.21); orb('paper', 0, 0.72, 0, 0.175, 0.23, 0.16); face(0, 0.62, 0.198); tube('orange', [[-0.21, 0.4, 0.1], [-0.1, 0.43, 0.2], [0, 0.39, 0.22], [0.11, 0.44, 0.2], [0.21, 0.42, 0.1]], 0.012); },
  'flip-flop'() {
    orb('green', 0, 0.5, 0, 0.24, 0.44, 0.13); face(0, 0.39, 0.13, 0.08, 0.045); tube('red', [[-0.19, 0.72, 0.12], [0, 0.58, 0.16], [0.19, 0.81, 0.1]], 0.035); rod('red', [0, 0.58, 0.16], [0.015, 0.29, 0.15], 0.035); arms('green', 0.45);
  },
  genius() {
    feet(); cyl('yellow', 0, 0.31, 0, 0.16, 0.2, 0.38); for (const [x, y, z] of [[-0.13, 0.78, 0], [0.12, 0.79, 0], [-0.21, 0.64, 0], [0.2, 0.64, 0], [0, 0.68, 0.06], [0, 0.9, 0]]) orb('pink', x, y, z, 0.13, 0.13, 0.14);
    face(0, 0.4, 0.18, 0.075, 0.043); for (const d of [-1, 1]) tube('violet', [[d * 0.1, 0.89, 0.08], [d * 0.04, 0.78, 0.16], [d * 0.12, 0.7, 0.16]], 0.012);
  },
  gunk() {
    orb('green', 0, 0.4, 0, 0.23, 0.3, 0.2); for (let i = 0; i < 9; i++) { const a = i * Math.PI * 2 / 9; orb('green', Math.cos(a) * 0.18, 0.39 + Math.sin(a) * 0.27, 0, 0.1); } face(0, 0.5, 0.19); for (const [x, y] of [[-0.17, 0.27], [0.16, 0.39], [-0.14, 0.65]]) orb('aqua', x, y, 0.15, 0.03); orb('red', 0.02, 0.32, 0.19, 0.08, 0.05, 0.025);
  },
  hare() { feet('yellow', 0.16); orb('yellow', 0, 0.4, 0, 0.22, 0.28, 0.19); orb('yellow', 0, 0.64, 0, 0.23, 0.22, 0.19); ears('pink', 0.97, 0.24, 0.12); face(0, 0.66, 0.19); orb('pink', 0, 0.56, 0.21, 0.033, 0.024, 0.024); orb('paper', 0, 0.35, -0.2, 0.085); },
  heckler() {
    feet(); cyl('red', 0, 0.51, 0, 0.27, 0.13, 0.5); cyl('yellow', 0, 0.78, 0, 0.28, 0.28, 0.07); cyl('ink', 0, 0.82, 0, 0.21, 0.21, 0.02); face(0, 0.49, 0.197, 0.08, 0.043); ring('yellow', -0.16, 0.3, 0, 0.09, 0.03, [Math.PI / 2, 0, 0]);
  },
  'huge-baby'() {
    feet('blue', 0.12); orb('blue', 0, 0.27, 0, 0.2, 0.16, 0.18); orb('pink', 0, 0.64, 0, 0.28, 0.27, 0.22); face(0, 0.67, 0.218, 0.115, 0.064); tube('orange', [[0, 0.9, 0], [-0.07, 0.98, 0], [0, 1.02, 0], [0.06, 0.97, 0]], 0.02); orb('yellow', 0, 0.32, 0.18, 0.032); arms('pink', 0.39);
  },
  hypnotist() {
    feet(); cyl('blue', 0, 0.44, 0, 0.21, 0.16, 0.6); cone('yellow', 0, 0.84, 0, 0.19, 0.25); cyl('paper', 0, 0.62, 0.21, 0.16, 0.16, 0.035, [Math.PI / 2, 0, 0]);
    const points = []; for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 4, r = i / 32 * 0.135; points.push([Math.cos(a) * r, 0.62 + Math.sin(a) * r, 0.235]); } tube('violet', points, 0.014); rod('paper', [0.18, 0.44, 0], [0.27, 0.7, 0], 0.026); rod('ink', [0.27, 0.7, 0], [0.27, 0.31, 0], 0.012); orb('yellow', 0.27, 0.28, 0, 0.055);
  },
  inchworm() {
    for (let i = 0; i < 4; i++) { orb('green', -0.21 + i * 0.14, 0.2 + i * 0.07, 0, 0.115, 0.13, 0.15); orb('ink', -0.21 + i * 0.14, 0.06, 0.09, 0.04); }
    orb('green', 0.2, 0.59, 0, 0.13, 0.23, 0.135); face(0.19, 0.66, 0.12, 0.055, 0.038); rod('ink', [0.14, 0.78, 0], [0.12, 0.91, 0], 0.013); rod('ink', [0.25, 0.78, 0], [0.29, 0.91, 0], 0.013); orb('yellow', 0.12, 0.91, 0, 0.029); orb('yellow', 0.29, 0.91, 0, 0.029);
  },
  lackey() { person(); root.children.forEach(o => { o.rotation.z = 0.08; }); rod('ink', [-0.3, 0.54, 0.07], [-0.15, 0.54, 0.07], 0.017); rod('ink', [0.15, 0.57, 0.07], [0.3, 0.57, 0.07], 0.017); cyl('paper', -0.27, 0.56, 0.07, 0.1, 0.1, 0.018); cyl('paper', 0.27, 0.59, 0.07, 0.1, 0.1, 0.018); box('ink', 0, 0.84, 0.13, 0.22, 0.055, 0.08, [0, 0, 0.2]); },
  leaptoad() { feet('green', 0.21); orb('green', 0, 0.35, 0, 0.24, 0.19, 0.18); orb('green', -0.13, 0.58, 0, 0.115); orb('green', 0.13, 0.58, 0, 0.115); face(0, 0.61, 0.1, 0.135, 0.058); orb('paper', 0, 0.29, 0.15, 0.14, 0.085, 0.035); tube('red', [[-0.02, 0.35, 0.19], [0.06, 0.33, 0.25], [0.13, 0.36, 0.24]], 0.024); },
  legs() { feet('pink', 0.18); rod('pink', [-0.1, 0.69, 0], [-0.17, 0.12, 0], 0.065); rod('pink', [0.1, 0.69, 0], [0.17, 0.12, 0], 0.065); cyl('blue', 0, 0.79, 0, 0.21, 0.14, 0.23); face(0, 0.83, 0.18, 0.085, 0.043); arms('pink', 0.74); },
  'lovable-loser'() { person('blue', 'pink'); box('yellow', 0.05, 0.4, 0.19, 0.12, 0.14, 0.035, [0, 0, -0.2]); tube('ink', [[0.01, 0.47, 0.215], [0.06, 0.41, 0.215], [0.03, 0.35, 0.215]], 0.009); orb('aqua', 0.15, 0.57, 0.14, 0.025, 0.055, 0.02); },
  magician() { person('blue'); cyl('ink', 0, 0.93, 0, 0.19, 0.19, 0.3); cyl('ink', 0, 0.79, 0, 0.28, 0.28, 0.045); cyl('red', 0, 0.83, 0, 0.193, 0.193, 0.065); rod('ink', [0.24, 0.44, 0], [0.29, 0.86, 0], 0.019); rod('paper', [0.287, 0.82, 0], [0.3, 0.91, 0], 0.021); },
  mastermind() { feet(); box('red', 0, 0.53, 0, 0.4, 0.47, 0.3); face(0, 0.6, 0.16); arms('ink'); crown(0.8); box('yellow', -0.27, 0.45, 0, 0.06, 0.17, 0.1); box('yellow', 0.27, 0.49, 0, 0.06, 0.17, 0.1); },
  mouth() { feet(); orb('red', 0, 0.4, 0, 0.29, 0.22, 0.2); orb('ink', 0, 0.44, 0.15, 0.24, 0.12, 0.09); for (let i = 0; i < 6; i++) { const x = -0.18 + i * 0.072; box('paper', x, 0.52, 0.22, 0.06, 0.1, 0.035); box('paper', x, 0.36, 0.22, 0.06, 0.08, 0.035); } face(0, 0.72, 0.05, 0.12, 0.058); },
  'party-animal'() { feet(); orb('yellow', 0, 0.43, 0, 0.22, 0.29, 0.19); orb('yellow', 0, 0.68, 0, 0.23, 0.21, 0.18); cone('blue', -0.23, 0.73, 0, 0.12, 0.23, [0, 0, 0.45]); cone('blue', 0.23, 0.73, 0, 0.12, 0.23, [0, 0, -0.45]); cone('red', 0, 1.0, 0, 0.14, 0.35); ring('paper', 0, 0.96, 0, 0.07, 0.015, [Math.PI / 2, 0, 0]); face(0, 0.71, 0.18); orb('pink', 0, 0.58, 0.2, 0.11, 0.08, 0.07); arms('yellow'); },
  'rocket-scientist'() { cyl('paper', 0, 0.5, 0, 0.16, 0.16, 0.61); cone('red', 0, 0.93, 0, 0.16, 0.27); cone('red', -0.18, 0.24, 0, 0.11, 0.3, [0, 0, -0.4], 4); cone('red', 0.18, 0.24, 0, 0.11, 0.3, [0, 0, 0.4], 4); cyl('yellow', 0, 0.56, 0.16, 0.14, 0.14, 0.055, [Math.PI / 2, 0, 0]); face(0, 0.58, 0.198, 0.055, 0.036); cone('yellow', 0, 0.1, 0, 0.1, 0.21, [0, 0, Math.PI]); cone('orange', 0, 0.07, 0, 0.06, 0.14, [0, 0, Math.PI]); },
  romantic() { feet('pink'); extrude('pink', [[0, 0.19], [-0.27, 0.56], [-0.25, 0.78], [-0.13, 0.88], [0, 0.79], [0.13, 0.88], [0.25, 0.78], [0.27, 0.56]], 0.2, [0, 0, -0.1]); face(0, 0.64, 0.13, 0.09, 0.049); rod('green', [0.25, 0.23, 0.03], [0.25, 0.62, 0.03], 0.016); for (let i = 0; i < 5; i++) orb('red', 0.25 + Math.cos(i * 1.25) * 0.038, 0.65 + Math.sin(i * 1.25) * 0.038, 0.03, 0.037); },
  scoocher() { feet(); orb('blue', -0.06, 0.55, 0, 0.18, 0.31, 0.17); box('yellow', 0.06, 0.25, 0.06, 0.43, 0.11, 0.29); face(-0.06, 0.66, 0.165, 0.07, 0.044); arms('blue', 0.43); rod('ink', [0.2, 0.3, 0], [0.25, 0.6, 0.05], 0.025); rod('ink', [0.17, 0.6, 0.05], [0.3, 0.6, 0.05], 0.021); },
  sisyphus() { feet('yellow', 0.13); orb('yellow', -0.11, 0.3, 0.05, 0.12, 0.18, 0.12); orb('yellow', -0.15, 0.54, 0.04, 0.115); face(-0.15, 0.56, 0.14, 0.046, 0.03); orb('blue', 0.1, 0.64, -0.02, 0.23, 0.25, 0.22); rod('yellow', [-0.1, 0.37, 0.1], [0.04, 0.54, 0.18], 0.035); tube('paper', [[0.01, 0.81, 0.1], [0.09, 0.86, 0.12], [0.17, 0.8, 0.15]], 0.012); },
  skipper() { person('blue'); cyl('paper', 0, 0.91, 0, 0.23, 0.2, 0.08); box('paper', 0, 0.98, 0, 0.27, 0.1, 0.2); box('ink', 0, 0.895, 0.16, 0.31, 0.025, 0.09); tube('paper', [[-0.13, 0.53, 0.12], [0, 0.39, 0.2], [0.13, 0.53, 0.12]], 0.015); ring('paper', 0, 0.28, 0.2, 0.045, 0.01); rod('paper', [0, 0.36, 0.2], [0, 0.23, 0.2], 0.011); },
  stickler() { feet(); box('yellow', 0, 0.51, 0, 0.29, 0.83, 0.23); box('blue', -0.065, 0.87, 0, 0.16, 0.12, 0.24); face(0.04, 0.63, 0.126, 0.06, 0.038); for (let i = 0; i < 5; i++) box('ink', -0.105, 0.32 + i * 0.09, 0.123, i % 2 ? 0.045 : 0.075, 0.012, 0.009); box('paper', 0.23, 0.62, 0, 0.12, 0.31, 0.04); rod('green', [0.2, 0.65, 0.025], [0.23, 0.62, 0.025], 0.009); rod('green', [0.23, 0.62, 0.025], [0.28, 0.7, 0.025], 0.009); },
  suckerfish() { feet('blue', 0.12); orb('blue', 0, 0.45, 0, 0.24, 0.18, 0.17); cone('pink', -0.23, 0.45, 0, 0.16, 0.18, [0, 0, -Math.PI / 2], 3); cone('pink', 0, 0.66, 0, 0.11, 0.2, [0, 0, 0.3], 3); face(0.07, 0.52, 0.145, 0.065, 0.044); ring('yellow', 0.21, 0.41, 0.13, 0.095, 0.035, [0, Math.PI / 4, 0]); orb('pink', 0.21, 0.41, 0.13, 0.062, 0.07, 0.02); },
  'third-wheel'() { ring('red', 0, 0.36, 0, 0.24, 0.068); ring('paper', 0, 0.36, 0.027, 0.15, 0.035); orb('yellow', 0, 0.36, 0.04, 0.06); for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; rod('ink', [0, 0.36, 0.04], [Math.cos(a) * 0.17, 0.36 + Math.sin(a) * 0.17, 0.04], 0.015); } orb('blue', 0, 0.76, 0, 0.18, 0.15, 0.15); face(0, 0.78, 0.14, 0.072, 0.043); },
  twin() { feet('ink', 0.16); for (const [d, color] of [[-1, 'pink'], [1, 'blue']]) { orb(color, d * 0.135, 0.35, 0, 0.14, 0.25, 0.14); orb(color, d * 0.135, 0.68, 0, 0.135, 0.17, 0.14); face(d * 0.135, 0.7, 0.135, 0.052, 0.033); } rod('yellow', [-0.13, 0.45, 0], [0.13, 0.45, 0], 0.04); },
};

// Blender keeps the original per-character silhouettes as editable named parts.
// This intermediate JSON is generated from the same established 36 designs.
if (process.argv.includes('--blender-source')) {
  const designs = [];
  for (const [id, build] of Object.entries(builders)) {
    root = new T.Group(); build(); root.updateMatrixWorld(true);
    designs.push({ id, parts: root.children.map((part, index) => ({
      name: `GEO-${id}-${String(index).padStart(2, '0')}`, type: part.geometry.type,
      parameters: part.geometry.parameters, color: part.material.name, role: part.userData.role,
      matrix: part.matrixWorld.toArray(),
      positions: [...part.geometry.attributes.position.array], indices: [...(part.geometry.index?.array ?? [])],
    })) });
  }
  const path = fileURLToPath(new URL('../tmp/blender-source.json', import.meta.url));
  await mkdir(fileURLToPath(new URL('../tmp/', import.meta.url)), { recursive: true });
  await writeFile(path, JSON.stringify({ colors, designs }));
  console.log(`Blender source: ${path}, ${designs.length} distinct character designs.`);
  process.exit(0);
}

const scene = new T.Scene(); scene.name = 'OriginalToyRacers';
const manifest = { version: 1, units: 'metres', up: '+Y', forward: '+Z', pivot: 'ground-centre', models: [] };
for (const [id, build] of Object.entries(builders)) {
  root = new T.Group(); build(); root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(root, true); const size = bounds.getSize(new T.Vector3());
  const factor = Math.min(1.015 / size.y, 0.59 / size.x, 0.59 / size.z);
  const centre = bounds.getCenter(new T.Vector3());
  const normalize = new T.Matrix4().makeScale(factor, factor, factor).multiply(new T.Matrix4().makeTranslation(-centre.x, -bounds.min.y, -centre.z));
  const paletteGroups = new Map();
  root.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    let geometry = object.geometry.clone().applyMatrix4(object.matrixWorld).applyMatrix4(normalize);
    if (geometry.index) geometry = geometry.toNonIndexed();
    geometry.deleteAttribute('uv');
    const collection = paletteGroups.get(object.material.name) ?? []; collection.push(geometry); paletteGroups.set(object.material.name, collection);
  });
  const mergedRoot = new T.Group(); mergedRoot.name = `toy_${id}`;
  let triangles = 0;
  for (const [name, geometries] of paletteGroups) {
    const geometry = mergeVertices(mergeGeometries(geometries), 0.0001); geometry.computeBoundingBox();
    const merged = new T.Mesh(geometry, Object.values(materials).find(material => material.name === name));
    merged.name = `${id}_${name}`; mergedRoot.add(merged); triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    geometries.forEach(item => item.dispose());
  }
  scene.add(mergedRoot);
  const exportedBounds = new T.Box3().setFromObject(mergedRoot, true); const exportedSize = exportedBounds.getSize(new T.Vector3());
  if (Math.abs(exportedBounds.min.y) > 0.00001 || exportedSize.x > 0.60001 || exportedSize.z > 0.60001 || exportedSize.y > 1.10001) throw new Error(`${id}: invalid model bounds`);
  manifest.models.push({ id, node: mergedRoot.name, triangles, draws: mergedRoot.children.length, bounds: exportedSize.toArray().map(v => Number(v.toFixed(4))), pivotY: 0 });
}

const output = fileURLToPath(new URL('../public/models/', import.meta.url)); await mkdir(output, { recursive: true });
const binary = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true });
await writeFile(`${output}/toy-racers.glb`, Buffer.from(binary));
manifest.bytes = binary.byteLength; manifest.totalTriangles = manifest.models.reduce((n, model) => n + model.triangles, 0);
const optimizer = process.argv[process.argv.indexOf('--optimizer') + 1];
if (process.argv.includes('--optimizer')) {
  if (!optimizer || optimizer.startsWith('--')) throw new Error('--optimizer requires the absolute path to @gltf-transform/cli/bin/cli.js');
  for (const command of ['dedup', 'prune', 'meshopt']) execFileSync(process.execPath, [optimizer, command, `${output}/toy-racers.glb`, `${output}/toy-racers.glb`], { stdio: 'inherit' });
  execFileSync(process.execPath, [optimizer, 'validate', `${output}/toy-racers.glb`], { stdio: 'inherit' });
  manifest.optimizedBytes = (await stat(`${output}/toy-racers.glb`)).size; manifest.compression = 'EXT_meshopt_compression';
}
await writeFile(`${output}/toy-racers.manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Exported ${manifest.models.length} toy models, ${manifest.totalTriangles} triangles, ${((manifest.optimizedBytes ?? manifest.bytes) / 1024).toFixed(1)} KiB. Ground pivots / dimensions valid.`);
