# 测试与验收记录

更新：2026-10-21。此处区分实际执行结果、测试覆盖范围与尚未完成的公网验收。浏览器房主是主路线，Node/SQLite与Tailscale为备用；两种模式共用同一规则引擎。

## 已完成的本地自动化

基础100项和13项Worker中继处理器测试均独立通过后，又用最终完整命令统一执行，结果为**113项通过、0失败**：

| 类别 | 数量 | 实际覆盖 |
| --- | ---: | --- |
| 角色与组合行为 | 75 | 36角色、优先级与同时移动组合、Copycat能力快照、可选技能跳过、Wild箭头与Huge Baby真循环等回归 |
| 完整对局与确定性 | 9 | 2–8人四场终局、选秀和角色消耗、固定种子重放、序列化恢复 |
| Node网络与持久化 | 3 | 独立身份与重复昵称、人数和操作权限、暗选隔离、版本和幂等、SQLite恢复后继续操作 |
| 本机启动器 | 4 | 安全识别本项目进程与Funnel配置、保留其他服务、启动和停止边界 |
| BrowserAuthority | 9 | IndexedDB原子状态与收据、事务完成后确认、并发重复/冲突请求、失败回滚、重载保持随机和技能队列、只在大厅增员、超时和持续结算、私有快照隔离 |
| Worker中继处理器 | 13 | 身份验证、房主权限、入房限制、动作转发、定向快照、断线与存储错误等处理器边界 |
| 合计 | **113** | 最终统一执行全部通过 |

`tests/relay.test.ts`执行真实Worker处理器，替换Cloudflare平台存储与socket适配，不等同于Cloudflare公网端到端测试。当前`pnpm test`会自动收集所有`tests/*.test.ts`和启动器测试。

类型检查已通过，涵盖浏览器、Node和独立Worker配置。Node生产构建、浏览器房主生产构建已通过。Wrangler部署打包预演已通过，Worker包约**27.38 KiB**；此结果只证明本地可打包，不代表已上传、已上线或已通过Cloudflare生产运行验证。

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

## 尚未完成

- Cloudflare账号登录、首次正式部署、真实`workers.dev`固定HTTPS入口与WSS多人实测。
- Cloudflare Workers Builds对私有GitHub仓库与生产分支的授权；尚不能实现推送后自动更新线上网站。
- 公网环境下不同设备、真实手机浏览器、校园网和运营商网络联机；本地独立Context不等同于独立物理设备。
- 免费账户的实际权限、配额提示与额度边界；未创建付费托管资源或启用自动付费升级。
- Tailscale备用Funnel入口尚未公开，未进行该入口的外网多人验收。

计算房主主动关闭、设备休眠或移动浏览器被系统暂停时，对局等待原浏览器恢复；不承诺后台常驻或客人接管。IndexedDB事务测试使用`fake-indexeddb`验证原子性，真实Edge网页验收验证实际存档与返回恢复；两者均不代表断电等硬件故障下已经完成所有存储耐久性验证。

规则来源与研究边界分别见[规则说明](rules.md)、[角色核验](characters.md)、[网页房规](house-rules.md)和[研究缺口](research-gaps.md)。这些测试验证明确的行为预期，不把尚未读取的英文新版PDF正文或未经测试的网络环境写成已核验事实。
