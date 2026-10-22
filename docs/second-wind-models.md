# Second Wind 角色模型与来源

本轮在本机 Blender **5.2.3 LTS Release Candidate / fab76e95306d** 实际建模、保存 `.blend`、导出 `.glb` 并用 Three.js/Meshopt 解码检查。36 名角色使用各自的立体构造；没有把插画贴到平面或把旧角色换色充数。它们是统一现有玩具风格的项目模型，不能称为发行商官方模型或逐像素复刻。

## 资源与接入

- [模型清单](../public/models/second-wind/manifest.json)列出 36 个稳定 ID、逐角色 GLB/头像地址、边界、绘制次数、三角形数、来源图片、已核对的识别特征和推断部分。
- [总览源文件](../assets/blender/second-wind.blend)打开即可查看正面排布；其中保留 38 个游戏模型和 36 个展示实例。
- 每个角色的完整构造源为 `assets/blender/second-wind/{id}.blend`。`EDIT-{id}` 下的 `GEO-{id}-*` 保留独立网格和倒角修改器，默认隐藏；取消隐藏并隔离该父节点可编辑，`toy_{id}` 是按材质合并后的游戏网格。总览只保留游戏网格，避免候选版在一次依赖图中保留数千个编辑对象时崩溃。
- 游戏模型分别请求 `/models/second-wind/{id}.glb`，根节点 `toy_{id}`；统一 **+Y 向上、+Z 正面、地面原点、米制**，宽/深均不超过 0.6，高不超过 0.98。保留旧 36 个模型与其加载流程。
- 游戏头像改为与旧角色一致的二维卡通 SVG，由 `second-wind-portraits-a/b/c.tsx` 分别绘制并经 `Avatar` 统一显示在圆框中；`/avatars/second-wind/{id}.svg` 为同源导出的矢量文件。`/models/second-wind/avatars/{id}.png` 保留为模型预览，192×192，不再作为界面头像。商业角色原图只用于本地核对，没有随发布资源再分发原卡面。

36 名角色加 2 个模块共 **1,572,948 字节 GLB**、**127,026 三角形**；最大单角色 **5,168 三角形**，最多 **9 次材质绘制**。15 种共享的无纹理 Principled BSDF 玩具材质，所有资源自包含；单角色约 17–61 KB，只有参赛时才需要加载完整模型。移动端可沿用现有关闭投影、降低特效和减少动态效果的设置。

### 变身与坐骑

`bite-mark-were.glb` / `toy_bite-mark-were` 是独立 W.E.R.E.M.O.U.T.H. 形态。现有图片只提供原形，变身体积采用相同橄榄绿肤色与紫色鬃毛、扩大齿口及爪子的项目设计，清单明确记录为推断。

`hog-knight.glb` 仅骑士；`hog-knight-hog.glb` / `toy_hog-knight-hog` 是独立绿野猪。由服务端骑乘状态决定谁显示坐骑，不能把猪永久绑定骑士身份。组合时以野猪地面原点为基准，骑乘选手抬高并缩放，具体落座由游戏镜头核对。转移坐骑只改变可视组合，不改变选手/玩家 ID。

### 动画与规则边界

每个 GLB 实际包含 `idle`、`move`、`skill`、`fall`、`recover` 五个动画片段，使用可编辑 NLA 动作。它们是父级轻微呼吸、跑动弹跳、技能蓄力、倾倒与恢复动作，**不是关节骨骼动画**。服务端事件决定何时移动、变身、骑乘、倒地或恢复；动画不生成移动点数、不判定命中、不结束等待选择。

现有 `pawn-fall.ts` 已处理实际棋盘上的倾倒支撑，使用它时不应同时播放 GLB `fall/recover`，以免重复旋转。降低动态效果时直接显示服务端最终姿态。`fall/recover` 文件片段仍提供给模型预览与其他播放器，并按模型真实边界补偿落地高度。

## 来源与建模判断

已逐张检查[玩家图鉴的 Second Wind 插画](https://johnnlds.github.io/Magical-Athlete-Racers/?v=13)，只选 `expansionAthletes` 中的 36 名，排除 Extra Mile。参考图是转载角色插画，不能据此认定文字或站主 Interactions 为官方规则。模型只使用外形信息，规则来源与裁定状态由 [Second Wind 规则资料](./second-wind-rules.md)单独记录。

已阅读用户指定的 [Blender skill 包说明](https://github.com/RobLe3/cc-blender-skill/blob/main/plugin/README.md)、[建模](https://github.com/RobLe3/cc-blender-skill/blob/main/plugin/skills/blender-modeling/SKILL.md)、[材质](https://github.com/RobLe3/cc-blender-skill/blob/main/plugin/skills/blender-materials/SKILL.md)、[动画](https://github.com/RobLe3/cc-blender-skill/blob/main/plugin/skills/blender-animation/SKILL.md)、[导出](https://github.com/RobLe3/cc-blender-skill/blob/main/plugin/skills/blender-export/SKILL.md)和后端映射。当前会话没有暴露 Blender MCP 工具，沿用本项目已授权的后台 Blender Python 入口，没有修改系统插件配置。

只有单幅正面/四分之三视图可用。未展示的背面、侧面、衣褶、身体连接和配件厚度均按玩具风格补全；清单逐项记录。Null 的图片是黑色纹理和两只眼睛，没有完整外轮廓，因此它的闭合圆润暗色体积属于明确的项目推断。

| 稳定 ID | 保留的造型特征 |
|---|---|
| bite-mark | 橄榄绿尖耳、紫色长鬃毛、白色镶边上衣、弯曲爪手 |
| blunderdog | 黄色蒙面犬、红蓝超人装、蓝星、举拳与披风 |
| cheatah | 橙色猎豹口鼻、绿黑斑点毛衣、手中骰子、卷尾 |
| critic | 蓝色龟头、紫色完整龟壳、绿外套、托腮手和杯子 |
| diva | 宽橄榄绿身体、粉色羽毛围巾、墨镜、红唇、手镜 |
| doppelgangster | 两个橙色长鼻黑帮、紫色条纹西装和帽子、红领带与胸花 |
| gloth | 黑发黑袍、苍白脸、紫色鼻子与尖领、长爪 |
| hog-knight | 灰色盔甲、粉色面罩、长枪、护肩；独立绿野猪 |
| hopfrog | 红色宽脸青蛙、双高眼座、长弹性四肢 |
| hotel | 红色坡屋顶、烟囱、白色大笑、前侧背窗户 |
| icarus | 黄色飞行员、粉色外套头盔、绿色长翼与支撑杆 |
| kingtripper | 绿色长嘴王者、红黄铃铛冠、紫披风和权杖 |
| kraken | 粉色头部、八条有厚度的卷触手、紫色吸盘 |
| le-saboteur | 绿色鳄鱼、黑白条纹上衣、黑贝雷帽、黄手套 |
| magical-athlete | 橙色脸、蓝色星纹巫师袍/高帽、紫法杖 |
| mole | 橙色圆身体、粉红鼻爪、长胡须、双门牙与背上土块 |
| mr-dice-guy | 橄榄脸、蓝西装、红蝴蝶结、紫色骰子高帽、彩色骰子 |
| mush | 不对称蓝色多脸团块、独立面部、后脑团块 |
| nemesis | 浅色古典雕像、卷发、长袍褶皱与直剑 |
| nepo-baby | 粉色圆脸、橙奶嘴、蓝高帽和正式西装、银拨浪鼓 |
| null | 暗色实体、两只极小白眼，无臆造的人形四肢 |
| overtaker | 蓝色口鼻、米色包头帽、棕大衣、铲子和骷髅杆 |
| party-pooper | 黄色不悦猫、粉绿睡衣睡帽、蓝鼻子、蜡烛 |
| penguin | 紫色企鹅、橙嘴脚、白纽扣胸、举起的长鳍、小帽 |
| re-runner | 灰卷发、紫发带、粉色黄条运动服、跑步手臂 |
| show-off | 紫色大象、卷鼻、大耳、粉绿滑轮鞋和帽、蓝黄高椅 |
| soulmate | 黄色爱慕表情、大型红心瞳孔、粉鼻子、伸舌和卷尾 |
| speed-demon | 橄榄绿角、蓝夹克、橙色飘发、红摩托车与完整车轮 |
| spoilsport | 粉色哭泣猪、大鼻孔、蓝色实体眼泪和卷尾 |
| stepdad | 紫色海象、棕胡须、白獠牙、红背带、蝴蝶结、举起的橙手指 |
| streaker | 米黄色细长尖头身体、长鼻长臂、小脚、向后的尾巴 |
| stunner | 五瓣立体橙甜椒、棕梗、红唇、粉脚、弯曲手臂 |
| switcharoo | 黄色袋鼠、粉圆眼镜、长耳脚尾、米色育儿袋 |
| tail | 独立绿色弯尾、橄榄绿三角背刺、顶部眼睛、小脚 |
| the-hose | 三圈有厚度绿软管、眼睛、黄铜喷嘴与喷水孔 |
| understudy | 紫色长鼻演员、黄文艺复兴服、白皱领、绿羽帽、剧本 |

## 检查与复现

`tests/second-wind-models.test.ts` 使用游戏同款 Three.js/Meshopt 解码 38 份 GLB，检查完整 ID、独立模块、真实边界/地面原点、完整厚度、材质/贴图、文件大小、面数、五个实际动画和 36 个本地 PNG。它不是仅根据清单自报成功。

[源文件审计](./evidence/second-wind/source-audit.json)实际逐一打开 38 份 Blender 源文件，核对命名可编辑零件、NLA 动作和导出网格闭合性；所有游戏网格开放边、游离边均为 0。审计包含源文件与 GLB 的 SHA-256，测试检查其对应的确实是当前交付资源。曲线转网格的端盖顶点在导出前焊接，避免只有坐标重合、拓扑仍断开的假封口。

2026-10-22 模型检查 **42/42 通过**，详见[测试输出](./evidence/second-wind/model-tests.txt)。本轮只修正交换袋鼠偏移的口鼻，新增对称鼻孔及曲面微笑线，其他37份GLB的哈希未变；修正后的[脸部近景](./evidence/second-wind/switcharoo-after-face.png)、[实际游戏](./evidence/second-wind/switcharoo-game-desktop.png)及[手机](./evidence/second-wind/switcharoo-game-mobile.png)另存。总览源与该角色源已同步。此前36个模型的三视图用于整体构造检查，其中交换袋鼠仍是修正前版本，应以新的单角色图和GLB为准；旧PNG模型缩略图不用于游戏头像。游戏中的二维卡通 SVG 另行逐角色绘制，已在[新旧头像对照图](./qa/second-wind/cartoon-avatar-contact-sheet.png)检查大厅及手机小尺寸，并通过 `tests/avatars.test.ts` 检查 72 个 ID 和同源导出资源。

模型三视图使用导出游戏网格渲染：[正面](./evidence/second-wind/all-36-front.png)、[侧面](./evidence/second-wind/all-36-side.png)、[背面](./evidence/second-wind/all-36-back.png)。这些是模型检查图；网页联机、手机视口、动画绑定和技能特效的验收属于整体游戏验收，不能用离线渲染代替。

```powershell
node scripts/generate-second-wind-models.mjs
& 'C:\blender-5.2.3-candidate+v52.fab76e95306d-windows.amd64-release\blender.exe' --background --threads 1 --python scripts/render-second-wind-models.py
& 'C:\Users\qiuti\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/generate-second-wind-avatars.py
pnpm build:avatars
& 'C:\blender-5.2.3-candidate+v52.fab76e95306d-windows.amd64-release\blender.exe' --background --threads 1 --python scripts/audit-second-wind-sources.py
node node_modules/tsx/dist/cli.mjs --test tests/second-wind-models.test.ts
```

可用 `BLENDER_EXE` 环境变量指定其他 Blender 安装。没有物理手机 GPU 性能实测；不把模型数量齐全等同于“完整支持 72 个角色”。
