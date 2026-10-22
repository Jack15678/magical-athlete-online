import * as rulesV2 from './rules-v2.js';
import * as current from './index.js';
import * as wurstiiV1 from './wurstii-v1.js';
import { WURSTII_V1_RULES_VERSION } from '../shared/rules-versions.js';
export { WURSTII_V1_RULES_VERSION };
export { SECOND_WIND_RULES_VERSION } from '../shared/rules-versions.js';
import * as legacy from './legacy-v1.js';
import * as secondWindV1 from './second-wind-v1.js';
import { CHARACTERS } from '../shared/characters.js';
import type { GameState, PublicAbilityEntry, PublicAbilityState, Racer } from '../shared/types.js';

/** These identifiers select executable rules, not just a displayed label.
 * Missing versions are saves created before Second Wind was installed. */
export const CURRENT_RULES_VERSION = 'cmyk-base-aug2026-fan-v3';
export const SECOND_WIND_V2_RULES_VERSION = 'cmyk-base-aug2026-sw-transcript-v2';
export const SECOND_WIND_V1_RULES_VERSION = 'cmyk-base-aug2026-sw-transcript-v1';
export const LEGACY_RULES_VERSION = 'legacy-base-v1';
export function rulesVersion(game: GameState): string { return game.rulesVersion ?? LEGACY_RULES_VERSION; }
export function hasRoomRules(game:GameState):boolean { return [CURRENT_RULES_VERSION,WURSTII_V1_RULES_VERSION,SECOND_WIND_V2_RULES_VERSION,SECOND_WIND_V1_RULES_VERSION,LEGACY_RULES_VERSION].includes(rulesVersion(game)); }
export function roomRules(game: GameState): Pick<typeof current, 'startGame' | 'applyGameAction' | 'automaticAction' | 'systemAction'> {
  const version = rulesVersion(game);
  if (version === WURSTII_V1_RULES_VERSION) return wurstiiV1;
  if (version === LEGACY_RULES_VERSION) return legacy;
  if (version === SECOND_WIND_V1_RULES_VERSION) return secondWindV1;
  if (version === SECOND_WIND_V2_RULES_VERSION) return rulesV2;
  if (version === CURRENT_RULES_VERSION) return current;
  throw Error(`此对局使用暂不支持的规则版本 ${version}，请使用兼容版本继续此局。`);
}
export function automaticRoomAction(game: GameState) {
  if (!hasRoomRules(game)) return;
  return roomRules(game).automaticAction(game);
}
export function systemRoomAction(game: GameState) {
  if (!hasRoomRules(game)) return;
  if (game.mode !== 'practice' && game.phase === 'draft' && game.draft?.market.length === 1) return automaticRoomAction(game);
  return roomRules(game).systemAction(game);
}

const publicCardIds=new Set(CHARACTERS.map(card=>card.id));
const publicPowerIds=(value:unknown):string[]=>Array.isArray(value)?[...new Set(value.filter((id):id is string=>typeof id==='string'&&publicCardIds.has(id)))]:[];
const publicString=(value:unknown):string|undefined=>typeof value==='string'?value:undefined;
const publicCard=(value:unknown):string|undefined=>typeof value==='string'&&publicCardIds.has(value)?value:undefined;
export function publicAbilityState(game:GameState,racer:Racer):PublicAbilityState {
  const raw=rulesVersion(game)===WURSTII_V1_RULES_VERSION ? wurstiiV1.abilityState(game,racer) : rulesVersion(game)===SECOND_WIND_V1_RULES_VERSION ? secondWindV1.abilityState(game,racer) : rulesVersion(game)===SECOND_WIND_V2_RULES_VERSION?rulesV2.abilityState(game,racer):current.abilityState(game,racer);
  // Frozen engines retain their original flag shapes. Project a typed allowlist
  // rather than leaking arbitrary stored metadata into a new detail component.
  const state:Record<string,unknown>=raw;
  const entries:PublicAbilityEntry[]|undefined=Array.isArray(state.entries)?state.entries.flatMap((value:unknown)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return[];
    const entry=value as Record<string,unknown>,id=publicCard(entry.id);
    if(!id||!['printed','copy','draw','acquired','temporary'].includes(String(entry.origin))||!['race','next-turn','source-change'].includes(String(entry.duration)))return[];
    return[{id,origin:entry.origin as PublicAbilityEntry['origin'],duration:entry.duration as PublicAbilityEntry['duration'],
      ...(publicCard(entry.sourceCardId)?{sourceCardId:publicCard(entry.sourceCardId)}:{}),
      ...(publicString(entry.sourceRacerId)?{sourceRacerId:publicString(entry.sourceRacerId)}:{}),
      ...(publicCard(entry.via)?{via:publicCard(entry.via)}:{})}];
  }):undefined;
  return{powers:publicPowerIds(state.powers),disabledBy:Array.isArray(state.disabledBy)?state.disabledBy.filter((id):id is string=>typeof id==='string'):[],
    copiedFrom:publicString(state.copiedFrom),acquired:publicPowerIds(state.acquired),krakenRemaining:typeof state.krakenRemaining==='number'?state.krakenRemaining:1,
    form:publicString(state.form)??'normal',mount:publicString(state.mount),stepTargetId:publicString(state.stepTargetId),stepTargetControllerId:publicString(state.stepTargetControllerId),
    ...(Array.isArray(state.ownedPowers)?{ownedPowers:publicPowerIds(state.ownedPowers)}:{}),...(entries?{entries}:{})};
}

/** Deadline-only policy. Never use this to advance a human choice immediately.
 * Existing manual Duelist rolls remain protected; other decisions follow the
 * public skip/keep/first-legal fallback and are logged by the room reducer. */
export function timeoutRoomAction(game:GameState){
  if(!hasRoomRules(game))return;
  if(rulesVersion(game)!==CURRENT_RULES_VERSION)return automaticRoomAction(game);
  const pending=game.pending;
  if(pending){
    const player=game.players.find(p=>p.id===pending.playerId);
    if(['duel-roll','em-cletus-roll'].includes(pending.kind)&&!player?.isAI)return;
    const option=pending.options.find(o=>o.id==='skip')??pending.options.find(o=>o.id==='keep')??pending.options.find(o=>o.id==='allow')??pending.options[0];
    if(option)return{playerId:pending.playerId,action:{type:'choose' as const,choiceId:pending.id,optionId:option.id}};
  }
  return automaticRoomAction(game);
}
