# 小熊动画历史核对

对照 Git 版本 `724e56e` 与当前 `teddy-track-lab/dist/teddy-bear-animated.glb`。

- Run、Idle、Jump 各 45 条动画通道的节点、插值、采样时间与输出二进制逐项一致。
- 骨架节点、逆绑定矩阵、网格位置/法线/UV、骨骼索引和权重均一致。
- Slide 有调整；当前新增 SlideLeft、SlideRight、SitDown、StandUp、FinishWave。
- 每个角色 GLB 自带骨架与动画。createRider 为每个模型创建独立 AnimationMixer 和动作表；切换成功后销毁旧模型的 mixer。共用动作名称与控制代码，不共用动画实例。
- 当前跑步播放速度按移动速度缩放至 0.45–1.35 倍，旧版原始播放器无此缩放。
- 新赛道适配器不播放 Run：Ready → SitDown → Slide → StandUp → FinishWave。经典滑梯仍含 Run 助跑与跑离。
- 新赛道 SitDown 在 min(0.7, duration) 秒被切到 Slide；坐姿偏移也使用独立平滑，而非动作时间。这是可疑的视觉衔接差异，尚未据此修改游戏。

浏览器同镜头、同材质、同归一化周期对照 Run，旧版与当前姿态一致，截图 run-before-now.jpg。Slide 截图 slide-before-now.jpg。

此次为调查，未修改或重新发布游戏。
