# 微缩运动会美术打磨与实机验收

日期：2026-10-21。本轮改动通过 PR 提交审阅。

## 画面与交互

- 保持全屏 3D、31 个逻辑格、12/15 两个转弯和两套特殊格规则。起点仍为第 0 格，向后扩成 8.06 × 2.65 的集结长台；八名角色以 1.65 倍原模型比例、两排四列摆放。普通小格发生八人同格时使用 .95 比例、三列排布，避免互穿。手机把整张棋盘刚性旋转 90°，不改路线。
- “自己”聚焦棋子的实际摆位，使用更低的俯角和更近的镜头；桌面增加约 16.7° 的水平斜角。“总览”按带厚底座、装饰高度的真实投影范围拟合。连续行动链结束后返回自己，手动平移和缩放会暂停跟拍，重置恢复；拖动棋子不再误开详情。
- 新增每场开赛的选手巡礼：每名角色 1.35 秒，依次近镜展示，再回到自己。可跳过、改总览或直接拖镜头；真实行动和待处理选择优先。减弱动态改为一秒静态全体展示。刷新、重连不重播，同房再来一局可以重新展示。起点两排交错 .35；手机巡礼临时从内场侧斜拍，结束平滑恢复默认角度，防止门牌挡脸。
- 木色厚底、奶油白包边和薄荷绿台面分层；地块有倒角、独立侧面、浅顶盖和 .14 的接缝。起终点横幅、领奖台、奖杯、小看台、旗帜和转弯护栏均避开编号与路线。终点门移到选手后方，避免遮脸。
- 保留全部 36 个原创、已 Meshopt 压缩的 GLB 角色；双层圆润棋座和共享磨砂塑料材质增强体积感。加分、绊倒、起身、前进、后退和位置交换只响应已确认演出事件；静止时不显示额外特效。
- 显式采用 sRGB 输出、ACES Filmic、1.1 曝光。本地程序生成摄影棚环境、柔和方向主光及冷色补光，只有一个投射阴影的灯。未增加屏幕空间 AO 或其他后期通道。

## 截图与可复现方法

全部为本地运行的真实 Edge WebGL 截图，来自隔离测试服务器的受控游戏状态。操作通过原 UI 和原规则引擎，未使用概念图替代实机。

| 检查 | 改造前 | 改造后 |
| --- | --- | --- |
| 1440×900，同状态、同镜头 | [原画面](qa/toy-before-desktop-self.png) | [重放原镜头](qa/toy-after-desktop-self-same-camera.png) |
| 1440×900，优化后的默认视角 | 同上 | [默认视角](qa/toy-after-desktop-self.png) |
| 桌面完整棋盘 | [原总览](qa/toy-before-desktop-overview.png) | [新总览](qa/toy-after-desktop-overview.png) |
| 390×844 手机布局 | [原默认](qa/toy-before-mobile-self.png) | [新默认](qa/toy-after-mobile-self.png) |
| 普通格八人同格 | [原排布](qa/toy-before-desktop-crowd.png) | [新排布](qa/toy-after-desktop-crowd.png) |

对比状态固定为温和赛道、第一场、教练第 0 格、香蕉第 2 格；同镜头图还逐项断言 camera position/target/up/zoom 与保存的原镜头一致。默认视角图用于单独展示构图变化。另保留[第一段试片](qa/toy-sample-desktop-self.png)，先检查起点、四格赛道与两名棋子，再推广整图；试片中发现并修正了顶盖被侧层遮住、门牌朝向错误。

新增需求与反馈截图：[八人长起点](qa/toy-after-desktop-eight-start.png)、[开赛巡礼](qa/toy-after-start-intro.png)、[手机巡礼](qa/toy-after-mobile-start-intro.png)、[手机长起点总览](qa/toy-after-mobile-eight-start-overview.png)、[终点八人压力画面](qa/toy-after-desktop-eight-finish.png)、[狂野赛道](qa/toy-after-wild-specials-overview.png)。终点八人为受控视觉压力状态；规则检查仍使用原引擎的正常移动与冲线。特殊格反馈均由 UI 掷骰后真实结算捕获：[加分](qa/toy-after-effect-score.png)、[绊倒](qa/toy-after-effect-trip.png)、[前进](qa/toy-after-effect-forward.png)、[后退](qa/toy-after-effect-backward.png)。

```powershell
# 原版截图：在 16f9245 基线上应用本 PR 的专用 QA 脚本和 spec
node scripts/art-qa-build.mjs
$env:ART_QA_STAGE='before'
pnpm exec playwright test tests/browser/toy-diorama.spec.ts --trace off

# 本 PR 的最终版本
node scripts/art-qa-build.mjs
$env:ART_QA_STAGE='after'
pnpm exec playwright test tests/browser/toy-diorama.spec.ts --trace off
Remove-Item Env:ART_QA_STAGE

# 专用 QA bundle 只用于截图；完成后恢复正式 bundle
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test tests/browser/three-scene.spec.ts --trace off
```

`scripts/art-qa-build.mjs` 仅向专用测试构建插入相机/渲染器观测接口。正式构建没有相机覆盖接口；专项 spec 默认跳过，设置 `ART_QA_STAGE` 才会启用。截图的状态注入只存在于测试服务器。

## 性能策略与边界

桌面阴影 2048²、手机视口 1024²，设备 DPR 上限分别为 1.5 / 1.25；低画质为 DPR 1、不投射实时阴影、Standard 材质，仍有廉价的棋子接触阴影。低档不生成或保留 PMREM 环境贴图，避免软件 WebGL 多页面重连时同步执行六面捕获及 GGX 预滤波；实测切档 environment=true→false、纹理 49→48。静止使用 demand 渲染。只有连续动画 90 帧中超过 60 帧大于 38ms，才自动降档，排除空闲间隔。重复地块复用几何体，角色复用材质与 GLB 几何，特效粒子实例化。共享资源与独有纹理有明确释放归属。

性能记录来自本机 headless Edge、Intel UHD D3D11。90 次主动 invalidate 确认发生实际 WebGL 绘制，记录帧调度间隔和 renderer.info；不把空闲按需渲染换算成持续帧率。390×844 是同一 GPU 的视口检查，不代表实体手机性能。

去除前 10 帧后统计 80 次间隔；本轮设备 DPR=1。每项完整原始记录保存在对应 `qa/toy-after-*-performance.json`。

| 视口与状态 | 画质 | Draw calls | 三角形（含阴影绘制） | 间隔中位 / P95 |
| --- | --- | ---: | ---: | ---: |
| 桌面，两人 | 高 | 194 | 47,040 | 17.4 / 27.0 ms |
| 桌面，八人同格 | 高 | 284 | 76,672 | 11.4 / 27.0 ms |
| 桌面，八人同格 | 低，关闭实时阴影 | 155 | 36,238 | 6.8 / 19.7 ms |
| 手机视口，两人 | 高 | 162 | 40,598 | 4.2 / 16.1 ms |
| 手机视口，八人同格 | 高 | 288 | 76,512 | 10.8 / 21.7 ms |
| 手机视口，八人同格 | 低，关闭实时阴影 | 151 | 35,230 | 4.4 / 13.6 ms |

这是连续八页软件渲染压力测试后的复验数据，帧调度间隔受本机负载影响较大；高档代码未变，不据此作跨次性能升降结论。Draw calls、几何量及环境/阴影开关的检查结果稳定。

专项浏览器 7 项通过，每项均断言页面脚本错误为 0：同镜头与布局、他人跟拍和手动返回、八人巡礼完整顺序与刷新不重播、终点遮挡、手机巡礼与跳过、减弱动态、特殊格真实触发。正常八人巡礼实测 10.8002 秒；减弱动态的全体静态介绍 1.0132 秒，事件序列 JSON 同样保存。浏览器验收发现的 timer 提前触发停顿已修正，并加入 1350−0.2ms 边界回归。无实体手机或公网连续性能测试结论。

手机巡礼从内场侧拍摄的小修另行补测 1 项通过。恢复正式 bundle 后，原有 3D 浏览器回归 **7/7 通过（1.1 分钟）**，覆盖权威骰面、连续骰子、双人决斗、冠军预测、交换后绊倒、传送后退及手机同时移动/设置/跳过。全量单元与集成测试 **275/275**、TypeScript、两种生产构建及 Worker 打包预演通过；正式产物检索 `__ART_QA_SCENE__` 为 **0 命中**。构建仍有现有 Three.js 大块警告，不阻塞构建。此次没有合并、部署或更改游戏规则。

额外八人联机复验：硬件 Edge 完整一场及房主/客人恢复通过（2.2 分钟）。最初 GitHub 两次检查停在客人断网刷新后的同步门控；同一版本本地 SwiftShader 实际完成了一场及双方恢复（5.1 分钟），但严格错误检查发现离线切换中首次 GLB 请求失败。两种现象不混为一个已确认原因。随后增加局部程序化棋子回退、共享的三次限额重试与联网恢复，避免失败的 GLB 缓存使整个棋盘失效；重试仅逐出失败缓存，不释放仍在使用的模型几何。

新增第 8 项美术专项已通过（11.0 秒）：主动中断首次 GLB 请求，确认[程序化占位](qa/toy-after-model-fetch-fallback.png)时棋盘、视角和游戏状态正常；放行重试后实际加载 `toy_coach`、`toy_banana` 两个 GLB 实例，[恢复原角色](qa/toy-after-model-fetch-recovered.png)，页面脚本错误为 0。没有用全局错误过滤器掩盖失败；针对当前 Fiber 将已捕获异常也上报 window error 的行为，资源失败在渲染前转为恢复状态，真正模型渲染异常仍保留错误边界。

## 参考资料的适用范围

项目保留 Three.js 0.186.1、React Three Fiber 9.8、drei 10.7，无新增运行时依赖或外部 CDN。

- [CloudAI-X threejs-skills](https://github.com/CloudAI-X/threejs-skills)：materials、lighting、geometry、performance 均针对 r186，与项目版本一致。采用 PBR 粗糙度、场景环境强度、PCFShadowMap、共享几何与资源释放策略；没有搬用旧版 RGBELoader、PCFSoftShadowMap 或 WebGPU 专用 API。
- [Web 3D Asset Pipeline](https://github.com/openai/plugins/blob/main/plugins/game-studio/skills/web-3d-asset-pipeline/SKILL.md)：现有角色已有优化 GLB，保持统一朝向、脚底原点和小体积包；此次场景程序化建模，无需新增 GLB、碰撞体或压缩工具链。
- [Game Playtest](https://github.com/openai/plugins/blob/main/plugins/game-studio/skills/game-playtest/SKILL.md)：按实际开局、操作、镜头、HUD、桌面/手机视口、截图和性能采样验证。
