# Commonplay

一个起步于 AI Hacker House 黑客松的 **3D 派对竞速闯关游戏**项目。已确认以 Lost Marbles、蛋仔派对等为玩法参考，继续定义滚动操控、障碍挑战与玩家互动。

An open-source 3D party racing and obstacle-course game project started at AI Hacker House, researching games such as Lost Marbles and Eggy Party.

“Commonplay” 是中性工作名称，暂不限定世界观、美术风格或最终玩法。

## 当前状态

截至 2026-11-08，已确认派对竞速闯关这一类型，已提供小熊滑梯和风港快递两个可运行原型。引擎、目标平台、实际人数、联网方案、是否采用弹珠角色及局内升级均未最终确定。

此前条件为开发时间半天、Hi3D 生成额度充足、团队可使用 Godot 或 Three.js；暂作为规划背景保留，不能据此承诺完整多人游戏的交付时间。此前 Godot 双人搬运、1v1 弹道对战等方案归档为历史候选，不再代表当前方向。

## 队友本地试玩

- **小熊滑滑梯**：在仓库根目录运行 `python3 -m http.server 8080 --directory teddy-playground/dist`，打开 [localhost:8080](http://localhost:8080)。A/D 转向，W/S 加减速，空格跳跃。页面、模型、贴图和渲染依赖都在仓库中。
- **风港快递**：按[局域网启动说明](rooftop/README.md)准备运行时、安装依赖并加入房间。
- [泰迪熊模型与同机位对比图](assets/teddy-bear/)、[Blender 轻量化与绑骨脚本](tools/blender/)和[人偶竞速设计文档](docs/humanoid-racing-mvp.zh-CN.md)可供后续迭代。

## 调研与原型方向

- **[当前方向与派对游戏调研](docs/party-racing-research.zh-CN.md)**：已确认事项、10 款竞品、机制比较、原型建议和待决策项。
- **[Lost Marbles 技术拆解](docs/lost-marbles-tech-analysis.zh-CN.md)**：根据公开加载源码确认渲染、物理、赛道生成、联机与资源方案。
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
