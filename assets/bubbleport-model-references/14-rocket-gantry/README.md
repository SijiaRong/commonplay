# 火箭装饰门架

本文件夹是该组件的独立设计单元。

- 修改造型、材质、描述与基础提示词：`design.json`。
- 修改灯光、可动部件、状态参数、周期与约束：`motion.json`。
- 基础四视图：`reference-sheet.png`；独立视图：`front.png` / `right.png` / `back.png` / `three-quarter.png`。
- 新设计另存 `states/v2/` 等版本；保留 v1 和原始基础图。

## 当前动态设计

红、黄、绿灯按事件状态切换，默认不自动循环倒计时；图示顺序是状态比较。

[四态对比图](states/v1/state-comparison.png)

对比图顺序：左上 → 右上 → 左下 → 右下。所有状态使用同一观察方向。

| 状态 | 单独参考 | 参数 |
|---|---|---|
| 关闭 | [图片](states/v1/off.png) | `{"red": 0, "amber": 0, "green": 0, "sign": 0}` |
| 等待·红灯 | [图片](states/v1/hold_red.png) | `{"red": 0.8, "amber": 0, "green": 0, "sign": 0.3}` |
| 准备·黄灯 | [图片](states/v1/ready_amber.png) | `{"red": 0, "amber": 0.8, "green": 0, "sign": 0.5}` |
| 出发·绿灯 | [图片](states/v1/go_green.png) | `{"red": 0, "amber": 0, "green": 0.9, "sign": 0.7}` |

## 后续3D制作

- 3D生成使用基础中性造型；状态图用于确定灯区、关节、转轴和形变，不为每个状态分别生成模型。
- 需要的部件拆分：`gantry_static`, `rocket_red_lamps`, `rocket_amber_lamps`, `rocket_green_lamps`, `sign_backlight`。
- 参数为设计目标，状态图不是经过尺寸或角度校准的3D渲染；几何和图像有冲突时以确认后的设定为准。
- 原图和完整生成提示词保存在 `states/v1/generation.json`。
- 此阶段未创建GLB、骨骼、顶点动画或引擎运行代码。
