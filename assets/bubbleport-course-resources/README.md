# 泡泡星港 · 赛段与材质资源库

[打开资源总览](index.html)。该目录保存当前采用版，可整体复制；原来的设计台和材质实验台仍可正常使用。

| 内容 | 位置 |
|---|---|
| 六段俯视图、逐段设计与提示词 | tracks/01-pendulums 至 tracks/06-wave-floor |
| 六段汇总规格与图像复核 | [设计规格](tracks/design-specifications.md) · [图像复核](tracks/image-review.md) |
| 三段3D结构的立体/俯视/侧视与代码快照 | structures/flat、slide、turn、source |
| 原始风格、整体效果与提示词 | concepts/ |
| 八种PBR参数与灯光预设 | materials/presets.json、lighting-presets.json |
| 28张PNG贴图与导入方式 | [材质说明](materials/README.md) · materials/textures/ |
| 日夜及材质近看预览 | previews/ |
| 文件用途、来源、尺寸、大小、校验值 | manifest.json |

六段采用版本：01/02/03/04/06为v2，05为v3，归档名称统一为各段的 topdown.png；提示词保留原始版本名。历史迭代图仍在仓库 bubbleport-segment-designs/topdown-v1，未删除或覆盖。三段结构样段是较早的独立方案，不等于六段已全部实现。

## 复用与重建

- 独立浏览本目录的 index.html 即可看图和贴图索引。
- 运行交互样板需从仓库根目录提供HTTP服务，打开 /bubbleport-material-lab/ 或 /bubbleport-segment-designs/。代码快照用于追溯；本资源目录不是完整应用的独立安装包。材质主源已汇入material-atlas/dist/original/bubbleport；本目录materials使用兼容软链接，ZIP中展开为实际文件。
- 用 node tools/archive-bubbleport-course-resources.cjs 从当前已采用源资源重建本目录。工具不生成新概念图；它复制采用版并从实际运行材质导出贴图。重建会更新归档副本，源文件不变。
- 资源打包ZIP位于同级 bubbleport-course-resources-v1.zip。压缩包只包含本目录，取用时保留结构。

## 来源与边界

概念图来自本项目已生成的内置ImageGen输出，提示词一并保留；原创程序材质来自材质实验台。微纹理为确定性程序生成；环境由官方Three.js RoomEnvironment生成，不包含第三方扫描贴图或外部HDR。第三方环境源码许可保存在 materials/source/LICENSE-three。

归档不扩展任何素材授权，也不认证精确尺寸、碰撞或通关。材质参数为视觉调试值；参见材料说明中的颜色空间、贴图乘数和发光限制。
