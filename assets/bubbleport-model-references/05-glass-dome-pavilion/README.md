# 玻璃穹顶馆

本文件夹是该组件的独立设计单元。

- 修改造型、材质、描述与基础提示词：`design.json`。
- 修改灯光、可动部件、状态参数、周期与约束：`motion.json`。
- 基础四视图：`reference-sheet.png`；独立视图：`front.png` / `right.png` / `back.png` / `three-quarter.png`。
- 新设计另存 `states/v2/` 等版本；保留 v1 和原始基础图。

## 当前动态设计

外壳不动；内部望远镜使用水平转台和俯仰轴两个关节。

[四态对比图](states/v1/state-comparison.png)

对比图顺序：左上 → 右上 → 左下 → 右下。所有状态使用同一观察方向。

| 状态 | 单独参考 | 参数 |
|---|---|---|
| 收泊·灯灭 | [图片](states/v1/parked.png) | `{"yaw_deg": 0, "pitch_deg": 10, "lights": 0}` |
| 低空观测 | [图片](states/v1/observe_low.png) | `{"yaw_deg": 30, "pitch_deg": 25, "lights": 0.5, "color": "#FFD198"}` |
| 高空观测 | [图片](states/v1/observe_high.png) | `{"yaw_deg": 60, "pitch_deg": 55, "lights": 0.7, "color": "#8ADDDC"}` |
| 回转扫描 | [图片](states/v1/return.png) | `{"yaw_deg": -25, "pitch_deg": 35, "lights": 0.5, "color": "#D7C0ED"}` |

## 后续3D制作

- 3D生成使用基础中性造型；状态图用于确定灯区、关节、转轴和形变，不为每个状态分别生成模型。
- 需要的部件拆分：`building_and_dome_static`, `telescope_yaw_mount`, `telescope_pitch_tube`, `dome_ring_light`, `window_lights`。
- 参数为设计目标，状态图不是经过尺寸或角度校准的3D渲染；几何和图像有冲突时以确认后的设定为准。
- 原图和完整生成提示词保存在 `states/v1/generation.json`。
- 此阶段未创建GLB、骨骼、顶点动画或引擎运行代码。
