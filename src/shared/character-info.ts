import { CHARACTERS } from './characters.js';
import type { GameEvent, Racer, RacerFlags } from './types.js';

const knownCard = (id: unknown): id is string => typeof id === 'string' && CHARACTERS.some(card => card.id === id);

/** Project decisions stay separate from the quoted/translated card ability. */
export const COPY_ABILITY_PROJECT_NOTES:Readonly<Record<string,string>>={
  copycat:'只模仿领先选手的身份印刷能力，不沿对方已复制或额外获得的能力继续追踪；赛前时点不补发。一个动作内保留已经开始的效果。',
  egg:'从真实未选牌堆取得至多三张；不足时只回收公共弃牌，不补造角色。完成选择后候选回弃牌，保留已公开的能力来源记录。',
  twin:'继承所选历史冠军冲线时持有的主要能力，不包含其额外或临时附加能力，也不转移资源。同身份多次获冠时按具体场次选择。',
  understudy:'取得对方选手身份卡的印刷能力，可在当前赛前窗口继续处理新指令；同一选手已处理的同种赛前指令不重复开启。',
  mush:'抽到的能力额外保留至赛末；同文只生效一份。不补用已过去的触发窗口，也不因同名临时借用到期而删除。',
  doppelgangster:'按首位冲线者淘汰前的有效能力集合取一次快照；多个接收者取得同一快照，不继承目标的次数、资源或私人手牌。',
  'leaf-zombie':'采用以前失利选手的身份印刷能力，不打包该选手当时复制、额外获得或临时借来的能力；失利指该场未获冠亚军。',
  'leaf-thespian':'同一选手每回合每种借牌机制最多一次。抽到另一种借牌角色可在当前主骰前窗口继续，但不补发赛前手牌；所有临时子层在自身下回合开始失效。同名不叠加、不刷新次数。',
  'leaf-filmmaker':'临时取得本能力不补发七张赛前手牌。同一选手每回合每种借牌机制最多一次；抽到自己或已执行的同种机制不再次选牌。所有临时子层在自身下回合开始失效。',
  'extra-mile-shuffler':'只重分配本场选手身份印刷卡所得的主要能力；控制者、位置、额外或临时能力及既有对象仍留在原实例。Gary没有独立印刷卡，不加入洗牌池。',
};

/** Only already revealed choices belong in public racer information. Older saves
 * recorded the choice in a public copy event instead of a dedicated flag. Match
 * its exact original text; a current inherited power cannot prove the drawn card.
 */
export function publicCopyCardIds(racer: Racer, logs: readonly GameEvent[]): Pick<RacerFlags, 'eggCardId' | 'twinCardId'> {
  const result: Pick<RacerFlags, 'eggCardId' | 'twinCardId'> = {};
  for (const kind of ['egg', 'twin'] as const) {
    const field = kind === 'egg' ? 'eggCardId' : 'twinCardId';
    const stored = racer.flags[field];
    if (knownCard(stored)) { result[field] = stored; continue; }
    const event = logs.find(entry => entry.type === 'copy' && entry.source === racer.id && entry.cause === kind);
    if (!event) continue;
    if (knownCard(event.selectedCardId)) { result[field] = event.selectedCardId; continue; }
    const printedName = CHARACTERS.find(card => card.id === racer.characterId)?.nameZh ?? racer.characterId;
    const selected = CHARACTERS.find(card => event.text === `${printedName}本场复制${card.nameZh}`);
    if (selected) result[field] = selected.id;
  }
  return result;
}
