# 观赏小树

本文件夹是该组件的独立设计单元。

- 修改造型、材质、描述与基础提示词：`design.json`。
- 修改灯光、可动部件、状态参数、周期与约束：`motion.json`。
- 基础四视图：`reference-sheet.png`；独立视图：`front.png` / `right.png` / `back.png` / `three-quarter.png`。
- 新设计另存 `states/v2/` 等版本；保留 v1 和原始基础图。

## 当前动态设计

盆、根和树干底部固定；枝梢与叶团使用分层风动。树叶不凭空增减。

[四态对比图](states/v1/state-comparison.png)

对比图顺序：左上 → 右上 → 左下 → 右下。所有状态使用同一观察方向。

| 状态 | 单独参考 | 参数 |
|---|---|---|
| 无风 | [图片](states/v1/calm.png) | `{"branch_bend_deg": 0, "leaf_bend_deg": 0}` |
| 左风阵 | [图片](states/v1/gust_left.png) | `{"branch_bend_deg": -4, "leaf_bend_deg": -10}` |
| 右风阵 | [图片](states/v1/gust_right.png) | `{"branch_bend_deg": 4, "leaf_bend_deg": 10}` |
| 余振 | [图片](states/v1/settle.png) | `{"branch_bend_deg": -1.5, "leaf_bend_deg": 4}` |

## 后续3D制作

- 3D生成使用基础中性造型；状态图用于确定灯区、关节、转轴和形变，不为每个状态分别生成模型。
- 需要的部件拆分：`pot_and_roots_static`, `trunk_lower_static`, `branch_joints`, `leaf_cluster_deform`。
- 参数为设计目标，状态图不是经过尺寸或角度校准的3D渲染；几何和图像有冲突时以确认后的设定为准。
- 原图和完整生成提示词保存在 `states/v1/generation.json`。
- 此阶段未创建GLB、骨骼、顶点动画或引擎运行代码。
