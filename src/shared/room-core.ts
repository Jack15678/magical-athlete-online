import { createGame, startGame } from '../engine/index.js';
import { timeoutRoomAction, CURRENT_RULES_VERSION, LEGACY_RULES_VERSION, WURSTII_V1_RULES_VERSION, roomRules, rulesVersion, publicAbilityState } from '../engine/runtime.js';
import { MAX_SPECTATORS, PLAYER_COLORS, RULES_STATUS } from './constants.js';
import type { ActionEnvelope, GameAction, Player, Room, RoomView } from './types.js';
import type { RelayMember, RelayMetadata } from './relay.js';
import { personalRoom, roomExpiry, roomExpiryMessage } from './room-lifecycle.js';
import { legacyRoomConfig, legacyPoolForConfig, validateRoomConfig, validateRoomConfigForPlayers } from './room-config.js';
import { publicCopyCardIds } from './character-info.js';
import type { RandomSeed } from './random.js';

/** Pure room policy shared by browser authority and future server adapters.
 * Time and entropy are explicit inputs. This module imports no Node APIs. */
export function validateMetadata(meta: RelayMetadata): void {
  if (!meta) throw Error('房间元数据无效。');
  if (meta.config !== undefined) validateRoomConfig(meta.config);
  if (meta.configFrozen !== undefined && typeof meta.configFrozen !== 'boolean') throw Error('房间配置锁定状态无效。');
  if (meta.characterPool !== undefined && !['original','second-wind','mixed','wurstii','all'].includes(meta.characterPool)) throw Error('角色牌池无效。');
  if (meta.mode !== undefined && !['multiplayer','practice','ai'].includes(meta.mode)) throw Error('比赛模式无效。');
  if (!/^[A-Z2-9]{6}$/.test(meta.code) || !Number.isSafeInteger(meta.createdAt) || meta.createdAt < 0) throw Error('房间元数据无效。');
  if (!Number.isInteger(meta.maxPlayers) || meta.maxPlayers < (meta.mode==='practice'?1:2) || meta.maxPlayers > 8) throw Error('房间人数范围无效。');
  if(meta.config)validateRoomConfigForPlayers(meta.config,meta.maxPlayers,meta.mode==='practice');
  if (!Number.isInteger(meta.timeoutSeconds) || (meta.timeoutSeconds !== 0 && (meta.timeoutSeconds < 30 || meta.timeoutSeconds > 600))) throw Error('房间超时配置无效。');
  if (!Array.isArray(meta.members) || !meta.members.length || meta.members.length > meta.maxPlayers) throw Error('房间成员数量无效。');
  if (new Set(meta.members.map(m => m.id)).size !== meta.members.length || new Set(meta.members.map(m => m.seat)).size !== meta.members.length) throw Error('房间成员身份或座位重复。');
  for (const m of meta.members) {
    if (typeof m.id !== 'string' || !m.id.length || m.id.length > 100 || typeof m.name !== 'string' || !m.name.trim() || m.name.length > 20 || /[\p{Cc}\p{Cf}]/u.test(m.name)) throw Error('房间成员信息无效。');
    if (!Number.isInteger(m.seat) || m.seat < 0 || m.seat >= meta.maxPlayers || typeof m.connected !== 'boolean') throw Error('房间成员座位无效。');
    if (m.renameUsed !== undefined && typeof m.renameUsed !== 'boolean') throw Error('改名次数信息无效。');
  }
  if (meta.spectators !== undefined) {
    if (!Array.isArray(meta.spectators) || meta.spectators.length > MAX_SPECTATORS) throw Error('观战人数无效。');
    const ids = new Set(meta.members.map(m => m.id));
    for (const spectator of meta.spectators) {
      if (!spectator || typeof spectator.id !== 'string' || !spectator.id.length || spectator.id.length > 100 || ids.has(spectator.id) || typeof spectator.name !== 'string' || !spectator.name.trim() || spectator.name.length > 20 || /[\p{Cc}\p{Cf}]/u.test(spectator.name) || typeof spectator.connected !== 'boolean') throw Error('观战身份无效。');
      ids.add(spectator.id);
    }
  }
  if(meta.members.some(m=>m.isAI!==undefined&&typeof m.isAI!=='boolean')||meta.members.find(m=>m.id===meta.authorityId)?.isAI||meta.members.find(m=>m.id===meta.adminHostId)?.isAI)throw Error('AI不能成为房主或计算设备。');
  if(meta.mode==='practice'&&(meta.maxPlayers!==1||meta.members.length!==1||meta.members[0]?.isAI))throw Error('练习模式只允许自己参加。');
  if (!meta.members.some(m => m.id === meta.authorityId) || !meta.members.some(m => m.id === meta.adminHostId)) throw Error('主持设备或房主管理身份无效。');
  if(meta.ownerId!==undefined&&!meta.members.some(member=>member.id===meta.ownerId&&!member.isAI))throw Error('生命周期房主身份无效。');
}
export function memberPlayer(member: RelayMember): Player {
  return { ...member, connected:!!member.isAI||member.connected, color: PLAYER_COLORS[member.seat]!, ready: false, score: 0, hand: [], used: [], selection: [] };
}
export function createBrowserRoom(meta: RelayMetadata, seed: RandomSeed, now: number): Room {
  validateMetadata(meta);
  if (meta.phase !== 'lobby') throw Error('主持设备没有这局的本地存档，无法恢复已开始的比赛。请创建新房间。');
  const room:Room = { mode:meta.mode??'multiplayer', code: meta.code, hostId: meta.adminHostId, ownerId:meta.ownerId??meta.authorityId,hostLeftAt:meta.hostLeftAt,createdAt: meta.createdAt, updatedAt: now, version: 1, maxPlayers: meta.maxPlayers, timeoutSeconds: meta.timeoutSeconds, deadline: null,
    spectators: structuredClone(meta.spectators ?? []), game: createGame([...meta.members].sort((a,b) => a.seat-b.seat).map(memberPlayer), seed,meta.mode,meta.characterPool) };
  room.game.config = meta.config ? validateRoomConfig(meta.config) : legacyRoomConfig(meta.characterPool,meta.mode==='practice');
  room.configFrozen = !!meta.configFrozen;
  if(meta.mode==='practice'||meta.mode==='ai'){room.game.players.forEach(p=>p.ready=true);startGame(room.game);room.configFrozen=true;setRoomDeadline(room,now);}
  return room;
}
/** Reconcile relay-owned roster and confirmed ownership. A local transfer's
 * receipt is replayed separately until the relay confirms its new owner. */
export function reconcileRoster(original: Room, meta: RelayMetadata, now: number): { room: Room; changed: boolean } {
  validateMetadata(meta);
  if (original.code !== meta.code || original.createdAt !== meta.createdAt || original.maxPlayers !== meta.maxPlayers || original.timeoutSeconds !== meta.timeoutSeconds || (original.mode??'multiplayer')!==(meta.mode??'multiplayer')) throw Error('房间配置与本地存档不一致，无法覆盖。');
  const room = structuredClone(original);
  // Keep the committed tombstone available to replay a lost close receipt, but
  // never let a reconnect or administrative transfer reopen the room.
  if (room.closedAt !== undefined) return { room, changed: false };
  let changed = false;
  if (room.game.rulesVersion === undefined) { room.game.rulesVersion = LEGACY_RULES_VERSION; changed = true; }
  const ownerId=meta.ownerId??meta.authorityId;
  if(room.ownerId!==ownerId){room.ownerId=ownerId;changed=true;}
  if(room.hostId!==meta.adminHostId){room.hostId=meta.adminHostId;changed=true;}
  if(room.hostLeftAt!==meta.hostLeftAt){room.hostLeftAt=meta.hostLeftAt;changed=true;}
  // Only an explicit lobby leave removes a relay identity. Disconnections keep
  // members in metadata, preserving their seat and preparation preference.
  if (room.game.phase === 'lobby') {
    const retained = room.game.players.filter(p => meta.members.some(m => m.id === p.id));
    if (retained.length !== room.game.players.length) { room.game.players = retained; changed = true; }
  }
  if (JSON.stringify(room.spectators ?? []) !== JSON.stringify(meta.spectators ?? [])) { room.spectators = structuredClone(meta.spectators ?? []); changed = true; }
  for (const member of [...meta.members].sort((a,b) => a.seat-b.seat)) {
    const p = room.game.players.find(p => p.id === member.id);
    if (!p) {
      if (room.game.phase !== 'lobby') throw Error('比赛已经开始，新访客不能加入锁定的参赛席位。');
      if (room.game.players.some(p => p.seat === member.seat)) throw Error('新成员的座位已被占用。');
      room.game.players.push(memberPlayer(member)); changed = true;
    } else {
      if (p.seat !== member.seat || !!p.isAI!==!!member.isAI) throw Error('已加入成员的固定身份信息发生变化。');
      if (p.name !== member.name) { p.name = member.name; changed = true; }
      if (!!p.renameUsed !== !!member.renameUsed) { p.renameUsed = !!member.renameUsed; changed = true; }
      if (p.connected !== (member.isAI||member.connected)) { p.connected = !!member.isAI||member.connected; changed = true; }
    }
  }
  // A transiently absent connection never removes its identity or resets a hand.
  for (const p of room.game.players) if (!meta.members.some(m => m.id === p.id) && !p.isAI && p.connected) { p.connected = false; changed = true; }
  if (changed && room.game.phase === 'lobby') room.game.players.sort((a,b) => a.seat-b.seat);
  if (changed) { room.version++; room.updatedAt = now; }
  return { room, changed };
}
export function setRoomDeadline(room: Room, now: number): void {
  room.deadline = room.closedAt === undefined && room.timeoutSeconds > 0 && timeoutRoomAction(room.game) ? now + room.timeoutSeconds*1000 : null;
}
export interface ReductionOptions { now: number; rematchSeed: RandomSeed; automatic?: boolean }
export function reduceRoomAction(original: Room, playerId: string, action: GameAction, options: ReductionOptions): Room {
  if (options.now >= roomExpiry(original)) throw Error(roomExpiryMessage(original));
  if (original.closedAt !== undefined) throw Error('房间已解散，请创建或加入其他房间。');
  const room = structuredClone(original); const p = room.game.players.find(p => p.id === playerId);
  room.game.rulesVersion ??= LEGACY_RULES_VERSION;
  if (!p) throw Error('你不在这个房间的参赛席位中。');
  if (options.automatic) {
    if(action.type==='choose'&&room.game.pending?.kind==='duel-roll'&&!p.isAI)throw Error('真人决斗投掷必须等待本人点击。');
    room.game.logs.push({ id: (room.game.logs.at(-1)?.id ?? 0)+1, type:'timeout', text:`${p.name}操作超时，按公开房规执行合法默认选择。` });
  }
  switch (action.type) {
    case 'configure':
      if (room.hostId !== playerId) throw Error('只有房主能修改角色包与玩法。');
      if (room.game.phase !== 'lobby' && room.game.phase !== 'finished') throw Error('本局已经开始，角色包与玩法已冻结。');
      { const config = validateRoomConfigForPlayers(action.config,room.maxPlayers,room.mode==='practice');
      // Only an explicit pre-draft edit upgrades an older executable rule set.
      // Preserve its secret entropy rather than resetting it to a public seed.
      if(room.game.phase==='lobby'&&rulesVersion(room.game)!==CURRENT_RULES_VERSION){
        const previous=room.game;room.game=createGame(previous.players,0,room.mode,legacyPoolForConfig(config));
        room.game.rngState=previous.rngState;room.game.randomStream=structuredClone(previous.randomStream);room.game.randomLog=structuredClone(previous.randomLog);
      }
      room.game.config = config;
      room.game.characterPool = legacyPoolForConfig(room.game.config);
      room.configFrozen = false;
      room.game.players.forEach(player => player.ready = !!player.isAI);
      break; }
    case 'close':
      if (room.hostId !== playerId) throw Error('只有房主能结束房间。');
      room.closedAt = options.now;room.closeReason='dismissed'; break;
    case 'ready':
      if (room.game.phase !== 'lobby') throw Error('只能在大厅准备。');
      p.ready = action.ready; break;
    case 'start':
      if (room.hostId !== playerId) throw Error('只有房主能开始比赛。');
      if(room.game.config)validateRoomConfigForPlayers(room.game.config,room.game.players.length,room.mode==='practice');
      if (room.game.phase !== 'lobby' || room.game.players.length < (room.mode==='practice'?1:2) || !room.game.players.every(p => p.ready && p.connected)) throw Error('需要至少2名玩家，且全员在线并准备。');
      roomRules(room.game).startGame(room.game); room.configFrozen = true; break;
    case 'transfer':
      if (room.hostId !== playerId) throw Error('只有房主能移交管理权。');
      if (!room.game.players.some(p => p.id === action.playerId && p.connected&&!p.isAI)) throw Error('请选择在线玩家。');
      room.hostId = action.playerId;room.ownerId=action.playerId;delete room.hostLeftAt;break;
    case 'rematch':
      if (room.hostId !== playerId || room.game.phase !== 'finished') throw Error('终局后由房主再来一局。');
      { const config = structuredClone(room.game.config ?? legacyRoomConfig(room.game.characterPool,room.mode==='practice'));
      room.game = createGame(room.game.players.map(p => ({ ...p, renameUsed:false, renameRequestId:undefined, ready:!!p.isAI, score:0, hand:[], used:[], selection:[] })), options.rematchSeed,room.mode,room.game.characterPool);
      room.game.config = config;room.configFrozen=false;
      if(room.mode==='practice'||room.mode==='ai'){room.game.players.forEach(p=>p.ready=true);startGame(room.game);room.configFrozen=true;}break; }
    default: roomRules(room.game).applyGameAction(room.game, playerId, action);
  }
  room.version++; room.updatedAt = options.now; setRoomDeadline(room, options.now);
  return room;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('操作格式不正确。');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw Error('操作包含无法识别的字段。');
}
function string(value: unknown, max = 100): string {
  if (typeof value !== 'string' || !value.length || value.length > max) throw Error('操作参数格式不正确。'); return value;
}
/** Canonical field order makes retransmission intent comparison independent of
 * a client's JSON property insertion order. Unexpected fields are rejected. */
export function validateActionEnvelope(value: unknown): ActionEnvelope {
  const e = object(value); keys(e, ['actionId','expectedVersion','action']);
  const actionId = string(e.actionId); if (!/^[a-zA-Z0-9_-]{1,100}$/.test(actionId)) throw Error('操作编号格式不正确。');
  if (!Number.isSafeInteger(e.expectedVersion) || Number(e.expectedVersion) < 0) throw Error('状态版本格式不正确。');
  const a = object(e.action); let action: GameAction;
  switch (a.type) {
    case 'configure': keys(a,['type','config']); action={type:'configure',config:validateRoomConfig(a.config)}; break;
    case 'ready': keys(a,['type','ready']); if (typeof a.ready !== 'boolean') throw Error('准备状态无效。'); action={type:'ready',ready:a.ready}; break;
    case 'start': case 'roll': case 'next': case 'rematch': case 'close': keys(a,['type']); action={type:a.type}; break;
    case 'draft': keys(a,['type','characterId']); action={type:'draft',characterId:string(a.characterId,50)}; break;
    case 'practice-team':
      keys(a,['type','characterIds']);if(!Array.isArray(a.characterIds)||a.characterIds.length!==4)throw Error('请选择4张练习角色牌。');
      action={type:'practice-team',characterIds:a.characterIds.map(id=>string(id,50))};break;
    case 'select':
      keys(a,['type','characterIds']); if (!Array.isArray(a.characterIds) || a.characterIds.length < 1 || a.characterIds.length > 2) throw Error('请选择本场所需角色。');
      action={type:'select',characterIds:a.characterIds.map(id => string(id,50))}; break;
    case 'choose': keys(a,['type','choiceId','optionId']); action={type:'choose',choiceId:string(a.choiceId),optionId:string(a.optionId)}; break;
    case 'transfer': keys(a,['type','playerId']); action={type:'transfer',playerId:string(a.playerId)}; break;
    default: throw Error('无法识别这个操作。');
  }
  return { actionId, expectedVersion:Number(e.expectedVersion), action };
}
export interface ProjectionOptions { authorityId: string; authorityOnline: boolean }
function publicRacerFlags(flags: Room['game']['racers'][number]['flags']) {
  return Object.fromEntries(Object.entries(structuredClone(flags)).filter(([key]) => key !== 'cheatahSecret' && key !== 'acquiredPowerSources' && !key.toLowerCase().startsWith('secret')));
}
export function projectRoom(room: Room, playerId: string, options: ProjectionOptions): RoomView {
  const spectator = room.spectators?.some(p => p.id === playerId) ?? false;
  if (!room.game.players.some(p => p.id === playerId) && !spectator) throw Error('你不在这个房间的参赛席位中。');
  const g=room.game, pending=g.pending;
  const expiry=roomExpiry(room);
  // The original frozen engine only knows its 36 base cards, even in practice
  // or when a later client previously wrote a broader legacy pool hint.
  const version=rulesVersion(g);
  const config=version===LEGACY_RULES_VERSION?legacyRoomConfig('original'):version===WURSTII_V1_RULES_VERSION?legacyRoomConfig(room.mode==='practice'?'all':g.characterPool):g.config??legacyRoomConfig(g.characterPool,room.mode==='practice');
  return { config:structuredClone(config),configFrozen:g.phase==='finished'?false:room.configFrozen??g.phase!=='lobby',characterPool:g.characterPool??'original',rulesVersion:rulesVersion(g),chat:structuredClone(room.chat?.messages??[]),chatLatestId:room.chat?.latestId??0,renameRemaining:spectator?0:g.players.find(p=>p.id===playerId)?.renameUsed?0:1,role:spectator?'spectator':'player',spectators:structuredClone(room.spectators??[]),createdAt:room.createdAt,expiresAt:room.hostLeftAt===undefined?undefined:expiry,ownerId:room.ownerId??room.hostId,hostLeftAt:room.hostLeftAt,closeReason:room.closeReason,mode:room.mode??'multiplayer',turnStage:g.phase==='race'?(pending?'choice':g.flags.needsBegin?'starting':g.flags.awaitRoll?'roll':'resolving'):undefined, code:room.code, version:room.version, hostId:room.hostId, selfId:playerId, maxPlayers:room.maxPlayers, timeoutSeconds:room.timeoutSeconds, deadline:room.deadline,
    phase:g.phase, round:g.round, track:g.track, hosting:'browser', authorityId:options.authorityId, authorityOnline:room.closedAt === undefined && options.authorityOnline, ...(room.closedAt === undefined ? {} : {closedAt:room.closedAt}),
    players:g.players.map(({hand,selection,renameRequestId,...p}) => ({ ...p, handCount:hand.length, selected:selection.length>0, ...(p.id===playerId ? {hand:[...hand],selection:[...selection]} : {}) })),
    draft:g.draft ? structuredClone(g.draft) : undefined, racers:g.racers.map(r=>({...structuredClone(r),flags:{...publicRacerFlags(r.flags),...publicCopyCardIds(r,g.logs),publicAbilities:publicAbilityState(g,r)}})), baseTurnOrder:g.baseTurnOrder?[...g.baseTurnOrder]:undefined, currentRacerId:g.currentRacerId,
    pending:pending?.playerId===playerId ? {id:pending.id,playerId:pending.playerId,racerId:pending.racerId,title:pending.title,options:structuredClone(pending.options),optional:pending.optional,kind:pending.kind} : undefined,
    waitingFor:pending?.playerId,waitingPrompt:pending?{playerId:pending.playerId,racerId:pending.racerId,kind:pending.kind}:undefined, logs:structuredClone(g.logs.slice(-120)), results:structuredClone(g.results), lastRoll:g.lastRoll ? {...g.lastRoll} : undefined, rulesStatus:typeof (g.flags.ruleHold as {message?:unknown}|undefined)?.message==='string'?String((g.flags.ruleHold as {message:string}).message):RULES_STATUS };
}
