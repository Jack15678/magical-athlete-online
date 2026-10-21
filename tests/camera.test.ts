import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from 'three';
import type { Racer, RoomView } from '../src/shared/types.js';
import type { PresentationBeat } from '../src/client/presentation.js';
import { actionFocus, advanceIntroStep, cameraFocusPoints, cameraFrame, cameraProject, cameraStep, cameraView, choiceFocus, claimRaceIntro, introFocus, introStepAt, INTRO_REDUCED_MS, INTRO_STEP_MS, ownFocus, pawnOccupancy, pawnWorldPoint, raceIntroEligible, raceIntroKey, resetRaceIntroForSetup, START_CENTER_OFFSET, START_EXTENSION, startPlacement } from '../src/client/scene/camera.js';
import { BOARD_CENTER_SPAN, boardPoint, TILE } from '../src/client/scene/math.js';

const racer = (id: string, playerId: string, position: number): Racer => ({ id, playerId, characterId: 'coach', position, tripped: false, finished: false, eliminated: false, flags: {} });
const racers = [racer('a', 'me', 2), racer('b', 'other', 14), racer('c', 'me', 7)];
const room: RoomView = { code: 'CAMERA', version: 1, hostId: 'me', selfId: 'me', maxPlayers: 8, timeoutSeconds: 0, deadline: null, phase: 'race', round: 1, track: 'wild', players: [], racers, currentRacerId: 'b', logs: [], results: [], rulesStatus: 'test' };
function beat(key: string, chainId: string, source: string, from: number, to: number): PresentationBeat {
  return { key, chainId, kind: 'move', source, targets: [source], motions: [{ racerId: source, from, to, path: Array.from({ length: to - from + 1 }, (_, index) => from + index) }], events: [], durationMs: 1000 };
}

test('the default camera follows my live racer and switches to my active racer', () => {
  assert.deepEqual(ownFocus(room, racers), { state: 'self', ids: ['a'], positions: [2] });
  assert.deepEqual(ownFocus({ ...room, currentRacerId: 'c' }, racers), { state: 'self', ids: ['c'], positions: [7] });
  assert.deepEqual(ownFocus(room, racers.map(value => ({ ...value, finished: value.id === 'a' }))).ids, ['c']);
});

test('spectators follow the current racer and retain a useful fallback when that racer is absent', () => {
  const watching = { ...room, role: 'spectator' as const, selfId: 'watcher' };
  assert.deepEqual(ownFocus(watching, racers), { state: 'self', ids: ['b'], positions: [14] });
  assert.deepEqual(ownFocus({ ...watching, currentRacerId: undefined }, racers).ids, ['a']);
  assert.deepEqual(ownFocus(watching, []).positions, [0]);
});

test('duo follow retains the last live own actor between turns and ignores finished actors', () => {
  const view = { ...room, logs: [{ id: 1, type: 'turn', source: 'c', text: 'second own actor' }] };
  assert.deepEqual(ownFocus(view, racers).ids, ['c']);
  assert.deepEqual(ownFocus({ ...view, currentRacerId: 'a' }, racers).ids, ['a']);
  assert.deepEqual(ownFocus({ ...view, currentRacerId: 'c' }, racers.map(value => ({ ...value, finished: value.id === 'c' }))).ids, ['a']);
});

test('distant swaps and reconnect gaps cannot cause an unbounded camera jump', () => {
  for (const delta of [1 / 120, 1 / 60, .05, 5]) for (const zoom of [30, 100, 160]) {
    const distance = 80, fraction = cameraStep(distance, zoom, delta);
    assert.ok(fraction > 0 && fraction <= 1);
    assert.ok(distance * fraction * zoom <= 720 * Math.min(delta, .05) + 1e-8, 'screen travel is bounded at 720 pixels/second');
  }
  assert.equal(cameraStep(80, 160, 5, true), 1, 'reduced motion applies the new frame directly');
});

test('one confirmed chain frames its actor, full movement path and reactions, excluding later turns', () => {
  const move = beat('move', 'turn1', 'b', 14, 20);
  const reaction = beat('reaction', 'turn1', 'a', 2, 4);
  const otherTurn = beat('later', 'turn2', 'c', 7, 30);
  const focus = actionFocus(move, racers, [move, reaction, otherTurn]);
  assert.equal(focus.chainId, 'turn1');
  assert.deepEqual(focus.ids, ['b', 'a']);
  assert.ok(focus.positions.includes(14) && focus.positions.includes(20) && focus.positions.includes(2) && focus.positions.includes(4));
  assert.ok(!focus.positions.includes(30));
});

test('a local pending choice shows all legal public targets and ignores another player choice', () => {
  const pending = { id: 'choice', playerId: 'me', racerId: 'a', title: '交换', kind: 'flip-flop', optional: true, options: [{ id: 'b', label: '对手' }, { id: 'c', label: '队友' }, { id: 'skip', label: '跳过' }] };
  assert.deepEqual(choiceFocus({ ...room, pending }, racers), { state: 'choice', ids: ['a', 'b', 'c'], positions: [2, 14, 7] });
  assert.equal(choiceFocus({ ...room, pending: { ...pending, playerId: 'other' } }, racers), undefined);
  assert.deepEqual(choiceFocus({ ...room, pending: { ...pending, kind: 'third-wheel', options: [{ id: '17', label: '17格' }, { id: '24', label: '24格' }] } }, racers)?.positions, [2, 17, 24]);
});

test('phone and desktop focus zoom in near me while panorama contains every track cell', () => {
  for (const [compact, width, height] of [[false, 1440, 900], [true, 390, 844]] as const) {
    const self = cameraFrame([2], compact, width, height);
    const overview = cameraFrame([], compact, width, height, true);
    assert.ok(self.zoom > overview.zoom, 'my nearby track must be larger than panorama');
    assert.ok(self.zoom > (compact ? 60 : 100), 'the default close-up must enlarge pawns beyond the previous framing');
    const actor = boardPoint(2, compact);
    assert.equal(self.x, actor[0]); assert.equal(self.z, actor[2]);
    for (let position = 0; position <= 30; position++) {
      const point = boardPoint(position, compact);
      assert.ok(Math.abs(point[0] - overview.x) * overview.zoom < width / 2 - 12);
      assert.ok(Math.abs(point[2] - overview.z) * .765 * overview.zoom < height / 2 - 80);
    }
    const action = cameraFrame([0, 12, 15, 30], compact, width, height);
    assert.ok(action.zoom < self.zoom, 'a distant chain should pull back to include its path');
    assert.ok(Number.isFinite(action.zoom) && action.zoom > 0);
  }
});

test('the toy-table view reveals model sides and uses matching real orthographic projection', () => {
  for (const compact of [false, true]) {
    const { offset } = cameraView(compact);
    const elevation = Math.atan2(offset[1], Math.hypot(offset[0], offset[2])) * 180 / Math.PI;
    assert.ok(elevation > 35 && elevation < 40, 'show both pawn faces and tile thickness');
    const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 100);
    camera.position.set(...offset); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    for (const point of [[3, 1, 2], [-8, 2.5, -3], [0, -1, 0]]) {
      const projected = new Vector3(...point).project(camera), expected = cameraProject(point, compact);
      assert.ok(Math.abs(projected.x - expected.x) < 1e-10);
      assert.ok(Math.abs(projected.y - expected.y) < 1e-10);
    }
    assert.equal(offset[0] === 0, compact, 'portrait keeps the long course upright; desktop adds a gentle diagonal');
  }
});

test('large displays respect the controls zoom limit so demand rendering can settle', () => {
  assert.equal(cameraFrame([2], false, 3840, 2160).zoom, 160);
  assert.equal(cameraFrame([2], false, 3840, 2160, false, undefined, true).zoom, 160);
});

test('overview includes the thick stadium perimeter and tall arch on desktop, phone and landscape phone', () => {
  for (const [compact, width, height] of [[false, 1440, 900], [true, 390, 844], [false, 844, 390]] as const) {
    const frame = cameraFrame([], compact, width, height, true);
    const { offset } = cameraView(compact);
    const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 100);
    camera.position.set(...offset); camera.lookAt(0, 0, 0); camera.zoom = frame.zoom;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const halfWidth = BOARD_CENTER_SPAN.width / 2 + TILE;
    const halfDepth = BOARD_CENTER_SPAN.depth / 2 + TILE * 1.1;
    for (const x of [-halfWidth, halfWidth]) for (const z of [-halfDepth, halfDepth]) for (const y of [-1.1, 2.8]) {
      const projected = new Vector3(...(compact ? [-z, y, x] : [x, y, z])).project(camera);
      assert.ok(Math.abs(projected.x) <= 1 - (compact ? 24 : 80) / width + 1e-10, 'the stadium sides fit inside horizontal margins');
      assert.ok(Math.abs(projected.y) <= 1 - (compact ? 235 : 190) / height + 1e-10, 'arch and base fit between the floating controls');
    }
    assert.equal(frame.x, 0); assert.equal(frame.z, 0);
  }
});

test('eight racers sharing one cell stay distinct at a readable pawn scale', () => {
  const crowd = Array.from({ length: 8 }, (_, index) => racer(String(index), String(index), 12));
  const placements = crowd.map(value => pawnOccupancy(value, crowd, 12));
  assert.equal(new Set(placements.map(value => `${value.x}:${value.z}`)).size, 8);
  for (const value of placements) {
    assert.ok(value.scale >= .95);
    assert.ok(Math.abs(value.x) + .33 * value.scale < TILE / 2 && Math.abs(value.z) + .33 * value.scale < TILE / 2, 'every enlarged pawn base stays on its own tile');
  }
  for (let i = 0; i < placements.length; i++) for (let j = i + 1; j < placements.length; j++) {
    assert.ok(Math.hypot(placements[i]!.x - placements[j]!.x, placements[i]!.z - placements[j]!.z) >= .67);
  }
  assert.ok(Math.abs(placements.reduce((sum, value) => sum + value.x, 0)) < 1e-10, 'an incomplete final row remains centered');
  assert.equal(pawnOccupancy(crowd[0]!, [crowd[0]!], 12).scale, 1.65);
});

test('the long starting cell holds eight full-size pawns without intersecting bases in either orientation', () => {
  for (const count of [1, 2, 4, 5, 8]) {
    const lineup = Array.from({ length: count }, (_, index) => racer(String(index), String(index), 0));
    const positions = lineup.map(value => startPlacement(value, lineup));
    assert.equal(new Set(positions.map(value => `${value.x}:${value.z}`)).size, count);
    for (let index = 0; index < count; index++) {
      const value = positions[index]!, compact = startPlacement(lineup[index]!, lineup, true);
      assert.equal(value.scale, 1.65, 'every entrant retains the same scale as a solitary racer');
      assert.ok(value.x - .33 * value.scale > -START_EXTENSION - .955 && value.x + .33 * value.scale < .955);
      assert.ok(Math.abs(value.z) + .33 * value.scale < 2.65 / 2, 'both rows stay inside the wider start platform');
      assert.equal(compact.x, -value.z); assert.equal(compact.z, value.x);
      assert.deepEqual(pawnOccupancy(lineup[index]!, lineup, 0, true), compact);
      for (let other = index + 1; other < count; other++) {
        assert.ok(Math.hypot(value.x - positions[other]!.x, value.z - positions[other]!.z) > .33 * (value.scale + positions[other]!.scale) + .2);
      }
    }
    const staggerMean = count > 4 ? .35 * (8 - count) / count : 0;
    assert.ok(Math.abs(positions.reduce((sum, value) => sum + value.x, 0) / count - START_CENTER_OFFSET - staggerMean) < 1e-10);
  }
});

test('phone opening portraits separate the long lineup with a fitted diagonal view then retain the original default pose', () => {
  const normal = cameraView(true), portrait = cameraView(true, true);
  assert.deepEqual(normal.offset, [0, 16, 20]);
  assert.deepEqual(portrait.offset, [-14, 18, 14]);
  const yaw = Math.atan2(portrait.offset[0], portrait.offset[2]) * 180 / Math.PI;
  assert.equal(yaw, -45);
  const rowSeparation = cameraProject([0, 0, 1.3], true, true);
  assert.ok(Math.abs(rowSeparation.x) > .9, 'each formerly hidden depth step also moves almost a pawn width sideways');
  const frame = cameraFrame([0], true, 390, 844, false, [[0, .22, 0]], true);
  const camera = new OrthographicCamera(-390 / 2, 390 / 2, 844 / 2, -844 / 2, .1, 100);
  camera.position.set(...portrait.offset); camera.lookAt(0, 0, 0); camera.zoom = frame.zoom;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  for (const x of [-.9, .9]) for (const z of [-.9, .9]) for (const y of [-.3, 2.65]) {
    const projected = new Vector3(x, y, z).project(camera), helper = cameraProject([x, y, z], true, true);
    assert.ok(Math.abs(projected.x * 390 / (2 * frame.zoom) - helper.x) < 1e-10);
    assert.ok(Math.abs(projected.y * 844 / (2 * frame.zoom) - helper.y) < 1e-10);
    assert.ok(Math.abs(projected.x) < 1 - 24 / 390 + 1e-10 && Math.abs(projected.y) < 1 - 235 / 844 + 1e-10);
  }
  assert.deepEqual(cameraView(true).offset, normal.offset, 'leaving an introduction restores the self/overview direction');
  assert.deepEqual(cameraView(false, true).offset, cameraView(false).offset, 'desktop introductions keep their established orientation');
});

test('self, actions and opening portraits frame visual starting positions without changing route numbers', () => {
  const lineup = Array.from({ length: 8 }, (_, index) => racer(`r${index}`, `p${index}`, 0));
  for (const compact of [false, true]) {
    const mine = ownFocus({ ...room, selfId: 'p6', currentRacerId: 'r0' }, lineup);
    const visual = pawnWorldPoint(lineup[6]!, lineup, 0, compact);
    const points = cameraFocusPoints(mine, lineup, compact);
    assert.deepEqual(points, [visual]);
    assert.deepEqual(mine.positions, [0], 'the engine still sees one starting cell');
    const frame = cameraFrame(mine.positions, compact, compact ? 390 : 1440, compact ? 844 : 900, false, points);
    assert.equal(frame.x, visual[0]); assert.equal(frame.z, visual[2]);
    const action = actionFocus(beat('depart', 'start', 'r6', 0, 3), lineup);
    assert.ok(cameraFocusPoints(action, lineup, compact).some(point => point[0] === visual[0] && point[2] === visual[2]));
    const portrait = introFocus(lineup, 6)!;
    const close = cameraFrame(portrait.positions, compact, compact ? 390 : 1440, compact ? 844 : 900, false, cameraFocusPoints(portrait, lineup, compact), true);
    assert.ok(close.zoom > frame.zoom * 1.15, 'the introduction provides a closer individual portrait');
  }
});

test('opening tour advances through every entrant, supports reduced motion and completes back to regular focus', () => {
  const lineup = Array.from({ length: 8 }, (_, index) => racer(`r${index}`, `p${index}`, 0));
  for (let index = 0; index < 8; index++) {
    const step = introStepAt(index * INTRO_STEP_MS, lineup.length)!;
    assert.equal(step, index);
    assert.deepEqual(introFocus(lineup, step)?.ids, [`r${index}`]);
  }
  assert.equal(introStepAt(8 * INTRO_STEP_MS, 8), undefined);
  assert.equal(introStepAt(0, 0), undefined);
  assert.deepEqual(introFocus(lineup, 0, true)?.ids, lineup.map(value => value.id));
  assert.equal(introStepAt(INTRO_REDUCED_MS - 1, 8, true), 0);
  assert.equal(introStepAt(INTRO_REDUCED_MS, 8, true), undefined);
});

test('opening tour timers advance even when fired a fraction before a boundary', () => {
  for (let index = 0; index < 7; index++) {
    const elapsed = (index + 1) * INTRO_STEP_MS - .2;
    assert.equal(introStepAt(elapsed, 8), index);
    assert.equal(advanceIntroStep(index, elapsed, 8), index + 1);
  }
  assert.equal(advanceIntroStep(7, 8 * INTRO_STEP_MS - .2, 8), undefined);
  assert.equal(advanceIntroStep(0, INTRO_STEP_MS * 4 + 50, 8), 4, 'a resumed background tab skips elapsed portraits');
  assert.equal(advanceIntroStep(0, INTRO_REDUCED_MS - .2, 8, true), undefined);
});

test('opening tours are claimed once per room and round, survive refresh and skip underway snapshots', () => {
  const lineup = [racer('a', 'me', 0), racer('b', 'other', 0)];
  const opening = { ...room, racers: lineup, logs: [{ id: 10, type: 'reveal', text: '选手亮相' }] };
  assert.equal(raceIntroEligible(opening, lineup), true);
  assert.equal(raceIntroEligible({ ...opening, phase: 'results' }, lineup), false);
  assert.equal(raceIntroEligible(opening, [lineup[0]!, { ...lineup[1]!, position: 1 }]), false);
  assert.equal(raceIntroEligible({ ...opening, logs: [...opening.logs, { id: 11, type: 'die', text: '已掷骰' }] }, lineup), false);
  assert.equal(raceIntroEligible({ ...opening, logs: [{ id: 9, type: 'die', text: '上场骰子' }, ...opening.logs] }, lineup), true);
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const key = raceIntroKey(opening), memory = new Set<string>();
  assert.equal(claimRaceIntro(key, storage, memory), true);
  assert.equal(claimRaceIntro(key, storage, memory), false);
  assert.equal(claimRaceIntro(key, storage, new Set()), false, 'a new document reads the persisted marker');
  assert.equal(claimRaceIntro(raceIntroKey({ ...opening, round: 2 }), storage, memory), true);
  const unavailable = { getItem: () => { throw Error('Storage disabled'); }, setItem: () => { throw Error('Storage disabled'); } };
  assert.equal(claimRaceIntro('private', unavailable, memory), true);
  assert.equal(claimRaceIntro('private', unavailable, memory), false);
});

test('same-room rematches reset old introductions during setup while race snapshots and other rooms retain their markers', () => {
  const values = new Map<string, string>(), memory = new Set<string>();
  const storage = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const own = raceIntroKey(room), otherRoom = raceIntroKey({ ...room, code: 'OTHER' }), otherPlayer = raceIntroKey({ ...room, selfId: 'other' });
  for (const key of [own, otherRoom, otherPlayer]) assert.equal(claimRaceIntro(key, storage, memory), true);
  assert.equal(resetRaceIntroForSetup(room, storage, memory), false);
  assert.equal(claimRaceIntro(own, storage, new Set()), false, 'a normal race snapshot or reconnect cannot replay the tour');
  assert.equal(resetRaceIntroForSetup({ ...room, phase: 'lobby', round: 0 }, storage, memory), true);
  assert.equal(claimRaceIntro(own, storage, memory), true, 'round one of a same-room rematch introduces the same roster again');
  assert.equal(claimRaceIntro(otherRoom, storage, memory), false);
  assert.equal(claimRaceIntro(otherPlayer, storage, memory), false);
  assert.equal(resetRaceIntroForSetup({ ...room, phase: 'selection' }, storage, memory), true);
  assert.equal(claimRaceIntro(own, storage, memory), true, 'repeated setup renders remain idempotent and do not affect an active race');
});
