import * as rulesV2 from './rules-v2.js';
import * as current from './index.js';
import * as legacy from './legacy-v1.js';
import * as secondWindV1 from './second-wind-v1.js';
import type { GameState, Racer } from '../shared/types.js';

/** These identifiers select executable rules, not just a displayed label.
 * Missing versions are saves created before Second Wind was installed. */
export const CURRENT_RULES_VERSION = 'cmyk-base-aug2026-fan-v3';
export const SECOND_WIND_V2_RULES_VERSION = 'cmyk-base-aug2026-sw-transcript-v2';
export const SECOND_WIND_V1_RULES_VERSION = 'cmyk-base-aug2026-sw-transcript-v1';
export const LEGACY_RULES_VERSION = 'legacy-base-v1';
export function rulesVersion(game: GameState): string { return game.rulesVersion ?? LEGACY_RULES_VERSION; }
export function hasRoomRules(game:GameState):boolean { return [CURRENT_RULES_VERSION,SECOND_WIND_V2_RULES_VERSION,SECOND_WIND_V1_RULES_VERSION,LEGACY_RULES_VERSION].includes(rulesVersion(game)); }
export function roomRules(game: GameState): Pick<typeof current, 'startGame' | 'applyGameAction' | 'automaticAction' | 'systemAction'> {
  const version = rulesVersion(game);
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
  return roomRules(game).systemAction(game);
}

export function publicAbilityState(game:GameState,racer:Racer) {
  return rulesVersion(game)===SECOND_WIND_V1_RULES_VERSION ? secondWindV1.abilityState(game,racer) : rulesVersion(game)===SECOND_WIND_V2_RULES_VERSION?rulesV2.abilityState(game,racer):current.abilityState(game,racer);
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
