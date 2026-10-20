# 用自己的电脑免费开一场运动会

朋友只需打开同一个固定HTTPS网站，输入昵称和房间号。朋友无需安装Tailscale、注册账号或访问GitHub。只有房主电脑需要首次安装并登录Tailscale，游戏时保持电脑、游戏服务和网络运行。

本方案是你选择的零费用本机主机：Node.js运行整个网站和Socket.IO，SQLite保存在项目的`data`目录，Tailscale Funnel把固定的`https://设备名.尾网名.ts.net`入口代理到本机`127.0.0.1:3000`。没有浏览器P2P、信令服务、TURN、随机隧道地址或付费云服务器。

## 首次设置（只做一次）

1. 安装Node.js 24+。本机Codex附带的Node运行时可作为启动脚本后备；换电脑时应安装标准Node.js。运行`pnpm install --frozen-lockfile`、`pnpm build`准备生产文件。
2. 从[Tailscale官方Windows下载页](https://tailscale.com/download/windows)安装Tailscale，或使用本机已下载并由此前步骤核验签名的`.local/tailscale-setup-1.104.1-amd64.msi`。安装、驱动权限、账号登录由你亲自完成，启动器不会自动安装或登录。
3. 在Tailscale桌面应用登录自己的账号，连接当前电脑。使用符合当前免费Personal套餐条件的账号；同学不加入你的tailnet。免费资格及限额以[官方套餐](https://tailscale.com/pricing)为准，不会自动创建付费资源。
4. 双击`启动游戏.cmd`。首次Funnel若提示启用HTTPS证书或Funnel权限，打开CLI给出的Tailscale官方授权网址，由你亲自确认。脚本最多等待15秒便返回，不会无限卡住，也不会自动批准网络权限。完成后再次双击启动。
5. 成功后窗口显示实际固定HTTPS网址。先用手机移动网络打开，检查能否建房，再把该网址发给同学。新域名、DNS与证书可能需要几分钟生效；尚未外网验证时不能把“配置成功”当作“所有网络可用”。

可先运行只读检查，不启动网站或Funnel：

```powershell
node scripts/host.mjs --check
```

检查输出安装、登录、生产构建、本地健康与Funnel配置状态，不打印账号密钥或玩家凭据。没有安装或登录时，页面代码仍已完成，但此时还没有可交付的正式外网网址。

## 每次游玩

双击`启动游戏.cmd`，等窗口显示网址。打开这个网站创建房间，把房间号发给同学；他们点击“加入朋友”输入房间号即可。也可在大厅直接复制专属房间邀请链接。

关闭命令窗口不会关闭后台游戏服务。游玩时让电脑保持唤醒、Tailscale在线；网页房主关闭页面时，管理权会自动转交在线玩家。运行服务的电脑关机后整个网站不可用。再次开机后双击启动，原浏览器的身份和SQLite中已确认的对局可恢复。

固定域名来自该设备的`Self.DNSName`，只去除DNS尾点，不使用临时生成的地址。在相同账号、tailnet与设备名称保持不变时可复用这个入口；改设备名、重新注册设备或更换tailnet可能改变网址，请以启动器当次显示为准。

## 停止、备份与更新

结束后双击`停止游戏.cmd`。它先检查当前Funnel根路径确实仍指向本游戏的`127.0.0.1:3000`，仅关闭这一条路径，再停止启动记录中的本项目Node进程。不会执行`funnel reset`、`tailscale down`，也不会终止所有Node进程。

启动记录保存在被Git忽略的`.local/host.json`；停止前同时核对PID、进程创建时间、Node可执行文件与绝对项目入口，避免PID被其他程序复用后误杀。服务日志保存在`.local/game-server.log`，SQLite保存在`data/`；都不提交仓库。若Funnel配置已被其他程序改动，停止器保留配置并提示人工检查，不会清空其他服务。

备份前先停止游戏，复制整个`data`目录。更新源码后重新安装锁定依赖并构建，再启动；恢复时先停止并还原整个`data`目录。不要清理朋友原浏览器的站点数据，否则会丢失该浏览器的重连凭据。

## 常见提示

- “未安装/尚未登录Tailscale”：按首次设置完成；脚本不会擅自安装、登录或改tailnet权限。
- “3000端口已有其他进程”：先确认旧服务；脚本不会把已有开发服务冒充本次生产主机，也不会终止未知进程。
- “443已有其他服务/路径”：为避免覆盖或把其他服务一并公开，启动器拒绝更改。请在Tailscale中检查既有规则，由你确认后仅处理冲突项。
- “Funnel尚未确认启用”：本机游戏可能已在后台运行，按窗口的官方URL授权后再次启动，或运行停止脚本关闭本机游戏。
- “启动记录不匹配”：不要随意填写PID。保留`.local/host.json`并检查任务管理器与项目路径。

需要人工查看当前配置时：

```powershell
tailscale status --json
tailscale funnel status --json
```

只有确认当前443的`/`代理确实为本游戏时，才手动关闭这条精确路径：

```powershell
tailscale funnel --bg --https=443 --set-path=/ http://127.0.0.1:3000 off
```

不要用`reset`代替上述命令，它会清除整套Serve/Funnel配置。

## 实际核验边界与官方依据

2026-10-21实际阅读[Tailscale Funnel功能说明](https://tailscale.com/docs/features/tailscale-funnel)、[现行CLI](https://tailscale.com/docs/reference/tailscale-cli/funnel)及[官方ServeConfig结构](https://github.com/tailscale/tailscale/blob/main/ipn/serve.go)。启动器使用`status --json`读取设备域名，使用`funnel status --json`交叉检查`Web`、`TCP`、`Foreground`与`AllowFunnel`，显式限定根路径与443端口。

Funnel当前为beta，有不可配置的带宽限制，无商业SLA。Funnel配置的`--bg`可跨设备/Tailscale重启保留，但本机游戏Node进程仍需要在开机后启动。中国大陆校园网、运营商网络与正式域名的HTTPS/WSS多人联机效果，需要实际登录并启用后测试；本机缺少登录授权时不声称已经上线或实测通过。
