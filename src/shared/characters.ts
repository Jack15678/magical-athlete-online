import { FAN_CHARACTERS } from './fan-expansions.js';
import { SECOND_WIND_CHARACTERS } from './second-wind.js';
import { WURSTII_CHARACTERS } from './wurstii.js';
import type { CharacterPool } from './types.js';
/** CMYK 2025 base box, 36 racers. Chinese names are project translations.
 * Rule interpretations are pinned to IELLO FAQ v2.0 (2026-08-28).
 * Source verification does not mean the corresponding engine behavior is implemented/tested.
 */
export interface CharacterSource { url: string; title: string; locator: string; accessed: string; version: string }
export interface CharacterData {
  edition?: 'original' | 'second-wind' | 'extra-mile' | 'leaf' | 'wurstii'; imageUrl?: string; verification?: string; limit?: string; adaptation?: string;
  id: string; nameEn: string; nameZh: string; translation: '本项目译名'; ability: string;
  timing: string[]; optional: boolean; targets: string; scope: string; duration: string;
  statuses: string[]; sources: CharacterSource[]; testId: string; verified: boolean;
}

export const ORIGINAL_CHARACTERS: readonly CharacterData[] = [
  {
    "id": "alchemist",
    "nameEn": "Alchemist",
    "nameZh": "炼金术士",
    "translation": "本项目译名",
    "ability": "主移动最终骰面为1或2时，可以把基础移动距离改为4；骰面不变。",
    "timing": [
      "main-roll-final"
    ],
    "optional": true,
    "targets": "自身",
    "scope": "主移动",
    "duration": "本次主移动",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 22，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Alchimiste；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-01",
    "verified": true
  },
  {
    "id": "baba-yaga",
    "nameEn": "Baba Yaga",
    "nameZh": "芭芭雅嘎",
    "translation": "本项目译名",
    "ability": "其他角色停在自己所在格，或自己停在已有其他角色的格子时，使那些角色绊倒。同组同时到达者之间不触发。",
    "timing": [
      "stop"
    ],
    "optional": false,
    "targets": "与自身发生单独到达接触的其他在赛角色",
    "scope": "同格",
    "duration": "绊倒至下次主移动恢复",
    "statuses": [
      "tripped"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 22，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Baba Yaga；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-02",
    "verified": true
  },
  {
    "id": "banana",
    "nameEn": "Banana",
    "nameZh": "香蕉",
    "translation": "本项目译名",
    "ability": "任何角色在一次移动中越过自己，都在完成整次移动后绊倒。向前或向后越过均适用，从同格出发不算越过。",
    "timing": [
      "passed"
    ],
    "optional": false,
    "targets": "越过自身的其他在赛角色",
    "scope": "路径越过",
    "duration": "绊倒至下次主移动恢复",
    "statuses": [
      "tripped"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 22，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Banane；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-03",
    "verified": true
  },
  {
    "id": "blimp",
    "nameEn": "Blimp",
    "nameZh": "飞艇",
    "translation": "本项目译名",
    "ability": "回合开始时若位于第二个弯角之前，本回合主移动+3；在该弯角或之后则主移动-1。",
    "timing": [
      "turn-start",
      "main-modifier"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "主移动",
    "duration": "当前回合",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 22，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Dirigeable；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-04",
    "verified": true
  },
  {
    "id": "centaur",
    "nameEn": "Centaur",
    "nameZh": "半人马",
    "translation": "本项目译名",
    "ability": "自己在一次移动中越过角色时，被越过者后退2格，最远退至起点。沿路径依次处理被越过的格子；同格目标同时后退。",
    "timing": [
      "pass"
    ],
    "optional": false,
    "targets": "被自身越过的其他在赛角色",
    "scope": "路径越过",
    "duration": "即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 22，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Centaure；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-05",
    "verified": true
  },
  {
    "id": "cheerleader",
    "nameEn": "Cheerleader",
    "nameZh": "啦啦队长",
    "translation": "本项目译名",
    "ability": "回合开始时，可以让所有并列末位的角色同时前进2格；结算完这些移动及后果后，自己另外前进1格。可以帮助自己。",
    "timing": [
      "turn-start"
    ],
    "optional": true,
    "targets": "全部并列最后的在赛角色，可包含自身",
    "scope": "全赛道",
    "duration": "即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 22，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Pompon；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-06",
    "verified": true
  },
  {
    "id": "coach",
    "nameEn": "Coach",
    "nameZh": "教练",
    "translation": "本项目译名",
    "ability": "与自己同格的所有角色主移动+1，包括自己。加成并入同一次主移动，不是额外移动。",
    "timing": [
      "main-modifier"
    ],
    "optional": false,
    "targets": "当时与自身同格的所有在赛角色，含自身",
    "scope": "同格",
    "duration": "计算主移动时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 22，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Coach；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-07",
    "verified": true
  },
  {
    "id": "copycat",
    "nameEn": "Copycat",
    "nameZh": "模仿猫",
    "translation": "本项目译名",
    "ability": "持续拥有当前领先角色的印刷能力；并列领先时选择一名，不能在一个动作中途切换。不能补用赛前能力；与原角色能力矛盾时原角色优先。复制双胞胎只获得其印刷选择能力，不获得它选择的能力。",
    "timing": [
      "leader-change",
      "continuous"
    ],
    "optional": false,
    "targets": "当前并列领先的其他在赛角色",
    "scope": "全赛道",
    "duration": "直到领先或所选对象变化",
    "statuses": [
      "copied-power",
      "copied-prediction"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 22，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Imichateur；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-08",
    "verified": true
  },
  {
    "id": "dicemonger",
    "nameEn": "Dicemonger",
    "nameZh": "骰子商人",
    "translation": "本项目译名",
    "ability": "所有角色每回合均可将主移动骰重掷一次。其他角色采用这次重掷时，商人先前进1格并结算全部后果，再掷新骰；舍弃骰面不触发结果技能。",
    "timing": [
      "reroll-window"
    ],
    "optional": true,
    "targets": "当前执行主移动的在赛角色，含自身",
    "scope": "全赛道",
    "duration": "每回合一次",
    "statuses": [
      "reroll-used"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 22，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Marchand Déambulant；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-09",
    "verified": true
  },
  {
    "id": "duelist",
    "nameEn": "Duelist",
    "nameZh": "决斗家",
    "translation": "本项目译名",
    "ability": "自己与其他角色同格时，可以在当前动作完成后发起决斗：双方掷骰，高者前进2格，平局自己胜。合法条件再次出现可再次发起，其他人的回合及起点也适用。",
    "timing": [
      "action-complete",
      "shared-space"
    ],
    "optional": true,
    "targets": "与自身同格的一名其他在赛角色",
    "scope": "同格",
    "duration": "本次决斗",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 23，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Duelliste；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-10",
    "verified": true
  },
  {
    "id": "egg",
    "nameEn": "Egg",
    "nameZh": "蛋",
    "translation": "本项目译名",
    "ability": "赛前从未分配的角色牌堆抽3张，选择一张，整场复制其能力，包括赛前能力。仍使用蛋作为角色身份和棋子。",
    "timing": [
      "before-race"
    ],
    "optional": false,
    "targets": "刚抽出的3张新角色牌之一",
    "scope": "未分配牌堆",
    "duration": "本场比赛",
    "statuses": [
      "copied-power",
      "egg-offer"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 23，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Œuf；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-11",
    "verified": true
  },
  {
    "id": "flip-flop",
    "nameEn": "Flip Flop",
    "nameZh": "人字拖",
    "translation": "本项目译名",
    "ability": "可以用与一名其他在赛角色交换位置，替代自己的主移动掷骰。双方同时传送并在目的地停下，不经过中间格，也不产生移动或越过。",
    "timing": [
      "main-replacement"
    ],
    "optional": true,
    "targets": "一名其他在赛角色",
    "scope": "全赛道",
    "duration": "即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 23，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Tong；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-12",
    "verified": true
  },
  {
    "id": "genius",
    "nameEn": "Genius",
    "nameZh": "天才",
    "translation": "本项目译名",
    "ability": "掷主移动骰前，可以预测最终骰面。若猜中，完成当前回合及后果后再行动一次；猜中1而船长在赛时，船长的后继安排取代这次额外回合。",
    "timing": [
      "before-main-roll",
      "turn-end"
    ],
    "optional": true,
    "targets": "预测1至6中的一个数",
    "scope": "自身",
    "duration": "本回合",
    "statuses": [
      "die-prediction",
      "extra-turn"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 23，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Génie；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-13",
    "verified": true
  },
  {
    "id": "gunk",
    "nameEn": "Gunk",
    "nameZh": "黏液怪",
    "translation": "本项目译名",
    "ability": "所有其他在赛角色的主移动距离-1。多个此能力可叠加，距离可以为负；不会改变骰面。",
    "timing": [
      "main-modifier"
    ],
    "optional": false,
    "targets": "所有其他在赛角色",
    "scope": "全赛道",
    "duration": "自身仍在赛期间",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 23，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Slime；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-14",
    "verified": true
  },
  {
    "id": "hare",
    "nameEn": "Hare",
    "nameZh": "野兔",
    "translation": "本项目译名",
    "ability": "主移动距离+2。但若回合开始时独自领先，则完全跳过本回合主移动；若已绊倒也不借此恢复。并列领先时正常行动。",
    "timing": [
      "turn-start",
      "main-modifier"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "主移动",
    "duration": "当前回合",
    "statuses": [
      "skip-main"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 23，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Lièvrapide；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-15",
    "verified": true
  },
  {
    "id": "heckler",
    "nameEn": "Heckler",
    "nameZh": "起哄者",
    "translation": "本项目译名",
    "ability": "任一角色在全部后果处理完的回合末，若停在距该回合起点不超过1格的位置，自己前进2格。可以因自己的回合或仅起身的回合触发。",
    "timing": [
      "turn-end"
    ],
    "optional": false,
    "targets": "自身；检查任一刚结束回合的在赛角色",
    "scope": "全赛道",
    "duration": "即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 23，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Hyénarquoise；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-16",
    "verified": true
  },
  {
    "id": "huge-baby",
    "nameEn": "Huge Baby",
    "nameZh": "巨婴",
    "translation": "本项目译名",
    "ability": "除起点外，其他角色不能与自己同格。任何将导致同格的情况，都把其他角色强制放在自己身后1格。该放置不算移动，但算在新格停下。",
    "timing": [
      "before-stop",
      "continuous"
    ],
    "optional": false,
    "targets": "将与自身同格的所有其他在赛角色",
    "scope": "同格，起点除外",
    "duration": "自身仍在赛期间",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 23，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Gros Bébé；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-17",
    "verified": true
  },
  {
    "id": "hypnotist",
    "nameEn": "Hypnotist",
    "nameZh": "催眠师",
    "translation": "本项目译名",
    "ability": "回合开始时，可以将一名在赛角色传送到自己所在格。传送不算移动或越过，但目的地停留效果正常触发。",
    "timing": [
      "turn-start"
    ],
    "optional": true,
    "targets": "一名在赛角色",
    "scope": "全赛道",
    "duration": "即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 23，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Hypnotiseur；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-18",
    "verified": true
  },
  {
    "id": "inchworm",
    "nameEn": "Inchworm",
    "nameZh": "尺蠖",
    "translation": "本项目译名",
    "ability": "其他角色主移动的最终骰面为1时，取消其整个主移动，改为自己前进1格。原角色的移动加成不会成为独立移动。",
    "timing": [
      "main-roll-final"
    ],
    "optional": false,
    "targets": "最终主骰为1的其他在赛角色及自身",
    "scope": "全赛道",
    "duration": "即时",
    "statuses": [
      "cancel-main"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 24，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Chenille；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-19",
    "verified": true
  },
  {
    "id": "lackey",
    "nameEn": "Lackey",
    "nameZh": "跟班",
    "translation": "本项目译名",
    "ability": "其他角色主移动的最终骰面为6时，在其主移动之前，自己先前进2格。自己的6不触发。",
    "timing": [
      "main-roll-final"
    ],
    "optional": false,
    "targets": "自身；由其他在赛角色最终主骰6触发",
    "scope": "全赛道",
    "duration": "即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 24，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Larbin；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-20",
    "verified": true
  },
  {
    "id": "leaptoad",
    "nameEn": "Leaptoad",
    "nameZh": "跳跳蟾蜍",
    "translation": "本项目译名",
    "ability": "任何移动都只计空格，跳过其他角色占据的格子，向后移动也适用。同组同时离开的格子视为空格；每个跳过的占用格是一次能力触发。",
    "timing": [
      "movement-step"
    ],
    "optional": false,
    "targets": "自身",
    "scope": "每次非传送移动的路径",
    "duration": "自身仍在赛期间",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 24，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Grouille-Grenouille；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-21",
    "verified": true
  },
  {
    "id": "legs",
    "nameEn": "Legs",
    "nameZh": "大长腿",
    "translation": "本项目译名",
    "ability": "可以不掷主移动骰，改用基础距离5进行主移动；仍受教练、黏液怪等移动修正影响。没有骰面可触发1或6的技能。",
    "timing": [
      "before-main-roll",
      "main-replacement"
    ],
    "optional": true,
    "targets": "自身",
    "scope": "主移动",
    "duration": "本次主移动",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 24，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Guy Bolles；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-22",
    "verified": true
  },
  {
    "id": "lovable-loser",
    "nameEn": "Lovable Loser",
    "nameZh": "可爱的倒霉蛋",
    "translation": "本项目译名",
    "ability": "回合开始时若独自处于最后一位，获得1分。并列最后不获得；之后需要起身也照样得分。",
    "timing": [
      "turn-start"
    ],
    "optional": false,
    "targets": "自身所属玩家",
    "scope": "全赛道排名",
    "duration": "即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 24，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Endormimie；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-23",
    "verified": true
  },
  {
    "id": "magician",
    "nameEn": "Magician",
    "nameZh": "魔术师",
    "translation": "本项目译名",
    "ability": "主移动骰可以重掷最多两次，每次都必须保留最新结果。每次重掷是独立技能触发，被舍弃的骰面不触发结果技能。",
    "timing": [
      "reroll-window"
    ],
    "optional": true,
    "targets": "自身最新的主移动骰",
    "scope": "主移动",
    "duration": "每次主移动最多两次",
    "statuses": [
      "magician-rerolls"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 24，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Magicien；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-24",
    "verified": true
  },
  {
    "id": "mastermind",
    "nameEn": "Mastermind",
    "nameZh": "幕后军师",
    "translation": "本项目译名",
    "ability": "自己的首次回合开始时，预测一名比赛胜者。若预测者获胜，比赛立即结束，自己获得第二名。可预测自己并同时取得第一及第二；若自己已被淘汰，能力失效。",
    "timing": [
      "first-turn-start",
      "first-finish"
    ],
    "optional": false,
    "targets": "任一在赛角色，可包含自身",
    "scope": "全赛道",
    "duration": "本场比赛",
    "statuses": [
      "winner-prediction"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 24，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Tremplin-Devin；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-25",
    "verified": true
  },
  {
    "id": "mouth",
    "nameEn": "M.O.U.T.H.",
    "nameZh": "大嘴怪",
    "translation": "本项目译名",
    "ability": "自己停在已有恰好一名其他角色的格子时，将该角色淘汰出本场比赛。其他人单独来找自己不触发；同组同时到达者之间不触发。",
    "timing": [
      "stop"
    ],
    "optional": false,
    "targets": "自己目的地原本唯一的其他在赛角色",
    "scope": "同格",
    "duration": "目标本场淘汰",
    "statuses": [
      "eliminated"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 24，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / B.O.U.C.H.E.；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-26",
    "verified": true
  },
  {
    "id": "party-animal",
    "nameEn": "Party Animal",
    "nameZh": "派对动物",
    "translation": "本项目译名",
    "ability": "回合开始时，所有其他角色同时朝自己移动1格。同格的每名其他角色，为自己的本回合主移动提供+1。同时到达者之间不触发相遇技能。",
    "timing": [
      "turn-start",
      "main-modifier"
    ],
    "optional": false,
    "targets": "所有其他在赛角色",
    "scope": "全赛道",
    "duration": "吸引即时；加成本回合",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 24，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Gros Fêtard；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-27",
    "verified": true
  },
  {
    "id": "rocket-scientist",
    "nameEn": "Rocket Scientist",
    "nameZh": "火箭科学家",
    "translation": "本项目译名",
    "ability": "掷主移动骰后，可以将骰面翻倍作为基础主移动距离，再应用加减修正；完成移动后自己绊倒。",
    "timing": [
      "main-roll-final",
      "after-main-move"
    ],
    "optional": true,
    "targets": "自身",
    "scope": "主移动",
    "duration": "绊倒至下次主移动恢复",
    "statuses": [
      "tripped",
      "double-main"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 25，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Docteur Fusée；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-28",
    "verified": true
  },
  {
    "id": "romantic",
    "nameEn": "Romantic",
    "nameZh": "浪漫家",
    "translation": "本项目译名",
    "ability": "任一角色停在已有恰好一名其他角色的格子时，自己前进2格，可以因自己停下触发。同一组同时到达者之间不触发。",
    "timing": [
      "stop"
    ],
    "optional": false,
    "targets": "自身；由任一在赛角色的单独到达触发",
    "scope": "全赛道",
    "duration": "即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 25，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Romantique；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-29",
    "verified": true
  },
  {
    "id": "scoocher",
    "nameEn": "Scoocher",
    "nameZh": "蹭蹭怪",
    "translation": "本项目译名",
    "ability": "其他角色每次使用或触发能力并完成该能力后，自己前进1格。每个黏液减益、每次重掷、每格占用格跳跃分别计次；自己产生后果的新分支先完整结算。",
    "timing": [
      "power-complete"
    ],
    "optional": false,
    "targets": "自身；由其他在赛角色的能力触发",
    "scope": "全赛道",
    "duration": "即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 25，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Sac-à-Puces；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-30",
    "verified": true
  },
  {
    "id": "sisyphus",
    "nameEn": "Sisyphus",
    "nameZh": "西西弗斯",
    "translation": "本项目译名",
    "ability": "赛前获得4分。自己的主移动最终骰面为6时，完全替代主移动：立即传送回起点并失去1分，总分最低为0；超过四次仍照常触发。",
    "timing": [
      "before-race",
      "main-roll-final"
    ],
    "optional": false,
    "targets": "自身及所属玩家",
    "scope": "全赛道",
    "duration": "赛前得分永久；传送即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 25，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Sisyphe；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-31",
    "verified": true
  },
  {
    "id": "skipper",
    "nameEn": "Skipper",
    "nameZh": "船长",
    "translation": "本项目译名",
    "ability": "任一角色主移动最终骰面为1时，当前回合及全部后果结束后，改由自己下一个行动。之后从自己左边继续。自己的1也让自己再行动。",
    "timing": [
      "main-roll-final",
      "turn-end"
    ],
    "optional": false,
    "targets": "自身；由任一在赛角色最终主骰1触发",
    "scope": "行动顺序",
    "duration": "当前回合结束时",
    "statuses": [
      "next-racer"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 25，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Cap’taine Passe；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-32",
    "verified": true
  },
  {
    "id": "stickler",
    "nameEn": "Stickler",
    "nameZh": "较真怪",
    "translation": "本项目译名",
    "ability": "所有其他角色通过任何移动越过终点线时，必须距离恰好够抵达终点；距离过长则整次移动取消，不是截短到终点。自身不受限制。",
    "timing": [
      "before-move"
    ],
    "optional": false,
    "targets": "所有其他在赛角色",
    "scope": "所有非传送移动",
    "duration": "自身仍在赛期间",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 25，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Tatillon；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-33",
    "verified": true
  },
  {
    "id": "suckerfish",
    "nameEn": "Suckerfish",
    "nameZh": "吸盘鱼",
    "translation": "本项目译名",
    "ability": "其他同格角色开始移动前，可以选择随行至该次移动的目的地，一旦随行必须走完整次移动。双方同组同时抵达，被跟随者优先处理排名及后果；不能跟随传送。",
    "timing": [
      "before-move"
    ],
    "optional": true,
    "targets": "与自身同格且将开始移动的一名其他在赛角色",
    "scope": "同起点角色的整次移动",
    "duration": "该次移动",
    "statuses": [
      "following"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 25，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Poisson-Ventouse；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-34",
    "verified": true
  },
  {
    "id": "third-wheel",
    "nameEn": "Third Wheel",
    "nameZh": "电灯泡",
    "translation": "本项目译名",
    "ability": "回合开始时，可以传送到恰好有两名角色的格子。停留效果正常触发，之后仍进行主移动。",
    "timing": [
      "turn-start"
    ],
    "optional": true,
    "targets": "恰好被两名在赛角色占据的格子",
    "scope": "全赛道",
    "duration": "即时",
    "statuses": [],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 25，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Cinquième Roue；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-35",
    "verified": true
  },
  {
    "id": "twin",
    "nameEn": "Twin",
    "nameZh": "双胞胎",
    "translation": "本项目译名",
    "ability": "赛前可以选择此前比赛的冠军，整场复制该冠军的能力，包括赛前能力。仍使用双胞胎身份和棋子；仅获第二名者不能选。",
    "timing": [
      "before-race"
    ],
    "optional": true,
    "targets": "此前场次获得第一名的角色",
    "scope": "历史冠军",
    "duration": "本场比赛",
    "statuses": [
      "copied-power"
    ],
    "sources": [
      {
        "url": "https://gamers-hq.de/media/pdf/g0/6d/14/How-to-play-MAGICAL-ATHLETE.pdf",
        "title": "CMYK How to play Magical Athlete（发行商镜像，旧修订）",
        "locator": "PDF/印刷页 25，可见卡面",
        "accessed": "2026-10-20",
        "version": "2025基础盒旧规则；以FAQ修订覆盖"
      },
      {
        "url": "https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/",
        "title": "IELLO FAQ v2.0",
        "locator": "Les Athlètes / Jumeau；Points de règles",
        "accessed": "2026-10-20",
        "version": "2026-08-28，声明纳入CMYK 2026年8月修订"
      }
    ],
    "testId": "CHAR-36",
    "verified": true
  }
];
const TWO_EDITIONS = [...ORIGINAL_CHARACTERS.map(c=>({...c,edition:'original' as const})), ...SECOND_WIND_CHARACTERS];
export const CHARACTERS: readonly CharacterData[] = [...TWO_EDITIONS, ...FAN_CHARACTERS, ...WURSTII_CHARACTERS];
/** Legacy pool names retain their original meaning; current rooms use RoomConfig. */
export function characterPool(pool: CharacterPool = 'original'): readonly CharacterData[] {
  if (pool === 'all') return [...TWO_EDITIONS, ...WURSTII_CHARACTERS];
  if (pool === 'wurstii') return [...ORIGINAL_CHARACTERS, ...WURSTII_CHARACTERS];
  return pool === 'mixed' ? TWO_EDITIONS : pool === 'second-wind' ? SECOND_WIND_CHARACTERS : ORIGINAL_CHARACTERS;
}
export const CHARACTER_BY_ID: Readonly<Record<string, CharacterData>> = Object.fromEntries(CHARACTERS.map(character => [character.id, character]));
export const CHARACTER_IDS = CHARACTERS.map(character => character.id);
