# 摩天轮

本文件夹是该组件的独立设计单元。

- 修改造型、材质、描述与基础提示词：`design.json`。
- 修改灯光、可动部件、状态参数、周期与约束：`motion.json`。
- 基础四视图：`reference-sheet.png`；独立视图：`front.png` / `right.png` / `back.png` / `three-quarter.png`。
- 新设计另存 `states/v2/` 等版本；保留 v1 和原始基础图。

## 当前动态设计

主轮绕水平轮轴旋转；每个吊舱独立反向补偿，始终朝上。示意角度，不表示完整循环只转67.5°。

[四态对比图](states/v1/state-comparison.png)

对比图顺序：左上 → 右上 → 左下 → 右下。所有状态使用同一观察方向。

| 状态 | 单独参考 | 参数 |
|---|---|---|
| 停止·灯灭 | [图片](states/v1/off_0.png) | `{"wheel_deg": 0, "lights": 0}` |
| 旋转22.5°·暖灯 | [图片](states/v1/warm_22.png) | `{"wheel_deg": 22.5, "lights": 0.8, "palette": "warm"}` |
| 旋转45°·青色追光A | [图片](states/v1/cyan_45.png) | `{"wheel_deg": 45, "lights": 0.8, "palette": "cyan", "chase_phase": 0}` |
| 旋转67.5°·彩色追光B | [图片](states/v1/party_67.png) | `{"wheel_deg": 67.5, "lights": 0.8, "palette": "peach-cyan", "chase_phase": 1}` |

## 后续3D制作

- 3D生成使用基础中性造型；状态图用于确定灯区、关节、转轴和形变，不为每个状态分别生成模型。
- 需要的部件拆分：`support_static`, `wheel_rotor`, `gondolas_pivoted`, `rim_light_segments`, `hub_light`。
- 参数为设计目标，状态图不是经过尺寸或角度校准的3D渲染；几何和图像有冲突时以确认后的设定为准。
- 原图和完整生成提示词保存在 `states/v1/generation.json`。
- 此阶段未创建GLB、骨骼、顶点动画或引擎运行代码。
