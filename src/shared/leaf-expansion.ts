import type { CharacterData } from './characters.js';
export interface LeafCharacterData extends CharacterData { adaptation:string; artworkReference:string }
/** 18 original card fronts, rulebook and matching transparent gamepieces inspected 2026-10-22. */
export const LEAF_CHARACTERS:readonly LeafCharacterData[] = [
  {
    "id": "leaf-catfish",
    "nameEn": "Catfish",
    "nameZh": "鲶鱼",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "侧躺比赛且不会绊倒。另一名选手从自己身后移动到自己前方时，自己前进1格。",
    "timing": [
      "pass",
      "trip-immunity"
    ],
    "optional": false,
    "targets": "another-racer-passes",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [
      "tripped"
    ],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p1，卡01 Catfish；Rulebook p1；ZIP Card images/01 Catfish.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-01",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "不含从同格出发或停在同格；按选手而非控制者判断。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/01 Catfish.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-crash-dummy",
    "nameEn": "Crash Dummy",
    "nameZh": "碰撞假人",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "主移动+2；主移动停在至少有另一名选手的格子时，同格所有选手（含自己）先绊倒，再结算其他落格能力。赛前自己绊倒。",
    "timing": [
      "before-race",
      "main-modifier",
      "main-stop"
    ],
    "optional": false,
    "targets": "all-sharing-racers",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [
      "tripped"
    ],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p1，卡02 Crash Dummy；Rulebook p1；ZIP Card images/02 Crash Dummy.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-02",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "主移动才引发碰撞；同一玩家的另一名选手仍受影响。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/02 Crash Dummy.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-dark-horse",
    "nameEn": "Dark Horse",
    "nameZh": "黑马",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "回合开始时独自末位，本回合主移动掷骰的距离翻倍。",
    "timing": [
      "turn-start",
      "main-modifier"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p1，卡03 Dark Horse；Rulebook p1；ZIP Card images/03 Dark Horse.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-03",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "回合开始快照判定；并列末位不翻倍。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/03 Dark Horse.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-kangaroo",
    "nameEn": "Kangaroo",
    "nameZh": "袋鼠",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "任一选手结束移动，恰停在自己正前方1格时，自己前进2格。",
    "timing": [
      "stop"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p1，卡04 Kangaroo；Rulebook p1；ZIP Card images/04 Kangaroo.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-04",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "适用所有移动；非只限主移动；自身移动不触发自己。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/04 Kangaroo.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-loan-shark",
    "nameEn": "Loan Shark",
    "nameZh": "高利贷鲨",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "赛前给每个对手的选手牌放1枚积分筹码；与仍持有该筹码的选手同格时取走它；比赛结束时未取走的筹码归持牌者。",
    "timing": [
      "before-race",
      "stop",
      "race-end"
    ],
    "optional": false,
    "targets": "opponent-racers",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p1，卡05 Loan Shark；Rulebook p1；ZIP Card images/05 Loan Shark.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-05",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "双选手模式不放在同一控制者的另一张牌上；每张牌最多取回本能力放的1枚。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/05 Loan Shark.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-lonely-wolf",
    "nameEn": "Lonely Wolf",
    "nameZh": "孤狼",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "回合开始时与另一名选手同格，本次主移动+2；否则+1。此能力不触发小挪挪。",
    "timing": [
      "turn-start",
      "main-modifier"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p1，卡06 Lonely Wolf；Rulebook p1；ZIP Card images/06 Lonely Wolf.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-06",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "在回合开始、掷骰前判定同格；小挪挪Scoocher例外是作者规则。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/06 Lonely Wolf.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-nepo-baby",
    "nameEn": "Nepo Baby",
    "nameZh": "关系户宝宝",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "本局此前每枚冠军奖杯或亚军绶带，使自己的主移动+1。",
    "timing": [
      "main-modifier"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p1，卡07 Nepo Baby；Rulebook p1；ZIP Card images/07 Nepo Baby.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-07",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "只数本控制者在此前各场获得的第一、第二名，不数积分总额。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/07 Nepo Baby.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-philanthropist",
    "nameEn": "Philanthropist",
    "nameZh": "慈善家",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "主移动掷2骰，选择1骰供自己主移动，并将另一骰交给另一选手；该选手下一次主移动不掷骰而使用赠骰，若该回合跳过掷骰，回合末弃掉赠骰。",
    "timing": [
      "main-roll",
      "choose-die",
      "choose-target",
      "next-main"
    ],
    "optional": false,
    "targets": "another-racer",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p1，卡08 Philanthropist；Rulebook p1；ZIP Card images/08 Philanthropist.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-08",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "赠骰是公开已知点数；不当作接受者新掷出的骰；同玩家另一选手是合法目标。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/08 Philanthropist.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-race-car",
    "nameEn": "Race Car",
    "nameZh": "赛车",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "赛前获得2分；主移动掷骰后、移动前，可以每回合最多花1分令该次主移动+3。",
    "timing": [
      "before-race",
      "main-roll-final",
      "main-modifier"
    ],
    "optional": true,
    "targets": "self",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p1，卡09 Race Car；Rulebook p1；ZIP Card images/09 Race Car.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-09",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "扣减实际积分且服务端校验余额；并非额外掷骰。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/09 Race Car.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-revolutionary",
    "nameEn": "Revolutionary",
    "nameZh": "革命家",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "回合开始时独自末位，主移动掷骰前传送到当前领先选手所在格。",
    "timing": [
      "turn-start",
      "warp"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p3，卡10 Revolutionary；Rulebook p2；ZIP Card images/10 Revolutionary.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-10",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "并列领先者同格；并列末位不触发。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/10 Revolutionary.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-sole-survivor",
    "nameEn": "Sole Survivor",
    "nameZh": "唯一幸存者",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "本场比赛中此选手自己每获得1分，主移动+1；每次从未绊倒变为绊倒，获得1分。",
    "timing": [
      "score",
      "trip",
      "main-modifier"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [
      "tripped"
    ],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p3，卡11 Sole Survivor；Rulebook p2；ZIP Card images/11 Sole Survivor.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-11",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "仅本场此选手的入账，不能计同一玩家另一名选手所得；包含星格、高利贷鲨等来源。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/11 Sole Survivor.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-sore-loser",
    "nameEn": "Sore Loser",
    "nameZh": "输不起",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "比赛结束时自己独自末位，获得3分。",
    "timing": [
      "race-end"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p3，卡12 Sore Loser；Rulebook p2；ZIP Card images/12 Sore Loser.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-12",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "按实际位置判断独自末位；真正循环判和不追加赛末奖励。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/12 Sore Loser.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-spiteful-spirit",
    "nameEn": "Spiteful Spirit",
    "nameZh": "怨灵",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "自己从绊倒起身时，前进1格并绊倒所有其他选手。",
    "timing": [
      "recover"
    ],
    "optional": false,
    "targets": "all-other-racers",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [
      "tripped"
    ],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p3，卡13 Spiteful Spirit；Rulebook p2；ZIP Card images/13 Spiteful Spirit.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-13",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "其他选手包括同一控制者的另一名选手；由同一规则队列按序结算。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/13 Spiteful Spirit.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-toucan",
    "nameEn": "Toucan",
    "nameZh": "巨嘴鸟",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "主移动骰掷出2时，可以将该骰点调整为1～6任意值，并按调整后的值进行主移动。",
    "timing": [
      "main-roll-final",
      "adjust-die"
    ],
    "optional": true,
    "targets": "self",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p3，卡14 Toucan；Rulebook p2；ZIP Card images/14 Toucan.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-14",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "调整不算再次掷骰；三角人等只看真实掷出值的能力不因调整触发。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/14 Toucan.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-triangle-man",
    "nameEn": "Triangle Man",
    "nameZh": "三角人",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "任何原因掷出的实体骰面为3时，自己前进1格，先于该骰的正常移动；多骰中的每个3分别触发。",
    "timing": [
      "raw-die"
    ],
    "optional": false,
    "targets": "self",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p3，卡15 Triangle Man；Rulebook p2；ZIP Card images/15 Triangle Man.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-15",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "对抗、技能、主移动、重掷均适用，调整成3不触发；自己的主骰3先前进1再主移动3。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/15 Triangle Man.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-zombie",
    "nameEn": "Zombie",
    "nameZh": "僵尸",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "赛前可以选择此前一场比赛失利的角色，本场使用其能力，仍使用自己的棋子，并获得所复制能力的赛前效果。",
    "timing": [
      "before-race",
      "copy"
    ],
    "optional": true,
    "targets": "previous-race-loser",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p3，卡16 Zombie；Rulebook p2；ZIP Card images/16 Zombie.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-16",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "项目数字化裁定：失利指该场未获冠军奖杯或亚军绶带；保留独立角色ID与棋子身份。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/16 Zombie.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-thespian",
    "nameEn": "Thespian",
    "nameZh": "戏剧演员",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "每次主移动掷骰前，弃掉未选角色牌堆顶牌，直到自己下个回合前拥有该牌的能力。忽略复制牌的赛前能力。",
    "timing": [
      "before-main",
      "copy",
      "discard"
    ],
    "optional": false,
    "targets": "unchosen-deck",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p3，卡17 Thespian；Rulebook p2；ZIP Card images/17 Thespian.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-17",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "上一张已展示复制牌在下次换牌时回公共弃牌堆；牌堆耗尽则洗公共弃牌堆。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/17 Thespian.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  },
  {
    "id": "leaf-filmmaker",
    "nameEn": "Filmmaker",
    "nameZh": "电影制作人",
    "translation": "本项目译名",
    "edition": "leaf",
    "ability": "赛前从未选角色牌堆抽7张私人手牌；每次主移动掷骰前弃1张，从此直到自己下个回合前拥有其能力。忽略复制牌的赛前能力。",
    "timing": [
      "before-race",
      "before-main",
      "secret-choice",
      "copy",
      "discard"
    ],
    "optional": false,
    "targets": "own-secret-hand",
    "scope": "按稳定选手ID与当前控制者ID分别判定；非官方粉丝扩展",
    "duration": "本场；临时复制能力持续到自身下回合换牌",
    "statuses": [],
    "sources": [
      {
        "url": "https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete",
        "title": "Leaf作者原始Printable Cards / Rulebook / PNG Images",
        "locator": "Printable正面p3，卡18 Filmmaker；Rulebook p2；ZIP Card images/18 Filmmaker.png",
        "accessed": "2026-10-22",
        "version": "用户提供作者3份原始文件，2026-10-22核验"
      }
    ],
    "testId": "LEAF-18",
    "verified": true,
    "verification": "已实际读取原始Printable卡面、两页Rulebook与PNG卡面；机制测试见leaf-expansion.test.ts",
    "adaptation": "手牌仅当前控制者可见；公开展示已弃并正在复制的牌；上一张展示牌换牌时才回公共弃牌堆。",
    "artworkReference": "PNG Images ZIP / Gamepiece images/18 Filmmaker.png",
    "limit": "每个独立合法触发分别处理；无统一技能次数上限"
  }
];
