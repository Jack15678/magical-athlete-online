# 资产与许可

所有网站实际使用的角色 SVG、图形装饰、骰子图形、图标与 CSS 均为本项目新绘制，源文件位于 `src/client/avatars.tsx`、`src/client/second-wind-portraits-a/b/c.tsx` 与样式文件。原作与续作共72个头像通过同一组件用于角色卡、选手与结算，使用同样的扁平填色和粗黑描边，避免视觉漂移。续作外形依据已记录的角色插画重新绘制矢量轮廓，没有嵌入或分发官方卡面、原始插画或模型截图作为头像。

续作矢量头像可运行 `pnpm build:avatars` 同源导出到 `public/avatars/second-wind/`，模型清单中的 `avatar` 指向这些 SVG；`modelPreview` 单独指向已有 Blender 检查预览 PNG。游戏直接使用内联 SVG，无需等待头像图片下载。

3D 棋子为本项目原创的 36 个几何玩具雕塑，沿用已有原创头像的色彩和角色轮廓，未使用第三方模型、贴图或扫描资产。精修可编辑源为 `assets/blender/toy-racers.blend`，保留独立命名部件和倒角修改器；重建脚本为 `scripts/generate-3d-assets.mjs --blender-source` 与 `scripts/refine-blender-models.py`。运行时模型为 `public/models/toy-racers.glb`，组件为 `src/client/scene/ToyCharacter.tsx`。模型具有真实体积、地面轴心和共享塑料材质；香蕉、兔耳、房屋、飞艇、火箭、鱼、双胞胎等均由独立网格构成。生成、优化、大小与验证说明见 [3d-assets.md](./3d-assets.md)，全角色精修覆盖见 [blender-models.md](./blender-models.md)。

字体：使用操作系统已有的中文无衬线与 Arial 系列；没有嵌入或分发商业字体，没有外部字体网络请求。

声音：浏览器 Web Audio 振荡器即时合成简短提示音，默认静音；没有第三方音频文件。

视觉参考与实际访问情况见 [art-direction.md](./art-direction.md)。研究参考图片仅存放在忽略的 `tmp` 目录用于分析，不打包到公开站点。

网站页脚注明“非官方同好项目”，并指向 CMYK 官方产品。Magical Athlete 的原作、游戏名称、角色设定和规则权利属于相应权利人；原创界面与头像不意味着取得商业授权。
