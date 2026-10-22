# 嘴部贴面修复

对原版、Second Wind、Extra Mile、Leaf 共121个独立角色源进行了口部检查。88个带嘴模型的98个口部对象检查发现：多数偏斜观感来自笑口浮在椭球脸前方，三分之四视角产生视差；Lackey另有真实横向偏移。没有给无嘴、鸟喙或特殊表情的角色统一添加笑口。

修复46个角色：原版8、Second Wind11、Extra Mile18、Leaf9。完整ID、精确口部对象、面部host以及源与GLB哈希见 [逐顶点审计](evidence/refinement-20261022/mouth-surface-repair.json)。所有口部顶点沿正面射线贴合真实脸、吻部或胡须表面；保留原圆管厚度、横向形状和表情，中心线间距为0.004米，46项实测误差均小于0.00001米。Lackey按双眼中线修正横移；裁判的笑口略降低以避开巨鼻；Thief生成器移除了原人脸重复眼睛，仅保留面罩的两眼。

奶嘴、长胡须、哭口、鼻子和动物吻部的有意遮挡保留；Spiteful Spirit的波浪怒口没有替换成标准笑脸。新香蕉独立源由另一项精修负责，不在这46项修复内。

原版高模与低模、Second Wind及两新包均从实际源导出。原有五骨骼与idle、move、skill、fall、recover五动作保留。基础低模从修正后的高模重新简化，逐模型独立Blender进程导出后合并共享调色板，再重建其独立骨骼。本机候选版Blender曾在连续网格分离及一次独立进程中原生退出；导出器记录原生退出并最多重试三次，Python错误立即失败。最终实际导出与全部验收通过。没有通过放宽模型测试或把低模改为静态网格规避问题。

Philanthropist样板的左、中、右平均口面间距从0.08288/0.08613/0.08288降至0.00381/0.00487/0.00381米。圆管截面平均点与中心线定义不同，故与逐顶点中心线0.004的数值略有差异。样板前/侧/三分之四视角分别保存在 `evidence/refinement-20261022/philanthropist-mouth-{before,after}-{front,side,quarter}.png`。Extra Mile和Leaf各三视图使用真实shipping GLB重新渲染，49个透明192px头像由新正视图裁出；原版与Second Wind界面使用既有SVG肖像，没有旧3D头像需要同步。

复现：

1. Blender运行 `scripts/refine-mouth-surfaces.py`，应用清单中46项并导出；已修源可重复运行。
2. Blender运行 `scripts/audit-mouth-surfaces.py` 与 `scripts/audit-second-wind-sources.py`，更新精确源/GLB哈希和闭合体证据。
3. Blender运行 `scripts/render-refined-roster.py`，随后Pillow运行 `scripts/crop-expansion-avatars.py`。
4. `pnpm exec tsx --test tests/3d-assets.test.ts tests/expansion-models.test.ts tests/second-wind-models.test.ts tests/mouth-surfaces.test.ts`。

资产专项98项通过；其中源闭合体38/38、贴面射线46/46通过。浏览器场景验收记录由整体视觉精修文档提供。
