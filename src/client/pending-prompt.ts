import { CHARACTERS } from '../shared/characters.js';
import type { RoomView } from '../shared/types.js';
export function pendingActionLabel(kind:string) {
  const fan:Record<string,string>={
    'em-cletus-target':'Cletus：选择对掷目标','em-cletus-roll':'Cletus：掷对抗骰',
    'em-gift-roll':'圣诞老人送礼：掷技能骰并移动','em-witch-self':'女巫：分配前进与后退','em-witch-target':'女巫：选择一名后退目标',
    'em-fox':'狐狸先生：决定是否阻止技能','em-heads':'硬币头：保留或翻转骰面','em-bully-recover':'校园恶霸：掷起身技能骰',
    'em-honey-roll':'蜜罐：掷技能骰取蜜','em-toddler-roll':'熊孩子：掷技能范围骰','em-marksman-roll':'神射手：追加技能骰',
    'leaf-gift-die':'巨嘴鸟赠骰：选择本次主移动骰','leaf-philanthropist-target':'慈善家：选择受赠选手','leaf-philanthropist-die':'慈善家赠骰：选择本次主移动骰',
    'leaf-film-card':'电影角色：秘密选择展示与复制的卡牌',
  };
  if(fan[kind])return fan[kind];
  if(/cletus.*roll|duel-roll/.test(kind))return '掷对抗骰';
  if(/roll|dice|die/.test(kind))return '掷技能骰或选择骰子';
  if(/witch|split|allocat/.test(kind))return '分配前进与后退';
  if(/fox|react|cancel|block/.test(kind))return '决定是否阻止技能';
  return '选择技能目标或选项';
}
/** Only public identity, kind and racer data. Private titles/options stay private. */
export function pendingPrompt(room:RoomView):string|undefined {
  const prompt=room.waitingPrompt??room.pending;
  if(!prompt)return room.waitingFor?`等待 ${room.players.find(player=>player.id===room.waitingFor)?.name??'其他玩家'} 响应技能`:undefined;
  const player=room.players.find(player=>player.id===prompt.playerId),racer=room.racers.find(racer=>racer.id===prompt.racerId);
  const name=CHARACTERS.find(character=>character.id===racer?.characterId)?.nameZh;
  return `${prompt.playerId===room.selfId&&room.role!=='spectator'?'请你操作':'等待 '+(player?.name??'选手')} · ${player?player.seat+1+'号 · ':''}${name?name+' · ':''}${pendingActionLabel(prompt.kind)}`;
}
