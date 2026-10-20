/** Independent acceptance oracles, pinned to publisher text, not engine output.
 * Every Chinese racer name in this project is an unofficial project translation.
 * `CHAR-*` maps to src/shared/characters.ts; these specifications are not test results.
 */
export interface AbilitySpec {
  id: string;
  characterId: string;
  title: string;
  given: string;
  action: string;
  expected: string;
  source: string;
}

const faq = 'IELLO FAQ v2.0 (2026-08-28), Les Athlètes / ';
export const ABILITY_SPECS: readonly AbilitySpec[] = [
  { id: 'CHAR-01', characterId: 'alchemist', title: '骰面与距离分离', given: '炼金术士位于5，主骰最终为1，无其他修正。', action: '选择改用4格。', expected: '炼金术士到9；记录骰面仍为1、主移动距离4。', source: faq + 'Alchimiste' },
  { id: 'CHAR-02', characterId: 'baba-yaga', title: '停留绊倒', given: '芭芭雅嘎在7，另一角色在4。', action: '其他角色移动3到7。', expected: '来访者位于7且绊倒；芭芭雅嘎不绊倒。', source: faq + 'Baba Yaga' },
  { id: 'CHAR-03', characterId: 'banana', title: '完成越过后绊倒', given: '香蕉在5，其他角色在3。', action: '其他角色移动4。', expected: '来访者先完成到7的移动，再绊倒；不得停在香蕉格。', source: faq + 'Banane' },
  { id: 'CHAR-04', characterId: 'blimp', title: '第二弯边界', given: '飞艇回合起点分别位于第二弯前1格及正好第二弯。', action: '均掷3。', expected: '前者主移动6格，后者主移动2格；判断依据是回合起点。', source: faq + 'Dirigeable' },
  { id: 'CHAR-05', characterId: 'centaur', title: '被越过者后退', given: '半人马在2，其他角色在4与6。', action: '半人马移动6到8。', expected: '半人马在8，其他角色分别从4到2、从6到4。', source: faq + 'Centaure' },
  { id: 'CHAR-06', characterId: 'cheerleader', title: '并列末位同时移动', given: '啦啦队长在5，两名末位角色都在1。', action: '回合开始选择加油。', expected: '末位两人同组同时从1到3；完成后啦啦队长单独从5到6，然后才执行主移动。', source: faq + 'Pompon' },
  { id: 'CHAR-07', characterId: 'coach', title: '教练为自身加成', given: '教练独自在3，无其他修正。', action: '教练掷3。', expected: '单次主移动4格，终点7；没有3格再1格的两个移动。', source: faq + 'Coach' },
  { id: 'CHAR-08', characterId: 'copycat', title: '持续复制领先者', given: '模仿猫在2，领先的教练在8，其他人在4。', action: '模仿猫掷3。', expected: '模仿猫复制教练，自身得到+1并到6；复制不只在自己的回合存在。', source: faq + 'Imichateur' },
  { id: 'CHAR-09', characterId: 'dicemonger', title: '商人先走再重掷', given: '骰子商人在3，其他角色主骰1，随后可用重掷得到4。', action: '其他角色采用商人重掷。', expected: '商人先从3到4及结算全部后果，再生成新骰4；旧骰1不触发结果技能。', source: faq + 'Marchand Déambulant / Relances' },
  { id: 'CHAR-10', characterId: 'duelist', title: '决斗平局决斗家胜', given: '决斗家与另一角色都在5，没有进行中的动作。', action: '发起决斗，双方都掷3。', expected: '决斗家从5到7，对手仍在5。', source: faq + 'Duelliste' },
  { id: 'CHAR-11', characterId: 'egg', title: '蛋复制赛前能力', given: '蛋赛前抽到西西弗斯及另两张牌。', action: '选择西西弗斯。', expected: '角色identity仍为蛋，复制西西弗斯，并获得其赛前4分；三张候选不成为玩家手牌。', source: faq + 'Œuf' },
  { id: 'CHAR-12', characterId: 'flip-flop', title: '交换为同时传送', given: '人字拖在2，另一角色在9。', action: '替代掷骰并交换。', expected: '两人同一传送组交换至9和2；不产生骰子，不穿过中间格，不触发香蕉或吸盘鱼随行。', source: faq + 'Tong' },
  { id: 'CHAR-13', characterId: 'genius', title: '猜中得到额外回合', given: '天才在2，无船长。', action: '预测4，主骰最终4，完成回合。', expected: '天才到6，下一行动者仍是天才；其余当前回合后果先完成。', source: faq + 'Génie' },
  { id: 'CHAR-14', characterId: 'gunk', title: '减移动不改骰面', given: '黏液怪在赛，另一角色位于3，最终主骰6。', action: '完成主移动。', expected: '其他角色移动5格至8，最终骰面记录仍为6。', source: faq + 'Slime' },
  { id: 'CHAR-15', characterId: 'hare', title: '独自领先跳过含恢复', given: '野兔在8、其他人最多在5，野兔已经绊倒。', action: '开始野兔回合。', expected: '完全跳过主移动、不掷骰，仍位于8且仍绊倒，不因被跳过的主移动起身。', source: faq + 'Lièvrapide' },
  { id: 'CHAR-16', characterId: 'heckler', title: '回应仅起身回合', given: '起哄者在3，另一角色在5且绊倒。', action: '另一角色回合只起身并结束。', expected: '另一角色位置仍5、恢复直立，起哄者从3到5。', source: faq + 'Hyénarquoise' },
  { id: 'CHAR-17', characterId: 'huge-baby', title: '排斥为放置', given: '巨婴在8，另一角色在6。', action: '其他角色拟移动2到8。', expected: '角色被放在7；记录最后的8到7为强制放置/stop，不能当作倒退move让吸盘鱼随行。', source: faq + 'Gros Bébé' },
  { id: 'CHAR-18', characterId: 'hypnotist', title: '催眠目的地停留', given: '催眠师在5，芭芭雅嘎在9。', action: '催眠师回合初召来芭芭雅嘎。', expected: '芭芭雅嘎传送到5，不经过6–8；催眠师先绊倒，紧接着本回合主移动阶段以起身替代移动，因此回合末直立并仍在5。', source: faq + 'Hypnotiseur / Baba Yaga / Trébuchement' },
  { id: 'CHAR-19', characterId: 'inchworm', title: '取消整次主移动', given: '尺蠖在2，教练在5。', action: '教练主骰最终1。', expected: '教练仍在5，即使有自己+1也不移动；尺蠖从2到3。', source: faq + 'Chenille' },
  { id: 'CHAR-20', characterId: 'lackey', title: '跟班先于主移动', given: '跟班在3，其他角色在5。', action: '其他角色主骰最终6。', expected: '跟班从3到5并先结算其后果，之后其他角色才主移动到11。', source: faq + 'Larbin' },
  { id: 'CHAR-21', characterId: 'leaptoad', title: '空格计数', given: '跳跳蟾蜍在2，其他角色分别占3和4，5与6为空。', action: '跳跳蟾蜍移动2。', expected: '跳过3、4，两次独立跳跃触发，最终到6。', source: faq + 'Grouille-Grenouille' },
  { id: 'CHAR-22', characterId: 'legs', title: '定距仍受修正', given: '大长腿在2，黏液怪在赛。', action: '大长腿选择不掷骰走5。', expected: '基础5减1，单次主移动4到6；没有骰面，不触发尺蠖/船长/跟班。', source: faq + 'Guy Bolles' },
  { id: 'CHAR-23', characterId: 'lovable-loser', title: '倒地仍得末位分', given: '倒霉蛋在1、已绊倒，其他角色位置均大于1，所属玩家0分。', action: '开始倒霉蛋回合。', expected: '先得1分，然后主移动起身，位置仍1；并列末位的对照不获分。', source: faq + 'Endormimie' },
  { id: 'CHAR-24', characterId: 'magician', title: '两次重掷保留最后', given: '魔术师在2，骰序为1、6、3。', action: '连续采用两次重掷。', expected: '只以3作主移动，到5；1和6均不触发结果技能，不能要求保留之前的6。', source: faq + 'Magicien' },
  { id: 'CHAR-25', characterId: 'mastermind', title: '自我预测双名次', given: '幕后军师首次回合已预测自己，尚无人完成。', action: '幕后军师先过终点。', expected: '比赛立即结束，同一角色领取第一与第二名两个奖分。', source: faq + 'Tremplin-Devin' },
  { id: 'CHAR-26', characterId: 'mouth', title: '只在自己停下时吃', given: '大嘴怪在2，其他角色在5与9。', action: '大嘴怪移动3到5。', expected: '在5原有的唯一对手被淘汰，大嘴怪在5；大嘴怪在原地且别人到来时的对照不得吃人。', source: faq + 'B.O.U.C.H.E.' },
  { id: 'CHAR-27', characterId: 'party-animal', title: '全体吸引及聚会加成', given: '派对动物在5，其他角色在4与6。', action: '回合初吸引，然后主骰3。', expected: '其他两人同组到5，主移动获得+2，派对动物单次主移动5到10。', source: faq + 'Gros Fêtard' },
  { id: 'CHAR-28', characterId: 'rocket-scientist', title: '乘法先于加法', given: '火箭科学家与教练同在2。', action: '主骰5，选择翻倍。', expected: '距离(5×2)+1=11，火箭科学家到13后绊倒。', source: faq + 'Docteur Fusée' },
  { id: 'CHAR-29', characterId: 'romantic', title: '浪漫家也触发自身', given: '浪漫家在2，另一角色在5。', action: '浪漫家移动3到5。', expected: '因单独抵达已有一人的格子，浪漫家再独立移动2到7。', source: faq + 'Romantique' },
  { id: 'CHAR-30', characterId: 'scoocher', title: '每个跳过格分别蹭', given: '蹭蹭怪在1，跳跳蟾蜍在2，两人占3和4，5与6为空。', action: '跳跳蟾蜍移动2。', expected: '蟾蜍到6，蹭蹭怪因跳过两个占用格分别移动1，最终到3。', source: faq + 'Sac-à-Puces / Grouille-Grenouille' },
  { id: 'CHAR-31', characterId: 'sisyphus', title: '六完全替代主移动', given: '西西弗斯赛前得4分，当前在12。', action: '最终主骰6。', expected: '传送回0，分数3；不得再由0移动6格。', source: faq + 'Sisyphe' },
  { id: 'CHAR-32', characterId: 'skipper', title: '跳到船长然后从其左边继续', given: '顺时针席位A、B、C(船长)、D，当前A。', action: 'A最终主骰1并完成回合。', expected: 'C下一个行动，B被跳过；C无新重排行为后下一位是D。', source: faq + 'Cap’taine Passe' },
  { id: 'CHAR-33', characterId: 'stickler', title: '超额整次取消', given: '较真怪在赛，另一角色距终点还1格。', action: '该角色经技能拟移动2。', expected: '该角色位置完全不变且不完赛；限制不限于主移动。', source: faq + 'Tatillon' },
  { id: 'CHAR-34', characterId: 'suckerfish', title: '跟随先者优先', given: '吸盘鱼与另一角色同格且距终点1格。', action: '其他角色移动2，吸盘鱼选择随行。', expected: '同组同时完赛，被跟随者第一、吸盘鱼第二，然后比赛立即结束。', source: faq + 'Poisson-Ventouse / Mouvements simultanés' },
  { id: 'CHAR-35', characterId: 'third-wheel', title: '传送后仍主移动', given: '电灯泡在2，两名其他角色都在8。', action: '选择传送至8，然后主骰3。', expected: '先传送到8并处理stop，再进行主移动到11。', source: faq + 'Cinquième Roue' },
  { id: 'CHAR-36', characterId: 'twin', title: '只复制旧冠军', given: '之前冠军是西西弗斯、第二是教练，双胞胎未参赛。', action: '双胞胎赛前选择复制西西弗斯。', expected: '身份仍双胞胎，复制西西弗斯且得到赛前4分；不能仅因教练曾第二而选教练。', source: faq + 'Jumeau' },
];

export const COMBINATION_SPECS: readonly AbilitySpec[] = [
  { id: 'COMBO-01', characterId: 'romantic', title: '浪漫家与吸盘鱼不互触', given: '浪漫家与吸盘鱼同在2，目的地5原为空格。', action: '浪漫家移动3，吸盘鱼随行。', expected: '双方同组到5，浪漫家不额外前进；不能形成自动直达终点。', source: faq + 'Mouvements simultanés / Romantique' },
  { id: 'COMBO-02', characterId: 'scoocher', title: '合法长连锁', given: '蹭蹭怪与吸盘鱼同格，吸盘鱼每次都选择随行；一项其他能力令蹭蹭怪首次前进。', action: '持续选择随行。', expected: '每次吸盘鱼能力让蹭蹭怪再前进1，继续至终点；不得以任意次数上限停止或当作相同状态循环。', source: faq + 'Poisson-Ventouse / Boucle' },
  { id: 'COMBO-03', characterId: 'genius', title: '船长取代天才额外回合', given: '天才猜1、最终主骰1，船长仍在赛。', action: '结束天才回合。', expected: '船长下一个行动，天才额外回合不进入后续待办。', source: faq + 'Génie' },
  { id: 'COMBO-04', characterId: 'huge-baby', title: '巨婴踩香蕉', given: '巨婴在3，香蕉在5。', action: '巨婴拟移动2到5。', expected: '香蕉强制置到4，巨婴在5；巨婴视为越过香蕉而绊倒。', source: faq + 'Gros Bébé' },
  { id: 'COMBO-05', characterId: 'dicemonger', title: '弃骰没有尺蠖与船长后果', given: '在赛有商人、尺蠖、船长，活动角色先掷1。', action: '采用商人重掷，最终4。', expected: '商人先走1；尺蠖不走且不取消主移；船长不重排行动；活动角色按4移动。', source: faq + 'Relances / Chenille / Cap’taine Passe' },
  { id: 'COMBO-06', characterId: 'party-animal', title: '吸引组内不触发大嘴怪', given: '派对动物5，大嘴怪4，其他角色6。', action: '吸引双方同时到5。', expected: '同组到达的大嘴怪不吃同组对手，也不把两次同步抵达串行化。', source: faq + 'Mouvements simultanés / B.O.U.C.H.E.' },
  { id: 'COMBO-07', characterId: 'copycat', title: '不复制双胞胎已选能力', given: '双胞胎在领先，赛前已复制西西弗斯；模仿猫在后。', action: '模仿猫更新复制对象为双胞胎。', expected: '模仿猫得到双胞胎印刷的赛前选择能力，已过赛前窗不能获得西西弗斯4分或六归零能力。', source: faq + 'Imichateur / Jumeau' },
  { id: 'COMBO-08', characterId: 'duelist', title: '可选机会到顺序时重检', given: '浪漫家的回合，浪漫家移动后与决斗家同格。', action: '按同时能力顺序处理。', expected: '浪漫家先走2；决斗家轮到时已无同格目标，不能发起决斗。', source: faq + 'Timing / Duelliste' },
  { id: 'COMBO-09', characterId: 'gunk', title: '负移动不改面', given: '两个黏液减益影响最终骰面1的其他角色，无尺蠖。', action: '计算主移动。', expected: '主移动距离-1，后退1格，骰面仍1；两个减益分别触发蹭蹭怪。', source: faq + 'Slime / Modificateurs' },
  { id: 'COMBO-10', characterId: 'mastermind', title: '原军师先于复制军师', given: '幕后军师和复制军师均预测同一第三角色获胜。', action: '该第三角色先过终点。', expected: '原军师先取得第二名并立即结束比赛；复制军师不再领取第二。', source: faq + 'Imichateur / Tremplin-Devin' },
];
