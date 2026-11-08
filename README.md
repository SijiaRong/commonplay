# Commonplay

一个起步于 AI Hacker House 黑客松的 **3D 派对竞速闯关游戏**项目。已确认以 Lost Marbles、蛋仔派对等为玩法参考，继续定义滚动操控、障碍挑战与玩家互动。

An open-source 3D party racing and obstacle-course game project started at AI Hacker House, researching games such as Lost Marbles and Eggy Party.

“Commonplay” 是中性工作名称，暂不限定世界观、美术风格或最终玩法。

## 当前状态

截至 2026-11-08，已确认派对竞速闯关这一类型，已提供小熊滑梯、风港快递、泡泡星港和赛道实验室四个可运行原型。引擎、目标平台、实际人数、联网方案、是否采用弹珠角色及局内升级均未最终确定。

此前条件为开发时间半天、Hi3D 生成额度充足、团队可使用 Godot 或 Three.js；暂作为规划背景保留，不能据此承诺完整多人游戏的交付时间。此前 Godot 双人搬运、1v1 弹道对战等方案归档为历史候选，不再代表当前方向。

## 队友本地试玩

- **泡泡星港 UI 实验室**：在仓库根目录运行 `python3 -m http.server 8926 --bind 127.0.0.1`，打开[实验室](http://127.0.0.1:8926/bubbleport-ui-lab/)。可切换准备、竞速、结算，调节玻璃模糊与悬浮动效。

- **泡泡星城**：小熊滑滑梯的独立分支，使用暖木工作室六面天空盒、象牙涂层路面和薄荷树脂构件。在单人闯关中打开「材质编辑」可按关卡、赛段和组件调整材质。[运行说明](bubblecity-teddy-slide/README.md)。
- **小熊滑滑梯**：在仓库根目录运行 `python3 -m http.server 8080 --directory teddy-playground/dist`，打开 [localhost:8080](http://localhost:8080)。默认单人闯关使用 WASD 移动、空格跳跃、R 复位。用鼠标点击开始或比赛画面即可隐藏光标并转动视角，按 Option / Alt 或 Esc 释放，再点画面继续。标准手柄左摇杆移动、右摇杆转视角，底部键（A / ×）跳跃、左侧键（X / □）用技能、顶部键（Y / △）复位。第一关「玩具门廊」从软垫起跑，穿过移门和积木桩，沿直滑梯下到钟摆锤廊和波浪地板，再绕 180° 回旋滑梯下到矮栏和终点门廊。[关卡拆解与里程](docs/fall-beans-course.zh-CN.md)记录了参考来源。顶部「经典滑梯」可进入原版滑行。在起点点「换个人物」可从[十只玩偶](assets/toy-town-personas/README.md)中选择。
- **风港快递**：按[局域网启动说明](rooftop/README.md)准备运行时、安装依赖并加入房间。
- **泡泡星港**：在仓库根目录运行 `python3 -m http.server 8891 --directory bubbleport-demo/dist`，打开 [localhost:8891](http://localhost:8891)。独立测试错位障碍、摆锤、回环与旁路，支持 16 / 19.2 净宽对比，详见[试玩与物理检查](bubbleport-demo/README.md)。
- **赛道实验室**：在仓库根目录运行 `python3 -m http.server 8892 --directory teddy-track-lab/dist`，打开 [localhost:8892](http://localhost:8892)。复用小熊角色与渲染，试玩三类程序路段，详见[操控与来源](teddy-track-lab/README.md)。
- **[泡泡星港 · 环港线](bubbleport-circuit/README.md)**：16 件星港设施、三段连续赛道与小熊滑滑梯工作室天空盒，可从起点沿线漫游到终点。
- **泡泡星港路段设计台**：三个子代理分别设计「苏打验票廊」平地关卡、「苏打云瀑」滑梯和「土星领航湾」180° 回头弯；可旋转查看与导出图片，尚未接入试玩物理。见[设计说明与预览入口](bubbleport-segment-designs/README.md)。
- **泡泡星港材质实验台**：用简单几何体比较路面、树脂、软胶、黄铜、铝、亚克力与发光灯；支持日夜切换、材质调参和独立检查发光/受光/光晕，见[预览与说明](bubbleport-material-lab/README.md)。
- 材质资源沿用统一标本室分类：Lost Marbles 研究材质位于 `material-atlas/dist/lm/`；本轮泡泡星港原创材质的唯一主源位于[原创资源目录](material-atlas/dist/original/bubbleport/index.html)，实验台与赛段归档引用同一份源码和纹理。V2提供亮面路面、软胶散射与回弹、同光照旧参数对照。
- [泰迪熊模型与同机位对比图](assets/teddy-bear/)、[Blender 轻量化与绑骨脚本](tools/blender/)和[人偶竞速设计文档](docs/humanoid-racing-mvp.zh-CN.md)可供后续迭代。

## 资源与文档导航

[全仓库 3D 模型库](assets/model-library/README.md)按 Lost Marbles 与 Commonplay 原创分组，可直接取用模型或查询全部来源路径。

[仓库材质与纹理合集](assets/material-library/README.md) 按 Lost Marbles 来源与 Commonplay 项目整理，含独立贴图、模型材质槽和程序材质。可在[在线来源索引](https://commonplay-surface-atlas.rongsijia.chatgpt.site/library/)检索。

| 内容 | 入口 |
|---|---|
| 泡泡星港六段采用版设计图、三段结构图、八种材质与 28 张纹理 | [资源总览](assets/bubbleport-course-resources/index.html) · [目录说明](assets/bubbleport-course-resources/README.md) · [ZIP](assets/bubbleport-course-resources-v1.zip) |
| 二十只玩偶设定、概念图、三视图与动作参考；其中十只已接入试玩 | [角色档案](assets/toy-town-personas/README.md) |
| 初代三角色模型、原始生成记录与模型检查图 | [模型目录](assets/toy-town-models/README.md) |
| 三种角色概念设计板 | [概念图目录](assets/toy-town-concepts/) |
| 泡泡星港设施建模参考、零件图片与打包文件 | [参考目录](assets/bubbleport-model-references/README.md) · [参考图 ZIP](assets/bubbleport-model-references.zip) · [零件 ZIP](assets/bubbleport-components-v2.zip) |
| 宽版赛道原始模型、预览与验证结论 | [资源目录](assets/track-redesign-validation/) · [验证文档](docs/track-redesign-validation.zh-CN.md) |
| 玩具市场与材质方向调研 | [市场调研](docs/toy-market-research.zh-CN.md) · [毛绒](docs/toy-design-plush.zh-CN.md) · [机器人](docs/toy-design-robot.zh-CN.md) · [软胶](docs/toy-design-vinyl.zh-CN.md) · [泡泡星港](docs/bubbleport-toy-research.zh-CN.md) |

模型、图片和试玩运行资源随仓库保存。旧小熊和初代模型目录中的相对软链接指向本仓库的角色档案；运行时所需文件仍保留在各 demo 的 `dist/` 内。下载时请保留目录结构；原始高精度模型和参考图片会增加克隆体积。

在仓库根目录运行物理回归检查：

```sh
node --test bubbleport-demo/tests/physics.test.mjs teddy-track-lab/tests/physics.test.mjs
```

## 调研与原型方向

- **[当前方向与派对游戏调研](docs/party-racing-research.zh-CN.md)**：已确认事项、10 款竞品、机制比较、原型建议和待决策项。
- **[玩具城三种角色概念](docs/toy-town-character-directions.zh-CN.md)**：毛绒飞鼠、木制发条机器人、软胶怪萌玩偶的设计板与独立玩具市场调研。三者已通过 Hi3D 建模并加入小熊 demo 的人物选择，见[模型、共用动作与接入说明](docs/toy-town-model-integration.zh-CN.md)。
- **[Lost Marbles 技术拆解](docs/lost-marbles-tech-analysis.zh-CN.md)**：根据公开加载源码确认渲染、物理、赛道生成、联机与资源方案。
- **[Lost Marbles 五关高清赛道图库](assets/lost-marbles/)**：每关三张 3200 × 4000 大图，包含完整路线俯视、斜向全景和机关特写，以及五关同场全景。
- **[Lost Marbles 赛道生成机制](docs/lost-marbles-course-generation.zh-CN.md)**：生成流程图、五关参数、22 类普通模块、特殊段与岔路规则，以及真实种子的拼装示例。
- 首版先验证操控、障碍、胜负与重开闭环；小人数房间、机器人补位、分轮淘汰或积分、局内升级均为待评估建议。
- Hi3D 可用于外观和装饰；碰撞体、关键赛道尺寸与玩法逻辑应单独控制。

## 历史调研与候选方案

下列资料保留供参考；其中的双人限制、首选路线与引擎推荐不代表当前已确认要求。

- [市场案例与机制分析](docs/market-research.zh-CN.md)：成功案例、来源、双人适配与黑客松范围建议。
- [按 3D 资源选型](docs/asset-driven-directions.zh-CN.md)：结合黑客松 3D 主题，比较现成场景、角色、动画与道具的可用性。
- [Hi3D 半天原型方案](docs/half-day-hi3d-plan.zh-CN.md)：最新约束下的首选与备选、资源清单、时间安排和验收标准。
- [Poki 双人试玩清单](docs/browser-playlist.zh-CN.md)：仅保留 Poki，合作与对战分别列出，注明 3D / 2D 与设备要求。
- [Punchers 技术栈分析](docs/punchers-tech-analysis.zh-CN.md)：从实际加载配置确认引擎与 Web 构建，并区分物理实现推断与未知项。
- [Lost Marbles REA 逆向分析](docs/lost-marbles-rea-analysis.zh-CN.md)：公开交付脚本、程序化赛道、弹珠材质、物理与联机协议，以及真实浏览器和本地模拟验证。

## 本地获取

```sh
git clone https://github.com/SijiaRong/commonplay.git
cd commonplay
```

## 参与与许可

欢迎通过 Issue 提出玩法、原型反馈和技术建议。项目采用 [MIT License](LICENSE)；后续引入的第三方代码、美术和音频需分别核验许可。调研中的游戏名称及其素材归各权利人所有；小熊滑梯试玩包含源自 Lost Marbles 的赛道和渲染资源。

第三方游戏调研与逆向分析内容仅供学习、研究和技术交流使用，不作商业用途。相关游戏、商标、源码及素材的权利归各自权利人所有，本项目不主张对其拥有权利，也不通过本项目的 MIT 许可授予第三方内容的使用权。如认为相关内容涉及版权或其他权利问题，请随时通过 [GitHub Issues](https://github.com/SijiaRong/commonplay/issues) 联系我们，我们将及时核实并删除相关内容。

[模型材质编辑器](model-editor/index.html)读取统一模型库与纹理库。仓库根目录启动静态服务后，访问 `/model-editor/` 可按编号查找模型、编辑材质槽并导出 GLB。
