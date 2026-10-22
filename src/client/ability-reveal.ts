import type { GameEvent, RoomView } from '../shared/types.js';
import { CHARACTERS } from '../shared/characters.js';

const card = (id: string) => CHARACTERS.find(value => value.id === id);
export interface AbilityRevealData {
  eventId: number;
  racerId?: string;
  characterId?: string;
  recipient: string;
  title: string;
  powers: string[];
  source: string;
  duration: string;
  privateDrawCount?: number;
}

/** Read only the confirmed event payload. In particular, a later snapshot's
 * current abilities cannot describe what an earlier copy event granted. */
export function abilityRevealForEvent(event: GameEvent, room: RoomView): AbilityRevealData | undefined {
  if (!['copy', 'acquire', 'draw'].includes(event.type)) return;
  const racer = room.racers.find(value => value.id === event.source);
  const owner = room.players.find(value => value.id === racer?.playerId);
  const recipient = `${racer ? card(racer.characterId)?.nameZh ?? racer.characterId : '运动员'}${owner ? ` · ${owner.seat + 1}号${owner.name}` : ''}`;
  const base = {eventId:event.id,racerId:racer?.id,characterId:racer?.characterId,recipient};
  if (event.type === 'draw') {
    if (event.cause !== 'leaf-filmmaker') return;
    // Never render the event text or inspect a private hand, even if a caller
    // accidentally supplies selectedCardId or private flags alongside this draw.
    const privateDrawCount = Number(/(?:抽取|抽到)\s*(\d+)\s*张/.exec(event.text)?.[1] ?? 0);
    return {...base,title:'抽到私人手牌',powers:[],source:'来源：电影制作人赛前抽牌',duration:'手牌保留至本场结束 · 牌名仅本人可见',privateDrawCount};
  }
  const granted = event.grantedPowerIds;
  const powers = [...new Set((granted ?? (event.selectedCardId ? [event.selectedCardId] : [])).filter(id => !!card(id)))];
  const mechanism = event.cause ? card(event.cause)?.nameZh ?? '能力效果' : event.type === 'copy' ? '复制' : '抽取新能力';
  const targets = (event.targets ?? []).flatMap(id => {const target=room.racers.find(value=>value.id===id);return target ? [card(target.characterId)?.nameZh ?? target.characterId] : [];});
  const source = `来源：${mechanism}${targets.length ? ` · ${targets.join('、')}` : event.selectedCardId && card(event.selectedCardId) ? ` · ${card(event.selectedCardId)!.nameZh}卡` : ''}`;
  const duration = {race:'持续至本场结束','next-turn':'下次自身回合开始失效','source-change':'随复制目标变化'}[event.grantDuration ?? (event.cause === 'copycat' ? 'source-change' : ['leaf-thespian','leaf-filmmaker'].includes(event.cause ?? '') ? 'next-turn' : 'race')];
  return {...base,title:powers.length ? event.cause==='egg' ? '抽到新能力' : event.type === 'acquire' ? '获得额外能力' : '获得复制能力' : '本次未获得新能力',powers,source,duration};
}
