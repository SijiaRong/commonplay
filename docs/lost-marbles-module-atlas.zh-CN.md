# Lost Marbles：34 类完整路段模块图录

本图录配套 [REA 逆向分析](lost-marbles-rea-analysis.zh-CN.md#module-atlas)与[赛道生成机制](lost-marbles-course-generation.zh-CN.md)，基于 2026-11-08 采集的公开交付脚本渲染。每类一张 **4096 × 3072** 大图，同一张图包括：左侧完整立体路段、右上入口与出口俯视、右下另一侧机关结构。点击图片可查看原尺寸。

**统计口径：22 类普通机关路段 + 3 类特殊大型路段 + 4 类岔路结构 + 3 类转弯 + 2 类终点 = 34 类。** 这是用于研究和模型素材规划的分类；原代码的可选主体模块 `PLAN_ITEMS` 有 29 项，加上 3 类转弯和 2 类终点得到同一口径。起跑台、普通连接坡和基础加速坡未计入。四类岔路各选一种代表组合，不表示原游戏只有四种岔路排列。

## 总览与索引

![34 类路段模块总览](../assets/lost-marbles/modules/contact-sheet.jpg)

可下载仓库后打开[本地图片浏览索引](../assets/lost-marbles/modules/index.html)。下表和分节图片均指向仓库内原尺寸文件。

| 编号 | 模块 | ID | 分类 | 大图 |
|---|---|---|---|---|
| 01 | 钉柱阵 | `pegs` | 普通机关路段 | [查看](../assets/lost-marbles/modules/01-pegs.jpg) |
| 02 | 旋转拨杆 | `spinners` | 普通机关路段 | [查看](../assets/lost-marbles/modules/02-spinners.jpg) |
| 03 | 凸块路 | `bumps` | 普通机关路段 | [查看](../assets/lost-marbles/modules/03-bumps.jpg) |
| 04 | 收口漏斗 | `funnel` | 普通机关路段 | [查看](../assets/lost-marbles/modules/04-funnel.jpg) |
| 05 | 弹性碰撞阵 | `bumperField` | 普通机关路段 | [查看](../assets/lost-marbles/modules/05-bumperField.jpg) |
| 06 | 横向滚筒 | `rollers` | 普通机关路段 | [查看](../assets/lost-marbles/modules/06-rollers.jpg) |
| 07 | 波浪坡 | `hills` | 普通机关路段 | [查看](../assets/lost-marbles/modules/07-hills.jpg) |
| 08 | 摆锤 | `hammers` | 普通机关路段 | [查看](../assets/lost-marbles/modules/08-hammers.jpg) |
| 09 | 活动闸门 | `gates` | 普通机关路段 | [查看](../assets/lost-marbles/modules/09-gates.jpg) |
| 10 | 大扫杆 | `sweeper` | 普通机关路段 | [查看](../assets/lost-marbles/modules/10-sweeper.jpg) |
| 11 | 陷阱地板 | `trapFloor` | 普通机关路段 | [查看](../assets/lost-marbles/modules/11-trapFloor.jpg) |
| 12 | 小落差 | `cliff` | 普通机关路段 | [查看](../assets/lost-marbles/modules/12-cliff.jpg) |
| 13 | 腾空跳台 | `bigAir` | 普通机关路段 | [查看](../assets/lost-marbles/modules/13-bigAir.jpg) |
| 14 | 阶梯瀑布 | `cascade` | 普通机关路段 | [查看](../assets/lost-marbles/modules/14-cascade.jpg) |
| 15 | 跷跷板 | `seesaws` | 普通机关路段 | [查看](../assets/lost-marbles/modules/15-seesaws.jpg) |
| 16 | 钢琴键 | `keys` | 普通机关路段 | [查看](../assets/lost-marbles/modules/16-keys.jpg) |
| 17 | 半管道 | `halfpipe` | 普通机关路段 | [查看](../assets/lost-marbles/modules/17-halfpipe.jpg) |
| 18 | 穿环跳 | `hoopJump` | 普通机关路段 | [查看](../assets/lost-marbles/modules/18-hoopJump.jpg) |
| 19 | 跳格子 | `hopscotch` | 普通机关路段 | [查看](../assets/lost-marbles/modules/19-hopscotch.jpg) |
| 20 | 蹦床 | `trampolines` | 普通机关路段 | [查看](../assets/lost-marbles/modules/20-trampolines.jpg) |
| 21 | 陡降滑槽 | `plunge` | 普通机关路段 | [查看](../assets/lost-marbles/modules/21-plunge.jpg) |
| 22 | 旋转陀螺 | `spintop` | 普通机关路段 | [查看](../assets/lost-marbles/modules/22-spintop.jpg) |
| 23 | 小漩涡 | `whirlpool` | 特殊大型路段 | [查看](../assets/lost-marbles/modules/23-whirlpool.jpg) |
| 24 | 滚筒弯道 | `drum` | 特殊大型路段 | [查看](../assets/lost-marbles/modules/24-drum.jpg) |
| 25 | 超级跳台 | `megaJump` | 特殊大型路段 | [查看](../assets/lost-marbles/modules/25-megaJump.jpg) |
| 26 | 多路线岔路 | `fork` | 岔路结构 | [查看](../assets/lost-marbles/modules/26-fork.jpg) |
| 27 | 垂直回环 | `loop` | 岔路结构 | [查看](../assets/lost-marbles/modules/27-loop.jpg) |
| 28 | 玩具大炮 | `cannon` | 岔路结构 | [查看](../assets/lost-marbles/modules/28-cannon.jpg) |
| 29 | 高低双路 | `split` | 岔路结构 | [查看](../assets/lost-marbles/modules/29-split.jpg) |
| 30 | 平面回头弯 | `turn` | 转弯连接段 | [查看](../assets/lost-marbles/modules/30-turn.jpg) |
| 31 | 倾斜回头弯 | `bank` | 转弯连接段 | [查看](../assets/lost-marbles/modules/31-bank.jpg) |
| 32 | 螺旋下坡弯 | `helix` | 转弯连接段 | [查看](../assets/lost-marbles/modules/32-helix.jpg) |
| 33 | 碗形终点 | `bowl` | 终点段 | [查看](../assets/lost-marbles/modules/33-bowl.jpg) |
| 34 | 围栏终点 | `pen` | 终点段 | [查看](../assets/lost-marbles/modules/34-pen.jpg) |

## 渲染方法与边界

- 每个模块独立调用原生成函数，使用同一随机种子 `20261108`、通道宽度 `16`、关卡索引 `2` 和基础坡度参数 `0.082`。长度、数量、落差等仍由各模块生成逻辑决定；这些图片不代表每种参数或每个随机变体。
- 普通与特殊路段通过 `addPiece` 生成；岔路通过 `fork`，转弯通过 `turn` / `bankedTurn`，终点通过 `pen` / `bowl` 生成。自编服务器仅在内存中追加内部构建函数导出，没有改写采集的原始文件。
- 调用原 `CourseView`、扫描木纹材质和程序纹理构建实际显示网格，保留生成的支架。为让最低路面离地约 8 单位，构建前按路径最低点确定起始高度；这属于独立展示的摆放设置，不是五关场景中的原始安装高度。
- 运动机关显示关卡时间 `t = 2s` 的姿态；**IN** 表示模块入口，**OUT** 表示连接下一段的出口，**GOAL** 表示检查点触发位置。标记只加在俯视图上，不属于原游戏模型。
- 大图使用中性地面、HDR 环境光、阴影和 AgX 色调映射，关闭景深，不包含原版完整后处理链、弹珠比赛或通关验证。右下图始终保留完整模块，以便核对主图中被遮挡的侧面和下方结构。
- `bowl` 使用非最终关的碗形检查点参数，包含漏斗下方出口及围栏区；最终关碗尺寸等参数会变化。`pen` 同样使用非最终关检查点参数。

复现命令：`node tools/render-lost-marbles-modules.cjs`。依赖和运行说明见[模块素材目录](../assets/lost-marbles/modules/README.md)；逐图参数、碰撞体数、视觉描述数和原始生成器 SHA-256 见[清单](../assets/lost-marbles/modules/manifest.json)。这些数量不是 draw call 数，也不是可以直接拿来使用的 GLB 文件数量。

<a id="group-1"></a>

## 普通机关路段

### 01 · 钉柱阵（pegs）

在立柱之间穿行。

[![01 钉柱阵：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/01-pegs.jpg)](../assets/lost-marbles/modules/01-pegs.jpg)

### 02 · 旋转拨杆（spinners）

转动横杆撞开弹珠。

[![02 旋转拨杆：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/02-spinners.jpg)](../assets/lost-marbles/modules/02-spinners.jpg)

### 03 · 凸块路（bumps）

连续小凸起。

[![03 凸块路：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/03-bumps.jpg)](../assets/lost-marbles/modules/03-bumps.jpg)

### 04 · 收口漏斗（funnel）

宽路逐渐变窄。

[![04 收口漏斗：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/04-funnel.jpg)](../assets/lost-marbles/modules/04-funnel.jpg)

### 05 · 弹性碰撞阵（bumperField）

弹性障碍改变行进方向。

[![05 弹性碰撞阵：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/05-bumperField.jpg)](../assets/lost-marbles/modules/05-bumperField.jpg)

### 06 · 横向滚筒（rollers）

滚动柱体制造颠簸。

[![06 横向滚筒：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/06-rollers.jpg)](../assets/lost-marbles/modules/06-rollers.jpg)

### 07 · 波浪坡（hills）

连续起伏。

[![07 波浪坡：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/07-hills.jpg)](../assets/lost-marbles/modules/07-hills.jpg)

### 08 · 摆锤（hammers）

摆动障碍横扫赛道。

[![08 摆锤：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/08-hammers.jpg)](../assets/lost-marbles/modules/08-hammers.jpg)

### 09 · 活动闸门（gates）

按时序开合。

[![09 活动闸门：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/09-gates.jpg)](../assets/lost-marbles/modules/09-gates.jpg)

### 10 · 大扫杆（sweeper）

跨赛道旋转扫击。

[![10 大扫杆：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/10-sweeper.jpg)](../assets/lost-marbles/modules/10-sweeper.jpg)

### 11 · 陷阱地板（trapFloor）

地板翻转，制造坠落风险。

[![11 陷阱地板：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/11-trapFloor.jpg)](../assets/lost-marbles/modules/11-trapFloor.jpg)

### 12 · 小落差（cliff）

短距离掉落。

[![12 小落差：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/12-cliff.jpg)](../assets/lost-marbles/modules/12-cliff.jpg)

### 13 · 腾空跳台（bigAir）

起跳越过间隙。

[![13 腾空跳台：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/13-bigAir.jpg)](../assets/lost-marbles/modules/13-bigAir.jpg)

### 14 · 阶梯瀑布（cascade）

连续台阶下落。

[![14 阶梯瀑布：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/14-cascade.jpg)](../assets/lost-marbles/modules/14-cascade.jpg)

### 15 · 跷跷板（seesaws）

活动桥面改变坡度。

[![15 跷跷板：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/15-seesaws.jpg)](../assets/lost-marbles/modules/15-seesaws.jpg)

### 16 · 钢琴键（keys）

板块按波形上下运动。

[![16 钢琴键：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/16-keys.jpg)](../assets/lost-marbles/modules/16-keys.jpg)

### 17 · 半管道（halfpipe）

沿弧形侧壁滑行。

[![17 半管道：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/17-halfpipe.jpg)](../assets/lost-marbles/modules/17-halfpipe.jpg)

### 18 · 穿环跳（hoopJump）

越过间隙穿过圆环。

[![18 穿环跳：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/18-hoopJump.jpg)](../assets/lost-marbles/modules/18-hoopJump.jpg)

### 19 · 跳格子（hopscotch）

连续短平台与空隙。

[![19 跳格子：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/19-hopscotch.jpg)](../assets/lost-marbles/modules/19-hopscotch.jpg)

### 20 · 蹦床（trampolines）

弹跳垫连接落点。

[![20 蹦床：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/20-trampolines.jpg)](../assets/lost-marbles/modules/20-trampolines.jpg)

### 21 · 陡降滑槽（plunge）

翻过坡顶进入陡降段。

[![21 陡降滑槽：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/21-plunge.jpg)](../assets/lost-marbles/modules/21-plunge.jpg)

### 22 · 旋转陀螺（spintop）

旋转盘面改变弹珠运动。

[![22 旋转陀螺：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/22-spintop.jpg)](../assets/lost-marbles/modules/22-spintop.jpg)

<a id="group-2"></a>

## 特殊大型路段

### 23 · 小漩涡（whirlpool）

沿碗壁滑向中间排出口。

[![23 小漩涡：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/23-whirlpool.jpg)](../assets/lost-marbles/modules/23-whirlpool.jpg)

### 24 · 滚筒弯道（drum）

绕中心柱沿侧壁转弯。

[![24 滚筒弯道：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/24-drum.jpg)](../assets/lost-marbles/modules/24-drum.jpg)

### 25 · 超级跳台（megaJump）

多落点的长距离飞跃。

[![25 超级跳台：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/25-megaJump.jpg)](../assets/lost-marbles/modules/25-megaJump.jpg)

<a id="group-3"></a>

## 岔路结构

### 26 · 多路线岔路（fork）

分成不同风险的并行路线。本图展示`stairs / beam / spinner` 三路示例。

[![26 多路线岔路：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/26-fork.jpg)](../assets/lost-marbles/modules/26-fork.jpg)

### 27 · 垂直回环（loop）

回环搭配平缓备用路。本图展示`loop / clear` 两路示例。

[![27 垂直回环：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/27-loop.jpg)](../assets/lost-marbles/modules/27-loop.jpg)

### 28 · 玩具大炮（cannon）

炮击飞跃搭配备用路。本图展示`cannon / clear` 两路示例。

[![28 玩具大炮：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/28-cannon.jpg)](../assets/lost-marbles/modules/28-cannon.jpg)

### 29 · 高低双路（split）

高处快路与低处安全路。本图展示`high / low` 两路示例。

[![29 高低双路：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/29-split.jpg)](../assets/lost-marbles/modules/29-split.jpg)

<a id="group-4"></a>

## 转弯连接段

### 30 · 平面回头弯（turn）

连接相邻两条下坡直道。

[![30 平面回头弯：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/30-turn.jpg)](../assets/lost-marbles/modules/30-turn.jpg)

### 31 · 倾斜回头弯（bank）

带倾角的曲面转弯。

[![31 倾斜回头弯：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/31-bank.jpg)](../assets/lost-marbles/modules/31-bank.jpg)

### 32 · 螺旋下坡弯（helix）

螺旋盘绕后进入下一条直道。

[![32 螺旋下坡弯：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/32-helix.jpg)](../assets/lost-marbles/modules/32-helix.jpg)

<a id="group-5"></a>

## 终点段

### 33 · 碗形终点（bowl）

沿碗壁滑向中央出口。本图展示非最终关碗形检查点，含下方出口和围栏区。

[![33 碗形终点：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/33-bowl.jpg)](../assets/lost-marbles/modules/33-bowl.jpg)

### 34 · 围栏终点（pen）

进入围栏区域判定到达。本图展示非最终关围栏检查点。

[![34 围栏终点：完整路段、入口出口俯视与另一侧机关结构](../assets/lost-marbles/modules/34-pen.jpg)](../assets/lost-marbles/modules/34-pen.jpg)

## 来源与权利

参考游戏：[Lost Marbles / Meticulai](https://meticulai.com/games/lost-marbles/)。游戏赛道设计、原生成器及相关视觉内容的权利归各自权利人所有；木纹与房间 HDR 原素材标注来源为 Poly Haven / CC0。本图录仅供学习、研究和技术交流，不通过仓库 MIT 许可授予第三方内容的使用权；详细说明见[图库来源与权利](../assets/lost-marbles/README.md#来源与权利)。
