import type { CharacterData } from './characters.js';

/** Wurstii v1.0, the 30 category-A cards selected from the user's PDFs.
 * These are project adaptations, not CMYK / Second Wind official cards. */
type Card = [id: string, nameEn: string, nameZh: string, page: number, ability: string, timing: string[], optional?: boolean];
const cards: Card[] = [
  ['bart-simpson', 'Bart Simpson', '巴特·辛普森', 1, '自己首次回合开始时，指定另一名在赛选手。本场主移动时，若该选手仍在赛且在你前方，移动距离+2。', ['turn-start', 'main-modifier']],
  ['bucky-ohare', 'Bucky O’Hare', '巴基兔', 3, '其他在赛选手回合结束时，若其位于5、10、15、20或25格，你前进1格。', ['turn-end']],
  ['bullet-bill', 'Bullet Bill', '炮弹刺客', 3, '自己回合开始时，若已有其他选手完赛，你前进8格。每场只发动一次。', ['turn-start']],
  ['chip-n-dale', 'Chip ’n Dale', '奇奇与蒂蒂', 4, '主移动的最终骰面为5或6时，本次主移动距离+2；骰面不变。', ['main-roll-final']],
  ['diddy-kong', 'Diddy Kong', '迪迪刚', 4, '每回合可将自己的主移动骰重掷至多3次，使用最后保留的骰面。你的移动必须恰好到30格才完赛；超过时停在29格。传送不受此移动限制。', ['reroll-window', 'main-move'], true],
  ['dixie-kong', 'Dixie Kong', '迪克西刚', 4, '每回合可将自己的主移动骰重掷一次，使用最后保留的骰面。舍弃的骰面不触发最终骰面能力。', ['reroll-window'], true],
  ['dr-wily', 'Dr. Wily', '威利博士', 5, '赛前预测本场亚军，可以预测自己。比赛结束时若猜中，获得3分。已完赛或淘汰仍可结算，但届时失去此能力或被禁能则不触发。', ['before-race', 'race-end']],
  ['dry-bones', 'Dry Bones', '枯骨龟', 5, '其他在赛选手回合结束于5、10、15、20或25格时，其控制者失去1分，最低为0。每名选手每场只触发一次，包括同一玩家的队友。', ['turn-end']],
  ['eric', 'Eric', '埃里克', 6, '若从5、10、15、20或25格开始回合，以基础移动6格代替主骰；仍受移动修正影响。倒地时先起身，不执行这次主移动。', ['before-main']],
  ['falco-lombardi', 'Falco Lombardi', '法尔科', 6, '计算主移动时，每有一名在赛选手位于你前方，本次主移动距离+1。', ['main-modifier']],
  ['frogger', 'Frogger', '过河蛙', 6, '向前或向后移动时，跳过5、10、15、20和25格，这些格不消耗步数；传送不跳格。', ['main-move']],
  ['hoagie', 'Hoagie', '霍吉', 8, '从24格起跑。每次主动作以基础移动1格代替掷骰，仍受移动修正影响；倒地时先起身。起始放置不触发赛道格。', ['before-race', 'before-main']],
  ['jason-vorhees', 'Jason Vorhees', '杰森', 8, '其他在赛选手回合结束于28或29格时，将该选手传送到20格。', ['turn-end']],
  ['knuckles', 'Knuckles', '纳克鲁斯', 9, '自己的第一次回合结束后，再连续进行两个完整回合。每场一次；额外回合仍需正常起身并处理技能。', ['turn-end']],
  ['lakitu', 'Lakitu', '朱盖木', 9, '自己回合开始时，必须选择另一名在赛选手，将其传送到你所在格。没有合法目标时不发动。', ['turn-start']],
  ['lizzie', 'Lizzie', '莉齐', 10, '主移动最终骰面为1或2且前方有在赛选手时，以传送到前方最近选手所在格代替主移动；无人领先则正常移动。', ['main-roll-final']],
  ['magikarp', 'Magikarp', '鲤鱼王', 10, '没有特殊能力，正常掷骰、移动和计分。', []],
  ['mario', 'Mario', '马力欧', 10, '向前或向后移动时，跳过其他在赛选手占据的格子，这些格不消耗步数；同组随行者不算占格，传送不跳格。', ['main-move']],
  ['mr-game-and-watch', 'Mr Game and Watch', '游戏与观看先生', 11, '其他选手每次能力发动并结算完成后，你前进1格。采用当前蹭蹭怪的逐次触发与循环裁定。', ['ability-complete']],
  ['olaf', 'Olaf', '奥拉夫', 12, '自己回合开始或结束时，若位于5或10格，传送到20格。', ['turn-start', 'turn-end']],
  ['pitfall-harry', 'Pitfall Harry', '探险家哈利', 13, '主动作时，可以传送到前方最近在赛选手所在格，代替掷主骰。没有领先者则正常掷骰；倒地时先起身。', ['before-main'], true],
  ['simon-belmont', 'Simon Belmont', '西蒙·贝尔蒙特', 15, '自己回合结束于5、10、15、20或25格时，获得一个额外回合。每次回合结束只检查一次。', ['turn-end']],
  ['tails', 'Tails', '塔尔斯', 16, '从8格起跑。起始放置不算移动或传送，不触发赛道格。', ['before-race']],
  ['yoshi', 'Yoshi', '耀西', 17, '一名在赛选手回合结束时，若其与至少另一名在赛选手同格，你前进2格。可以由自己的回合触发，每个回合末只触发一次。', ['turn-end']],
  ['rollercoaster-tycoon-guest', 'RollerCoaster Tycoon Guest', '过山车乐园游客', 18, '自己回合结束于5、10、15、20或25格时，获得1分。', ['turn-end']],
  ['spot', 'Spot', '斯波特', 20, '前方其他在赛选手回合结束于5、10、15、20或25格时，将其向后传送5格；结算该次传送及后果后，若其仍在赛且仍在你前方，你前进2格。', ['turn-end']],
  ['rockford', 'Rockford', '洛克福德', 20, '计算主移动时，与你同格或前后相邻一格的每名在赛选手，使本次移动距离+1，包含自己。双人模式按选手计数。', ['main-modifier']],
  ['burt', 'Burt', '伯特', 21, '每回合主骰前预测1～6的最终骰面。猜中后，在本次主移动及后果结算完成后，额外前进5格。倒地恢复或用固定移动、传送代替主骰时不预测。', ['before-main', 'main-roll-final']],
  ['piranha-plant', 'Piranha Plant', '食人花', 22, '前方其他在赛选手回合结束于5、10、15、20或25格时，你传送到该回合结束格。', ['turn-end']],
  ['fluffin-puffins', 'Fluffin’ Puffins', '蓬蓬海鹦', 22, '自己回合开始时，若已有其他选手完赛，获得1分；每场最多触发3次。', ['turn-start']],
];

export const WURSTII_CHARACTERS: readonly CharacterData[] = cards.map(([id, nameEn, nameZh, page, ability, timing, optional = false], index) => ({
  id: `wurstii-${id}`, nameEn, nameZh, edition: 'wurstii', translation: '本项目译名', ability, timing, optional,
  targets: '按卡文；其他选手包含同一玩家的队友，已完赛或淘汰者不作普通目标',
  scope: '本场比赛；采用当前四场、30格赛道及玩家计分规则', duration: '按卡文，本场结束重置', statuses: [],
  sources: [{url: '/rules/wurstii-a.md', title: 'Wurstii v1.0 角色卡与本项目适配说明', locator: `200_Characters_by_Wurstii_v1.0.pdf 第${page}页 / ${nameEn}`, accessed: '2026-10-22', version: '用户提供 PDF v1.0；本项目 A 类适配 v1'}],
  testId: `WA-${String(index + 1).padStart(2, '0')}`, verified: false,
  verification: '已对照用户提供的 Wurstii v1.0 卡面；采用本项目适配卡文，混合牌池强度未经实战验证',
}));
