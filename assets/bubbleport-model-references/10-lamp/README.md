# 路灯

本文件夹是该组件的独立设计单元。

- 修改造型、材质、描述与基础提示词：`design.json`。
- 修改灯光、可动部件、状态参数、周期与约束：`motion.json`。
- 基础四视图：`reference-sheet.png`；独立视图：`front.png` / `right.png` / `back.png` / `three-quarter.png`。
- 新设计另存 `states/v2/` 等版本；保留 v1 和原始基础图。

## 当前动态设计

灯体固定。闪烁通过off与指定亮态切换；默认淡入淡出，不使用高速频闪。

[四态对比图](states/v1/state-comparison.png)

对比图顺序：左上 → 右上 → 左下 → 右下。所有状态使用同一观察方向。

| 状态 | 单独参考 | 参数 |
|---|---|---|
| 关闭 | [图片](states/v1/off.png) | `{"intensity": 0, "color": "#FFD09A"}` |
| 暖光常亮 | [图片](states/v1/warm.png) | `{"intensity": 0.7, "color": "#FFD09A"}` |
| 青色提示 | [图片](states/v1/cyan.png) | `{"intensity": 0.65, "color": "#8EDDDC"}` |
| 蜜桃提示 | [图片](states/v1/peach.png) | `{"intensity": 0.65, "color": "#FFB6A0"}` |

## 后续3D制作

- 3D生成使用基础中性造型；状态图用于确定灯区、关节、转轴和形变，不为每个状态分别生成模型。
- 需要的部件拆分：`lamp_static`, `bulb_emissive`, `point_light`。
- 参数为设计目标，状态图不是经过尺寸或角度校准的3D渲染；几何和图像有冲突时以确认后的设定为准。
- 原图和完整生成提示词保存在 `states/v1/generation.json`。
- 此阶段未创建GLB、骨骼、顶点动画或引擎运行代码。
