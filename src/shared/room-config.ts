import { CHARACTERS } from './characters.js';
import type { CharacterPool } from './types.js';

export const ROOM_CONFIG_VERSION = 'room-config-v1' as const;
export const CHARACTER_PACK_IDS = ['original', 'second-wind', 'extra-mile', 'leaf-fan', 'wurstii'] as const;
export type CharacterPackId = typeof CHARACTER_PACK_IDS[number];
export interface RoomConfig {
  version: typeof ROOM_CONFIG_VERSION;
  characterPacks: Record<Exclude<CharacterPackId, 'wurstii'>, boolean> & { wurstii?: boolean }; // Older v1 saves omit Wurstii.
  /** No independent optional scoring variants have been verified yet. */
  optionalRules: [];
}
export function legacyRoomConfig(pool: CharacterPool = 'original', practice = false): RoomConfig {
  return { version: ROOM_CONFIG_VERSION, characterPacks: { original: practice || pool !== 'second-wind', 'second-wind': practice || ['second-wind','mixed','all'].includes(pool), 'extra-mile': false, 'leaf-fan': false, wurstii: pool === 'wurstii' || pool === 'all' }, optionalRules: [] };
}
export function validateRoomConfig(value: unknown): RoomConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('角色包配置无效。');
  const config = value as Record<string, unknown>, packs = config.characterPacks;
  if (Object.keys(config).some(key => !['version','characterPacks','optionalRules'].includes(key)) || config.version !== ROOM_CONFIG_VERSION || !packs || typeof packs !== 'object' || Array.isArray(packs)) throw Error('角色包配置版本或字段无效。');
  const flags = packs as Record<string, unknown>;
  if (CHARACTER_PACK_IDS.some(id => !(id === 'wurstii' && flags[id] === undefined) && typeof flags[id] !== 'boolean') || Object.keys(flags).some(id => !CHARACTER_PACK_IDS.includes(id as CharacterPackId))) throw Error('角色包开关无效。');
  if (!Array.isArray(config.optionalRules) || config.optionalRules.length) throw Error('没有已核实的独立可选玩法，请勿提交未知玩法。');
  const result:RoomConfig = {version:ROOM_CONFIG_VERSION,characterPacks:Object.fromEntries(CHARACTER_PACK_IDS.map(id=>[id,flags[id] === true])) as Record<CharacterPackId,boolean>,optionalRules:[]};
  if (!enabledCharacterIds(result).length) throw Error('请至少启用一个含已完成角色的角色包。');
  return result;
}
export function enabledCharacterIds(config?: RoomConfig, legacyPool: CharacterPool = 'original', practice = false): string[] {
  const enabled = config ?? legacyRoomConfig(legacyPool, practice);
  return CHARACTERS.filter(character => {
    const edition: string = character.edition ?? 'original';
    const pack = edition === 'leaf' ? 'leaf-fan' : edition;
    return enabled.characterPacks[pack as CharacterPackId] === true;
  }).map(character => character.id);
}
export function requiredCharacterCount(players:number,practice=false):number { return practice?4:players===2?16:players*4; }
export function validateRoomConfigForPlayers(config:RoomConfig,players:number,practice=false):RoomConfig {
  const normalized=validateRoomConfig(config),available=enabledCharacterIds(normalized).length,required=requiredCharacterCount(players,practice);
  if(available<required)throw Error(`当前角色包共${available}名可用角色，${practice?'个人练习':`${players}人四场比赛`}至少需要${required}名，请启用更多角色包或减少房间人数。`);
  return normalized;
}
/** Compatibility projection for clients that still display the old selector. */
export function legacyPoolForConfig(config: RoomConfig): CharacterPool {
  return config.characterPacks.original ? config.characterPacks['second-wind'] ? 'mixed' : 'original' : 'second-wind';
}
export const MULTIPLAYER_ROOM_LIMIT = 30;
export const ROOM_CAPACITY_MESSAGE = '当前实时对战房间已满，请稍后重试。';
