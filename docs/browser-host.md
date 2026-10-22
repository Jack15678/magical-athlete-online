# 浏览器主持模式

> 2026-10-22 本分支的新建房间已改为服务端 Durable Object 权威结算，见[迭代说明](fan-iteration-2026-10-22.md)。本文保留旧浏览器计算房间恢复与部署历史；已存在的旧房间继续使用原存档。部署命令及网址配置仍适用。

正式入口：https://magical-athlete.qiuh23.workers.dev 。已部署到用户确认的Workers Free；无需在游玩设备安装本项目、Node或Tailscale。

`pnpm build`同时生成本机版与浏览器房主版，兼容Cloudflare面板默认构建命令；`pnpm build:browser`可只构建网页房主版本。

所有人打开同一个 HTTPS 网站，创建房间或输入六位房间码。创建者当前浏览器负责规则和随机计算，Cloudflare 只做连接认证与消息中继；玩家无需注册或安装软件。可以从任意支持的设备创建房间，不依赖部署者固定电脑上的 Node 服务或 Tailscale。

在“加入朋友”页可以刷新当前房间列表，查看人数、比赛阶段及剩余有效期，点击加入或观战。练习房从列表排除，人机和满员或已开赛的房间支持观战；观战不占参赛席位。观战视图只包含公开信息，不能查看任何选手的手牌、暗选或私有选择，也不能执行比赛动作。每房最多32名观战者。

房内提供“退出房间”或“退出观战”。普通选手在大厅主动退出会释放席位并撤销旧凭据；开赛后的选手及计算房主退出会保留身份，便于在有效期内回到原浏览器继续。计算房主退出会暂停比赛，退出前会显示说明。断网时仍可退出页面；保留本地凭据，待联网后返回。观战和选手的凭据分别保存，切换身份不会覆盖原计算房主的恢复凭据。

主持网页需保持打开并联网。刷新、短暂断线时其他玩家暂停；原浏览器恢复后继续。手机切后台或锁屏可能暂停网页，清除网站数据或使用无痕模式也可能丢失主持存档。主持者拥有完整状态，这个模式面向互相信任的好友。

## 构建和本地验证

使用项目锁定的 Wrangler 和 Node 24。浏览器前端构建输出到 `dist/browser`；`wrangler.jsonc` 在同一个域名提供静态资源和 `/api/browser/*` 中继。

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build:browser
pnpm exec wrangler deploy --dry-run
pnpm exec wrangler dev --ip 127.0.0.1 --port 8787
```

本地验证 URL 为终端打印的网址。必须验证独立浏览器身份、满员/开局锁定、秘密选择、重发去重、刷新恢复和主持断线暂停，再发布公网。

## 零费用发布

创建或使用已有 Cloudflare 免费账号并完成 Wrangler OAuth 登录。保持 **Workers Free**，不要升级 Workers Paid；无需购买域名或开通 R2、付费 TURN 等其他产品。

```powershell
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm exec wrangler deploy
```

固定网站地址形如 `https://magical-athlete.<你的账号子域>.workers.dev`。如该 Worker 名已被本账号使用，请修改项目 `wrangler.jsonc` 的 `name`，之后保持不变。玩家只需这一个入口，可继续复制带房间码的邀请链接。

Cloudflare Free 的静态资源请求免费；中继有日额度，超过额度后报错停止，不会自动购买或升级付费方案。当前核查的额度与官方来源见 [免费方案核查](./browser-host-research.md)。发布者应在控制台确认账号方案；代码配置无法代替账单方案检查。

## GitHub 自动同步

Cloudflare 的 GitHub integration 可以绑定此仓库与生产分支，构建命令使用 `pnpm build:browser`，部署命令使用 `pnpm exec wrangler deploy`。每次生产分支推送后构建部署到同一个地址。需要发布者授权 Cloudflare 访问仓库，玩家不需要登录 GitHub。[官方说明](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)

只配置一条自动发布路线。仓库中不要存储 Cloudflare API Token 或玩家重连凭据。在线对局期间避免发布破坏协议的更改；现有页面遇到协议不兼容时应先保存、结束本局，再刷新更新。

已用 Wrangler 发布后，可按以下步骤接入自动更新：

1. Cloudflare 控制台进入 **Workers & Pages → magical-athlete → Settings → Builds → Connect**，选择 GitHub 并授权。Worker 名必须与仓库 `wrangler.jsonc` 的 `name` 相同；仓库根目录选择 `/`。[Builds 接入流程](https://developers.cloudflare.com/workers/ci-cd/builds/)
2. 安装 **Cloudflare Workers & Pages** GitHub App 时选择 **Only select repositories**，仅授权这个游戏仓库。已有私有仓库无需为部署改成公开；如果连接列表看不到仓库，先检查此 App 的仓库授权和所属账号。[GitHub integration 访问管理](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
3. 生产分支选择实际使用的默认分支；构建命令填 `pnpm build:browser`，部署命令填 `pnpm exec wrangler deploy`。设构建变量 `NODE_VERSION=24`、`PNPM_VERSION=11.25.0`，让构建和项目 CI 要求一致。自动依赖安装使用已提交的 pnpm lockfile。[构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[构建镜像版本](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
4. 首版关闭 **Enable Preview Builds**，只在生产分支推送时发布，避免临时分支也触发构建和生成额外预览。以后需要预览时应先配置隔离的 DO 资源。[生产分支与预览控制](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
5. Cloudflare Builds 可以代管部署 API token，不必把 token 提交源码或交给玩家。控制台的构建授权和本地 Wrangler 登录是两套授权，不能把本地“已登录”视为已完成自动发布。生产分支推送后，在 Builds 检查新提交对应的成功记录，再打开固定网址确认新版本。[Builds 部署凭据](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token)

Workers Builds Free 当前提供每月 **3,000 构建分钟**、**1 个并发构建**、每次 **20 分钟**上限。生产网站运行额度与构建额度分别计算；维持免费方案，不因额度不够而升级 Paid。[Builds Free 限制](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)

## 状态和身份

- 规则状态、随机记录与动作去重结果由主持浏览器的 IndexedDB 保存，保存成功后才确认动作。
- Durable Object 使用 SQLite 后端保存房间与座位凭据摘要、主持身份和最新每人私有视图缓存；中继不包含规则引擎。
- 身份令牌只保存在玩家浏览器，通过 WSS 首包认证，不放进邀请链接和公开日志。昵称相同不会变成同一个身份。
- 普通连接只能发操作意图与同步请求；当前主持连接才能发送裁剪后的状态和操作确认，按玩家 ID 定向分发。
- 连接采用 hibernation，在空闲时可休眠；恢复时从连接附件与 SQLite 元数据恢复路由。客户端仍须处理平台断线并重连。
- 客户端每10秒发送链路心跳，25秒收不到回复就重新连接。DO 从平台保存的自动回复时间戳检查主持连接的35秒租约；超过租约即撤销主持角色、通知全房暂停。心跳本身不会唤醒 DO；认证超时、主持租约和房间过期共用持久化 alarm，没有常驻计时器。若无法保存下一次租约检查，中继会关闭主持连接并暂停，不能继续声称在线。
- 所有类型房间在创建房主在线时保留，最后一个有效创建房主连接离开后30分钟自动关闭；返回取消本次计时，再次离开重新计时。中继服务持久化离开时间并通过 Durable Object alarm 执行清理，浏览器关闭后仍有效；心跳租约兼容平台连接失效。AI、观战和普通对局活动不能刷新房主离开的计时。房主退出只离开当前标签，其他有效标签仍在线则不计时。AI/练习房可从“退出房间”确认立即解散。房主离开或刷新不会自动把房主交给其他人；首页提供原身份返回入口，30分钟内返回可继续，显式移交才转移ownerId。关闭时清理活跃状态、凭据、视图及告警，仅保留不含秘密的关闭记录；旧链接不能复活房间。
- 房间目录复用现有 `ROOMS` Durable Object 命名空间，不需要增加绑定或运行数据迁移；目录只保存公开摘要，不包含凭据或手牌。已有房间在原页面重新认证后登记到目录。

