# 双人交互、全类型房间回收与 Blender 角色升级验收

日期：2026-10-21。修改在 `codex/duo-practice-blender` 分支，未部署生产网站。

## 复现与修改原因

- 旧引擎中，双人己方粘液怪会令队友的主骰 3 只移动 2 格；本次仅对该双人减速效果增加同控制玩家豁免，其他技能目标保持原规则。网页规则页明确标为自定义规则。
- 旧超时策略会替真人的必选决斗步骤选择 `roll`。当按钮尚在等待前序演出时，用户可能直接看到自动投出。现在真人两名选手均等待本人点击，AI 继续自动；以玩家 ID 判权限，以选手实例 ID 绑定步骤，不用角色定义 ID 代表控制权。
- 双人出场数组以前仅隐式影响顺序；现在选牌时显示先后和交换按钮，确认后保存 `baseTurnOrder`，推进和同玩家技能排序共用这份顺序，下一场重选。回合开始技能仍先处理，结束前不替下一位掷骰。
- 旧房间按创建后 3 小时到期。现在按最新产品要求，全部类型房间统一由 Node 和 Worker 持久化创建房主离开时间，生产期限固定 30 分钟，最后一个有效连接离开才计时。退出或刷新不会自动移交房主，30分钟内保留原主；显式移交房主才转移。首页提供返回原房间入口。在线无操作、AI 和观战均不会误触发或延长期限。恢复、重启、主动解散与重复清理都有回归。所有类型的主动解散均即时清理活跃记录、身份凭据、AI/计时任务，仅留关闭记录；旧链接不能复活。
- 练习开局以前只展示随机候选；现在完整 36 张牌任选四张不同角色。旧存档若停在已选 1～3 张的练习选秀阶段，可原子替换为新阵容，不修改已开赛存档。服务端目录创建、更新、恢复均排除练习房，前端也过滤。
- 原摔倒约转动 2.5π；现在短促失衡、一次 90° 倾倒、轻落地，倒地/起身跟随规则状态。逐格移动改为经过格中心的缓弯路径、按弧长采样、平滑起停和小幅落脚，终点、格数、随机与规则时间不变。
- 双人镜头在第二位行动后会回跳第一位，现在保留最近己方行动者；手机巡礼结束时目标不变、视角改变也平滑过渡。远距离移动与缩放限速；自动跟随、手动平移、总览和恢复选择保持原有操作语义。
- 首页增加“返回刚才创建的房间”，沿用保存的原身份和房间码，不再创建新房。刷新当前房间继续恢复当前路由，同浏览器不同标签的选手/观战身份分别保留。首页只读查询服务器确认房间和归属，不打开连接、不取消离开计时；点击返回才恢复连接，已关闭或过期的入口清理。
- 高画质与低画质分别使用精修和经济版模型。减少动效时棋盘、骰子按需渲染，直接显示确认的落点和最终姿态，避免八个软件 WebGL 客户端持续绘制静态画面。
- 房主赛后“解散房间”与“原房间，再来一局”并列，使用同宽同高的主按钮；中间场次也与“前往下一场”并列。解散先确认，确认后复用统一清理，其他玩家和观战者不显示管理按钮。

## 规则与美术依据

[IELLO 2026-08-28 v2.0 FAQ](https://iello.fr/athletes-de-compete-tatillon-repond-a-vos-questions/)确认行动完整结算、赛道优先、当前玩家和顺时针优先，以及同玩家选手在开赛固定次序用于技能排序。本次未绕过技能明确的抢先、追加或跳过动作。

CMYK 主创八月更新的 [BGG 讨论](https://boardgamegeek.com/thread/3754599/a-couple-august-2026-rules-updates/page/1)本次返回 403，未声称读取其完整正文；按用户指定的固定顺序要求及发行商 FAQ 实施，既有研究边界见 [research-gaps.md](research-gaps.md)。

美术参考 [Aardman 的黏土角色](https://www.aardman.com/film-tv-games/morph/)与 [Blender Studio 的 Wing It! 卡通设计](https://studio.blender.org/projects/wing-it/blog/)，用于圆润体块、清楚表情、软质玩具表面与微缩场景的方向。未导入这些作品的模型或贴图。地图增加共享的微细粗糙度印纹，保持原赛道编号、布局和标识。

## Blender 交付

实际使用 Blender 5.2.3 LTS Release Candidate 后台 Python。先检查野兔与粘液怪的前/侧/背面，再完善全部 36 名已实现选手。可编辑源、复现脚本、覆盖清单和预算见 [Blender 模型报告](blender-models.md)，实际包体与逐角色数据见 [manifest](../public/models/toy-racers.manifest.json)。

模型统一 +Y 向上、+Z 正面、地面中心原点和 `toy_<角色ID>` 命名。沿用运行时父组的站立、移动、技能、传送、摔倒与起身动作，不新增骨骼依赖。游戏资源带版本参数，更新后不会复用旧 URL 缓存。截图会等待实际 GLB 节点加载，确认没有占位模型。

## 验证

- `pnpm typecheck` 通过；`pnpm test` **331/331** 通过；`pnpm build` 成功生成 Node 与浏览器房主版本。Three.js 分包仍有既有的 >500 kB 构建提示，不影响构建成功。
- Node 真实界面：两种行动顺序、确认后刷新、下一场重选；8 种跨玩家决斗发起/应战组合、双方手动投掷、应战者刷新、每次只产生两颗骰和一份结果。
- Worker 真实界面：逆序锁定和回合开始技能、双方刷新后的第二名选手决斗；手机练习完整牌池、取消重选、存档和四场练习入口。
- 可控时钟：所有模式的 30 分钟边界、期限内返回、再次离开、普通玩家/AI/观战无效续期、多标签、重启、权限、主动解散和幂等；生产常量仍为 `30 * 60 * 1000`。
- 原房返回：普通/AI/练习三种模式只创建一次；房主退出后保留房主身份，首页一键返回原房间；仍有其他标签在线时不误计离开，最后标签离开后重新返回取消计时；当前路由刷新和同浏览器选手/观战身份互不覆盖。其他标签解散后返回入口、凭据清理，刷新旧链接仍显示关闭。
- 移交竞态：旧成功回执重放不能覆盖新房主或取消原计时；移交目标在回执前退出、服务重建和首次确认丢失仍能正确恢复。缺失/错误回执版本不确认移交。
- 实际 WebGL：电脑与手机布局加载新模型，转弯移动经过规则格位；镜头回到正确的第二名己方角色。另有连续远端技能链、手动镜头和总览的回放验证。
- 浏览器专项合计 20 项通过：Node 新增交互/模型、减少动效及赛后双按钮 6 项，模型失败恢复及画质切换 2 项，交换摔倒/传送后退/同时移动 3 项，Worker 解散、双人恢复、普通房主双标签退出、同浏览器双身份与全模式首页返回 7 项，Worker 手机练习 1 项，完整远端技能链镜头 1 项。一次交换用例的断言通过后因并行测试共用录像目录发生清理冲突，改用独立输出目录重跑后通过。
- Worker `wrangler deploy --dry-run` 成功。高画质 GLB 为 1,636,676 字节、192,306 三角形；低画质 GLB 为 857,268 字节、71,065 三角形。每档源资源与 Node/浏览器构建包逐一核对 SHA-256 一致：高画质 `01DE0790AFC894B9C9898FEFDF9A1AEA10FE9CD809F265DB5185AEA9A5B10CA5`，低画质 `972DF4A3DA5F17384A960083CAA6FB378ACC4D8D33C79425C8C154937EB0EBFE`。

- 八个独立软件 WebGL 客户端的单场比赛通过（本地 Edge + SwiftShader，约 3.7 分钟），覆盖房主/访客重连、双标签、隐私和布局。此前远端检查曾在第 37 次操作遇到已启用掷骰按钮停等；已补充有界公开 UI 诊断，优化减少动效渲染与低画质几何，其后远端在双标签恢复时命中了新增存档诊断的 2 秒限制。正常存档读取已改用与原动作相同的 20 秒有界上限，公开 UI 诊断仍为 2 秒；最终远端状态以 PR Checks 为准。
- 减少动效实际 RAF 采样确认移动、传送和交换达到正确落点，骰面可读，回到自己镜头后连续 400ms 的实际 WebGL 帧增量为 0；正常动效仍保留平滑移动与镜头插值。见 [采样记录](qa/duo-upgrade/reduced-motion-demand.json)。

## 实际游戏截图

| 场景 | 截图 |
| --- | --- |
| 交换两名选手的行动顺序 | [电脑选牌](qa/duo-upgrade/order-reversed.png) |
| 第二名选手决斗，等待本人投掷 | [手机决斗](qa/duo-upgrade/duel-second-athlete-mobile.png) |
| 赛后再来一局与解散同等重要 | [电脑](qa/duo-upgrade/results-equal-actions-desktop.png)、[手机](qa/duo-upgrade/results-equal-actions-mobile.png) |
| 首页返回刚才创建的房间 | [手机练习入口](qa/duo-upgrade/home-owner-return-practice.png)、[普通联机返回](qa/duo-upgrade/home-owner-restored-multiplayer.png)、[AI 返回](qa/duo-upgrade/home-owner-restored-ai.png) |
| 房主双标签退出与原身份恢复 | [退出确认](qa/duo-upgrade/multiplayer-owner-exit-confirm.png)、[返回房间](qa/duo-upgrade/multiplayer-owner-return.png) |
| 完整牌池自由选四张 | [手机练习选牌](qa/duo-upgrade/practice-pool-mobile.png) |
| 新模型与微缩地图 | [电脑](qa/duo-upgrade/blender-game-desktop.png)、[手机](qa/duo-upgrade/blender-game-mobile.png) |
| 转弯移动与跟随第二名选手 | [移动](qa/duo-upgrade/corner-move-mobile.png)、[跟随回位](qa/duo-upgrade/follow-second-mobile.png) |
| Blender 代表角色前侧背检查 | [野兔与粘液怪](evidence/blender/representatives-front-side-back.png) |
| 高低画质模型对比 | [相同镜头下的前侧背](evidence/blender/economy-front-side-back.png) |
| 全部 36 名角色 | [总览](evidence/blender/all-36-front.png) |

决斗矩阵见 [duel-matrix.json](qa/duo-upgrade/duel-matrix.json)，实际帧采样见 [手机](qa/duo-upgrade/movement-mobile.json)和[电脑](qa/duo-upgrade/movement-desktop.json)。

## 验证边界

- 手机验证为桌面 Edge 的 390×844 布局仿真，未在实体 Android/iPhone 上运行，不能据此保证所有手机的帧率、温度和电量表现。
- 未进行公网部署，也未在生产服务真实等待 30 分钟；服务回收边界以 Node/Worker 可控时钟和真实连接测试验证。
- 新模型使用运行时刚体动作，未新增骨骼蒙皮或角色专属逐肢体动画。
- CMYK 更新帖正文的访问限制仍在；新模型与新增规则需要在合并部署后另做公网版本核验。
