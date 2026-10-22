# 微缩运动场、121角色与局部骨骼验收

日期：2026-10-22。均在当前仓库和实际 Edge WebGL 页面实施，未部署。浏览器截图、Blender模型检查图分别保存，不能互相替代。

减少动态模式后续改为共享原几何和材质的静态bind-pose实例，省去SkinnedMesh与AnimationMixer；重新启用动态仍从原始GLB重建独立骨骼。7项真实模型逐顶点、包围盒、资源共享和恢复动作检查通过。低档另外移除跑道、草地及底座的凹凸/粗糙度贴图，并使用无clearcoat的金色Standard材质；保留颜色纹理、几何及高档效果。下方性能表采于这两项优化前，远端软件渲染检查结果单独见PR Checks。

## 本次改动

用户的[场景参考](evidence/refinement-20261022/user-miniature-stadium-reference.png)与[嘴部反馈](evidence/refinement-20261022/user-mouth-feedback.png)已保存在仓库。先完成跑道段、香蕉、起点门样板并与参考对照，再推广全场。最终实际网页：[香蕉与前三格](qa/refinement-20261022/toy-reference-final-reference-banana-lane-closer.png)、[完整起点门](qa/refinement-20261022/toy-reference-final-reference-banana-complete-start-gate.png)、[全场](qa/refinement-20261022/toy-reference-final-reference-stadium-overview.png)。

跑道最终采用一条连续薄荷绿圆角U形沿边，奶油顶盖厚`.045`、宽`2.025`，中心距仍为`2.05`，细缝`.025`。圆角奶油底座、薄荷腰线、浅色台面分层连接。道路使用暖奶油橡胶色、粗糙度`.76`和轻微程序凹凸。取消重复内框与反向第二编号，起终点保留棋盘地线和完整编号，门头为双排棋盘条、柔圆柱、黄金球顶和两级奶油基座。规则格数、编号顺序、特殊格、`boardPoint`与结算均未改。

草地增加深浅条纹、细噪声、凸起草坪层与颁奖台/看台两块深色岛台；高档有34组×5叶瓣的重叠圆灌木、102个稀疏草叶，使用两组实例几何，低档全部关闭这些细节。暖主光配柔阴影，底座另有一个低成本渐变接触影平面。实际核对输出为sRGB、ACES Filmic、曝光1.1；无DOF、SSAO、泛光或额外后期通道。参考图离线草地和光照仍更细腻，本实现优先保证游戏距离清晰、八人可读性及低档成本，不宣称逐像素复刻。

曾出现数字部分笔画缺损和白栏斜纹：最终印字层离面`.012`，使用不接阴影的透明Basic材质、关闭深度写入及轻微polygon offset；长白栏关闭接收阴影。实际网页已复看03、04、07、09、10、12和全场编号完整。

香蕉按参考重建为连续封闭曲面（33段×20径向）、独立茎部/后接缝、弯曲手臂、双高光眼睛、笑口、黑鞋和奶油鞋底。可编辑源`assets/blender/banana.blend`，实际运行资源`public/models/banana/`；高档4,950三角形/68,764字节、低档3,934三角形/61,712字节，均7材质绘制、5骨骼和5动作。原大包香蕉保留兼容，网页使用新独立模型。

初版新香蕉也发现左眼越出弯曲轮廓、嘴角悬空，已将整组面孔按真实香蕉皮重定位、眉毛和17个口管中心逐点射线贴面。最后Blender BVH审计17/17命中，左/中/右间距均`0.003561`，双眼后表面间距均`-0.008012`，略入皮保证接触。[独立香蕉审计](evidence/refinement-20261022/banana-face-audit.json)包含精确源及两档GLB哈希，资产测试会核对证据对应当前文件。

## 模型与动作覆盖

- 原版36：实际Blender精修源和高/低档GLB更新为5关节局部骨骼，采用各自命名的`idle / move / skill / fall / recover`。最终高档196,798三角形、2,233,404字节；低档72,714三角形、1,256,928字节。低档从嘴部修正源重新简化、逐角色独立进程重建骨骼。几何预算仍受原测试约束；下载预算调整为2.25 / 1.25 MiB。
- Second Wind36及两个形态模块：分别更新现有38份可编辑源和实际加载GLB，保留原来五个动作名。重新运行闭合体/源哈希审计，没有用旧审计文件声称新源已检查。总览`.blend`是既有陈列图，最新可编辑骨骼以各角色独立源为准。
- Extra Mile31：除隔离的Box外，每个完成角色有独立立体模型、可编辑源、五关节、五动作和本项目模型头像。[模型清单](../public/models/extra-mile/manifest.json)记录逐项形象识别点、参考和推断。
- Leaf18：实际解压并查看作者PNG Images里的18张透明棋子图，逐个创建模型，含独立的Leaf Nepo Baby。[模型清单](../public/models/leaf/manifest.json)记录参考。Box未制作可玩形象；额外Groundhogs Day未混入约定32名单。

新模型在`assets/blender/extra-mile/`、`assets/blender/leaf/`；游戏实际资源在对应`public/models/`目录。完整卡面和作者透明原图只留本地研究下载，不作为网页资源分发。角色头像是本项目真实模型渲染的192px透明PNG，非同款占位头像。

最终Extra31合计1,527,560字节/89,908三角形，Leaf18合计902,664字节/52,336三角形。49张头像全部从修正后的shipping GLB重新渲染，准确路径`public/models/{extra-mile,leaf}/avatars/{完整角色ID}.png`。原版与Second Wind沿用既有SVG肖像。

对121源检查88个带嘴模型、98个口部对象，确认46个其他角色需要修复（原版8、Second Wind11、Extra18、Leaf9），全部已贴合真实脸、吻部或胡须并重新Blender导出。包含Lackey全局原点旋转导致的横向偏移、Blunderdog/Le Saboteur/Overtaker吻部、裁判巨鼻遮嘴、Thespian胡须贴面、Thief重复四眼。保留Spiteful Spirit怒口、哭口、奶嘴和有意长胡须遮挡。完整名单/原因、精确逐顶点审计及固定同镜头正侧斜视前后图见[46项嘴部修复报告](mouth-surface-repair-2026-10-22.md)。这46项加新香蕉均已修正，没有为无嘴/鸟喙角色统一添加笑脸。

统一柔塑料身体、奶油粗糙部分、较光亮黑眼睛/鞋和金属道具材质应用于全部121可选角色；具体几何按体型选择性优化，不声称121套均逐件手作重雕。Heads眼杆/腿、Doctor Dice腿部连接、Triangle Man前向/轴向也在实际三视图中修正。

动作按双足、四足、长条、漂浮、轮式分组，节奏/幅度由稳定角色ID确定；局部头部、身体、步态及尾部/次级部件响应。不是121套手工独立动作库：五个基础动作按体型和角色参数复用，掷骰/得分等使用准备动作和已有事件特效。移动世界坐标始终由游戏状态/已确认路径控制，骨骼不带root motion。`SkeletonUtils.clone`确保多人同角色不共享骨骼姿态。开始/停止采用短淡入淡出；摔倒的唯一整体倾角仍由`pawn-fall.ts`控制，新增局部动作不会叠加第二圈旋转。降低动态时冻结骨骼并直接显示已确认姿态；空闲保留按需绘制。

模型来自单视图卡图的玩具化解释，未见侧背形态、部分接缝和骨骼为项目设计，不宣称作者认可的精确雕塑。Blender正侧背实际检查发现Heads的腿/眼杆、Doctor Dice腿部连接不足后已修复重导。

## 实际网页证据

| 视角 | 本次改前 | 本次改后 |
|---|---|---|
| 桌面自己1440×900 | [前](qa/refinement-20261022/toy-before-desktop-self.png) | [后](qa/refinement-20261022/toy-after-desktop-self.png) |
| 桌面总览 | [前](qa/refinement-20261022/toy-before-desktop-overview.png) | [后](qa/refinement-20261022/toy-after-desktop-overview.png) |
| 手机视口自己390×844 | [前](qa/refinement-20261022/toy-before-mobile-self.png) | [后](qa/refinement-20261022/toy-after-mobile-self.png) |
| 手机视口总览 | [前](qa/refinement-20261022/toy-before-mobile-overview.png) | [后](qa/refinement-20261022/toy-after-mobile-overview.png) |

[香蕉品质样板](qa/refinement-20261022/toy-after-desktop-banana-quality-sample.png)、[Extra不同体型同场](qa/refinement-20261022/toy-after-new-pack-0-self.png)、[Leaf不同体型同场](qa/refinement-20261022/toy-after-new-pack-1-self.png)、[跨包修嘴网页样板](qa/refinement-20261022/toy-after-new-pack-2-self.png)、[八人高档](qa/refinement-20261022/toy-after-desktop-crowd.png)/[低档](qa/refinement-20261022/toy-after-desktop-crowd-low.png)。[最终短录屏](qa/refinement-20261022/actual-model-movement-skills-fall.webm)包含三组八人模型、真实UI掷骰、移动、箭头技能及一次摔倒；使用可控场景种子，事件来自原规则引擎。总览截图等待镜头缓动稳定后捕获。自己视角另存[桌面固定改前相机](qa/refinement-20261022/toy-after-desktop-self-same-camera.png)和[手机固定改前相机](qa/refinement-20261022/toy-after-mobile-self-same-camera.png)。

固定同镜头嘴部对照：[斜视改前](evidence/refinement-20261022/philanthropist-mouth-before-quarter.png)/[改后](evidence/refinement-20261022/philanthropist-mouth-after-quarter.png)、[侧视改前](evidence/refinement-20261022/philanthropist-mouth-before-side.png)/[改后](evidence/refinement-20261022/philanthropist-mouth-after-side.png)。Blender图用于几何检查，网页图用于实际游戏距离验收，两者不替代。

真实Blender检查图：[Extra正面](evidence/refinement-20261022/extra-mile-front.png)、[侧面](evidence/refinement-20261022/extra-mile-side.png)、[背面](evidence/refinement-20261022/extra-mile-back.png)；[Leaf正面](evidence/refinement-20261022/leaf-front.png)、[侧面](evidence/refinement-20261022/leaf-side.png)、[背面](evidence/refinement-20261022/leaf-back.png)。

## 验证与性能

最终美术资产、独立香蕉、嘴部、相机、摔倒和材质专项合计 **123/123通过**，TypeScript检查通过。包括49新增模型、基础两画质各36骨骼的真实Three.js/Meshopt解码、源、体积/几何预算、脚底、五动作变化、两个实例不共姿态、无root motion、46项嘴部精确源/GLB哈希和独立香蕉17点审计；Second Wind源闭合体38/38通过。最终浏览器完整两项 **2/2通过（1.3分钟）**，参考样板额外 **1/1通过**，覆盖四视角、高低档八人、三组八体型、真实行动与录像，页面脚本错误0。

最终采样在其他八客户端浏览器全部退出后进行。本机Intel UHD / D3D11，Edge155，DPR1。每项90次主动invalidate，去除前10次，统计80次真实绘制调度间隔。记录在`qa/refinement-20261022/toy-after-*-performance.json`。这不是把空闲按需渲染算作持续帧率；390×844是同一GPU手机布局检查，不代表实体手机性能，不作跨设备速度推断。

| 实测状态 | 绘制调用 | 三角形（含阴影） | 间隔中位/P95 ms |
|---|---:|---:|---:|
| 桌面2人高档 |176|86,602|9.1/11.0|
| 桌面8人高档 |267|152,872|10.1/11.8|
| 桌面8人低档 |152|43,250|4.6/5.4|
| 手机视口8人高档 |279|155,910|4.2/9.5|
| 手机视口8人低档 |156|43,968|4.2/4.5|
| Extra8种体型高档 |346|142,210|9.2/11.0|
| Leaf8种体型高档 |342|145,310|9.5/11.7|
| 跨包修嘴8角色高档 |360|160,422|9.6/11.7|

保留手机1024²/桌面2048²阴影、DPR上限1.25/1.5；低档关闭实时阴影、PMREM和细小植被，基础角色独立简化网格，仍有接触影。新增模型按角色加载，单角色小于100KB、8,000三角形、9次材质绘制。场景性能和30房间通信压力分别验收，不互相推断。

## 复现

实际使用本机Blender5.2.3候选版`fab76e95306d`，后台`--threads 1 --python-exit-code 1`。未安装社区MCP或修改系统插件。采用社区[建模规范](https://github.com/RobLe3/cc-blender-skill/blob/main/plugin/skills/blender-modeling/SKILL.md)中可兼容的命名、连接重叠、平滑法线和真实导出验收；[插件说明](https://github.com/RobLe3/cc-blender-skill/blob/main/plugin/README.md)的MCP专属操作未照搬。

新增模型用`generate-extra-mile-models.py -- --only=cletus`、`generate-leaf-models.py -- --only=catfish`，每个ID独立进程；`assemble-expansion-models.mjs`生成清单。最终独立香蕉用`refine-banana-reference.py`生成、`audit-banana-reference.py`审计；46项口部用`refine-mouth-surfaces.py`和`audit-mouth-surfaces.py`，见口部报告。重新生成模型后应重跑口部修复和头像渲染，避免旧生成形态覆盖最终修整。局部动作在`refine-racer-motion.py`，基础高档`--rig-base`、Second Wind`--rig-second`，低档导出简化几何后`--rig-economy`。

`render-refined-roster.py`从shipping GLB生成三视图，`crop-expansion-avatars.py`裁透明头像。设置`ART_QA_OUTDIR=.local/reference-qa-dist`运行`node scripts/art-qa-build.mjs`，再设置`REFINEMENT_STATIC_DIR=.local/reference-qa-dist`、`REFINEMENT_QA_STAGE=after`运行浏览器专项前两项；参考取景另设`REFINEMENT_REFERENCE=true`与`REFINEMENT_QA_STAGE=reference-final`。该隔离目录不覆盖生产包，服务只在测试期监听本地临时端口，已退出。正式生产包不得含`__ART_QA_SCENE__`，正式构建与主验收另行记录。候选Blender曾在反复修改大型依赖图时退出，分进程及临时文件原子替换后导出成功，没有以静态网格绕过骨骼验收。
