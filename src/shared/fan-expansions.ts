import { LEAF_CHARACTERS } from './leaf-expansion.js';
import type { CharacterData } from './characters.js';
export interface FanCharacterData extends CharacterData { adaptation?: string }
/** Exact 32-name webpage manifest. Box is documented but absent from playable pools. */
export const EXTRA_MILE_MANIFEST: readonly FanCharacterData[] = [
  {
    "id": "extra-mile-box",
    "nameEn": "Box",
    "nameZh": "盒子",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "所有实体掷骰须入盒；骰子触及盒外时自己前进2。浏览器适配未确定，因此不可选。",
    "timing": [
      "physical-roll"
    ],
    "optional": true,
    "targets": "box",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Box",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p3 / Box",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-01",
    "verified": false,
    "verification": "原始卡文已核验；实体规则未适配，隔离不可玩",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Box.png",
    "adaptation": "待确定实体入盒判定的数字化方式，未用随机概率代替。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-broken-clock",
    "nameEn": "Broken Clock",
    "nameZh": "坏时钟",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "主移动掷两骰；不同取较低值，相同取两骰总和。",
    "timing": [
      "main-roll"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Broken Clock",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p3 / Broken Clock",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-02",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Broken%20Clock.png",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-cletus",
    "nameEn": "Cletus",
    "nameZh": "克莱特斯",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "可代替主移动选择3格内另一选手，双方分别掷对抗骰：同点淘汰目标；自己高则重新进行正常主移动；对方高则对方前进1。",
    "timing": [
      "main-replacement",
      "contest-roll"
    ],
    "optional": true,
    "targets": "other-within-3",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Cletus",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p1 / Cletus",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-03",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Cletus.png",
    "adaptation": "对抗骰不触发仅主移动骰能力；双方控制者均须点击。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-doc-paradox",
    "nameEn": "Doc Paradox",
    "nameZh": "悖论博士",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "从终点倒向起点比赛；与其他选手同格时传回终点，并从此主移动增加3。",
    "timing": [
      "before-race",
      "stop",
      "main-modifier"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Doc Paradox",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p1 / Doc Paradox",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-04",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Doc%20Paradox.png",
    "adaptation": "数字适配：倒向起点完赛；倒向主移动的距离仍先应用通常加减；每次重置累计+3。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-doctor-dice",
    "nameEn": "Doctor Dice",
    "nameZh": "骰子医生",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "不会绊倒。主移动前可传到一名倒地选手的格子并使其起身；向后传送时本次主移动+2。",
    "timing": [
      "before-main",
      "trip"
    ],
    "optional": true,
    "targets": "tripped-other",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Doctor Dice",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p3 / Doctor Dice",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-05",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Doctor%20Dice.png",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-dom-and-gary",
    "nameEn": "Dom and Gary",
    "nameZh": "多姆与加里",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "加里从第4格开始，总在多姆之前行动；多姆越过或与加里同格会淘汰加里并获得主移动+2；加里前二完赛时拿走该名次积分。",
    "timing": [
      "before-race",
      "pass",
      "stop",
      "main-modifier"
    ],
    "optional": false,
    "targets": "extra-pawn",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Dom and Gary",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p5 / Dom and Gary",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-06",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Dom%20and%20Gary.png",
    "adaptation": "数字适配：加里由多姆控制者操作但不为玩家计分，其拿走的名次积分退出本局。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-echo",
    "nameEn": "Echo",
    "nameZh": "回声",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "可代替掷骰，按前一名行动选手主移动的实际移动格数移动。",
    "timing": [
      "main-replacement"
    ],
    "optional": true,
    "targets": "self",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Echo",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p7 / Echo",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-07",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Echo.png",
    "adaptation": "PDF写previous racer moved，网页写rolled；采用PDF。首次行动无前次记录时正常掷骰；传送不算移动。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-gingy",
    "nameEn": "Gingy",
    "nameZh": "姜饼人",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "有4点生命；其他选手单独落到自己的格子时失去1生命，主移动永久+1；生命归零淘汰。",
    "timing": [
      "stop",
      "main-modifier"
    ],
    "optional": false,
    "targets": "arriving-other",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Gingy",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p1 / Gingy",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-08",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Gingy.png",
    "limit": "4生命"
  },
  {
    "id": "extra-mile-gluebert",
    "nameEn": "Gluebert",
    "nameZh": "胶水伯特",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "同格其他选手主移动-2；其他选手越过自己时，该次移动少1格。",
    "timing": [
      "main-modifier",
      "passed"
    ],
    "optional": false,
    "targets": "other",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Gluebert",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p5 / Gluebert",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-09",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Gluebert.png",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-heads",
    "nameEn": "Heads",
    "nameZh": "硬币头",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "每次自己掷骰后可使用骰子底面的点数（七减当前面）。",
    "timing": [
      "any-roll"
    ],
    "optional": true,
    "targets": "self",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Heads",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p1 / Heads",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-10",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Heads.png",
    "adaptation": "每颗骰只翻一次；翻面在强制重掷检查之前，固定点数后不再翻回。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-honey-pot",
    "nameEn": "Honey Pot",
    "nameZh": "蜜罐",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "赛前向公共蜜罐加入等于场次的积分，并标记一格；选手落上后掷骰领取至多相应点数，自己每发出1分前进1格。",
    "timing": [
      "before-race",
      "stop",
      "ability-roll"
    ],
    "optional": false,
    "targets": "marked-space",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Honey Pot",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p3 / Honey Pot",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-11",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Honey%20Pot.png",
    "adaptation": "数字适配：蜜罐由公共供应补充，不扣控制者积分；余额不足只发余额；每名蜜罐独立标记，共享本场蜜罐。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-king-pete",
    "nameEn": "King Pete",
    "nameZh": "皮特国王",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "其他选手掷出5或6时，该次主移动少1格，自己前进1格。",
    "timing": [
      "any-roll"
    ],
    "optional": false,
    "targets": "other",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "King Pete",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p7 / King Pete",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-12",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/King%20Pete.png",
    "adaptation": "数字适配：主骰扣当前主移动；能力骰与对抗骰无主移动可扣，仍触发国王前进。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-lazy-bones",
    "nameEn": "Lazy Bones",
    "nameZh": "懒骨头",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "未掷到6前不能离开起点；掷到6时传到领跑者所在格，并立即再行动一回合。",
    "timing": [
      "main-roll"
    ],
    "optional": false,
    "targets": "lead",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Lazy Bones",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p5 / Lazy Bones",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-13",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Lazy%20Bones.png",
    "adaptation": "数字适配：锁在起点仅限制自己的主移动；首次掷6后解除，随后每次主骰6仍执行传送和额外回合。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-marksman",
    "nameEn": "Marksman",
    "nameZh": "神射手",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "主移动前可对3格之外的目标逐次掷骰累加；总和等于目标所在格则淘汰，否则超出后目标前进1。",
    "timing": [
      "before-main",
      "ability-roll"
    ],
    "optional": true,
    "targets": "other-beyond-3",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Marksman",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p7 / Marksman",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-14",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Marksman.png",
    "adaptation": "数字适配：连续单骰累加，达到或超过目标格号即结束；每颗骰都等待操作者。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-moneybags",
    "nameEn": "Moneybags",
    "nameZh": "钱袋先生",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "可支付1积分代替掷骰，以自己选择的1至8格为主移动距离。",
    "timing": [
      "main-replacement"
    ],
    "optional": true,
    "targets": "self",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Moneybags",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p3 / Moneybags",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-15",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Moneybags.png",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-mr-fox",
    "nameEn": "Mr. Fox",
    "nameZh": "狐狸先生",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "每场至多3次，在公开技能生效前阻止该次能力。",
    "timing": [
      "reaction"
    ],
    "optional": true,
    "targets": "public-power",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Mr. Fox",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p3 / Mr. Fox",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-16",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Mr.%20Fox.png",
    "adaptation": "数字适配：按本场固定顺序响应，一个阻止成功即关闭窗口；阻止不再互相阻止；已付款和已花次数不返还。持续能力按单次可观察激活开启窗口。",
    "limit": "每场3次"
  },
  {
    "id": "extra-mile-oddball",
    "nameEn": "Oddball",
    "nameZh": "怪球",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "自己主骰偶数时本次主移动-2，奇数时+3。",
    "timing": [
      "main-roll",
      "main-modifier"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Oddball",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p5 / Oddball",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-17",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Oddball.png",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-pooh",
    "nameEn": "Pooh",
    "nameZh": "维尼",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "同一回合内多个能力发生后，自己前进1；倒地后立即起身。",
    "timing": [
      "power-done",
      "trip"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Pooh",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p3 / Pooh",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-18",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Pooh.png",
    "adaptation": "数字适配：本回合第二次及之后每次能力完成均前进1；自己的该次响应不继续触发自己。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-robin-hood",
    "nameEn": "Robin Hood",
    "nameZh": "罗宾汉",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "自己越过或与领跑者同格时，从其拿1积分给末位玩家，然后自己前进2。",
    "timing": [
      "pass",
      "stop"
    ],
    "optional": false,
    "targets": "lead,last",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Robin Hood",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p7 / Robin Hood",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-19",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Robin%20Hood.png",
    "adaptation": "数字适配：并列领先或末位按本场固定顺序取第一名不同选手；不足1分不转移，仍移动2格。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-saint-nick",
    "nameEn": "Saint Nick",
    "nameZh": "圣尼克",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "自己单独落到有其他选手的格子时，每名其他选手使自己前进1格；之后那些选手的控制者依次掷骰，1至3后退1格、4至6前进2格。",
    "timing": [
      "stop",
      "ability-roll"
    ],
    "optional": false,
    "targets": "co-located-others",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Saint Nick",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p1 / Saint Nick",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-20",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Saint%20Nick.png",
    "adaptation": "按选手实例计数与逐个掷骰，同玩家的两个选手仍分别执行；自身额外移动完成及连锁后才开始送礼骰。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-school-bully",
    "nameEn": "School Bully",
    "nameZh": "校园恶霸",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "主骰3使所有其他选手倒地；他们下一次主移动可掷恢复骰，1至3可起身并按该骰移动，恶霸前进2。",
    "timing": [
      "main-roll",
      "recovery-roll"
    ],
    "optional": true,
    "targets": "all-others",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "School Bully",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p1 / School Bully",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-21",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/School%20Bully.png",
    "adaptation": "PDF明确恢复成功后按该骰移动，网页省略，采用PDF；4至6只起身而失去主移动。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-scout",
    "nameEn": "Scout",
    "nameZh": "童子军",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "主骰确定后、移动前可向前或向后传送1格。",
    "timing": [
      "main-roll"
    ],
    "optional": true,
    "targets": "self",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Scout",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p1 / Scout",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-22",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Scout.png",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-shuffler",
    "nameEn": "Shuffler",
    "nameZh": "洗牌师",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "赛前将本场所有选手印刷能力洗牌重新分配；自己独自末位时可再次洗牌。",
    "timing": [
      "before-race",
      "turn-start"
    ],
    "optional": true,
    "targets": "all-racers",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Shuffler",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p5 / Shuffler",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-23",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Shuffler.png",
    "adaptation": "数字适配：重新分配能力不改控制者、位置与棋子；既有赛前窗口不重新打开，已建立对象与资源仍绑定实例。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-silly-goose",
    "nameEn": "Silly Goose",
    "nameZh": "傻鹅",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "主骰1至6分别改为移动-3、0、2、5、7、10格。",
    "timing": [
      "main-roll"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Silly Goose",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p5 / Silly Goose",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-24",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Silly%20Goose.png",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-snake-eyes",
    "nameEn": "Snake Eyes",
    "nameZh": "蛇眼",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "赛前选择冠军并下注；猜中获得下注额3倍积分，否则失去下注额。",
    "timing": [
      "before-race",
      "race-end"
    ],
    "optional": false,
    "targets": "chosen-racer",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Snake Eyes",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p7 / Snake Eyes",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-25",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Snake%20Eyes.png",
    "adaptation": "数字适配：下注额限当前玩家积分，不预扣；结束按净增3倍或扣注额结算；和局视为未猜中。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-snub",
    "nameEn": "Snub",
    "nameZh": "落选仔",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "主移动增加本批选秀中在自己之前被选出的角色数量。",
    "timing": [
      "draft",
      "main-modifier"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Snub",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p5 / Snub",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-26",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Snub.png",
    "adaptation": "记录本批选秀选择前的全桌选牌数；练习自由组队顺序视为该次选牌顺序。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-terrible-toddler",
    "nameEn": "Terrible Toddler",
    "nameZh": "可怕幼童",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "主骰1或2时，在主移动前额外掷一骰，使自己周围不超过该骰距离的所有选手倒地。",
    "timing": [
      "main-roll",
      "ability-roll"
    ],
    "optional": false,
    "targets": "within-range",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Terrible Toddler",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p1 / Terrible Toddler",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-27",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Terrible%20Toddler.png",
    "adaptation": "anyone包含自己；额外范围骰不触发主移动专属能力。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-thief",
    "nameEn": "Thief",
    "nameZh": "盗贼",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "赛前秘密指定另一选手；本场结束公开目标，偷取该选手本场获得的积分。",
    "timing": [
      "before-race",
      "race-end"
    ],
    "optional": false,
    "targets": "secret-other",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Thief",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p5 / Thief",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-28",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Thief.png",
    "adaptation": "秘密目标保存在GameState私有flags，不能放Racer公共flags。数字适配按目标实例的正向积分收入记账，最多偷其控制者当前剩余积分。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-toll-troll",
    "nameEn": "Toll Troll",
    "nameZh": "收费巨魔",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "赛前标记一格，任何选手停在该格自己获得1积分。",
    "timing": [
      "before-race",
      "stop"
    ],
    "optional": false,
    "targets": "marked-space",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Toll Troll",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p7 / Toll Troll",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-29",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Toll%20Troll.png",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-totally-fair-ref",
    "nameEn": "Totally Fair Ref",
    "nameZh": "绝对公平裁判",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "其他选手从非领先位置进入领先时倒地。",
    "timing": [
      "move"
    ],
    "optional": false,
    "targets": "new-leader",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Totally Fair Ref",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p1 / Totally Fair Ref",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-30",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Totally%20Fair%20Ref.png",
    "adaptation": "数字适配：从不在并列领先变为并列领先也算进入；同组同时到达合并检查。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-whisper",
    "nameEn": "Whisper",
    "nameZh": "低语",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "自己停到被占用格时，移动到前后最近空格；别人落到自己的格子时，自己前进至下个空格。",
    "timing": [
      "stop"
    ],
    "optional": true,
    "targets": "nearest-empty",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Whisper",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p3 / Whisper",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-31",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Whisper.png",
    "adaptation": "等距两个空格由控制者选择；以正常移动结算经过和停格触发。",
    "limit": "按每个独立触发分别结算"
  },
  {
    "id": "extra-mile-witch-hazel",
    "nameEn": "Witch Hazel",
    "nameZh": "女巫海泽尔",
    "translation": "本项目译名",
    "edition": "extra-mile",
    "ability": "可把非负主移动距离分为自己前进和另一名选手后退；先完成自身移动及连锁，再对所选目标后退。",
    "timing": [
      "main-allocation"
    ],
    "optional": true,
    "targets": "one-other",
    "scope": "按选手实例；其他选手包含同一玩家的另一选手。",
    "duration": "本次效果；生命、次数与永久加值保存至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "Extra Mile 作者角色网页",
        "locator": "Witch Hazel",
        "accessed": "2026-10-22",
        "version": "v13，32名名单"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf",
        "title": "Extra Mile 作者卡面PDF",
        "locator": "PDF p3 / Witch Hazel",
        "accessed": "2026-10-22",
        "version": "2026-10-22下载，8页33张正面"
      }
    ],
    "testId": "EM-32",
    "verified": true,
    "verification": "作者网页与PDF卡面交叉核对；规则采用PDF优先",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/extra-mile/Witch%20Hazel.png",
    "adaptation": "PDF明确one other racer，网页写other racers；查未发现作者勘误，采用PDF单目标。全给自身或全给目标均可；负主移动不分配。",
    "limit": "按每个独立触发分别结算"
  }
];
export const FAN_CHARACTERS: readonly FanCharacterData[] = [...EXTRA_MILE_MANIFEST.filter(c=>c.id!=='extra-mile-box'),...LEAF_CHARACTERS];
export const EXTRA_MILE_CHARACTER_IDS: readonly string[] = FAN_CHARACTERS.filter(c=>c.edition==='extra-mile').map(c=>c.id);
export const LEAF_CHARACTER_IDS: readonly string[] = LEAF_CHARACTERS.map(c=>c.id);
export const FAN_READY_COUNTS = {'extra-mile':EXTRA_MILE_CHARACTER_IDS.length,'leaf-fan':LEAF_CHARACTER_IDS.length} as const;
export const FAN_SOURCE_STATUS = {verifiedAt:'2026-10-22',extraMile:{webCount:32,pdfFrontCount:33,excludedPdfOnly:'Groundhogs Day / DÉJÀ MOVE',isolated:['extra-mile-box']},leaf:{count:18,ready:18,missing:[],acquisition:'BGG downloads returned403; user provided original files459312/459301/459299; fullPDF andPNG read2026-10-22'}} as const;
