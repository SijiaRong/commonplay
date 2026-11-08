# Commonplay

一个起步于 AI Hacker House 黑客松的 **3D 派对竞速闯关游戏**项目。已确认以 Lost Marbles、蛋仔派对等为玩法参考，继续定义滚动操控、障碍挑战与玩家互动。

An open-source 3D party racing and obstacle-course game project started at AI Hacker House, researching games such as Lost Marbles and Eggy Party.

Commonplay 是项目名称，主线游戏定名为《泡泡星港》。

## 正式部署版本

**泡泡星城**是原「小熊滑滑梯」的正式名称。阿里云测试服使用本仓库 `teddy-playground/` 下的游戏和派对服务器，发布入口为 [泡泡星城](https://actionl.ink/bubbleport/)。`bubbleport-demo/` 是独立的「泡泡星港」赛道原型。更新测试服时，请从 `teddy-playground/server/` 运行服务，并将入口及其 WebSocket 请求转发到同一服务。[服务器运行说明](teddy-playground/server/README.md)

## 当前状态

截至 2026-11-08，已确认派对竞速闯关这一类型，已提供小熊滑梯、风港快递、泡泡星港和赛道实验室四个可运行原型。

已确定：以小熊滑滑梯为主线，最终赛道做成泡泡星港风格；先做网页（含手机浏览器）；一个人也能开局，房间最多 16 人、首版 4 人；积分制，五关不淘汰；先在局域网运行，之后部署到国内服务器。玩法引擎、选卡与装备沿用现有实现。

此前条件为开发时间半天、Hi3D 生成额度充足、团队可使用 Godot 或 Three.js；暂作为规划背景保留，不能据此承诺完整多人游戏的交付时间。此前 Godot 双人搬运、1v1 弹道对战等方案归档为历史候选，不再代表当前方向。

## 队友本地试玩

[泡泡星港 试玩与开服说明](bubblecity-teddy-slide/README.md)

- **小熊滑滑梯 · 多人派对版**：按[局域网服务器说明](teddy-playground/server/README.md)在一台电脑上运行 `npm install && npm start`，同一 Wi-Fi 下的手机和电脑打开终端里的地址，创建房间或输入房间码加入。1～4 人（可配到 16 人），可加机器人补位，五关积分制，支持手机触控。
- **小熊滑滑梯 · 单人**：在仓库根目录运行 `python3 -m http.server 8080 --directory teddy-playground/dist`，打开 [localhost:8080](http://localhost:8080)。可选机器人陪跑；WASD 移动、空格跳跃、R 复位。第一关「玩具门廊」从软垫起跑，穿过移门和积木桩，沿直滑梯下到钟摆锤廊和波浪地板，再绕 180° 回旋滑梯下到矮栏和终点门廊。[关卡拆解与里程](docs/fall-beans-course.zh-CN.md)记录了参考来源。顶部「经典滑梯」可进入原版滑行。在起点点「换个人物」可从[十只玩偶](assets/toy-town-personas/README.md)中选择。
- **风港快递**：按[局域网启动说明](rooftop/README.md)准备运行时、安装依赖并加入房间。
- **泡泡星港**：在仓库根目录运行 `python3 -m http.server 8891 --directory bubbleport-demo/dist`，打开 [localhost:8891](http://localhost:8891)。独立测试错位障碍、摆锤、回环与旁路，支持 16 / 19.2 净宽对比，详见[试玩与物理检查](bubbleport-demo/README.md)。
- **赛道实验室**：在仓库根目录运行 `python3 -m http.server 8892 --directory teddy-track-lab/dist`，打开 [localhost:8892](http://localhost:8892)。复用小熊角色与渲染，试玩三类程序路段，详见[操控与来源](teddy-track-lab/README.md)。
- [泰迪熊模型与同机位对比图](assets/teddy-bear/)、[Blender 轻量化与绑骨脚本](tools/blender/)和[人偶竞速设计文档](docs/humanoid-racing-mvp.zh-CN.md)可供后续迭代。

## 资源与文档导航

| 内容 | 入口 |
|---|---|
| 二十只玩偶设定、概念图、三视图与动作参考；其中十只已接入试玩 | [角色档案](assets/toy-town-personas/README.md) |
| 初代三角色模型、原始生成记录与模型检查图 | [模型目录](assets/toy-town-models/README.md) |
| 三种角色概念设计板 | [概念图目录](assets/toy-town-concepts/) |
| 泡泡星港设施建模参考、零件图片与打包文件 | [参考目录](assets/bubbleport-model-references/README.md) · [参考图 ZIP](assets/bubbleport-model-references.zip) · [零件 ZIP](assets/bubbleport-components-v2.zip) |
| 宽版赛道原始模型、预览与验证结论 | [资源目录](assets/track-redesign-validation/) · [验证文档](docs/track-redesign-validation.zh-CN.md) |
| 宣传片脚本、分镜、参考截图与整片渲染脚本 | [宣传片](promo/README.md) · [分镜](promo/storyboard.zh-CN.md) |
| 赛道资源、可下载素材包与校验值 | [赛道素材](assets/bubbleport-course-resources/) · [ZIP](assets/bubbleport-course-resources-v1.zip) · [SHA-256](assets/bubbleport-course-resources-v1.zip.sha256) |
| 公用模型、材质和音乐 | [模型库](assets/model-library/) · [材质库](assets/material-library/) · [音乐](assets/bubbleport-music/) |
| 素材浏览、编辑与制作工具 | [材质图集](material-atlas/) · [模型编辑器](model-editor/) · [制作脚本](tools/) |
| 滑道、环线和赛段原型代码 | [泡泡星城滑道](bubblecity-teddy-slide/) · [环线](bubbleport-circuit/) · [赛段设计](bubbleport-segment-designs/) · [土星滑道](saturn-slide-mvp/) |
| 材质与界面实验代码 | [材质实验](bubbleport-material-lab/) · [界面实验](bubbleport-ui-lab/) |
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
