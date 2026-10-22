# 测试与验收记录

## 能力相互作用与详情专项（2026-10-22）

本轮按用户要求采用能力专项，不重复八人完整对局。`pnpm test:abilities`覆盖相关基础/扩展技能、嵌套复制、私密信息投影、旧版本、循环保护、详情与演出；网页只运行 `egg-character-info.spec.ts` 和 `ability-reveal-intro.spec.ts`，检查详情优先级、公开获得提示及入场先于赛前能力。结果与边界见[复制裁定](copy-ability-rulings.md)和[详情排版验收](ability-detail-layout-2026-10-22.md)。

CI保留类型检查、生产构建和Worker打包预演。提交消息带独立行 `Validation-Scope: ability-interactions` 时，自动检查使用上述专项替代八人对局；没有此标记时仍默认一场八人检查。手动运行可选择 `ability-interactions`、`eight-only` 或 `all`，手动选择优先。标记仅选择公开检查范围，不代表测试已通过。

更新：2026-10-21。此处区分实际执行结果、测试覆盖范围与尚未完成的公网验收。浏览器房主是主路线，Node/SQLite与Tailscale为备用；两种模式共用同一规则引擎。

本轮微缩玩具运动会美术升级的同镜头前后截图、加长起点、开赛巡礼、桌面/手机视口与性能检查详见[美术打磨报告](toy-diorama.md)。

最新双人规则、全部房型的房主离开 30 分钟回收、练习牌池、Blender 模型与镜头验证见 [本轮验收报告](duo-practice-blender.md)。下文的 3 小时有效期记录属于旧策略，已由本轮规则替代。

## 房间列表、退出、观战和旧3小时有效期（2026-10-21）

本地已通过254项单元／集成检查、TypeScript检查、两种生产构建及Worker打包预演。新增覆盖目录摘要与并发更新、普通玩家离席与空位复用、独立观战凭据、观战秘密信息隔离和操作拒绝、公开动画同步、3小时整点到期、旧存档恢复与到期清理，以及到期后的WebSocket终止通知。

真实Edge通过4项房间专项及2项原有解散回归：从列表点击加入、满员房间观战、大厅退出释放席位、观战退出后使用新凭据、选秀到暗选及3D赛场的只读观战、中途加入和实时动作同步、同浏览器双身份互不踢出、断网时退出观看与恢复。390×844手机视口无横向溢出，页面脚本错误为0。3小时有效期由受控时钟验证精确边界，不声称实际连续等待了3小时；本次未执行公网部署或公网验收。

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm exec wrangler deploy --dry-run
pnpm exec playwright test -c playwright.relay.config.ts tests/relay-browser/room-directory.spec.ts tests/relay-browser/close-room.spec.ts
```

## 完整顺序演出、决斗参与与常驻预测（2026-10-21）

提交 `52021a1` 已由 Cloudflare GitHub 自动构建并100%发布为 `0083c706-7f71-43d9-b7f6-cb4f333227e5`，公开入口 `/assets/index-D53Mwf5E.js`。已通过233项单元／集成检查、两种生产构建、Worker预演及16项不同的浏览器专项，涵盖连续骰子、默认与4×减动效最少1.5秒技能阅读、AI和真人完整前序队列、120条窗口以外的事件分页、跨场与终场不抢演出、决斗双方点击和同时读数、手机常驻预测、交换后绊倒、传送和后退、手动镜头及显式跳过。

本地Worker真实三AI四场已完成（277.324秒，0页面脚本错误、0次跳过点击，最后等待idle与成绩面板），[四场结果](qa/animation-ai-final.png)和[测量](qa/animation-ai-result.json)已保存。另用20个固定种子完成80场引擎检查，并用原始约30MB的循环存档验证重复随行策略能正常续算至四场结束。失败首轮、原始存档恢复、整局观察与严格事件ID对照的验证范围均在[完整报告](animation-sequence.md)中区分。

[决斗短演示](https://magical-athlete.qiuh23.workers.dev/demo/duel.webm)已实际GET验证，1,406,583字节、SHA256与本地最终视频一致。[手机双骰](qa/duel-paired-mobile.png)与[常驻预测](qa/prediction-persistent-mobile.png)来自实际浏览器验收。手机为Windows Edge视口模拟。最新部署和CI结果见[部署记录](deployment.json)。

正式站三AI短流程也已通过（49.697秒）：新入口脚本正确，58个实际WebSocket快照汇总的公开事件ID1～73连续，30个期望动画事件与30个实际显示事件逐项一致、无缺失或多余，5次技能实测1500.1～1503.1ms（4×＋减少动效）。真人正常掷骰2次，0次跳过、0页面／控制台错误，比赛期间WebSocket重开／关闭均0；最终权威等待本人掷骰且视觉idle。桌面1440×1000、手机390×844均精确满屏、无滚动。已保存[正式手机截图](qa/animation-public-mobile.png)和[脱敏逐项证据](qa/animation-public-result.json)。

该源码的[远端CI](https://github.com/qiuh23/magical-athlete-online/actions/runs/39563582048)已成功：类型检查、两种构建、Worker部署预演及一场八人独立浏览器联机，浏览器部分约7.6分钟，包含房主和客人恢复、快照隐私与桌面／手机布局。233项单元与上述16项表现专项为本地实际执行结果，未把默认CI跳过的额外检查计为远端执行。

## 沉浸式、单人练习与人机（2026-10-21）

后续小地图放大、可读连锁节奏与绊倒规则核验，已通过209项自动检查和8项真实浏览器专项；本次未修改引擎规则。尺寸、计时证据、官方规则来源与一个明确列出的未决边界，见[本次核验报告](map-and-tripped-review.md)。

提交 `081aa63` 已由 Cloudflare 自动发布成功，版本 `6a7818d0-e70d-4e06-9b13-7f73d537693c` 100%上线，公开入口为 `/assets/index-BEuy5r4Z.js`。正式站390×844手机视口练习复验通过（7.2秒，0页面脚本错误）；小地图实测宽148px，稳定回到自己的视角、掷骰按钮可用时，明确显示“你 · 第6格”和角色名，棋盘与文档均390×844、双向无滚动。公开帮助页核验倒地技能、起身不投主骰、决斗独立骰、野兔例外及骰后连锁的网页裁定均已显示。证据：[手机小地图](qa/minimap-public-mobile.png)、[手机规则](qa/minimap-public-rules-mobile.png)、[实际测量](qa/minimap-public-mobile.json)。

该提交的[远端CI](https://github.com/qiuh23/magical-athlete-online/actions/runs/39556007154)也已成功：类型检查、两种构建、Worker预演及一场八人联机，浏览器部分约7.2分钟，含房主与客人恢复、快照隐私及布局。209项单元检查和8项表现专项为本地实际执行结果，未把默认CI跳过的额外检查计作远端执行。

本次升级的实际检查、电脑与手机尺寸、连续技能镜头、手动操作、回合开始选择、完整人机四场，以及可观看的20秒演示，集中记录在[沉浸式与人机验收](immersive-practice.md)。下方保留此前3D与2D版本的历史证据。

最终集成类型检查、两种生产构建、Worker打包预演和189项自动检查全部通过。[本次远端CI](https://github.com/qiuh23/magical-athlete-online/actions/runs/39552190668)已成功完成类型、两种构建、Worker预演和一场八人联机，浏览器部分约4.5分钟。正式站已通过私有仓库推送自动发布提交 `be822c4`，Cloudflare版本 `0f9af3c5-0fc9-4651-bf49-c6be2787ff87` 已100%上线；公开bundle为 `/assets/index-B3lVTEqk.js`。正式站390×844手机尺寸练习从首页选秀、出场至多次掷骰移动通过（7.9秒，0页面错误），[实际截图](qa/immersive-public-practice-mobile.png)。[20秒公开演示](https://magical-athlete.qiuh23.workers.dev/demo/immersive.webm) 实际GET为817,526字节，与本地SHA256一致；细节和验证边界见[部署记录](deployment.json)。

## 此前 3D 升级验收（2026-10-21）

本节记录 3D 版本；后文的 122 项和旧 2D 截图是此前版本的历史记录。代码通过 [PR #2](https://github.com/qiuh23/magical-athlete-online/pull/2) 合并到生产 `02daad2`，复用现有规则、浏览器计算房主、Node 服务与 Cloudflare 发布。

- 类型检查、两种生产构建、Worker 部署预演通过；`pnpm test` **162 项通过、0 失败**。新增覆盖确认事件去重、重连基线、技能顺序、同时移动、六面骰子朝向、36 个真实 GLB 网格解码与性能预算。
- 赛道坐标测试确认连续 31 格，只在 **12、15 格**形成两个直角；手机为同一块棋盘的刚性旋转。飞艇在 14 格与 15 格行动的规则修正分别校验，轻松和狂野赛道均通过。
- Edge 专项验证默认约 2.5 秒掷骰、停稳后才移动、服务器骰面 1 与炼金术士移动 4 格分开显示；交换两目标同时移动后再触发绊倒；传送、后退、啦啦队同时移动、跳过、减少动效、4 倍速、访客恢复与焦点同步不重播均通过。骰盘在待机、掷骰、待机之间保留同一个画布，避免反复创建图形上下文。

| 真实浏览器模式 | 玩家数 | 最新实际结果 |
| --- | --- | --- |
| Node/SQLite | 2 | 完整四场、刷新、断线恢复、再来一局通过，约 1.2 分钟，0 页面错误 |
| Node/SQLite | 6 | 完整四场、恢复和再来一局通过，约 2.0 分钟，0 页面错误 |
| Node/SQLite | 8 | 完整四场、恢复和再来一局通过，约 2.6 分钟，0 页面错误 |
| 浏览器计算房主 + 本地 Worker | 2、6、8 | 三组完整四场分别约 1.0、1.9、2.6 分钟；房主页关闭返回、第二标签页、客人断网恢复、快照隐私、再来一局通过，0 页面错误 |
| 本地 Worker 解散回归 | 2 | 大厅转交后解散、对局中解散均通过；共 5 个本地中继用例约 5.8 分钟全部通过 |
| 正式 Cloudflare 网站 | 8 | **完整四场通过，约 3.8 分钟，0 页面错误**；真实 HTTPS/WSS、8 个隔离身份、原房主关闭返回、第二标签页、客人断线恢复、快照隐私和再来一局均通过 |

完整多窗口回归使用低画质、减少动效和 4 倍速；专项测试保留默认 2.5 秒掷骰并检查高画质实际画面。桌面 1440×1000、手机 390×844 的棋盘、操作、技能和设置经过真实 Edge 渲染检查，未出现整页横向溢出。手机操作条不再覆盖赛道。这里验证的是浏览器尺寸，不声称已覆盖所有真实手机 GPU 或提供固定帧率保证。

换场曾触发第三方 3D HTML 门户的 `removeChild` 清理异常，现改为普通 DOM 投影标签；后续完整回归为 0 错误。六窗口测试曾在反复掷骰时图形无响应，骰盘改为复用渲染器，主棋盘在掷骰特写期间按需绘制；最终六、八窗口完整回归通过。早期失败和中止的运行不计为通过。

生产网站已自动发布为 `55fa9883-e669-437b-b471-8f6acbbecf0a`。公网入口 `/assets/index-TzQNhr8y.js` 与本地最终构建一致，模型 465,736 字节及 SHA-256 与本地验证资产相同，房间健康检查通过。公网八人截图来自这次实际对局。

Linux 软件渲染环境和短动画阶段观测修正后，[两个动画专项通过](https://github.com/qiuh23/magical-athlete-online/actions/runs/39537599667)。后续完整八人四场持续推进到第四场、第 421 次操作，因 600 秒总时限结束，未计为通过；换场 checkpoint 与原始错误现已保留，关页清理不会再遮住原始失败。另修复黏液怪头像 SVG 曲线缺少终点的问题，153 条字面量路径参数静态检查通过。

按用户要求，最终默认 CI 收敛为一场八人联机。[最终单场 CI 已通过](https://github.com/qiuh23/magical-athlete-online/actions/runs/39540261380)：**1 项通过，约 1.6 分钟，0 页面错误**，覆盖房主关闭返回、第二标签页、客人断线恢复、隐私和桌面/手机布局；未重复单元与动画专项。完整四场结论以上述本地 Edge 和公网实际验收为准。之后仅按用户要求调整总时限为用例 15 分钟、任务 30 分钟，没有为时限配置再次运行测试。

最终头像修复已通过现有 Wrangler 流程发布为 `0579106f-119f-4219-b1ce-4683c6d1eb02`，入口为 `/assets/index-CF-LIG6R.js`；3D 模型内容保持相同。部署核对结果记录在 `deployment.json`。

- [最终高画质双直角 3D 棋盘](qa/3d-board-desktop.png)
- [3D 骰盘停稳特写](qa/3d-dice.png)
- [最终八人手机棋盘](qa/3d-board-mobile.png)
- [正式网站八人四场成绩](qa/3d-public-final-8.png)

### 控制浏览器复验数量

按用户要求，默认 CI 仅执行 **一场八人联机检查**，包含房主/客人恢复、快照隐私和桌面/手机布局；保留必要的类型检查、构建和部署预演。单元测试、掷骰/动画专项及完整四场矩阵均为手动按需执行。八人用例总时限为 **15 分钟**，整个 CI 任务上限为 **30 分钟**；单步动作仍限 20 秒，便于及时发现具体操作异常。

默认浏览器检查：

```sh
RELAY_SMOKE=1 pnpm exec playwright test -c playwright.relay.config.ts --grep "browser authority 8 independent"
```

需要时才执行的专项与完整四场检查：

```sh
pnpm exec playwright test tests/browser/three-scene.spec.ts --grep "3D dice settles|3D simultaneous"
pnpm exec playwright test -c playwright.relay.config.ts --grep "browser authority 8 independent"
```

GitHub Actions 的 **Run workflow** 默认选择 `browser_suite: eight-only`，只运行上述一场。只有明确需要追加检查时才选择 `all`，增加单元和两个动画专项。复验失败时先检查原始错误和换场 checkpoint，修复后仅重跑必要用例。


## 已完成的本地自动化

最终完整命令统一执行，结果为**122项通过、0失败**，包括主持连接租约、同实例重连计时和准备同步回归：

| 类别 | 数量 | 实际覆盖 |
| --- | ---: | --- |
| 角色与组合行为 | 75 | 36角色、优先级与同时移动组合、Copycat能力快照、可选技能跳过、Wild箭头与Huge Baby真循环等回归 |
| 完整对局与确定性 | 9 | 2–8人四场终局、选秀和角色消耗、固定种子重放、序列化恢复 |
| Node网络与持久化 | 3 | 独立身份与重复昵称、人数和操作权限、暗选隔离、版本和幂等、SQLite恢复后继续操作 |
| 本机启动器 | 4 | 安全识别本项目进程与Funnel配置、保留其他服务、启动和停止边界 |
| BrowserAuthority | 10 | IndexedDB原子状态与收据、事务完成后确认、并发重复/冲突请求、失败回滚、重载保持随机和技能队列、只在大厅增员、超时和持续结算、私有快照隔离、同实例网络重连刷新时限且普通成员变更不延时 |
| Worker中继处理器 | 17 | 身份验证、房主权限、入房限制、动作转发、定向快照、断线与存储错误、主持连接租约等处理器边界 |
| 浏览器准备同步 | 4 | 已收到新私有快照后有限重试显式准备状态、重试上限、禁止重放掷骰和已离开大厅的动作 |
| 合计 | **122** | 最终统一执行全部通过 |

`tests/relay.test.ts`执行真实Worker处理器，替换Cloudflare平台存储与socket适配，不等同于Cloudflare公网端到端测试。当前`pnpm test`会自动收集所有`tests/*.test.ts`和启动器测试。

两套类型检查均已通过，涵盖浏览器、Node和独立Worker配置。Node生产构建和最终浏览器房主构建通过；最终Worker包约**29.81 KiB**，部署打包预演通过。已实际上传的生产版本与公网验收结果另记于下文。

## 已完成的真实网页流程

在Windows的Edge中，使用Playwright独立BrowserContext隔离不同玩家的cookie、localStorage与IndexedDB。操作通过实际界面的按钮和卡片执行；测试读取权威状态仅用于判断当前操作者与核验保存结果，不绕过界面提交游戏动作。

| 模式 | 玩家数 | 本轮状态 | 已验证内容 |
| --- | ---: | --- | --- |
| Node/SQLite备用 | 2、6、8 | 全部通过 | 完整四场、选秀与暗选、刷新/断线恢复、邀请链接、原房间再来、桌面与390px移动布局 |
| 浏览器房主＋本地Worker中继 | 2 | 通过，59.1秒 | 完整四场、计算房主页离开后暂停与返回恢复、第二标签页、客人断网重连、快照隐私、原房间再来 |
| 浏览器房主＋本地Worker中继 | 6 | 通过，约2.0分钟 | 完整四场、计算房主返回恢复、第二标签页、客人重连、快照隐私、原房间再来 |
| 浏览器房主＋本地Worker中继 | 8 | 通过，约2.1分钟 | 完整四场、计算房主返回恢复、第二标签页、客人重连、快照隐私、原房间再来；7–8人为网页扩展 |

8人首轮因Playwright测试辅助函数的深层对象传输错误未完成。辅助函数改为按游戏存档格式返回JSON字符串后，已重跑完整通过；首轮不计为完整通过。

最终补充了重连同步门控：收到本次同步请求对应的新快照后才恢复操作。修复后2人完整四场再次通过（56.6秒）；额外短流程验证同浏览器第二标签接管后立即准备成功、全部计算页关闭时客人禁用操作、原浏览器返回后选秀游标和手牌恢复，0页面脚本错误。

浏览器房主流程还核验：客人没有创建权威IndexedDB数据库；其他玩家的手牌与暗选不出现在收到的快照中；WebSocket URL不携带身份令牌；计算房主返回前后随机状态、日志、待处理选择、队列、角色与成绩保持一致。浏览器测试也检查页面脚本错误和横向溢出。

已保留的QA截图来自已通过的Node备用流程：

- [桌面首页](qa/home-desktop.png)
- [移动端赛道](qa/race-mobile.png)
- [八人四场最终成绩](qa/final-8.png)

新浏览器房主流程运行时生成`test-results/browser-authority/race-人数.png`、`race-mobile-人数.png`和`final-人数.png`。`test-results`、Playwright报告及失败trace为本地验收产物，不提交仓库；只有完整测试通过后才能据此标记该人数验收成功。

浏览器房主八人已通过流程的截图：[移动赛道](qa/browser-race-mobile-8.png)、[四场终局](qa/browser-final-8.png)。

## 复现方式

环境要求：Node.js 24+、pnpm 11.25.0。Windows配置使用已安装Edge；Linux使用Playwright Chromium。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm build:browser
pnpm exec wrangler deploy --dry-run
```

浏览器房主主路线：

```sh
pnpm exec playwright install chromium
pnpm test:relay
```

该命令使用`playwright.relay.config.ts`，默认启动Wrangler本地中继于`127.0.0.1:8787`。必须先构建`dist/browser`。可通过`RELAY_URL`指定待测的实际部署网址；此时测试不会自行启动本地Worker。不要在进行中的朋友对局上运行验收。

Node备用路线：

```sh
pnpm build
pnpm test:e2e
```

该套测试自行创建隔离的Node服务与测试房间，不依赖Tailscale公网。仓库的GitHub Actions配置上述检查；最新远端运行结果以仓库Actions页为准，本报告中的本地结果不能替代远端结果。

Cloudflare已按用户确认的Workers Free正式部署到 https://magical-athlete.qiuh23.workers.dev ，首次Worker版本为`329ab155-6bd6-43f3-82c7-3763f7e022ab`。HTTPS证书校验、首页200、`/api/browser/health`已通过。最终Worker包29.81 KiB，启动时间2ms，完整公网验收如下。

正式网站完整对局现已全部通过：2人1.6分钟，准备同步修复后6人2.3分钟、8人2.7分钟。每组均为独立Edge BrowserContext，经过实际HTTPS/WSS、四场终局、房主页关闭返回恢复、客人离线重连、私有快照检查及原房间再来；0页面脚本错误、无横向溢出。公开环境八人截图：[移动赛道](qa/public-race-mobile-8.png)、[四场总成绩](qa/public-final-8.png)。本机模拟器停止后正式health仍正常，网址不依赖本机服务。

GitHub自动发布已实证：提交`46f407118f35668f95dcc38c19c11b71778871ed`触发Cloudflare GitHub App检查成功，Build ID为`b40b3c4f-2e44-4482-b046-00a51b392b9a`，正式部署版本为`a91e63c0-f1c8-4a50-8022-0a1ea872a21b`，公开脚本与验收构建`index-x7MX-wCO.js`相符。本次推送之后没有手动CLI发布夹杂。此前首次自动构建失败是面板`pnpm build`仅生成本机版本；现默认构建同时生成`dist/browser`，已构建并自动发布成功。GitHub Actions完整验收也已全部通过。

最终代码的[远端CI](https://github.com/qiuh23/magical-athlete-online/actions/runs/39468302305)在Linux环境通过：122/122单元与集成检查、双类型检查、默认生产构建和Worker打包预演；Node网页2/6/8人分别约1.2/2.4/4.2分钟，浏览器房主本地Worker网页2/6/8人分别约1.0/2.1/3.4分钟，6/6全部通过。官方job总计15分38秒，日志保存在本地忽略的`tmp/`。仅报告和截图的后续提交不重跑这些完整对局，网页房规等会进入运行时的文档仍会触发CI。

最终弱网短流程在真实本地Worker与Edge中执行：双向丢包且保留TCP连接，客户端25秒后换代重连，DO在35.1秒后撤销失联计算页面并让访客等待；网络恢复后保留原选秀游标和私有手牌。操作系统离线事件会立即停止操作，回连后重新同步；全程0页面脚本错误。

## 验证边界

- 已对公网网址进行独立浏览器联机，但未获得真实手机、不同物理设备、校园网和运营商网络的实测条件；独立Context不等同于独立物理设备。
- 未故意耗尽账号的每日配额。费用与超限行为依据官方Free文档，账号方案由用户在控制台确认；没有创建付费资源或调用升级接口。
- Tailscale本机备用入口保持关闭，主方案通过Cloudflare正式网址提供，不把备用入口视为另一个已公开服务。

计算房主主动关闭、设备休眠或移动浏览器被系统暂停时，对局等待原浏览器恢复；不承诺后台常驻或客人接管。IndexedDB事务测试使用`fake-indexeddb`验证原子性，真实Edge网页验收验证实际存档与返回恢复；两者均不代表断电等硬件故障下已经完成所有存储耐久性验证。

规则来源与研究边界分别见[规则说明](rules.md)、[角色核验](characters.md)、[网页房规](house-rules.md)和[研究缺口](research-gaps.md)。这些测试验证明确的行为预期，不把尚未读取的英文新版PDF正文或未经测试的网络环境写成已核验事实。
