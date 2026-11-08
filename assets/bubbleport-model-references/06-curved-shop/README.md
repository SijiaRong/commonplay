# 弧形商铺模块

本文件夹是该组件的独立设计单元。

- 修改造型、材质、描述与基础提示词：`design.json`。
- 修改灯光、可动部件、状态参数、周期与约束：`motion.json`。
- 基础四视图：`reference-sheet.png`；独立视图：`front.png` / `right.png` / `back.png` / `three-quarter.png`。
- 新设计另存 `states/v2/` 等版本；保留 v1 和原始基础图。

## 当前动态设计

不让建筑本体转动；橱窗分A/B组轮亮。灯条为设计新增材质区。

[四态对比图](states/v1/state-comparison.png)

对比图顺序：左上 → 右上 → 左下 → 右下。所有状态使用同一观察方向。

| 状态 | 单独参考 | 参数 |
|---|---|---|
| 闭店 | [图片](states/v1/closed.png) | `{"zone_a": 0, "zone_b": 0, "cornice": 0}` |
| 营业暖光 | [图片](states/v1/warm.png) | `{"zone_a": 0.65, "zone_b": 0.65, "cornice": 0.25}` |
| 橱窗轮亮A | [图片](states/v1/sequence_a.png) | `{"zone_a": 0.9, "zone_b": 0.2, "cornice": 0.4}` |
| 橱窗轮亮B | [图片](states/v1/sequence_b.png) | `{"zone_a": 0.2, "zone_b": 0.9, "cornice": 0.4}` |

## 后续3D制作

- 3D生成使用基础中性造型；状态图用于确定灯区、关节、转轴和形变，不为每个状态分别生成模型。
- 需要的部件拆分：`building_static`, `window_light_zone_a`, `window_light_zone_b`, `cornice_light`。
- 参数为设计目标，状态图不是经过尺寸或角度校准的3D渲染；几何和图像有冲突时以确认后的设定为准。
- 原图和完整生成提示词保存在 `states/v1/generation.json`。
- 此阶段未创建GLB、骨骼、顶点动画或引擎运行代码。
