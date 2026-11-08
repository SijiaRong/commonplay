# Commonplay

一个面向 **3D 双人游戏**的开源探索项目，起步于 AI Hacker House 黑客松。当前分别调研纯合作与纯对战两条候选路线，最终选择其中一条。

An open-source 3D two-player game project started at AI Hacker House. Research explores co-op and versus as separate alternatives; the prototype will focus on one direction.

“Commonplay” 是中性工作名称，暂不限定世界观、美术风格或最终玩法。

## 当前状态

项目处于调研与原型定义阶段，尚无可运行的游戏；引擎、平台、联网方案和 AI 玩法均未确定。

## 调研与原型方向

- [市场案例与机制分析](docs/market-research.zh-CN.md)：成功案例、来源、双人适配与黑客松范围建议。
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
