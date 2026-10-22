# 2026-10-22 技能反馈、镜头与聊天修复

本轮针对游玩反馈调整结算、公开演出和操作提示。续作完整官方规则书仍未取得；新增的循环、六骰无重复裁决经用户明确授权，作为项目房规标注，不冒充官方规则。

## 调整内容

| 反馈 | 现在的行为 |
|---|---|
| 继父加2给谁 | 取赛前固定选手顺序的下一名实例，与屏幕左右、赛道排名无关；可以是自己控制的另一名选手。只加强主要移动，详情显示本场目标与当前控制者。独自出场不会强化自己。 |
| 宿敌跟骰无演出 | 能力骰进入公开骰盘，展示确认点数及比较结果，再播放能力移动；其他玩家和观战者也能看到。 |
| 交换袋鼠只有放弃按钮 | 没有合法邻近实例时直接继续，提交目标时复验。保留“其他选手”包含同控制者的规则；同控制者交换不再损坏已用牌记录。 |
| 交换袋鼠嘴歪 | Blender口鼻居中，新增对称鼻孔和曲面微笑线；更新源、GLB、审计及模型缓存版本，其他37份GLB未变。 |
| 骰子先生六骰不可见 | 同一骰盘展示六颗确认骰，所有客户端看到同一结果；等待选点或重掷时保留六骰公开结果。快速播放也保留结果阅读时间。 |
| 点头像查看技能与玩家 | 选人、浮动头像、小地图、亮相、技能及骰盘接同一详情。区分同角色多个实例、当前控制者、复制/额外能力与角色身份；不揭示对手手牌或暗选。 |
| 水管结束骰与绊倒 | 本人回合结束先等待当前控制者点击“掷水管范围骰”，再公开能力骰并绊倒严格前方1～N格，含第N格；同格、身后、离场者不算。起身回合也能触发，能力骰不冒充主骰。 |
| 吸盘鱼难判断是否跟 | 提示包括控制者、角色、移动种类、实际起终格和前后位移；跳格及边界截断按本次实际结算预览，传送不弹跟随提示。 |
| 镜头反复回自己 | 只跟随正在播放的动作，不预先框入未来连锁；空档留在最近行动者，自己的回合或回合外技能开始时再跟过去。保留手动拖动、总览和返回自己；中段略加速，远距离及落点仍有速度边界。 |
| 新聊天不显眼、框跳左上 | 收起时昵称和纯文本正文冒泡6秒，连发延长并汇总，消失后未读保留。历史补齐、重连、重复不冒泡。body portal固定定位，避开场景祖先transform及继承定位污染；手机抽屉仍避让技能按钮。 |

详细依据与实际审计见[规则复核说明](rule-review-2026-10-22.md)。

## 随机数与存档

正式建房及再来一局使用 Web Crypto `getRandomValues` 生成256位密钥及96位nonce，驱动RFC 8439的ChaCha20流。每块缓存16个32位值，骰子和洗牌都用拒绝采样映射范围，避免直接取模的尾部偏差。不会为了短期“看起来平均”而纠正点数，也不禁止合法的连续同点。

密钥、nonce、计数器及缓存只进入权威存档，不进入玩家投影、聊天或公开事件。完整存档恢复相同随机序列；动作提交前不广播结果，重复动作沿用回执。显式数字种子保留给旧存档与确定性测试，正式开房入口均用安全种子。

依据：[RFC 8439 §2.3及测试向量](https://www.rfc-editor.org/rfc/rfc8439#section-2.3)、[W3C Web Crypto](https://w3c.github.io/webcrypto/#Crypto-method-getRandomValues)。`tests/random.test.ts`核对RFC向量、平台OpenSSL多块结果、拒绝采样边界、缓存跨块恢复及信息隔离。本机Node 24运行300万次固定公开测试种子投骰，单次耗时中位约0.11微秒；[计时和直方图](qa/athlete-feedback/random-audit.json)仅为本机性能及分布冒烟检查，不是对全部设备或随机性的数学证明。

新局使用 `cmyk-base-aug2026-sw-transcript-v2`。已有续作v1对局继续运行 `second-wind-v1.ts`，更早原作存档继续运行 `legacy-v1.ts`，不静默改变旧局规则或随机序列；完整再来一局才升级。公开能力投影也按对应版本生成。

## 项目循环裁决

只在可证明的重复规则状态、期间没有会改变结果的随机或合法选择出口时裁决强制循环，不按任意操作次数结束比赛。已有名次和积分保留，未完赛者不补判名次分，按本场和局继续下一场；不会伪造淘汰或触发输不起的专属奖励。仍有放弃、多目标、正常随机出口的连锁不自动裁决。

骰子先生六骰全不同时，先公开本次结果，再等待当前控制者重掷整组六骰，不消耗主要移动；重掷仍走同一骰子规则与连锁，真人不会被AI代投。两项均为明确的项目规则，已有v1局不追溯更改。

## 复跑与证据

- `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm exec wrangler deploy --dry-run`均通过；全套单元测试 **546/546**，包含42项模型检查。构建仍有既有Three.js大块提示，不阻止构建。
- `pnpm exec playwright test tests/browser/athlete-feedback-ui.spec.ts tests/browser/athlete-feedback-dice-camera.spec.ts`：**8/8**，真实连接检查聊天、头像、三端六骰、宿敌/水管、镜头，以及六骰各异刷新重投和强制循环和局后的下一场。
- `tests/browser/presentation-sequence.spec.ts`：**4/4**，检查AI骰子/反应技能顺序、快速切场、日志缺页补齐及第4场最后演出。另选取的专用美术镜头用例因未运行美术观测构建而按其既有条件跳过，不计入通过数量；本次镜头行为由新增浏览器用例及单元测试验证。
- `pnpm exec playwright test -c playwright.relay.config.ts tests/relay-browser/second-wind-community.spec.ts`：**4/4**，通过真实认证WebSocket中继完成续作和混合牌池各四场，覆盖三名玩家、一名观战者、手机聊天/改名/刷新、秘密隔离、再来一局机会重置、练习筛选及变身/坐骑界面。
- 公共AI定向45局和扩大的180局均完整完成四场，无暂停、限额或异常；其中强制循环按本轮明确房规收尾。汇总及适用范围见[规则复核说明](rule-review-2026-10-22.md)。
- [本轮验证汇总](qa/athlete-feedback/validation-results.json)、[续作联机四场](qa/second-wind/second-wind-four-races.json)、[混合联机四场](qa/second-wind/mixed-four-races.json)。
- [六骰对手手机](qa/athlete-feedback/six-dice-other-mobile.png)、[宿敌骰](qa/athlete-feedback/nemesis-die-desktop.png)、[水管绊倒](qa/athlete-feedback/hose-trip-desktop.png)。
- [桌面消息冒泡](qa/athlete-feedback/chat-desktop-bubble.png)、[手机抽屉](qa/athlete-feedback/chat-mobile-drawer.png)、[定位数据](qa/athlete-feedback/chat-browser-results.json)。
- [交换后的当前玩家](qa/athlete-feedback/avatar-current-controller.png)、[多实例](qa/athlete-feedback/avatar-multiple-instances.png)、[禁用能力](qa/athlete-feedback/avatar-disabled-abilities.png)。
- [袋鼠脸部](evidence/second-wind/switcharoo-after-face.png)、[实际游戏](evidence/second-wind/switcharoo-game-desktop.png)、[模型审计](evidence/second-wind/source-audit.json)。

手机使用浏览器视口及缩小可视区域测试，未宣称物理手机GPU或真实软键盘实测。提交审阅，不部署生产网站。
