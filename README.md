# 胡闹运动会 · 好友联机

基于 CMYK 2025《Magical Athlete》基础盒的非官方中文网页项目。2–6人按对应官方流程；7–8人明确标注网页扩展模式。36名基础角色、两人双角色、两批选秀、四场暗选/揭示、技能响应、累计分数和原房间再来一局。

## 使用方式与费用

本项目最终采用用户于2026-10-21明确选择的**零费用、本机当主机**方式：整站运行在房主电脑，通过 Tailscale Personal 的 Funnel HTTPS 地址提供给同学。只有房主需要首次安装并登录 Tailscale；同学只需浏览器打开同一个网址，输入昵称与房间码，或打开专属邀请链接。

电脑、游戏服务和连接通道需要在游玩时运行。关闭电脑后无法继续联机；SQLite 对局保存在本机，重启后原浏览器可恢复身份。无需购买域名或常驻云服务器。Funnel 的资格和限额以[当前官方文档](https://tailscale.com/docs/features/tailscale-funnel)及[Personal套餐](https://tailscale.com/pricing)为准；目前仍为beta、有带宽限制，不承诺商业SLA。大陆校园网和手机运营商访问质量需要对应网络实测。

一键脚本与首次设置见 [本机主机说明](docs/local-host.md)。`render.yaml` 和 Dockerfile 保留为可移植部署配置，本次未创建付费云资源。GitHub Pages只能承载静态文件，不能代替实时游戏服务；本次不使用短期随机隧道地址冒充正式入口。

## 本地开发

需要 Node.js 24+、pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile
pnpm dev
# 另一个终端
pnpm dev:client
```

开发前端默认在5173、后端3000。Vite代理API和Socket.IO，无境外CDN、外部字体、图片或音效依赖。

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

生产入口 `dist/server/server/index.js` 同时提供前端和Socket.IO。按 `.env.example` 设置环境变量；启动脚本自动设置 `PUBLIC_ORIGIN` 为实际Funnel域名。默认每次操作120秒，0关闭自动选择。使用云部署时必须配置持久化磁盘并仅运行一个实例。

## 规则与美术

- [规则来源、流程和赛道](docs/rules.md)：CMYK 2025基础盒、IELLO 2026-08-28 v2.0 FAQ明确整合的8月修订。
- [36角色核验](docs/characters.md)、[结构化卡库](src/shared/characters.ts)、[两面赛道](src/shared/tracks.ts)。中文名均为本项目译名。
- [网页房规](docs/house-rules.md)：7–8人两批2N蛇形选秀、Egg未分配牌堆补充流程、超时合法默认选项。没有宣称扩展人数与官方平衡相同。
- [研究覆盖与缺口](docs/research-gaps.md)：新版CMYK PDF与BGG正文访问受限的实际边界、英法先手掷骰差异。
- [美术方向](docs/art-direction.md)、[资产与许可](docs/assets.md)：36个原创SVG头像，不分发原作插画、商业字体或卡面PDF。

## 架构和恢复

`src/engine`独立于UI和网络。服务器统一生成骰子、处理合法动作及序列化事件队列；每人快照隔离暗选、手牌与待处理技能选项。浏览器只提交意图。Player、Racer、角色卡分别建模。

`src/server/store.ts`使用Node内置SQLite，WAL与`synchronous=FULL`。房间状态、随机记录、待处理选择、事件队列、操作去重记录在同一事务提交后才确认成功。网络断开后主动全量同步，不依赖Socket.IO的临时恢复。每个动作有actionId和预期版本，重复请求只生效一次；昵称不作为身份。重连令牌仅存原浏览器本机，数据库只保存其哈希，邀请链接不带身份令牌。

`DATA_DIR`默认`data/`，请保留整个目录。**不要把数据库、环境文件或身份信息提交到仓库。**备份时先停止游戏，再复制整个data目录；恢复时停止服务并还原同一目录。升级前备份，重新安装锁定依赖、执行检查并构建，再启动游戏。当前没有跨不兼容规则版本的自动数据库迁移。

## 验收

```sh
pnpm test
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
```

Windows测试默认使用已安装Edge，Linux CI使用Playwright Chromium。实际执行结果、环境、截图与未完成项目见 [测试报告](docs/testing.md)。`tests/ability-specs.ts`记录独立预期和来源；测试数不等于穷尽全部角色组合。

GitHub Actions运行类型检查、规则/网络测试、生产构建和独立BrowserContext测试。`scripts/github-publish.mjs`可通过本机Git Credential Manager推送；凭据仅在进程内，绝不写入远程URL、源码或日志。

## 目录

```text
src/client   React界面、原创SVG、网络恢复
src/engine   纯规则、可持久化事件/选择
src/shared   角色、赛道、协议类型
src/server   权威服务、身份、事务存储
tests        角色预期、组合、流程、联机、浏览器
docs         来源、房规、美术、验收和部署
scripts      本机启动与仓库发布
```
