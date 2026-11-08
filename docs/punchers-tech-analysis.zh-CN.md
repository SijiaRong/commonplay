# Punchers 技术栈分析

核验：2026-11-08。对象是 [Poki 的 Punchers](https://poki.com/zh/g/punchers)本次实际加载的构建，不代表其他平台或更新版本。通过浏览器读取游戏 iframe 的 HTML 加载脚本，再读取其公开构建 JSON；没有获取游戏源码或反编译二进制。

## 直接确认的部分

| 层次 | 结论 | 直接证据 |
| --- | --- | --- |
| 引擎 | Unity 2019.3.3f1 | iframe 配置的 loader 为 unity，unityVersion 为 2019.3.3f1；构建 JSON 中版本一致 |
| 发布目标 | Unity WebGL | 加载器为 unity.js，配置指向 Unity 构建 JSON |
| 程序运行 | WebAssembly + JavaScript 框架 | 构建配置明确列出 wasmCodeUrl、wasmFrameworkUrl |
| 图形 API | 配置支持 WebGL 2.0 / WebGL 1.0 | graphicsAPI 数组包含两者；没有探测本次实际选择哪一种 |
| 资源打包 | Unity .data.unityweb 资源文件 | dataUrl 指向对应资源文件；未拆包确认模型或动画格式 |
| 平台接入 | Poki JavaScript SDK + iframe 包装 | 直接看到 poki-sdk.js、Poki 加载器和多层 iframe |
| 构建设置 | 非开发构建，配置未启用多线程 | developmentBuild 与 multithreading 均为 false |
| 双人模式 | 本地双人，有电脑对手 | Poki 官方游戏说明明确支持本地对决与电脑对战；不能据此推断整个网站没有后端 |

### 原始证据入口

- [实际游戏 HTML](https://094c4b1e-a024-4d01-bd2a-0b6237eaf8b1.gdn.poki.com/c5fadc9a-ab1d-459f-91a3-4e616274056e/index.html)
- [构建 JSON](https://094c4b1e-a024-4d01-bd2a-0b6237eaf8b1.gdn.poki.com/c5fadc9a-ab1d-459f-91a3-4e616274056e/Build/Punchers%20Poki.json)

地址为本次加载版本的公开 CDN 路径，可能在平台更新后变化；游戏 HTML 的独立访问也可能受嵌入上下文影响。本次在 Poki 的实际嵌入页面读取加载脚本，并通过 HTTP 成功取得构建 JSON。

关键配置摘录：

```json
{
  "unityVersion": "2019.3.3f1",
  "graphicsAPI": ["WebGL 2.0", "WebGL 1.0"],
  "multithreading": false
}
```

Unity 的 [WebGL 构建文档](https://docs.unity3d.com/2019.3/Documentation/Manual/webgl-building.html)可解释这些构建文件的角色；不要将 Poki 外层网页所用的前端框架直接当作游戏引擎。

## 推断与未知

- **游戏逻辑语言很可能为 C#。** 这是 Unity 的常见开发方式；未取得源码，不能把脚本语言、代码结构或插件清单当成已核验事实。
- **很可能使用 Unity 内置 3D 物理。** Unity 2019.3 的内置 3D 物理基于 PhysX，见 [官方物理文档](https://docs.unity3d.com/2019.3/Documentation/Manual/PhysicsSection.html)。但当前证据不能排除自定义物理或插件，不能直接确认 Punchers 的每个物理组件。
- **布娃娃效果可以确认，具体控制算法未知。** Poki 官方描述明确提及 ragdoll physics。用多刚体、关节和姿态驱动实现拳手是一种合理方案，但尚不能确认是否为 active ragdoll、是否用了 ConfigurableJoint、PD 控制、IK 或 PuppetMaster 等插件。
- **渲染管线、制作工具与素材来源未知。** 没有足够证据判断 Built-in / URP / HDRP，也不能据外观判断使用 Blender、Maya、Mixamo 或某个资源包。
- **后端与 AI 算法未知。** 本地对战不需要远程同步两个玩家，但不能据此声称没有统计、广告或保存服务；电脑拳手的具体决策方式没有源码证据。

## 对半天原型的意义

这个案例说明 Unity 可以将物理驱动的 3D 双人对战发布到浏览器；它并不能证明同等质量能在半天内完成。其最难复制的部分是身体控制、稳定性与命中反馈，而不是网页包装或角色外观。

若团队决定借鉴拳击方向，优先沿用熟悉的 Godot，先做两个简化身体、各一个拳头碰撞体、左右出拳、轻微倾斜躲避、生命值和重开；身体先固定站位或限制移动，避免首版依赖完整布娃娃。Hi3D 用于拳手外观或机器人部件，碰撞和运动由简化节点控制。

这只是可实现结构建议，不是对 Punchers 源码的复述；是否改做拳击尚未确定，不因为参考作品使用 Unity 就要求团队临时切换引擎。
