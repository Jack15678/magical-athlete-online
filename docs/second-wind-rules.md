# Second Wind 接入、来源与核验状态（2026-10-21）

当前角色数据为原作36张 + Second Wind36张，共72个稳定定义；不包含 Extra Mile。不能据此标记“完整支持72个角色”：新角色官方完整规则/卡面复核和下面的边界裁定尚未全部完成。

## 已取得的资料

- [CMYK更新版基础规则书镜像](https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf)：直接下载成功，共32页。它是更新版基础规则书，不是 Second Wind 完整规则书。p14明确主要移动和可选/强制措辞；p15顺序为赛道、当前玩家、顺时针其他玩家；p20列出合盒四场顺序；p23区分移动、传送、停格、越过、最终骰面、并列目标、多选手固定顺序、能力失效、循环和剩余一人的规则。保存于 `docs/research-downloads/cmyk-updated-base-2026.pdf`。
- [IELLO发行商FAQ](https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/)：网页可访问。FAQ2.0，2026-08-28更新，声明纳入CMYK2026年8月修订。用于基础通则和原作交互，不当作续作逐卡FAQ。
- [玩家图鉴v13](https://johnnlds.github.io/Magical-Athlete-Racers/?v=13)：网页及脚本可访问，脚本 `expansionAthletes` 数组恰好36条，每条标签 Second Wind。分别读取其中技能转录、插画链接；未读取站主 Interactions 作为裁定。插画只有角色形象，不能用它证明文字确为官方卡面。
- [Ludopedia英文规则线索](https://ludopedia.com.br/jogo/magical-athlete-second-wind/anexos/350133)：搜索/网页工具可读到文件介绍，称为发行方Discord流出的英文规则；直接下载请求遇到Cloudflare验证，未取得正文。没有绕过登录，也没有据文件介绍宣称核实版本。另找到 `CMYK_MASW_Rulebook_072826_FPO.pdf` 的过期Discord线索，未取得文件。

来源优先级为：官方规则/卡面、主创原始答复、发行商FAQ、玩家卡文转录、玩家解释。当前新36张的数据均 `verified:false`，显示“卡文转录已核对；待官方 Second Wind 规则/卡面复核”。中文名都是本项目暂译，未宣称官方译名。

## 引擎落实

`characters.ts` 导出 `ORIGINAL_CHARACTERS`、完整 `CHARACTERS` 和 `characterPool('original'|'second-wind'|'mixed')`。完整36张续作记录在 `second-wind.ts`，包括稳定ID、中英文名、版本、来源/定位/访问日期、触发时点、可选性、目标、次数、持续时间、插画URL和核验状态。

每次新局记录 `characterPool` 和 `rulesVersion=cmyk-base-aug2026-sw-transcript-v1`。旧存档缺版本时绑定 `legacy-base-v1` 并通过 `engine/runtime.ts` 单一版本登记继续使用保存的旧引擎 `legacy-v1.ts`；未知版本拒绝套用当前规则，保留存档待对应引擎恢复。牌库与蛋候选补充都沿用本局牌池；练习模式一直提供完整72张选四张。赛道仍是明确的现有赛道配置 Mild/Wild/Mild/Wild。官方合盒次序是 Mild Mile → Wild Wilds → Twisty Twirl → Whirly World；因新两条赛道布局与格子规则未核实，未按名称猜测实现。

玩家ID用于身份、分数和重连；`Racer.identityPlayerId`保留选手创建来源，`Racer.playerId`是当前控制者，`Racer.id`是场上实例，`characterId`是印刷角色定义。Switcharoo只交换当前控制者和已用牌归属，不交换位置或实例ID。Re-Runner记录后续额外参赛条目，并在每场创建额外实例；固定行动列表不限定每玩家两名。

`effectivePowers`支持多个实际能力；Mush保留自身和新增能力，复制来源保持独立；Null从后方往前方确定哪些Null仍有效，被禁用的Null不能继续禁用更前方选手。旧的双人粘液怪例外仍仅适用粘液怪，其他角色的“其他选手”包含队友；“对方选手”按当前控制者不同筛选。

所有骰子进入可序列化 `rollBatch` 任务：主骰、六骰、追加骰、跟掷、水管和决斗。Stunner修改最终骰面，原随机值留在权威审计。Party Pooper针对所有最终6点强制重掷，其移动与连锁先完成，再生成替代骰。原骰不进入后续最终结果观察者。真人的每个可选或强制选择都必须由对应控制者提交，自动调度不提前代选；队列和隐藏context可以保存后恢复。

Cheatah设定值只保留在权威`flags.cheatahSecret`和pending.context，公共投影删除秘密字段和context。猜测完成后才发布揭晓事件。决斗第一颗保留骰同样在第二方提交前不公开。动画只读取事件。

## 当前明确待核实的续作边界

以下是可运行实现中的暂定解释或尚缺权威依据的交互，不能标记官方已核验：

1. Bite Mark的转录文字未说明还原时点；实现保留狼人形态至本场结束，没有编造“掷3～6自动还原”。是否需要不同持续时间，待官方正文/双面卡确认。
2. Mr. Dice Guy六骰恰好1～6各一次时，没有重复合法点数。当前保留规则队列并暂停本场，显示准确的待核实原因；不编造跳过或重新投掷的处理。
3. Show-Off累加时哪些骰触发观察者，以及与Magician、Critic、Dicemonger、Nemesis、Inchworm等在追加中如何衔接，仍缺续作官方说明。当前先完成继续/停止，保留最后骰面与累计移动距离分别记录；Party Pooper会处理每颗追加骰。
4. 多个来源同时提供“以另一方式代替主移动”时，目前提供主移动能力选择；是否应顺序叠加、取代或限制，待官方裁定。多个被动加减与多来源复制已有实现，但这不等于所有72×72交互均已核验。
5. Doppelgängster自冲线、多个复制的Doppelgängster、它获得的能力是否包含对方已获得能力、与Mastermind同时结束的优先关系，仍需逐项取得权威例证。当前按首个冲线者淘汰（包含自己）、每场一次、持续获得实际能力处理。
6. Re-Runner与Switcharoo跨比赛的最终卡归属、Re-Runner获得其他角色能力后是否继续额外出场、一次比赛出现多个同名来源的额外参赛条目，需要官方续作多选手示例。
7. Hog Knight多名同时到达、原骑手到达另一名选手、骑手被淘汰/完赛、Null禁用来源后坐骑是否留下，仍需官方坐骑规则。当前非同时到达者可以夺走已在格子的坐骑，坐骑物件独立给骑手+2。
8. Penguin转录规定绊倒时主骰加倍以替代跳过，没有明确要求在该移动后恢复；实现保持绊倒并只加倍原主骰，不加倍后续加减。与不掷骰的固定距离能力结合，尚待核实。
9. Spoilsport取消比赛是否触发Gloth等“比赛结束”奖励，已有名次如何处理；以及比赛结束前后同时触发多个奖励的细节，尚待官方续作说明。
10. 新获得能力不会重开已经过去的before-race时点；Understudy在before-race窗口复制能力时会继续初始化该能力（包括Sisyphus、Egg、Hog Knight等）。此处理依照基础规则时点原则，仍待续作复制示例复核。

## 验证范围

`tests/second-wind.test.ts`对新增36张分别编写行为用例，另覆盖秘密信息投影/保存恢复、真人强制选择权限、Null与Mush、Understudy赛前初始化、复制、全类型骰子强制重掷、原骰与距离分离、控制权交换和回合外选择。`tests/second-wind-match.test.ts`分别用续作和混合池、2/4/8名玩家从选秀完成四场，所有决策使用公共投影，并在待选时保存恢复。

这些验证证明目前实现的行为和状态机可以复现；不替代官方规则来源、实际多人联机和手机渲染验收。

## 扩展压力检查

最终后端压力检查使用续作/混合牌池、2/3/8人、各30种种子，共180局，由只读取玩家投影的 AI 决策，并随每次操作更新公开版本。结果：169局完整四场，最长1264次操作；6局进入明确的 Mr. Dice Guy 六骰各异待核实暂停；5局达到3000次模拟操作限额，但仍存在合法操作；没有异常、缺失合法操作或内存溢出。限额案例包括 Soulmate 与复制其能力的 Understudy 在绊倒格形成重复传送/恢复、Diva 与绊倒格形成跨回合交换、Null/Stunner/Hopfrog 组合持续行动。这里没有给真实比赛添加任意回合数终止规则；跨回合闭环的官方处理仍需复核。Cheatah 的设定和猜测使用不同公开种子，不读取秘密队列，已避免此前测试策略恒定设1、猜1造成的固定策略停滞。结果保存在 `docs/qa/second-wind/seeded-public-ai-sweep.json`，可用 `pnpm exec tsx scripts/audit-second-wind-matches.ts` 重跑。

## 新增36张清单

完整目标/时点/次数/持续时间以 `src/shared/second-wind.ts` 同源数据为准。下表的所有中文名均为本项目暂译，核验状态均为“已核对玩家卡文转录，待官方卡面/续作规则复核”。

| ID | 英文 | 中文暂译 | 行为用例 | 外形参考 |
|---|---|---|---|---|
| `bite-mark` | Bite Mark | 咬痕 | SW-01 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Bite%20Mark.png) |
| `blunderdog` | Blunderdog | 糊涂狗 | SW-02 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Blunderdog.png) |
| `cheatah` | Cheatah | 千术豹 | SW-03 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Cheatah.png) |
| `critic` | Critic | 评论家 | SW-04 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Critic.png) |
| `diva` | Diva | 歌剧女伶 | SW-05 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Diva.png) |
| `doppelgangster` | Doppelgängster | 替身帮 | SW-06 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Doppelgangster.png) |
| `gloth` | Gloth | 葛洛斯 | SW-07 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Gloth.png) |
| `hog-knight` | Hog Knight | 野猪骑士 | SW-08 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Hog%20Knight.png) |
| `hopfrog` | Hopfrog | 弹跳蛙 | SW-09 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Hopfrog.png) |
| `hotel` | Hotel | 旅馆 | SW-10 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Hotel.png) |
| `icarus` | Icarus | 伊卡洛斯 | SW-11 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Icarus.png) |
| `kingtripper` | Kingtripper | 绊倒国王 | SW-12 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Kingtripper.png) |
| `kraken` | Kraken | 海怪 | SW-13 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Kraken.png) |
| `le-saboteur` | Le Saboteur | 破坏者 | SW-14 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/LeSaboteur.png) |
| `magical-athlete` | Magical Athlete | 魔法运动员 | SW-15 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Magical%20Athlete.png) |
| `mole` | Mole | 鼹鼠 | SW-16 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Mole.png) |
| `mr-dice-guy` | Mr. Dice Guy | 骰子先生 | SW-17 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Mr.%20Dice%20Guy.png) |
| `mush` | Mush | 蘑菇泥 | SW-18 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Mush.png) |
| `nemesis` | Nemesis | 宿敌 | SW-19 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Nemesis.png) |
| `nepo-baby` | Nepo Baby | 关系宝宝 | SW-20 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Nepo%20Baby.png) |
| `null` | Null | 虚无 | SW-21 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Null.png) |
| `overtaker` | Overtaker | 超车骷髅 | SW-22 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Overtaker.png) |
| `party-pooper` | Party Pooper | 扫兴鬼 | SW-23 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Party%20Pooper.png) |
| `penguin` | Penguin | 企鹅 | SW-24 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Penguin.png) |
| `re-runner` | Re-Runner | 返场跑者 | SW-25 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Re-Runner.png) |
| `show-off` | Show-Off | 显摆精 | SW-26 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Show-Off.png) |
| `soulmate` | Soulmate | 灵魂伴侣 | SW-27 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Soulmate.png) |
| `speed-demon` | Speed Demon | 速度恶魔 | SW-28 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Speed%20Demon.png) |
| `spoilsport` | Spoilsport | 输不起 | SW-29 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Spoilsport.png) |
| `stepdad` | Stepdad | 继父 | SW-30 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Stepdad.png) |
| `streaker` | Streaker | 裸奔客 | SW-31 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Streaker.png) |
| `stunner` | Stunner | 惊艳者 | SW-32 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Stunner.png) |
| `switcharoo` | Switcharoo | 交换袋鼠 | SW-33 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Switcharoo.png) |
| `tail` | Tail | 尾巴 | SW-34 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Tail.png) |
| `the-hose` | The Hose | 水管 | SW-35 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/The%20Hose.png) |
| `understudy` | Understudy | 替补演员 | SW-36 | [插画](https://johnnlds.github.io/Magical-Athlete-Racers/images/expansion/Understudy.png) |
