# 从 Fall Beans 到小熊的「玩具门廊」

Fall Beans 是 Pitoy Games 制作的多人 3D 网页竞速闯关游戏。调研时 CrazyGames 页面记录了 24,938 次评价。开发者的 itch.io 页面也嵌入了这一网页版本。[游戏主页](https://www.crazygames.com/game/fall-beans) · [开发者页面](https://pitoygames.itch.io/fall-beans)

## 公开构建里能看到什么

分析对象是 WebGL 构建 1.32，Unity 2019.3.15f1。解包公开的 UnityWebData 后，使用 software/rea 的 `inspect-il2cpp-metadata` 检查 `global-metadata.dat`，识别到版本 24 和 `GoalCollider` 等游戏字符串。关卡的摆放顺序另由 UnityPy 读取同一构建的 `data.unity3d`，按 Transform 父子关系还原。下表使用场景文件名和父节点坐标。门的实时开闭周期未测量。[发行构建清单](https://files.crazygames.com/fall-beans/9/Build/WebGLFallBeansDecemberUpdatedCrazyAdsSDK.json)

| level5 的节点 | 摆放证据 | 小熊关卡取用的节奏 |
| --- | --- | --- |
| Stage1 至 Stage4 | 四块 Ground 的缩放都是 40 × 1 × 40。父节点高度相同，沿 Z 每隔 40 排一块。每块都有 Bumpers 和 SlidingDoors，门组位于各自中心前方 19.5 处。第一组的三个门位横坐标是 −12、0、12。 | 用有纵深的平地让玩家看见门洞。第一组练选门，最后一组在回旋滑梯和矮栏之后。 |
| Stage5 至 Stage6 | 第五段仍有同规格 Ground。第六段 Static 下的两个 GooSlide 节点位置和旋转相同，绕 X 轴约 30°。 | 在平地挑战之间改变高度。小熊第一关的直滑梯和回旋滑梯各下降 8 个单位。 |
| FinalGoal | 终点父节点在 Z=240、Y=−15。门组位于本地 Z=−19.5，GoalCollider 位于本地 Z=0。 | 落地后先给玩家空间站稳，再用熟悉的移门收尾。 |

## 第一关试玩

沿水平中心线量，从起跑闸到终点约 253.3 个游戏单位。两段滑梯合计约 56.1 个单位，占全程 22.2%。两者之间有 58 个单位的平地，用于落脚、过摆锤和跑过下沉地板。

| 里程（约） | 路段 |
| --- | --- |
| 0–26 | 软垫助跑 |
| 26–50 | 三门洞移门 |
| 50–82 | 积木绕桩 |
| 82–102 | 直木滑梯，下降 8 个单位 |
| 102–134 | 钟摆锤廊，两把悬锤横扫跑道 |
| 134–160 | 波浪地板，四排三列地块依次下沉 |
| 160–196.1 | 回旋滑梯，绕中心柱转过 180°，同时再下降 8 个单位 |
| 196.1–226.1 | 沿反向平地出弯，跳过或绕开矮栏 |
| 226.1–253.3 | 终点移门、冲线 |

本机采集结果位于 [REA 摘要](../.local/fall-beans/metadata-summary.json) 和 [level5 场景节点](../.local/fall-beans/level5-transforms.json)。试玩复用小熊项目现有的移门、软垫和木坡组件。
