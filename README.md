# Commonplay

一个面向 **3D 双人游戏**的开源探索项目，起步于 AI Hacker House 黑客松。当前分别调研纯合作与纯对战两条候选路线，最终选择其中一条。

An open-source 3D two-player game project started at AI Hacker House. Research explores co-op and versus as separate alternatives; the prototype will focus on one direction.

“Commonplay” 是中性工作名称，暂不限定世界观、美术风格或最终玩法。

## 当前状态

项目处于调研与原型定义阶段，尚无可运行的游戏；引擎、平台、联网方案和 AI 玩法均未确定。

最新约束：开发时间半天，Hi3D 生成额度充足，团队可使用 Godot 或 Three.js。当前建议 Godot 本地双人合作原型，尚未最终选定玩法或开始实现。

## 调研与原型方向

- [市场案例与机制分析](docs/market-research.zh-CN.md)：成功案例、来源、双人适配与黑客松范围建议。
- [按 3D 资源选型](docs/asset-driven-directions.zh-CN.md)：结合黑客松 3D 主题，比较现成场景、角色、动画与道具的可用性。
- [Hi3D 半天原型方案](docs/half-day-hi3d-plan.zh-CN.md)：最新约束下的首选与备选、资源清单、时间安排和验收标准。
- [Poki 双人试玩清单](docs/browser-playlist.zh-CN.md)：仅保留 Poki，合作与对战分别列出，注明 3D / 2D 与设备要求。
- 当前优先考虑易导入、少动画、简单碰撞的玩法；Hi3D 负责视觉资产，首版优先验证固定规则下的双人可玩闭环。
- 优先验证一个能在 3–5 分钟内完整体验的双人核心循环。
- 合作候选：非对称信息解谜、互补能力闯关、双人协调操作。
- 对战候选：1v1 空间博弈、弹道攻防或短回合竞技。
- 两条路线独立比较，原型只选其中一条，不同时实现合作与对战。
- 先使用简单几何体完成可玩闭环，再决定引擎、美术投入和联网范围。

以上为待验证方向，不代表已经确定的产品需求。

## 本地获取

```sh
git clone https://github.com/SijiaRong/commonplay.git
cd commonplay
```

## 参与与许可

欢迎通过 Issue 提出玩法、原型反馈和技术建议。项目采用 [MIT License](LICENSE)；后续引入的第三方代码、美术和音频需分别核验许可。调研中的游戏名称及其素材归各权利人所有，仓库不包含这些游戏的资源。
