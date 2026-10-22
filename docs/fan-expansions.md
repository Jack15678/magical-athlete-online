# 粉丝扩展规则与核验（2026-10-22）

本轮可选角色：原版36、已有Second Wind36、Extra Mile31、Leaf18，共121个**来源区分的卡牌条目**。两个新增包都是非官方粉丝扩展；Leaf Nepo Baby与Second Wind Nepo Baby保留独立ID，不声称是121个完全不同角色。Second Wind继续沿用已有实验性核验状态。

新规则版本为`cmyk-base-aug2026-fan-v3`。缺少版本的旧存档、Second Wind v1/v2分别使用独立冻结引擎；旧练习房没有包设置时仍为原72张。新建房间粉丝包默认关闭，服务端所有角色分配入口按房间配置筛选。主动启用全部已完成包的练习房可跨包选四张。

## 原始资料与版本差异

- [Extra Mile作者网页v13](https://johnnlds.github.io/Magical-Athlete-Racers/?v=13)：Johnnie Reynolds设计、Dan Reynolds绘画。实际下载网页和script.js并读出32名角色。
- [作者ExtraMile.pdf](https://johnnlds.github.io/Magical-Athlete-Racers/ExtraMile.pdf)：实际下载8页纯图片PDF，渲染并查看第1、3、5、7页全部33张正面卡。多出的 **Groundhogs Day / DÉJÀ MOVE** 没有进入约定32名清单。
- [Leaf作者文件页](https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete)、[发布帖](https://boardgamegeek.com/thread/3757806/leafs-fan-expansion-18-new-racers)：网页、原生API下载及内嵌浏览器均实际尝试。API读到三个准确文件元数据，但下载返回403；之后用户提供这三份作者原始文件。已实际读取Printable Cards正面、两页Rulebook，以及ZIP里的18张卡面和18张透明角色图，阻塞已解除。
- 通则：[作者站镜像基础规则](https://johnnlds.github.io/Magical-Athlete-Racers/officialrules.pdf)与[IELLO FAQ v2.0](https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/)。不把作者站Interactions非官方示例当作已确认官方FAQ。

网页与PDF存在差异，未找到作者针对差异的正式勘误，本轮明确采用可见PDF卡面：Witch Hazel **one other racer**（只能一个目标）；School Bully恢复骰1～3后还按该骰移动；Echo采用前一选手**实际移动**而非网页的骰面。详细时点、范围和数字适配见下表及[机器可读审计](fan-expansion-audit.json)。

Box原卡要求实体骰子触及盒外，浏览器缺少经过认可的实体输入/数字适配。仅此角色隔离不可选、不计可用数；没有代入任意随机概率，没有因它而隔离其他31名。

## 复杂机制与工程裁定

Cletus双方对抗骰与主移动骰分离，双方均由当前稳定控制者操作，平局淘汰目标、自己高则重新正常主移动、对方高则目标前进1。Saint Nick按其他**选手实例**计数，即使同一人控制两个选手也各掷一次；先完成自己的+n移动及子效果，再按固定顺序等待各目标送礼骰。Witch按完整主移动加减后的非负距离分配，先自己、再单一目标；0与全额分配都合法。Mr. Fox每个独立能力激活开持久窗口，按固定顺序响应，成功后立即关闭同次窗口；已付款/次数不返还，不对“阻止”再开启互相阻止。翻面被阻止保留原骰；童子军传送被阻止继续原主移动。被能力复制的选手保留移动开始时的能力快照，不能因该移动改变领先者而丢弃已触发的后续效果。

队列是深度优先子效果的可序列化栈，所有随机、选择与继续位置保存在权威状态，动画不驱动规则。循环签名包含位置、控制权、积分、生命、能力/资源、牌堆、阶段和即将重复的效果，不含日志ID及展示流水。只有完整状态重现且嵌套分支回到同一后续栈时才停止该分支；持续得分、消耗资源和每次有新随机/可变选择的链不冒充确定循环。既有跨回合强制和局裁定仅保留在冻结v2引擎；当前v3的跨回合强制重复分支暂停保留状态，不制造和局结果。Triangle Man观察原始骰时，Stunner不能把该随机出口忽略。

每次调用最多3000事件后让出并保持剩余队列。诊断检查点独立限制在96000字符，忘记旧检查点不等于判循环。异常连续9000事件会**暂停本房间供诊断**，保留随机种子、日志与全部未执行队列，不吞事件、不改骰、不判赢家；这不是技能次数上限。4005事件的资源消耗链已验证跨调用及JSON恢复后全部完成。

## Extra Mile 32名清单

| 稳定ID / 原名 | 中文名 | 状态与数字化裁定 |
|---|---|---|
| extra-mile-box / Box | 盒子 | 隔离，不可玩；待确定实体入盒判定的数字化方式，未用随机概率代替。 |
| extra-mile-broken-clock / Broken Clock | 坏时钟 | 已实现并有固定局面测试；按已核对卡面及通则结算。 |
| extra-mile-cletus / Cletus | 克莱特斯 | 已实现并有固定局面测试；对抗骰不触发仅主移动骰能力；双方控制者均须点击。 |
| extra-mile-doc-paradox / Doc Paradox | 悖论博士 | 已实现并有固定局面测试；数字适配：倒向起点完赛；倒向主移动的距离仍先应用通常加减；每次重置累计+3。 |
| extra-mile-doctor-dice / Doctor Dice | 骰子医生 | 已实现并有固定局面测试；按已核对卡面及通则结算。 |
| extra-mile-dom-and-gary / Dom and Gary | 多姆与加里 | 已实现并有固定局面测试；数字适配：加里由多姆控制者操作但不为玩家计分，其拿走的名次积分退出本局。 |
| extra-mile-echo / Echo | 回声 | 已实现并有固定局面测试；PDF写previous racer moved，网页写rolled；采用PDF。首次行动无前次记录时正常掷骰；传送不算移动。 |
| extra-mile-gingy / Gingy | 姜饼人 | 已实现并有固定局面测试；按已核对卡面及通则结算。 |
| extra-mile-gluebert / Gluebert | 胶水伯特 | 已实现并有固定局面测试；按已核对卡面及通则结算。 |
| extra-mile-heads / Heads | 硬币头 | 已实现并有固定局面测试；每颗骰只翻一次；翻面在强制重掷检查之前，固定点数后不再翻回。 |
| extra-mile-honey-pot / Honey Pot | 蜜罐 | 已实现并有固定局面测试；数字适配：蜜罐由公共供应补充，不扣控制者积分；余额不足只发余额；每名蜜罐独立标记，共享本场蜜罐。 |
| extra-mile-king-pete / King Pete | 皮特国王 | 已实现并有固定局面测试；数字适配：主骰扣当前主移动；能力骰与对抗骰无主移动可扣，仍触发国王前进。 |
| extra-mile-lazy-bones / Lazy Bones | 懒骨头 | 已实现并有固定局面测试；数字适配：锁在起点仅限制自己的主移动；首次掷6后解除，随后每次主骰6仍执行传送和额外回合。 |
| extra-mile-marksman / Marksman | 神射手 | 已实现并有固定局面测试；数字适配：连续单骰累加，达到或超过目标格号即结束；每颗骰都等待操作者。 |
| extra-mile-moneybags / Moneybags | 钱袋先生 | 已实现并有固定局面测试；按已核对卡面及通则结算。 |
| extra-mile-mr-fox / Mr. Fox | 狐狸先生 | 已实现并有固定局面测试；数字适配：按本场固定顺序响应，一个阻止成功即关闭窗口；阻止不再互相阻止；已付款和已花次数不返还。持续能力按单次可观察激活开启窗口。 |
| extra-mile-oddball / Oddball | 怪球 | 已实现并有固定局面测试；按已核对卡面及通则结算。 |
| extra-mile-pooh / Pooh | 维尼 | 已实现并有固定局面测试；数字适配：本回合第二次及之后每次能力完成均前进1；自己的该次响应不继续触发自己。 |
| extra-mile-robin-hood / Robin Hood | 罗宾汉 | 已实现并有固定局面测试；数字适配：并列领先或末位按本场固定顺序取第一名不同选手；不足1分不转移，仍移动2格。 |
| extra-mile-saint-nick / Saint Nick | 圣尼克 | 已实现并有固定局面测试；按选手实例计数与逐个掷骰，同玩家的两个选手仍分别执行；自身额外移动完成及连锁后才开始送礼骰。 |
| extra-mile-school-bully / School Bully | 校园恶霸 | 已实现并有固定局面测试；PDF明确恢复成功后按该骰移动，网页省略，采用PDF；4至6只起身而失去主移动。 |
| extra-mile-scout / Scout | 童子军 | 已实现并有固定局面测试；按已核对卡面及通则结算。 |
| extra-mile-shuffler / Shuffler | 洗牌师 | 已实现并有固定局面测试；数字适配：重新分配能力不改控制者、位置与棋子；既有赛前窗口不重新打开，已建立对象与资源仍绑定实例。 |
| extra-mile-silly-goose / Silly Goose | 傻鹅 | 已实现并有固定局面测试；按已核对卡面及通则结算。 |
| extra-mile-snake-eyes / Snake Eyes | 蛇眼 | 已实现并有固定局面测试；数字适配：下注额限当前玩家积分，不预扣；结束按净增3倍或扣注额结算；和局视为未猜中。 |
| extra-mile-snub / Snub | 落选仔 | 已实现并有固定局面测试；记录本批选秀选择前的全桌选牌数；练习自由组队顺序视为该次选牌顺序。 |
| extra-mile-terrible-toddler / Terrible Toddler | 可怕幼童 | 已实现并有固定局面测试；anyone包含自己；额外范围骰不触发主移动专属能力。 |
| extra-mile-thief / Thief | 盗贼 | 已实现并有固定局面测试；秘密目标保存在GameState私有flags，不能放Racer公共flags。数字适配按目标实例的正向积分收入记账，最多偷其控制者当前剩余积分。 |
| extra-mile-toll-troll / Toll Troll | 收费巨魔 | 已实现并有固定局面测试；按已核对卡面及通则结算。 |
| extra-mile-totally-fair-ref / Totally Fair Ref | 绝对公平裁判 | 已实现并有固定局面测试；数字适配：从不在并列领先变为并列领先也算进入；同组同时到达合并检查。 |
| extra-mile-whisper / Whisper | 低语 | 已实现并有固定局面测试；等距两个空格由控制者选择；以正常移动结算经过和停格触发。 |
| extra-mile-witch-hazel / Witch Hazel | 女巫海泽尔 | 已实现并有固定局面测试；PDF明确one other racer，网页写other racers；查未发现作者勘误，采用PDF单目标。全给自身或全给目标均可；负主移动不分配。 |

## Leaf 18名清单

| 稳定ID / 原名 | 中文名 | 规则与适配 |
|---|---|---|
| leaf-catfish / Catfish | 鲶鱼 | 不含从同格出发或停在同格；按选手而非控制者判断。 |
| leaf-crash-dummy / Crash Dummy | 碰撞假人 | 主移动才引发碰撞；同一玩家的另一名选手仍受影响。 |
| leaf-dark-horse / Dark Horse | 黑马 | 回合开始快照判定；并列末位不翻倍。 |
| leaf-kangaroo / Kangaroo | 袋鼠 | 适用所有移动；非只限主移动；自身移动不触发自己。 |
| leaf-loan-shark / Loan Shark | 高利贷鲨 | 双选手模式不放在同一控制者的另一张牌上；每张牌最多取回本能力放的1枚。 |
| leaf-lonely-wolf / Lonely Wolf | 孤狼 | 在回合开始、掷骰前判定同格；小挪挪Scoocher例外是作者规则。 |
| leaf-nepo-baby / Nepo Baby | 关系户宝宝 | 只数本控制者在此前各场获得的第一、第二名，不数积分总额。 |
| leaf-philanthropist / Philanthropist | 慈善家 | 赠骰是公开已知点数；不当作接受者新掷出的骰；同玩家另一选手是合法目标。 |
| leaf-race-car / Race Car | 赛车 | 扣减实际积分且服务端校验余额；并非额外掷骰。 |
| leaf-revolutionary / Revolutionary | 革命家 | 并列领先者同格；并列末位不触发。 |
| leaf-sole-survivor / Sole Survivor | 唯一幸存者 | 仅本场此选手的入账，不能计同一玩家另一名选手所得；包含星格、高利贷鲨等来源。 |
| leaf-sore-loser / Sore Loser | 输不起 | 按实际位置判断独自末位；真正循环判和不追加赛末奖励。 |
| leaf-spiteful-spirit / Spiteful Spirit | 怨灵 | 其他选手包括同一控制者的另一名选手；由同一规则队列按序结算。 |
| leaf-toucan / Toucan | 巨嘴鸟 | 调整不算再次掷骰；三角人等只看真实掷出值的能力不因调整触发。 |
| leaf-triangle-man / Triangle Man | 三角人 | 对抗、技能、主移动、重掷均适用，调整成3不触发；自己的主骰3先前进1再主移动3。 |
| leaf-zombie / Zombie | 僵尸 | 项目数字化裁定：失利指该场未获冠军奖杯或亚军绶带；保留独立角色ID与棋子身份。 |
| leaf-thespian / Thespian | 戏剧演员 | 上一张已展示复制牌在下次换牌时回公共弃牌堆；牌堆耗尽则洗公共弃牌堆。 |
| leaf-filmmaker / Filmmaker | 电影制作人 | 手牌仅当前控制者可见；公开展示已弃并正在复制的牌；上一张展示牌换牌时才回公共弃牌堆。 |

## 下载文件指纹

原始商业/粉丝卡面只保存在本机研究目录，不打包到网站。本仓库交付规则数据、来源定位、原创3D资产与可复现测试。

| 文件 | 字节 | SHA-256 |
|---|---|---|
| ExtraMile.pdf | 21141125 | 1aa7b8aaa25fc363cd0fc672cde2a8fe61cf40a6ce4e88ca48b853cb95ed9c9e |
| Printable_Cards_-_Leafs_Fan_Expansion.pdf | 1423068 | 093cad1f28c76d772dd68516a56c5138e88bb943f97f7fc49a2830cc17196edd |
| Rulebook_-_Leafs_Fan_Expansion.pdf | 1147647 | 2018e28fd463af8e0b740ae98071593342e1c789b88c06a06998a1639b633da6 |
| PNG_Images_-_Leaf's_Fan_Expansion.zip | 2282380 | a8296688a4a18a611efc83cf97a4fa2b7cfb52382111f0914129f6a3b0eb811f |

## 验证

`tests/fan-expansions.test.ts`覆盖Extra全部31角色及Box隔离、对抗双方操作、多人多选手、分配移动、有限次数阻止、JSON恢复、秘密投影、固定seed、长链预算、异常暂停和独立重复触发。`tests/leaf-expansion.test.ts`按原始卡文和Rulebook覆盖18名及原骰3、赠骰不掷骰、秘密影片手牌等边界。旧版本回归通过固定v2引擎继续检验历史裁定；当前规则的持续得分局面可重放相同诊断暂停，不再当成循环截断。

额外固定种子验收：[四包回放摘要](qa/fan-rules-seeded-smoke.json)。权威自动合法策略完成2/4/8人各3种子，共9局36场、4307动作、2826骰，无诊断暂停或错误。另一个通过真实公共投影与 `decideAI` 的双人种子7曾发现AI反复召回Baba Yaga的自愿策略陷阱；只调整公开AI策略避免可预见的自绊倒，保留真人全部合法动作，未将其冒充强制循环。修正后该局2533动作完成4场。完整失败状态保存在本机忽略目录，提交的摘要不含秘密手牌或身份凭据。
