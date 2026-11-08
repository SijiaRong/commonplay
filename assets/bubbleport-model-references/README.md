# 泡泡星港：景观模型生成参考库

16 个独立资产；每个包含 1 张四视图设计板及 4 张独立白底 PNG。图像由内置 image_gen 生成。

## 文件与视角

- `reference-sheet.png`：设计审阅用，左上正面、右上右侧、左下背面、右下斜视。
- `front.png`、`right.png`、`back.png`、`three-quarter.png`：从设计板原样拆出的独立视图，去掉网格线并补白成方图；未放大或重画。
- `manifest.json`：包含各资产描述、完整生成提示词、源文件、视图路径及像素尺寸。

## 用于 Hi3D

1. 每次只提交一个资产。选择独立单视图，不要把四视图设计板当作一张物体照片提交。
2. 以 `front.png` 为正面参考；斜视图适合检查整体体积。其他视图需按当时接口支持的视角和数量填写，不能把右侧当左侧。
3. 同一资产的四视图应一起核对：这些是 AI 概念参考，不是经过尺寸校准的同一网格渲染；细节若冲突，以正面和斜视图确认的主体造型为准。
4. 当前只制作 2D 参考，未发起 Hi3D 3D 生成，也未验证重建质量。

## 建模边界

- 保留奶油白、薄荷绿、蜜桃色及玩具模型材质；隐藏背面为保守设计补全。
- 赛道、障碍、赛道支架、底座、房间和地面不包含在本资产库中。门架仅为独立装饰结构。
- 建筑按闭合外壳设计，透明玻璃和内部摆件仅为造型参考；后续需检查背面、薄壁、底面及材质。
- 摩天轮先按静态景观整体建模；需要动画时，轮体、支架与吊舱要在 DCC 软件中拆分。
- 机器人为中性 A 姿势参考；参考图不代表已有骨骼或动画。
- 弧形商铺为独立填充模块，尺寸和曲率需按实际赛道重新适配。
- 桌伞为连接的整体；咖啡椅独立。花箱包含植物，小树包含花盆。
- 发光、玻璃折射、金属效果在引擎中重新配置。窗框、栏杆、树叶等细节可能需要简化。

## 资产目录

| 编号 | 模型 | 设计板 | 独立视图 |
|---|---|---|---|
| 01 | 土星地标 | [四视图](01-saturn-landmark/reference-sheet.png) | [正面](01-saturn-landmark/front.png) · [右侧](01-saturn-landmark/right.png) · [背面](01-saturn-landmark/back.png) · [斜视](01-saturn-landmark/three-quarter.png) |
| 02 | 摩天轮 | [四视图](02-ferris-wheel/reference-sheet.png) | [正面](02-ferris-wheel/front.png) · [右侧](02-ferris-wheel/right.png) · [背面](02-ferris-wheel/back.png) · [斜视](02-ferris-wheel/three-quarter.png) |
| 03 | 汽水店 | [四视图](03-soda-cafe/reference-sheet.png) | [正面](03-soda-cafe/front.png) · [右侧](03-soda-cafe/right.png) · [背面](03-soda-cafe/back.png) · [斜视](03-soda-cafe/three-quarter.png) |
| 04 | 月牙观测塔 | [四视图](04-moon-observatory/reference-sheet.png) | [正面](04-moon-observatory/front.png) · [右侧](04-moon-observatory/right.png) · [背面](04-moon-observatory/back.png) · [斜视](04-moon-observatory/three-quarter.png) |
| 05 | 玻璃穹顶馆 | [四视图](05-glass-dome-pavilion/reference-sheet.png) | [正面](05-glass-dome-pavilion/front.png) · [右侧](05-glass-dome-pavilion/right.png) · [背面](05-glass-dome-pavilion/back.png) · [斜视](05-glass-dome-pavilion/three-quarter.png) |
| 06 | 弧形商铺模块 | [四视图](06-curved-shop/reference-sheet.png) | [正面](06-curved-shop/front.png) · [右侧](06-curved-shop/right.png) · [背面](06-curved-shop/back.png) · [斜视](06-curved-shop/three-quarter.png) |
| 07 | 终点站房 | [四视图](07-terminal-station/reference-sheet.png) | [正面](07-terminal-station/front.png) · [右侧](07-terminal-station/right.png) · [背面](07-terminal-station/back.png) · [斜视](07-terminal-station/three-quarter.png) |
| 08 | 服务机器人 | [四视图](08-service-robot/reference-sheet.png) | [正面](08-service-robot/front.png) · [右侧](08-service-robot/right.png) · [背面](08-service-robot/back.png) · [斜视](08-service-robot/three-quarter.png) |
| 09 | 长椅 | [四视图](09-bench/reference-sheet.png) | [正面](09-bench/front.png) · [右侧](09-bench/right.png) · [背面](09-bench/back.png) · [斜视](09-bench/three-quarter.png) |
| 10 | 路灯 | [四视图](10-lamp/reference-sheet.png) | [正面](10-lamp/front.png) · [右侧](10-lamp/right.png) · [背面](10-lamp/back.png) · [斜视](10-lamp/three-quarter.png) |
| 11 | 花箱 | [四视图](11-planter/reference-sheet.png) | [正面](11-planter/front.png) · [右侧](11-planter/right.png) · [背面](11-planter/back.png) · [斜视](11-planter/three-quarter.png) |
| 12 | 遮阳伞桌 | [四视图](12-umbrella-table/reference-sheet.png) | [正面](12-umbrella-table/front.png) · [右侧](12-umbrella-table/right.png) · [背面](12-umbrella-table/back.png) · [斜视](12-umbrella-table/three-quarter.png) |
| 13 | 咖啡椅 | [四视图](13-cafe-chair/reference-sheet.png) | [正面](13-cafe-chair/front.png) · [右侧](13-cafe-chair/right.png) · [背面](13-cafe-chair/back.png) · [斜视](13-cafe-chair/three-quarter.png) |
| 14 | 火箭装饰门架 | [四视图](14-rocket-gantry/reference-sheet.png) | [正面](14-rocket-gantry/front.png) · [右侧](14-rocket-gantry/right.png) · [背面](14-rocket-gantry/back.png) · [斜视](14-rocket-gantry/three-quarter.png) |
| 15 | 观赏小树 | [四视图](15-ornamental-tree/reference-sheet.png) | [正面](15-ornamental-tree/front.png) · [右侧](15-ornamental-tree/right.png) · [背面](15-ornamental-tree/back.png) · [斜视](15-ornamental-tree/three-quarter.png) |
| 16 | 广场围栏 | [四视图](16-plaza-railing/reference-sheet.png) | [正面](16-plaza-railing/front.png) · [右侧](16-plaza-railing/right.png) · [背面](16-plaza-railing/back.png) · [斜视](16-plaza-railing/three-quarter.png) |

## 完整提示词

每个资产的完整英文提示词已保存在 `manifest.json` 的 `generation_prompt` 中，可继续迭代。

<!-- COMPONENT-DYNAMICS -->

## 逐组件设定与动态设计

[打开本地状态比较目录](index.html)。每个组件保留独立目录，造型设定在 `design.json`，动态设定在 `motion.json`，状态图在 `states/v1/`。配置更改后运行 `python3 build_catalog.py` 更新目录页；该操作保留已有图片，不会重新调用生成服务。

13 个动态组件，每个 1 张对比图 + 4 张独立状态图，共新增 65 张 PNG。另有 3 个静态组件跳过。状态图采用同机位，图序为左上、右上、左下、右下。完整提示词在每个组件的 `states/v1/generation.json`。

这些是关键帧设计与可修改参数，尚未实现 3D 模型拆分、绑定、物理形变或运行时动画。动态图不作为另一个模型的基础造型输入。

| 组件 | 状态与说明 | 设定 |
|---|---|---|
| [土星地标](01-saturn-landmark/README.md) | 日间关闭 / 暖光迎宾 / 青色呼吸高点 / 蜜桃呼吸低点 | [造型](01-saturn-landmark/design.json) · [动态](01-saturn-landmark/motion.json) |
| [摩天轮](02-ferris-wheel/README.md) | 停止·灯灭 / 旋转22.5°·暖灯 / 旋转45°·青色追光A / 旋转67.5°·彩色追光B | [造型](02-ferris-wheel/design.json) · [动态](02-ferris-wheel/motion.json) |
| [汽水店](03-soda-cafe/README.md) | 闭店·灯灭 / 营业·暖光 / 招徕·闪灯A / 招徕·闪灯B | [造型](03-soda-cafe/design.json) · [动态](03-soda-cafe/motion.json) |
| [月牙观测塔](04-moon-observatory/README.md) | 暂停·顶舱灯灭 / 巡视·30° / 巡视·60° / 巡视·90° | [造型](04-moon-observatory/design.json) · [动态](04-moon-observatory/motion.json) |
| [玻璃穹顶馆](05-glass-dome-pavilion/README.md) | 收泊·灯灭 / 低空观测 / 高空观测 / 回转扫描 | [造型](05-glass-dome-pavilion/design.json) · [动态](05-glass-dome-pavilion/motion.json) |
| [弧形商铺模块](06-curved-shop/README.md) | 闭店 / 营业暖光 / 橱窗轮亮A / 橱窗轮亮B | [造型](06-curved-shop/design.json) · [动态](06-curved-shop/motion.json) |
| [终点站房](07-terminal-station/README.md) | 闭站 / 候客 / 开门迎接 / 缓慢关门 | [造型](07-terminal-station/design.json) · [动态](07-terminal-station/motion.json) |
| [服务机器人](08-service-robot/README.md) | 待机 / 挥手迎宾 / 指路 / 休眠 | [造型](08-service-robot/design.json) · [动态](08-service-robot/motion.json) |
| [长椅](09-bench/README.md) | 固定长椅，无活动机构；跳过动态设计。 | [造型](09-bench/design.json) · [动态](09-bench/motion.json) |
| [路灯](10-lamp/README.md) | 关闭 / 暖光常亮 / 青色提示 / 蜜桃提示 | [造型](10-lamp/design.json) · [动态](10-lamp/motion.json) |
| [花箱](11-planter/README.md) | 无风 / 向左摆 / 向右摆 / 回弹 | [造型](11-planter/design.json) · [动态](11-planter/motion.json) |
| [遮阳伞桌](12-umbrella-table/README.md) | 伞面0° / 伞面22.5° / 伞面45° / 伞面67.5° | [造型](12-umbrella-table/design.json) · [动态](12-umbrella-table/motion.json) |
| [咖啡椅](13-cafe-chair/README.md) | 固定咖啡椅，无活动机构；跳过动态设计。 | [造型](13-cafe-chair/design.json) · [动态](13-cafe-chair/motion.json) |
| [火箭装饰门架](14-rocket-gantry/README.md) | 关闭 / 等待·红灯 / 准备·黄灯 / 出发·绿灯 | [造型](14-rocket-gantry/design.json) · [动态](14-rocket-gantry/motion.json) |
| [观赏小树](15-ornamental-tree/README.md) | 无风 / 左风阵 / 右风阵 / 余振 | [造型](15-ornamental-tree/design.json) · [动态](15-ornamental-tree/motion.json) |
| [广场围栏](16-plaza-railing/README.md) | 固定广场围栏，无活动机构；跳过动态设计。 | [造型](16-plaza-railing/design.json) · [动态](16-plaza-railing/motion.json) |
