# Commonplay 模型库

按几何来源归档的独立 GLB 文件快照，2026-11-08。159 个模型路径按 SHA-256 去重后得到 101 个文件，另新增一套星港横移门白模，现有 102 个文件。计数包含同一设计的原模、运行版和制作中间版本。[清单](manifest.json)记录每份文件的来源路径、字节数、校验值、网格数和材质数。

## Lost Marbles

[经典木滑梯](lost-marbles/classic-slide/)收录从原版赛道烘焙的两个 GLB，分别来自小熊试玩和泡泡星城分支。后者的材质处理沿用项目分支。另有 [34 类程序路段图录](../lost-marbles/modules/README.md)和[五关完整图库与来源说明](../lost-marbles/README.md)，这些模块由生成器在运行时构建。

## Commonplay 原创与制作版本

| 模型组 | 数量 | 取用方式 |
|---|---:|---|
| [玩偶与机器人](commonplay/characters/) | 44 | 按 17 个角色归档。original 用于继续制作，animated 用于带动作的试玩，desktop 用于桌面展示。 |
| [泡泡星港设施](commonplay/bubbleport/scenery/) | 32 | 16 件设施，每件各有 [Hi3D 原模](commonplay/bubbleport/scenery/original/)与[运行版](commonplay/bubbleport/scenery/runtime/)。 |
| [星港机关](commonplay/bubbleport/obstacles/) | 5 | 胶囊软垫与土星锤头各有原模和运行版，另有[横移门白模](commonplay/bubbleport/obstacles/runtime/starport-sliding-gate.glb)。 |
| [整段赛道试模](commonplay/bubbleport/track-studies/) | 3 | 错位障碍、摆锤、回环的高模测试件。[验证记录](../track-redesign-validation/) |
| [绗缝跑道](commonplay/track-parts/) | 1 | 软垫跑道部件。 |
| [风港快递](commonplay/windport/) | 2 | 港口场景和快递员。 |
| [历史制作中间件](commonplay/work-in-progress/) | 13 | 保留减面、动画和验证阶段的版本，来源见清单。 |

## 泡泡星港护栏怎么选

- 广场、站台等景观边界可直接放置 [16 号广场围栏 GLB](commonplay/bubbleport/scenery/runtime/16-plaza-railing.glb)。造型为双立柱、双横杆和金色柱帽。[四视图与设计说明](../bubbleport-model-references/16-plaza-railing/README.md)
- 赛道边界复用[程序护栏](../../bubbleport-segment-designs/kit.mjs)，沿路线生成顶管和立柱，下坡可启用连续侧壁。三个样段已有对应的[直道、下坡与弯道配置](../../bubbleport-segment-designs/segments/)。试玩可参考[边界几何与碰撞](../../bubbleport-demo/dist/course.mjs)；设计台的几何预览本身不验证通行。
- 薄荷树脂、金属接头和灯罩的表面可用[自制材质库](../bubbleport-course-resources/materials/README.md)。概念图中的连续护壁与广场双横杆用途不同，制作首版可沿用上述两套结构。

## 盘点范围

纳入工作树和本机 .local 制作目录中可直接读取、含网格的独立模型。依赖包、部署压缩包、第三方游戏数据包、纯材质 glTF 样本和参考图不计入模型数。归档保留实际模型文件，各试玩仍从原路径读取。归档日期之后对源文件的修改需重新同步。第三方采样运行时与研究证据沿用原目录的来源说明。

在仓库根目录运行 `python3 -m http.server 8893 --bind 127.0.0.1`，即可打开[模型材质编辑器](http://127.0.0.1:8893/model-editor/)。可按名称或编号搜索模型，选择材质槽并调整贴图，修改自动保存在当前浏览器，也可导出 GLB。
