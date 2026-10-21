# 胡闹运动会 · 好友联机

基于 CMYK 2025《Magical Athlete》基础盒的非官方中文网页项目。支持36名基础角色、两人双角色、两批选秀、四场暗选与揭示、技能响应、累计分数和原房间再来一局。2–6人按对应官方流程；7–8人为明确标注的网页扩展模式。

比赛界面升级为真正的3D棋盘与36个立体玩具棋子，赛道固定两处直角转弯，手机整体旋转同一块棋盘。支持约2.5秒掷骰特写、逐格移动与技能连锁演出，以及低画质、静音、减少动效和1×/2×/4×速度；动画消费已确认事件，加速或跳过不改变规则结算。实现说明见 [3D升级说明](docs/3d-upgrade.md)。

## 主路线：打开网页就能当房主

玩家使用同一个HTTPS网址，输入昵称创建房间，再把邀请链接或六位房间号发给朋友。**创建者的浏览器负责计算对局**；Cloudflare Workers Free提供网页与WebSocket房间中继。朋友无需安装软件、登录游戏账号或配置网络，房主也无需运行本机Node服务。

当前房主可在等人大厅或对局顶部点击“结束房间”，再次确认后解散整个房间。所有玩家会收到解散提示；原房间号和邀请链接不能恢复此房间。

计算房主的网页需要保持打开和联网。关闭页面或设备休眠时对局暂停；回到原设备、原浏览器和同一网站后，可从IndexedDB中的存档恢复。其他玩家不会接管完整秘密状态。手机切到后台可能暂停网页，请在游玩时保持前台；清理站点数据或使用无痕窗口可能丢失恢复能力。这是熟人联机方案，计算房主可以访问完整对局状态。

**正式网站：[打开胡闹运动会](https://magical-athlete.qiuh23.workers.dev)。** 已部署到用户确认的Workers Free，使用固定`workers.dev`域名，无需购买域名或云服务器。122项本地自动检查通过，公网2、6、8人完整四场、刷新恢复与再来一局通过，弱网恢复与GitHub自动发布已验证。使用和维护方式见 [浏览器房主说明](docs/browser-host.md)，证据见 [测试报告](docs/testing.md)。

## 本地开发与检查

需要Node.js 24+、pnpm 11.25.0。浏览器房主模式：

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build:browser
pnpm dev:browser
```

打开`http://127.0.0.1:8787`，通过Wrangler本地运行静态网页和房间中继。`pnpm build:browser`生成浏览器房主专用的`dist/browser`。本地地址仅用于开发，不能当作朋友可访问的公网入口。检查部署包可运行`pnpm exec wrangler deploy --dry-run`；正式授权和部署见上述部署说明。

前端资源均随项目提供，无境外CDN、外部字体、图片或音效依赖。

## GitHub更新与网站同步

代码仓库为私有的 [qiuh23/magical-athlete-online](https://github.com/qiuh23/magical-athlete-online)。GitHub Actions配置类型检查、自动化测试、两种生产构建、Worker打包预演及两种联机模式的浏览器测试；最新远端运行结果见仓库的Actions页，不能由本地通过推断远端已通过。

最终代码`46f4071`的[完整CI已通过](https://github.com/qiuh23/magical-athlete-online/actions/runs/39468302305)：122项回归和两种模式共6组完整网页验收全部通过。

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

`src/engine`独立于界面和网络，两种模式共用规则。每个动作带操作ID和预期版本；重复请求仅生效一次。浏览器房主将状态、随机记录、技能队列和操作收据在同一IndexedDB事务完成后确认；Node备用模式使用SQLite事务。客人仅收到各自快照，不能看到其他人的手牌、未揭示选择或未来随机状态。身份凭据保留在各自浏览器，邀请链接不带身份令牌。

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
