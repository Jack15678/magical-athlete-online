import type { CharacterData } from './characters.js';
/** Card transcription only; fan-authored Interactions are not official rulings. */
export const SECOND_WIND_CHARACTERS: readonly CharacterData[] = [
  {
    "id": "bite-mark",
    "nameEn": "Bite Mark",
    "nameZh": "咬痕",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "主移动最终骰面1或2时变成狼人巨口，消灭此次形态下越过的选手。",
    "timing": [
      "main-roll-final",
      "passed"
    ],
    "optional": false,
    "targets": "被越过的其他选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "变身时",
    "duration": "本场；卡文未说明还原，待官方复核",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Bite Mark",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-01",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Bite%20Mark.png"
  },
  {
    "id": "blunderdog",
    "nameEn": "Blunderdog",
    "nameZh": "糊涂狗",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "处于末位时，主移动骰面乘三；否则主要移动改为后退。",
    "timing": [
      "main-move"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次主移动",
    "duration": "本次主移动",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Blunderdog",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-02",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Blunderdog.png"
  },
  {
    "id": "cheatah",
    "nameEn": "Cheatah",
    "nameZh": "千术豹",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "用秘密设定1～6代替主移动掷骰；右手玩家猜中则不移动。",
    "timing": [
      "before-main",
      "secret-guess"
    ],
    "optional": false,
    "targets": "右手真人玩家；自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次主移动",
    "duration": "秘密直到猜测完成",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Cheatah",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-03",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Cheatah.png"
  },
  {
    "id": "critic",
    "nameEn": "Critic",
    "nameZh": "评论家",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "可以让前方选手每回合重掷一次主移动。",
    "timing": [
      "reroll-window"
    ],
    "optional": true,
    "targets": "位于自身前方的选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每个回合一次",
    "duration": "舍弃旧骰面",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Critic",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-04",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Critic.png"
  },
  {
    "id": "diva",
    "nameEn": "Diva",
    "nameZh": "歌剧女伶",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "回合开始处于末位则与领跑者交换位置；否则与末位选手交换。并列时选择一名。",
    "timing": [
      "turn-start"
    ],
    "optional": false,
    "targets": "领跑或末位选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每回合开始一次",
    "duration": "立即",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Diva",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-05",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Diva.png"
  },
  {
    "id": "doppelgangster",
    "nameEn": "Doppelgängster",
    "nameZh": "替身帮",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "最先冲线的选手改为淘汰；自己获得其能力。",
    "timing": [
      "before-first-finish"
    ],
    "optional": false,
    "targets": "首个冲线选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每场一次",
    "duration": "获得能力至本场结束",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Doppelgängster",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-06",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Doppelgangster.png"
  },
  {
    "id": "gloth",
    "nameEn": "Gloth",
    "nameZh": "葛洛斯",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "主移动−1；比赛结束时若尚未超过第二弯道，获得3分。",
    "timing": [
      "main-move",
      "race-end"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次主移动；每场结束一次",
    "duration": "本场",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Gloth",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-07",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Gloth.png"
  },
  {
    "id": "hog-knight",
    "nameEn": "Hog Knight",
    "nameZh": "野猪骑士",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "开赛骑野猪，坐骑为当前骑手主移动+2；其他选手停到野猪所在格便夺走坐骑。",
    "timing": [
      "before-race",
      "main-move",
      "stop"
    ],
    "optional": false,
    "targets": "停到坐骑所在格的选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次合法停格",
    "duration": "坐骑留在本场",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Hog Knight",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-08",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Hog%20Knight.png"
  },
  {
    "id": "hopfrog",
    "nameEn": "Hopfrog",
    "nameZh": "弹跳蛙",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "回合结束时，若自己恰在任意选手后1格，获得额外回合。",
    "timing": [
      "turn-end"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每回合结束一次",
    "duration": "下一个回合",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Hopfrog",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-09",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Hopfrog.png"
  },
  {
    "id": "hotel",
    "nameEn": "Hotel",
    "nameZh": "旅馆",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "其他选手停到自己所在格，需付给自己1分；无法支付则绊倒。",
    "timing": [
      "stop"
    ],
    "optional": false,
    "targets": "单独到达自身格的其他选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次合法停格",
    "duration": "立即",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Hotel",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-10",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Hotel.png"
  },
  {
    "id": "icarus",
    "nameEn": "Icarus",
    "nameZh": "伊卡洛斯",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "主移动+3；主移动最终骰面6时淘汰。",
    "timing": [
      "main-roll-final",
      "main-move"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次主移动",
    "duration": "立即",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Icarus",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-11",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Icarus.png"
  },
  {
    "id": "kingtripper",
    "nameEn": "Kingtripper",
    "nameZh": "绊倒国王",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "回合开始时，可以绊倒领跑选手；并列则选择一名。",
    "timing": [
      "turn-start"
    ],
    "optional": true,
    "targets": "领跑选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每回合开始一次",
    "duration": "至目标下次恢复",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Kingtripper",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-12",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Kingtripper.png"
  },
  {
    "id": "kraken",
    "nameEn": "Kraken",
    "nameZh": "海怪",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "每场一次，在回合开始时可以把所有其他选手传送至自己所在格并绊倒。",
    "timing": [
      "turn-start"
    ],
    "optional": true,
    "targets": "所有其他在赛选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每场一次",
    "duration": "至目标下次恢复",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Kraken",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-13",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Kraken.png"
  },
  {
    "id": "le-saboteur",
    "nameEn": "Le Saboteur",
    "nameZh": "破坏者",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "其他选手主移动最终骰面3时，主移动方向改为后退。",
    "timing": [
      "main-roll-final"
    ],
    "optional": false,
    "targets": "其他在赛选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每个最终3",
    "duration": "本次主移动",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Le Saboteur",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-14",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/LeSaboteur.png"
  },
  {
    "id": "magical-athlete",
    "nameEn": "Magical Athlete",
    "nameZh": "魔法运动员",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "主骰1：移动7；2：末位传送到自己；3：传送到另一选手并绊倒对方；4：移动4并额外回合；5：领跑者后退5；6：移动6并绊倒越过者。",
    "timing": [
      "main-roll-final",
      "passed"
    ],
    "optional": false,
    "targets": "按骰面确定；并列目标选一名",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次主移动",
    "duration": "本次效果",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Magical Athlete",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-15",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Magical%20Athlete.png"
  },
  {
    "id": "mole",
    "nameEn": "Mole",
    "nameZh": "鼹鼠",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "若自己周围1格内没有其他选手，可不掷主骰，改为移动6。",
    "timing": [
      "before-main"
    ],
    "optional": true,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次主移动",
    "duration": "本次主移动",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Mole",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-16",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Mole.png"
  },
  {
    "id": "mr-dice-guy",
    "nameEn": "Mr. Dice Guy",
    "nameZh": "骰子先生",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "主移动掷六颗骰子，从出现至少两次的点数中选择一个作为结果。",
    "timing": [
      "main-roll"
    ],
    "optional": false,
    "targets": "六颗骰子中重复的点数",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次主移动",
    "duration": "本次主移动",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Mr. Dice Guy",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-17",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Mr.%20Dice%20Guy.png"
  },
  {
    "id": "mush",
    "nameEn": "Mush",
    "nameZh": "蘑菇泥",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "主移动最终骰面1或2时抽一张选手牌，获得其能力至本场结束，可累积。",
    "timing": [
      "main-roll-final"
    ],
    "optional": false,
    "targets": "牌库顶选手牌",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每个最终1或2",
    "duration": "本场剩余时间",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Mush",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-18",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Mush.png"
  },
  {
    "id": "nemesis",
    "nameEn": "Nemesis",
    "nameZh": "宿敌",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "其他选手掷主骰时，自己可跟掷；相同则移动该点数。",
    "timing": [
      "other-main-roll"
    ],
    "optional": true,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次其他选手主骰",
    "duration": "立即",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Nemesis",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-19",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Nemesis.png"
  },
  {
    "id": "nepo-baby",
    "nameEn": "Nepo Baby",
    "nameZh": "关系宝宝",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "开赛时置于第一弯道。",
    "timing": [
      "before-race"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "开赛一次",
    "duration": "起始位置",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Nepo Baby",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-20",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Nepo%20Baby.png"
  },
  {
    "id": "null",
    "nameEn": "Null",
    "nameZh": "虚无",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "自己前方选手主移动−1，且没有能力。",
    "timing": [
      "continuous",
      "main-move"
    ],
    "optional": false,
    "targets": "严格位于自身前方的在赛选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "持续",
    "duration": "符合位置条件时",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Null",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-21",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Null.png"
  },
  {
    "id": "overtaker",
    "nameEn": "Overtaker",
    "nameZh": "超车骷髅",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "自己前方每有一名选手，主移动+1。",
    "timing": [
      "main-move"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次主移动",
    "duration": "本次主移动",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Overtaker",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-22",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Overtaker.png"
  },
  {
    "id": "party-pooper",
    "nameEn": "Party Pooper",
    "nameZh": "扫兴鬼",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "所有掷出的6必须重掷；每次因此重掷，自己移动1。",
    "timing": [
      "any-roll"
    ],
    "optional": false,
    "targets": "所有骰子；自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每个6",
    "duration": "旧骰作废",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Party Pooper",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-23",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Party%20Pooper.png"
  },
  {
    "id": "penguin",
    "nameEn": "Penguin",
    "nameZh": "企鹅",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "被其他选手越过时自己绊倒；绊倒时主移动不跳过，改为骰面加倍。",
    "timing": [
      "passed",
      "main-move",
      "recovery"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次被越过/绊倒主移动",
    "duration": "保持绊倒，主骰加倍代替跳过；待官方复核",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Penguin",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-24",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Penguin.png"
  },
  {
    "id": "re-runner",
    "nameEn": "Re-Runner",
    "nameZh": "返场跑者",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "首次参赛后，余下每场都作为所属玩家的额外选手参赛。",
    "timing": [
      "race-end",
      "before-race"
    ],
    "optional": false,
    "targets": "稳定的所属玩家",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "首次参赛后各场",
    "duration": "本局剩余比赛",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Re-Runner",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-25",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Re-Runner.png"
  },
  {
    "id": "show-off",
    "nameEn": "Show-Off",
    "nameZh": "显摆精",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "主移动掷骰后，可以继续掷骰并累计距离；若新骰不大于前一个骰面，本次不移动。",
    "timing": [
      "main-roll",
      "push-your-luck"
    ],
    "optional": true,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "可持续追加，严格递增",
    "duration": "本次主移动",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Show-Off",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-26",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Show-Off.png"
  },
  {
    "id": "soulmate",
    "nameEn": "Soulmate",
    "nameZh": "灵魂伴侣",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "开赛前选择一名对方选手；自己回合开始距其不超过5格时，传送到对方所在格。",
    "timing": [
      "before-race",
      "turn-start"
    ],
    "optional": false,
    "targets": "由其他玩家控制的在赛选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "开赛选一名；每回合开始一次",
    "duration": "本场",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Soulmate",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-27",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Soulmate.png"
  },
  {
    "id": "speed-demon",
    "nameEn": "Speed Demon",
    "nameZh": "速度恶魔",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "自己玩家每有1分，主移动+1；回合开始领先所有其他选手至少4格时淘汰。",
    "timing": [
      "turn-start",
      "main-move"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每回合开始/主移动",
    "duration": "即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Speed Demon",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-28",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Speed%20Demon.png"
  },
  {
    "id": "spoilsport",
    "nameEn": "Spoilsport",
    "nameZh": "输不起",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "回合开始时，如果所有其他选手均领先自己至少5格，取消本场比赛，自己获得3分。",
    "timing": [
      "turn-start"
    ],
    "optional": false,
    "targets": "自身及整场比赛",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每回合开始一次",
    "duration": "本场取消",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Spoilsport",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-29",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Spoilsport.png"
  },
  {
    "id": "stepdad",
    "nameEn": "Stepdad",
    "nameZh": "继父",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "自己左边选手主移动+2；该选手获得第一时，自己获得3分。",
    "timing": [
      "before-race",
      "main-move",
      "first-finish"
    ],
    "optional": false,
    "targets": "固定行动顺序中左边的选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "持续；获冠军一次",
    "duration": "本场",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Stepdad",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-30",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Stepdad.png"
  },
  {
    "id": "streaker",
    "nameEn": "Streaker",
    "nameZh": "裸奔客",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "一次移动越过至少一名选手时，自己获得1分。",
    "timing": [
      "passed"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每次越过移动一次",
    "duration": "立即",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Streaker",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-31",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Streaker.png"
  },
  {
    "id": "stunner",
    "nameEn": "Stunner",
    "nameZh": "惊艳者",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "自己周围1格内的其他选手，所有掷骰结果均为1。",
    "timing": [
      "any-roll"
    ],
    "optional": false,
    "targets": "距自身不超过1格的其他选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "持续",
    "duration": "符合位置条件时",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Stunner",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-32",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Stunner.png"
  },
  {
    "id": "switcharoo",
    "nameEn": "Switcharoo",
    "nameZh": "交换袋鼠",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "回合结束时，可与距离自己不超过1格的另一选手交换控制权。选手实例和位置保持。",
    "timing": [
      "turn-end"
    ],
    "optional": true,
    "targets": "距离不超过1格的其他选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每回合结束一次",
    "duration": "本场控制权与牌归属",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Switcharoo",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-33",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Switcharoo.png"
  },
  {
    "id": "tail",
    "nameEn": "Tail",
    "nameZh": "尾巴",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "回合开始时，可传送到最近前方选手身后1格。",
    "timing": [
      "turn-start"
    ],
    "optional": true,
    "targets": "最近前方格；并列同格无差别",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每回合开始一次",
    "duration": "立即",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Tail",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-34",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Tail.png"
  },
  {
    "id": "the-hose",
    "nameEn": "The Hose",
    "nameZh": "水管",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "回合结束时掷一骰，绊倒前方距离不超过该骰面的所有选手。",
    "timing": [
      "turn-end",
      "ability-roll"
    ],
    "optional": false,
    "targets": "前方范围内其他选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "每回合结束一次",
    "duration": "至目标恢复",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / The Hose",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-35",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/The%20Hose.png"
  },
  {
    "id": "understudy",
    "nameEn": "Understudy",
    "nameZh": "替补演员",
    "translation": "本项目译名",
    "edition": "second-wind",
    "ability": "开赛前复制一名对方选手的能力。",
    "timing": [
      "before-race"
    ],
    "optional": false,
    "targets": "由其他玩家控制的选手",
    "scope": "按卡文；other 为其他选手，opposing 为其他玩家控制的选手",
    "limit": "开赛一次",
    "duration": "本场",
    "statuses": [],
    "sources": [
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/?v=13",
        "title": "非官方玩家图鉴：Second Wind 卡文转录（未采用 Interactions）",
        "locator": "Second Wind / Understudy",
        "accessed": "2026-10-21",
        "version": "v13"
      },
      {
        "url": "https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf",
        "title": "CMYK 更新版基础规则书镜像；只用于通则",
        "locator": "p14 / p15 / p20 / p23",
        "accessed": "2026-10-21",
        "version": "32页更新版；非Second Wind完整规则书"
      }
    ],
    "testId": "SW-36",
    "verified": false,
    "verification": "卡文转录已核对；待官方 Second Wind 规则/卡面复核",
    "imageUrl": "https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Understudy.png"
  }
];
