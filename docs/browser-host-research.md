# 浏览器主持联机：免费部署核查

## 结论

可实施：把现有纯 TypeScript 规则引擎放进创建房间者的浏览器，使用 Cloudflare Workers Free 的静态资源托管和 SQLite-backed Durable Object 作为房间消息中继。所有玩家只打开同一个固定 HTTPS 网站，通过房间码或邀请链接加入；游戏时无需本机 Node 服务或 Tailscale。创建者可以使用任意支持的电脑或手机浏览器，但主持这一局的网页必须保持运行。

Cloudflare 官方产品页明确提供免信用卡开始使用的免费方案。保持 Workers Free，不升级 Workers Paid，不启用额外收费产品，才能维持这里的零费用边界。[Cloudflare Workers 产品页](https://www.cloudflare.com/products/workers/)

这仍需要一个小型联网中继。GitHub Pages 官方定位为 HTML/CSS/JavaScript 静态托管；它可以下发游戏程序，却不提供供多个浏览器共享的持久实时房间进程。因此，“只用 GitHub Pages、无其他联网服务，同时保持自动房间码联机”的要求不适合这条路线。源代码仍保存在 GitHub。[GitHub Pages 说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 免费边界

以下是官方当前文档中与本项目直接相关的额度，额度为账号共享，不能把每个房间都按一份额度计算。

| 项目 | Workers Free |
| --- | --- |
| Worker 动态请求 | 100,000 / 日 |
| Worker 每次调用 CPU | 10 ms |
| 静态文件请求 | 免费、不限请求数；资源存储无额外费用 |
| Durable Object 后端 | 只允许 SQLite-backed |
| Durable Object 请求 | 100,000 / 日 |
| Durable Object 运行时长 | 13,000 GB-s / 日 |
| Durable Object SQLite | 读 500 万行 / 日，写 10 万行 / 日，账号总存储 5 GB |

Workers Free 的请求额度和 CPU 见 [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)。静态资源费用见 [Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)。DO 免费额度、SQLite 要求与超限行为见 [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)：Free 超过某项限额后，该类操作失败；日额度于 UTC 00:00，即北京时间 08:00 重置。超额不是自动进入付费按量计费。

DO 创建 WebSocket 需要请求；出站消息不收费，入站应用消息计费按 20:1 折算。使用 WebSocket Hibernation，让没有消息时的房间符合休眠条件，避免普通 `accept()` 把连接全程计入运行时长。[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

2～8 人回合制好友房是与这些额度相符的使用形态；这属于依据消息量和处理方式的工程判断，不是无上限或不受中断的保证。静态页、额度耗尽、网络可达性和实际游戏稳定性需分别验收。尤其需在玩家实际网络下测试 `workers.dev`，不能由部署成功推断所有网络都能连通。

## 已实现的数据流与边界

```text
浏览器 A（房主；完整规则状态 + RNG + IndexedDB）
          ↕ 同域 WSS
Cloudflare Worker → 房间 Durable Object（认证、路由、连接信息）
          ↕ 同域 WSS
浏览器 B～H（操作意图；各自被允许看到的视图）
```

以下描述当前源码实现，不是 Cloudflare 预置功能；本地测试和公网实际稳定性仍需分别核验：

1. `src/engine` 保持不依赖 Node；浏览器主持层串行处理操作。中继不导入规则引擎、不生成骰子、不裁定技能。
2. 每个房间一个 DO。SQLite 保存房间生命周期、座位凭据摘要、创建者主持身份、阶段和管理权，以及每名玩家最新的一份私有裁剪视图缓存；缓存按玩家覆盖，不存完整规则状态或动作历史。完整权威游戏状态保存在房主浏览器的 IndexedDB。连接 ID、身份和主持角色保存在各 WebSocket 的附件中，以跨休眠恢复。
3. 房主先把状态、随机记录、待决技能、动作去重结果放入一个 IndexedDB 事务，等待事务完成，再广播视图、返回成功确认。保存失败就拒绝动作，不先显示已成功。
4. 玩家操作包含 actionId 和预期版本。中继根据已认证连接附加真实 playerId；客户端不能靠 payload 冒充其他人。房主用既有规则校验并生成每人独立的裁剪视图，暗选牌和未来随机信息不能广播全房。
5. 邀请链接和房间码仅授予加入能力。每个席位有独立的32字节随机身份令牌；创建者使用自己的身份凭据请求主持角色，中继只允许创建者取得该角色。令牌保存在该浏览器，不放入分享 URL，不打印日志；中继仅保存摘要与席位的对应关系。
6. 主持角色结合当前有效连接 ID 校验。同一创建者的新主持连接完成认证后废止旧主持连接；旧连接不能再发状态，避免两个标签页同时主持。浏览器另持有本房间的 Web Lock，普通同身份标签页仍可作为查看页面。
7. 主持短暂离线或刷新时全房暂停，原浏览器恢复已保存状态后再继续。只有裁剪视图的普通玩家不能提升为完整规则主机。当前不支持跨设备迁移本局主持存档；“任意设备可建房”指从该设备创建并主持新房间。
8. 刷新后重新认证并请求全量本人视图；不依靠 WebSocket 连接本身保存游戏进度。已确认动作重发仍返回原确认结果，不能重复掷骰或重复计分。
9. 校验 Origin、消息类型、JSON 大小、昵称长度、8 人容量和消息频率。只转发允许的消息；普通玩家不能发主持状态或确认。无主持、房间失效、网络中断和无效操作有中文提示。
10. 云端免费额度耗尽时，保留房主已确认的 IndexedDB 存档并给出错误，不能自动购买服务或升级方案。

浏览器本地存储默认是 best-effort，可能因用户清理、隐私会话结束或空间压力消失。持久存储授权和存档导出可作为后续增强，当前没有将它们作为已交付能力；不能承诺浏览器存储永久保留。[MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)、[MDN IndexedDB limitations](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology)

浏览器后台标签页可能被节流；手机锁屏、切走浏览器或系统回收页面时，网页主机无法保证继续计算。界面应明确“主持网页保持打开；离线则暂停”，恢复时进行网络和状态同步。[MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

浏览器主机有完整状态，操控自己浏览器的房主可以检查暗选或修改裁定。这是好友房信任模型的限制；本方案不适合作为有对抗作弊要求的公共竞技服务。

## Hibernation 实现要点

中继使用 `ctx.acceptWebSocket(server)`，在 DO 的 `webSocketMessage`、`webSocketClose` 和 `webSocketError` 方法里处理消息，不使用普通 WebSocket 的 `server.accept()` / event listeners。处理消息时从 `ctx.getWebSockets()` 获取连接集合。认证完成后把 playerId、角色和连接 ID 写入 `serializeAttachment()`；休眠唤醒时用 `deserializeAttachment()` 读取，不能假定内存 Map 仍存在。附件最大 16,384 字节，只与仍然健康的连接同寿命；重新连接凭据和房间元数据仍需持久化。[Cloudflare WebSocket best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

中继已配置 `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`；客户端若发送应用层 `ping`，由平台回复并保持休眠，DO 内没有发送心跳的 `setInterval`。自动回复适用于所有连接，故它只证明网络存活，不能被视为认证成功或房主在线。[DurableObjectState auto response](https://developers.cloudflare.com/durable-objects/api/state/#setwebsocketautoresponse)

为识别断网后仍显示 OPEN 的幽灵连接，客户端每10秒发送原始 `ping`，25秒没有 `pong` 就换代重连。DO 通过 `getWebSocketAutoResponseTimestamp()` 取得该主持连接最后回复时间，与认证时刻取较新者后计算35秒租约；持久化 alarm 到期后检查，仍健康则安排下一次，过期则撤销角色并广播暂停。该 alarm 同时处理10秒认证超时和30天房间清理，不使用普通 DO 定时器。首次认证无法安排租约检查时不授予主持角色；之后排程写失败则撤销现有主持角色并让平台重试清理，保持失败时暂停。

部署或平台重启仍可能导致 WebSocket 关闭；客户端已实现退避间隔有上限的重连和独立认证。

## 仓库当前部署配置

以下与仓库 `wrangler.jsonc` 一致。Worker、浏览器前端和 SQLite 中继已实现；此配置本身不表示已经完成 Cloudflare 账号授权或公网发布。运行 `pnpm build:browser` 生成 `dist/browser/index.html` 后再测试或发布。

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "magical-athlete",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-10-20",
  "workers_dev": true,
  "assets": {
    "directory": "./dist/browser",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "durable_objects": {
    "bindings": [{ "name": "ROOMS", "class_name": "RoomRelay" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["RoomRelay"] }],
  "observability": { "enabled": false }
}
```

项目采用受支持的 `migrations` 流，`new_sqlite_classes` 明确创建 SQLite-backed DO，符合 Free 要求。保留现行流，不额外加入另一套类声明；以后变更命名空间时再按官方迁移规则处理。[DO 声明与迁移](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)

`run_worker_first` 只匹配 API 路径，使普通 HTML、JS 和图片由静态资源路径处理；SPA 路由可回落到首页。[Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)

固定分享网址形如 `https://magical-athlete.<账号子域>.workers.dev`；不需要购买域名，Worker 名和账号子域保持不变即可持续使用同一入口。[workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

## Windows 开发与发布

Wrangler 官方支持 Windows 11 和处于 Current、Active、Maintenance 周期的 Node.js；本项目 Node 24 适合这条路线。按项目安装并锁定 Wrangler 版本，避免每次 `npx` 下载不同版本。[Wrangler installation](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

```powershell
pnpm install --frozen-lockfile
pnpm exec wrangler --version
pnpm typecheck
pnpm build:browser
pnpm exec wrangler login --scopes account:read user:read workers_scripts:write
pnpm exec wrangler whoami
pnpm exec wrangler dev
# 前端构建、类型检查、联机验收后：
pnpm exec wrangler deploy --dry-run
pnpm exec wrangler deploy
```

`login` 通过浏览器 OAuth 授权已有 Cloudflare 账号；无需把账号密码交给项目。浏览器本地回调不可达时，当前 Wrangler 文档另支持 `login --device`。部署凭据属于发布者，玩家不需要 Cloudflare 账号。[Wrangler authentication commands](https://developers.cloudflare.com/workers/wrangler/commands/general/#login)

当前配置只有 Worker、该 Worker 实现的 DO、静态资源和 `workers.dev`。上述三个 scope 是依据当前部署路径选择的最小授权集合：Worker 上传与静态资源上传会话接受 Workers Scripts Write，DO 权限跟随实现它的 Worker；不需要为了本配置授予 KV、R2、D1、域名路由或其他产品的写权限。Wrangler 会额外请求 `offline_access` 以刷新 OAuth 凭据。最终仍应以实际账号部署响应验证授权是否充足；此研究没有运行登录。[Worker 上传权限](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/)、[静态资源上传权限](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/assets/subresources/upload/methods/create/)、[DO 权限](https://developers.cloudflare.com/workers/authorization/durable-objects/)

## GitHub 更新同步

Cloudflare 可连接现有 GitHub 仓库，在指定生产分支推送变更后自动构建、部署；这样仍只分享同一个网站链接。需要发布者在 Cloudflare 授权仓库访问，玩家不需要 GitHub 权限。[Cloudflare GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)

另一条路线是 GitHub Actions 调用 Wrangler；凭据必须放仓库 secrets。首版只配置一种发布路线，避免一次提交触发两套发布。

## 最小验收清单

- 2、3、6、8 个独立浏览器上下文从建房到终局并再来一局，页面操作保持现有流程。
- 非当前操作者、伪造 playerId、普通连接发主持包、重复 actionId、过期版本、超大消息均被拒绝。
- 暗选只发给所属玩家；主持断线时玩家不能继续推进；刷新恢复后最后一个已确认动作不会丢失或重算。
- 两个主持标签页竞争同一房间时，只有有效连接可推进。平台 DO 休眠唤醒后仍能认证并准确路由。
- 首页、房间邀请、WSS 均来自同一公网 HTTPS 域；关闭本机 Node/Tailscale 后网站仍可运行。
- 账号确认维持 Workers Free；没有 Paid、R2、TURN 等额外收费资源。错误不触发自动升级。
- 由房主和朋友的实际设备/网络验证连通、刷新恢复、待机恢复；不能只凭 localhost E2E 宣称公网稳定。

