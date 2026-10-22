# 胡闹运动会 · 好友联机

Wurstii A 扩展：新增30名中文角色、独立立绘与3D模型，接入现有“角色包与玩法”勾选设置，默认关闭；五个包全开共151张。详细适配卡文见 [Wurstii A 规则](public/rules/wurstii-a.md)，素材与历史验收见 [Wurstii 美术接入](docs/wurstii-art.md)。旧 Wurstii 对局保留冻结规则；每批选秀最后一张由系统自动分配。

2026-10-22：[复制与临时抽牌嵌套裁定](docs/copy-ability-rulings.md)、[当前能力详情排版](docs/ability-detail-layout-2026-10-22.md)。本轮采用能力专项验证，类型、构建和打包预演仍保留，不重复八人完整对局。

本分支新增 [粉丝扩展、房间与聊天迭代](docs/fan-iteration-2026-10-22.md)及[参考图美术升级](docs/art-refinement-2026-10-22.md)：Extra Mile 31、Leaf 18 个可玩条目，独立包开关，新建网页房间服务端权威结算、练习离线10分钟与30真人房共享容量。Box 尚无确定数字化适配而隔离。**本轮通过 PR 审阅，未部署；Second Wind 继续保留原实验性核验标识。**

2026-10-22 更新：[技能反馈、镜头跟随、聊天冒泡与随机数修复](docs/athlete-feedback-2026-10-22.md)。

此前 Second Wind 迭代新增36个角色的实验性规则与 Blender 模型接入、完整72张练习选牌，以及房间聊天、统一昵称去重和每局一次改名。**官方续作规则与部分边界尚待核实，目前不标记“完整支持72个角色”。** 历史验收见下列报告；本分支的独立角色包设置替代原作 / 续作 / 混合单选框。

本轮的运行、测试、实际联机截图和待核实项目见 [Second Wind 接入验收](docs/second-wind-delivery.md)；[逐角色规则数据](src/shared/second-wind.ts)、[规则来源与缺口](docs/second-wind-rules.md)、[模型与可编辑源](docs/second-wind-models.md)、[聊天与旧局兼容](docs/chat-names-rules-version.md)可分别检查。

基于 CMYK 2025《Magical Athlete》基础盒的非官方中文网页项目。支持36名基础角色、单人练习、1–7位AI、好友联机、两人双角色、两批选秀、四场暗选与揭示、技能响应、累计分数和原房间再来一局。2–6人按对应官方流程；7–8人为明确标注的网页扩展模式。

电脑和手机对局由3D棋盘铺满视口，无页面滚动；悬浮骰子、头像积分、右上小地图保留在场内，规则、播报和画质设置收进菜单。默认聚焦自己的棋子，连续观看其他选手的移动与技能后回位；支持总览、手动平移缩放和自动观看开关。回合开始能力由计算端自动推进，完成选择后才掷骰。动画只消费已确认事件，加速或跳过不改变规则结算。实现说明见 [3D升级说明](docs/3d-upgrade.md)与[沉浸式与人机验收](docs/immersive-practice.md)。

## 主路线：打开网页就能当房主

玩家使用同一个HTTPS网址，输入昵称创建房间，再把邀请链接或六位房间号发给朋友。**本分支新建房间由服务器的 SQLite Durable Object 负责计算与保存对局**；Cloudflare Workers 提供网页、WebSocket和房间权威状态。旧的浏览器计算房间保留原存档与规则版本。朋友无需安装软件、登录游戏账号或配置网络，房主也无需运行本机Node服务。

当前房主可在等人大厅或对局顶部点击“结束房间”，再次确认后解散整个房间。所有玩家会收到解散提示；原房间号和邀请链接不能恢复此房间。

“加入朋友”界面列出当前房间，可直接点击加入或观战，也支持输入房间码。观战者不占选手席位，可观看已满员或已经开始的比赛，不能操作比赛或查看手牌、暗选和私有技能选择。玩家可点击“退出房间”，观战者可随时点击“退出观战”；大厅普通选手退出会释放席位，开赛后退出保留席位供原浏览器返回。新建的服务端房间由服务器继续保存与结算；旧浏览器计算房间在计算网页退出时仍暂停，返回原浏览器后继续。

**所有类型房间**均在创建房主在线时保留，在线闲置不会过期。最后一个有效房主连接离开后，由服务端计时，个人练习连续离开 **10 分钟**、独立AI与真人房连续离开 **30 分钟** 自动关闭，期间返回取消计时。其他玩家、AI 和观战活动不会续期。退出或刷新不会自动把房主转给其他人，显式移交房主才转移归属。首页可返回仍保留的房间，无需重复创建。房主“退出房间”保留房间后退出当前标签页；AI/练习房还可确认解散并立即清理。

双人模式每场暗选两名上场选手时可交换先后行动顺序；确认后本场固定，下一场重选。每名选手完整结算后才开始下一名，真人决斗均等待对应控制玩家点击。粘液怪在双人模式排除己方全部选手的减速属于本项目自定义规则。

新建练习默认保留原两代72张，启用三个粉丝包后可在151个来源区分的已完成条目中跨包任选四张，支持查看技能、取消和重选；练习房不会进入观战列表。

旧浏览器计算房间的计算网页需要保持打开和联网。关闭页面或设备休眠时旧房间对局暂停；回到原设备、原浏览器和同一网站后，可从IndexedDB中的存档恢复。其他玩家不会接管完整秘密状态。手机切到后台可能暂停网页，请在游玩时保持前台；清理站点数据或使用无痕窗口可能丢失恢复能力。此旧模式的计算房主可以访问完整对局状态；新建服务端房间不把完整秘密状态交给任何玩家网页。

**正式网站：[打开胡闹运动会](https://magical-athlete.qiuh23.workers.dev)。** 已部署到用户确认的Workers Free，使用固定`workers.dev`域名，无需购买域名或云服务器。原3D版本已验证两种模式2、6、8人完整四场，正式网站8人四场、房主与客人恢复和再来一局；本次沉浸式、单练与人机的独立验收结果见[本次报告](docs/immersive-practice.md)。使用和维护方式见 [浏览器房主说明](docs/browser-host.md)，证据见 [测试报告](docs/testing.md)。

## 本地开发与检查

微缩玩具运动会美术升级、加长起点与开赛巡礼的同镜头前后截图及本机验收记录见[美术打磨报告](docs/toy-diorama.md)。

双人行动顺序、决斗、个人房回收、完整练习牌池及 Blender 36 角色升级的修改原因、测试和实际游戏截图见[本次验收报告](docs/duo-practice-blender.md)。

需要Node.js 24+、pnpm 11.25.0。浏览器房主模式：

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build:browser
pnpm dev:browser
```

打开`http://127.0.0.1:8787`，通过Wrangler本地运行静态网页和房间服务。`pnpm build:browser`生成Worker网页资源`dist/browser`。本地地址仅用于开发，不能当作朋友可访问的公网入口。检查部署包可运行`pnpm exec wrangler deploy --dry-run`；正式授权和部署见上述部署说明。

前端资源均随项目提供，无境外CDN、外部字体、图片或音效依赖。

## GitHub更新与网站同步

代码仓库为私有的 [qiuh23/magical-athlete-online](https://github.com/qiuh23/magical-athlete-online)。GitHub Actions 默认仅做必要的类型检查、构建、Worker 打包预演及 **一场八人联机检查**。单元与动画专项通过手动 `all` 按需执行，完整四场矩阵保留手动命令；最新远端结果见 Actions 页。

3D 版本的[单场八人 CI 已通过](https://github.com/qiuh23/magical-athlete-online/actions/runs/39540261380)，约 1.6 分钟。按用户要求，用例总时限为 15 分钟，整个 CI 任务上限为 30 分钟。

此前2D版本代码`46f4071`的[完整CI已通过](https://github.com/qiuh23/magical-athlete-online/actions/runs/39468302305)：122项回归和两种模式共6组完整网页验收全部通过。

Cloudflare Workers Builds已连接此私有仓库和生产分支`main`，已实际验证一次推送后自动构建、部署成功，网站地址不变。默认构建`pnpm build`同时生成两种版本，面板也可用`pnpm build:browser`只构建网页版本；部署命令`pnpm exec wrangler deploy`。现有对局结束后再发布涉及规则或协议的更新。具体配置见 [GitHub自动同步步骤](docs/browser-host.md#github-自动同步)。

## 备用：Node与本机Tailscale

保留Node权威服务器、SQLite存档和Tailscale Funnel固定HTTPS入口，供需要独立服务器的场景使用。此模式由运行Node的电脑计算；网页管理房主退出不等于服务器停止。朋友仍只需浏览器，但服务电脑必须保持运行。首次安装、登录、启用Funnel、启动与停止脚本见 [本机主机说明](docs/local-host.md)。此备用入口尚未公开，不能视为已交付的公网服务。

Node开发时在两个终端分别运行：

```sh
pnpm dev
pnpm dev:client
```

前端默认5173、Node后端3000；Vite代理API和Socket.IO。生产运行：

```sh
pnpm build
pnpm start
```

入口`dist/server/server/index.js`同时提供网页与Socket.IO。按`.env.example`配置`PUBLIC_ORIGIN`等环境变量；云部署需要持久化磁盘且只运行一个实例。`Dockerfile`和`render.yaml`作为可移植配置保留，未创建付费资源。默认操作时限120秒，0关闭超时自动选择。

`DATA_DIR`默认`data/`，备份前停止服务并复制整个目录。不要将数据库、环境文件或身份信息提交仓库；当前没有跨不兼容规则版本的自动迁移。使用本机备用方案更新时，先结束对局并运行“停止游戏”，再双击`更新游戏.cmd`完成拉取、安装、检查和构建，成功后重新运行“启动游戏”。它更新的是本机Node网站，不会部署Cloudflare。

## 规则、美术与状态安全

- [规则来源、流程和赛道](docs/rules.md)：CMYK 2025基础盒、IELLO 2026-08-28 v2.0 FAQ明确整合的8月修订。
- [36角色核验](docs/characters.md)、[结构化卡库](src/shared/characters.ts)、[两面赛道](src/shared/tracks.ts)。中文名为本项目译名。
- [网页房规](docs/house-rules.md)：7–8人扩展、Egg补充流程和超时默认选项。
- [研究覆盖与缺口](docs/research-gaps.md)：新版CMYK英文PDF正文访问受限等实际边界。
- [美术方向](docs/art-direction.md)、[资产与许可](docs/assets.md)：36个原创SVG头像，不分发原作插画、商业字体或卡面PDF。

`src/engine`独立于界面和网络，两种部署共用规则。每个动作带操作ID和预期版本；重复请求仅生效一次。新Worker房间在SQLite Durable Object事务中保存状态、随机记录、技能队列和操作收据；Node备用模式使用SQLite事务。旧浏览器计算房间沿用原IndexedDB事务恢复路径。各页面只收到本人可见快照，不能看到其他人的手牌、未揭示选择或未来随机状态。身份凭据保留在各自浏览器，邀请链接不带身份令牌。

## 验收

```sh
pnpm test
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
pnpm build:browser
pnpm test:relay
```

Windows浏览器测试使用已安装的Edge，Linux CI配置使用Playwright Chromium。已执行结果、截图、复现命令和公网待测项目见 [测试报告](docs/testing.md)。独立行为预期记录在`tests/ability-specs.ts`；通过测试不代表穷尽所有角色组合或真实设备、网络环境。

## 目录

```text
src/client   React界面、原创SVG、网络恢复
src/browser  浏览器计算房主、IndexedDB原子存档
src/worker   Cloudflare房间身份与WebSocket中继
src/engine   纯规则、可持久化事件与选择
src/shared   角色、赛道、房间投影、协议类型
src/server   备用Node权威服务、身份、SQLite存储
tests        角色、组合、流程、事务、网络与浏览器验收
docs         来源、房规、美术、测试与部署
scripts      构建、本机启动、更新与仓库发布
```
