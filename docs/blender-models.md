# Blender 角色精修与验收

本轮实际运行本机 **Blender 5.2.3 LTS Release Candidate**（构建 `fab76e95306d`，2026-10-21），通过后台 Python 建模、保存源文件、导出和渲染；没有调用图片生成、第三方模型或把二维头像贴到模型上。当前工具没有暴露 Blender MCP 连接，因此使用用户授权的后台脚本入口。

可编辑源为 [toy-racers.blend](../assets/blender/toy-racers.blend)。每个 `EDIT-${id}` 保留独立 `GEO-*` 命名网格、五官、配件和倒角修改器；源对象默认隐藏，取消隐藏即可编辑。`toy_${id}` 是按材质合并的游戏导出件。游戏实际加载 [toy-racers.glb](../public/models/toy-racers.glb)，版本参数 `?v=blender-refined-20261021` 避免旧缓存，失败时仍使用既有网络恢复流程。

## 方法与质量标准

已阅读 [blender-modeling](https://github.com/RobLe3/cc-blender-skill/blob/main/plugin/skills/blender-modeling/SKILL.md)、[blender-materials](https://github.com/RobLe3/cc-blender-skill/blob/main/plugin/skills/blender-materials/SKILL.md)、[blender-animation](https://github.com/RobLe3/cc-blender-skill/blob/main/plugin/skills/blender-animation/SKILL.md)、[blender-export](https://github.com/RobLe3/cc-blender-skill/blob/main/plugin/skills/blender-export/SKILL.md) 及 [Blender Agent Skills 的 Codex/后台接入说明](https://github.com/EL4CTEO/blender-skills)。针对当前 5.2 版本显式建立 Principled BSDF/Output 节点，使用原生 Meshopt 导出。没有修改系统插件或 MCP 配置。

先精修兔子和粘液怪，实际渲染并检查正、侧、背三视图。第一轮发现兔子脚部视觉悬空及鼻子被口鼻覆盖，补脚踝、调整鼻尖后再次渲染。确认圆润五官、耳朵与尾巴在侧背都具有体积，粘液怪由独立球体融合为连续的不对称曲面，再将标准推广至全部角色。

共同标准：保留已有颜色与不同轮廓；主要曲面提高到 24×16 分段，细节用较低分段；硬边倒角；眼睛具有实际厚度和高光体积；在背侧增加各角色自己的配件或纹路；逐角色核对躯干与鞋子的位置并补短腿，避免连到外套顶部或手持配件；最终按求值后的网格重新对齐地面原点。飞艇的束带移到左侧，避免从正面遮住眼睛。

## 全部 36 名选手覆盖

每项均包含曲面、边缘、实体眼睛以及适用的脚部连接更新。精确面数和每项细节也记录在 [manifest](../public/models/toy-racers.manifest.json)。

| ID | 本轮新增的独特立体细节 |
|---|---|
| alchemist | 瓶口包边、背面瓶体接缝 |
| baba-yaga | 后窗十字框、屋脊包边 |
| banana | 香蕉皮背脊弧线 |
| blimp | 背面气囊分瓣、避开眼睛的束带 |
| centaur | 后脑鬃毛、马背鞍线 |
| cheerleader | 后脑马尾、裙摆包边 |
| coach | 帽面接缝、运动外套后背线 |
| copycat | 两个不同颜色的卷尾巴 |
| dicemonger | 背面实体骰点、圆角方体 |
| duelist | 外套后摆、头盔后缘 |
| egg | 蛋壳背面的连续裂纹 |
| flip-flop | 鞋底背部边线 |
| genius | 大脑背部沟回 |
| gunk | 体素融合、平滑连续躯体、背侧气泡 |
| hare | 口鼻、鼻尖、耳内层、肚皮、手臂、脚踝、脚趾、尾巴 |
| heckler | 杯体背部包边 |
| huge-baby | 尿布背侧包边 |
| hypnotist | 袍子背部褶线 |
| inchworm | 背面分节花纹 |
| lackey | 围裙背后绑带 |
| leaptoad | 背侧实体斑点 |
| legs | 双膝护垫和连接 |
| lovable-loser | 后背补丁缝线 |
| magician | 披肩领、帽子背面色带 |
| mastermind | 王座背部卷纹 |
| mouth | 嘴唇背部轮廓线 |
| party-animal | 后背彩色装饰 |
| rocket-scientist | 火箭后部检修板线、火焰地面原点修正 |
| romantic | 心形背部浮雕线 |
| scoocher | 座位背部包边 |
| sisyphus | 石头背面纹理浮雕 |
| skipper | 水手服背部衣领 |
| stickler | 尺子背面色边 |
| suckerfish | 背鳍立体鳍条 |
| third-wheel | 后轮毂 |
| twin | 两个身体背后的连接带 |

## 动作与运行预算

沿用现有游戏的父级待机、移动、技能、交换、传送和淘汰呈现，不引入新的骨骼播放器或把模型动画当作规则。摔倒使用 `pawn-fall.ts` 的一次 90° 倾倒：短失衡、倾倒、轻微落地反馈。底座支撑高度随角度变化，倒地持续时间取决于服务端 `tripped` 状态；只有规则的 `recover` 才起身，起身后旋转归零。降低动态效果时直接使用稳定倒地姿态。

整包 **1,636,676 字节（约 1.56 MiB）**，**192,306 三角形**；最大单角色兔子 **9,308 三角形**。最多 8 个角色同时呈现，角色部分最坏小于 80,000 三角形。全套复用 **10 种无纹理 PBR 材质**，单角色最多 8 次材质绘制，Meshopt 解码器随现有 Three.js 提供。手机低画质继续关闭角色投影、降低底座分段，几何和材质实例共享。

## 验证与证据

- 真正 Blender 渲染：[两代表角色正侧背](./evidence/blender/representatives-front-side-back.png)、[全部 36 角色正面](./evidence/blender/all-36-front.png)。这些是模型检查图；实际游戏截图由本轮整体 UI 验收另外保存，不混作游戏截图。
- `tests/3d-assets.test.ts` 实际使用 Three.js/Meshopt 解码当前 GLB，检查 36 个角色 ID、真实边界、地面原点、材质复用、无外部资源、文件大小和面数预算。
- `tests/pawn-fall.test.ts` 采样 101 个倾倒时刻，检查无连续旋转、落地支撑、倒地保持、起身终点和降低动态效果。
- 当前候选版在批量编辑/求交时曾多线程退出，最终使用 `--threads 1` 成功完成。此设置仅影响离线建模，不影响浏览器运行。

复现构建：

```powershell
node scripts/generate-3d-assets.mjs --blender-source
& 'C:\blender-5.2.3-candidate+v52.fab76e95306d-windows.amd64-release\blender.exe' --background --threads 1 --python scripts/refine-blender-models.py
node node_modules/tsx/dist/cli.mjs --test tests/3d-assets.test.ts tests/pawn-fall.test.ts
```

本轮没有物理手机 GPU 的实机测试；手机视口、浏览器加载、图形错误及画面检查以集成浏览器验收为准。模型使用现有整体动作，并非新增每个关节的骨骼动画。
