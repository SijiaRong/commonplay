# Lost Marbles 技术拆解

检查日期：2026-11-08。对象：[Lost Marbles 在线页面](https://meticulai.com/games/lost-marbles/)。基于页面 HTML 和公开加载的 JavaScript 源码；未取得服务端项目，也未进行完整多人实测。线上文件未固定到发布版本，未来可能变化。

完整场景与机关外观可对照 [REA 逆向分析中的五关高清图](lost-marbles-rea-analysis.zh-CN.md#full-course-gallery)：包含五关同场全景，以及每关的完整路线俯视、斜向全景和三个机关特写。图片对应固定种子 `20261108`，用于结构分析。

另见[34 类独立路段模块图录](lost-marbles-module-atlas.zh-CN.md)：每类一张 4096 × 3072 大图，展示完整路段和机关结构。

## 核实结论

| 层次 | 公开文件支持的结论 | 主要证据 |
| --- | --- | --- |
| 页面与 UI | 原生 HTML、CSS、JavaScript，ES Modules；Import Map 映射本地 vendor/three；菜单由 DOM 与事件驱动 | 页面、js/main.js |
| 渲染 | Three.js r186，THREE.WebGLRenderer | vendor/three/three.core.js 中 REVISION = '186'；js/render/scene.js |
| 物理 | 自研 JavaScript 模块；60Hz；每 tick 4 次子步进；球与盒体、圆柱、旋转曲面、螺旋曲面等碰撞 | shared/physics.js |
| 赛道 | 一个随机种子生成五阶段赛道，输出碰撞体、视觉描述、路径、分叉、起点及终点 | shared/course.js |
| 联机 | 原生 WebSocket；JSON 控制消息、二进制状态快照；协议注明世界快照 20Hz | js/net.js、shared/protocol.js |
| 客户端同步 | 自身预测、收到权威状态后重放未确认输入；其他弹珠用快照插值 | js/game.js |
| 单人模式 | 在页面内运行同一 ShowSession；比赛模拟逻辑前后端共享 | js/net.js、shared/session.js、shared/sim.js |
| 音频 | Web Audio API；真实滚动、碰撞录音与合成音效，音量及音高响应模拟状态 | js/audio.js |
| 本地档案 | localStorage 保存等级、贴纸、卡组、皮肤与设置 | js/profile.js |

公开源码足以确认以上实现。没有发现必须依赖 React/Vue 的页面实现；不能据此前端检查确认所有服务端依赖、构建工具或部署栈。

## 真实感如何实现

### 摄影环境、光照与投影

房间使用 Poly Haven 的 CC0 全景照片与 HDR，而非把整个房间建成复杂模型。GroundedSkybox 将全景地面投影为赛道下面的平面；HDR 经 PMREM 处理提供环境光和反射，主光方向匹配照片亮源，透明阴影接收面将实时物体阴影叠到照片地板。

背景照片和用于照明的 HDR 分开加载。移动设备使用更低分辨率的全景与纹理，降低下载及显存需求。

### 弹珠的玻璃和内部花纹

使用 Three.js 物理材质，并注入 GLSL：视线折射入球体后进行光线步进，程序生成猫眼、旋涡、星云、气泡等内部图案，再模拟透过玻璃的房间倒像。不是简单在球表面贴一张花纹图片。

50 颗弹珠采用实例化批量绘制；“一次实例化绘制”描述弹珠主体合批，不代表整个画面连阴影、特效和后处理总共只有一次 draw call。

### 木材与镜头

木材使用颜色、法线、粗糙度扫描贴图与物理材质，彩色积木仍保留木纹并加入清漆效果。后处理按画质组合 GTAO、移轴景深、Bloom、AgX 调色、颗粒、暗角及色差，形成微缩玩具摄影感。

高、中、低画质采用不同像素比、阴影分辨率、抗锯齿和后处理开关；还包含动态分辨率、低频阴影更新与移动端帧率控制。

## 比赛与网络结构

- 每场 50 颗弹珠，5 个阶段；前四次检查点分别淘汰 10 个，最后 10 个争冠。
- 开场从 6 个升级中保留 3 个；检查点后幸存者再选升级。局内能力变化与局外卡组、皮肤和成长是不同层次。
- 生成相同赛道靠共享种子和生成逻辑，不必传输完整三维网格。
- 权威模拟以 60Hz 推进；ShowSession 默认每 3 tick 发快照，即 20Hz；单人模式可使用不同快照间隔。
- 控制与事件使用 JSON；快照使用 ArrayBuffer/DataView，对其他弹珠位置、速度等量化编码。
- 自己的操作先预测，再按服务器确认的输入序号校正；其他弹珠用包含速度的快照插值，源码使用 Cubic Hermite。
- 物理数据以数字和数组实现，文件注明可运行于 Node、Workers 和浏览器；这只说明可复用性，不能据此确认线上是否使用 Worker 或具体 Node 服务框架。

## 对本项目的启发与限制

以下为设计判断，不是已经确定的技术方案：

1. 摄影全景搭配简单实时几何，可以减少环境制作量；摄像机活动范围、背景透视与可交互区域必须验证。
2. 简单碰撞与视觉网格分离，适合 Hi3D 外观资产接入；生成模型不能直接替代玩法碰撞与赛道尺寸设计。
3. 自研弹珠物理有利于共享预测，但完整碰撞、边界、同步与调试成本高；不能把参考项目的代码量当成半天可复现的证据。
4. 首版先用普通球体材质做好操控与赛道，玻璃内部光线步进和完整摄影后处理可后置。
5. 静态赛道按材质和空间块合并几何，动态障碍实例化，避免零件数量直接变成大量独立绘制。
6. 共享模拟不等于自动获得确定性与一致性；网络延迟、移动障碍、球间碰撞和预测校正仍需真实多人验证。

未核实项：线上服务端语言及框架、WebSocket 库、数据库、房间部署与扩容、反作弊、CDN、真实并发与成本。localStorage 只能证明所检查的本地档案实现，不能证明整个服务完全没有数据库。

## 源码入口

- [页面 HTML](https://meticulai.com/games/lost-marbles/)、[应用入口](https://meticulai.com/games/lost-marbles/js/main.js)、[Three.js 版本](https://meticulai.com/games/lost-marbles/vendor/three/three.core.js)。
- [渲染与后处理](https://meticulai.com/games/lost-marbles/js/render/scene.js)、[环境](https://meticulai.com/games/lost-marbles/js/render/env.js)、[弹珠](https://meticulai.com/games/lost-marbles/js/render/marbles.js)、[材质](https://meticulai.com/games/lost-marbles/js/render/materials.js)、[赛道绘制](https://meticulai.com/games/lost-marbles/js/render/courseView.js)。
- [物理](https://meticulai.com/games/lost-marbles/shared/physics.js)、[赛道生成](https://meticulai.com/games/lost-marbles/shared/course.js)、[比赛模拟](https://meticulai.com/games/lost-marbles/shared/sim.js)、[会话](https://meticulai.com/games/lost-marbles/shared/session.js)。
- [连接](https://meticulai.com/games/lost-marbles/js/net.js)、[客户端预测与插值](https://meticulai.com/games/lost-marbles/js/game.js)、[协议](https://meticulai.com/games/lost-marbles/shared/protocol.js)。
- [音频](https://meticulai.com/games/lost-marbles/js/audio.js)、[本地档案](https://meticulai.com/games/lost-marbles/js/profile.js)。

本仓库仅保存分析与链接，没有复制第三方代码或游戏资源。公开可访问不代表开源授权；如后续复用实现或素材，需分别核验其许可，不能将整个参考游戏默认按本仓库 MIT 许可使用。
