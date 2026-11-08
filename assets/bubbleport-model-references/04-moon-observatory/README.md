# 月牙观测塔

本文件夹是该组件的独立设计单元。

- 修改造型、材质、描述与基础提示词：`design.json`。
- 修改灯光、可动部件、状态参数、周期与约束：`motion.json`。
- 基础四视图：`reference-sheet.png`；独立视图：`front.png` / `right.png` / `back.png` / `three-quarter.png`。
- 新设计另存 `states/v2/` 等版本；保留 v1 和原始基础图。

## 当前动态设计

上部观测舱为新增运动设计；与下层阳台分网格。月牙随顶舱旋转，楼体固定。

[四态对比图](states/v1/state-comparison.png)

对比图顺序：左上 → 右上 → 左下 → 右下。所有状态使用同一观察方向。

| 状态 | 单独参考 | 参数 |
|---|---|---|
| 暂停·顶舱灯灭 | [图片](states/v1/off_0.png) | `{"turret_yaw_deg": 0, "upper_light_intensity": 0, "lower_light_intensity": 0.5}` |
| 巡视·30° | [图片](states/v1/scan_30.png) | `{"turret_yaw_deg": 30, "lights": 0.6, "color": "#FFD49B"}` |
| 巡视·60° | [图片](states/v1/scan_60.png) | `{"turret_yaw_deg": 60, "lights": 0.8, "color": "#9ADFE8"}` |
| 巡视·90° | [图片](states/v1/scan_90.png) | `{"turret_yaw_deg": 90, "lights": 0.5, "color": "#E0C3EE"}` |

## 后续3D制作

- 3D生成使用基础中性造型；状态图用于确定灯区、关节、转轴和形变，不为每个状态分别生成模型。
- 需要的部件拆分：`lower_building_static`, `balcony_static`, `upper_observation_turret`, `window_lights`, `moon_light`。
- 参数为设计目标，状态图不是经过尺寸或角度校准的3D渲染；几何和图像有冲突时以确认后的设定为准。
- 原图和完整生成提示词保存在 `states/v1/generation.json`。
- 此阶段未创建GLB、骨骼、顶点动画或引擎运行代码。
