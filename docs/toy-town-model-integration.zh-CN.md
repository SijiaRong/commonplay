# 玩具城人物：Hi3D 建模与 demo 接入

2026-11-08。PIP、TIK、WOB 均通过 Hi3D MCP 生成，使用 v3.0 高质、模型与 PBR 贴图、私有 GLB。每个 45 积分，共 135 积分。未重复提交建模任务。

## 试玩与选择

在仓库根目录运行：

```sh
python3 -m http.server 8080 --directory teddy-playground/dist
```

- 默认单人闯关：`http://localhost:8080/`。
- 原有经典滑梯：`http://localhost:8080/?mode=yard`。
- 在起点或完成后的「换个人物」中选择。可选择十只玩偶，完整清单见[角色设定总索引](../assets/toy-town-personas/README.md)。
- 选择保存在本机浏览器。默认单人模式在起点切换角色时沿用当前赛道与模拟进程，完赛后切换会重新开局。加载失败保留原人物，旧人物的几何、材质、贴图和骨骼纹理在替换后释放。
- 经典滑梯的终点展示镜头限制在护栏内侧，避免庆祝动作被护栏挡住。

## 六只新增玩偶

阿扣、翻面、碰铃、准星、一圈和屉屉分别使用首版设定板中的单角色裁图生成。六个私有 Hi3D v3.0 高质 PBR 任务各 45 积分，共 270 积分。每只玩偶的原始模型、参考图、任务编号和模型页保存在各自的[角色文件夹](../assets/toy-town-personas/README.md)。

六只玩偶复用小熊的九个动作名与时长，骨架按体型设置。翻面用翼骨表现滑翔，其余玩偶按双足或多足分配步态；一圈在入滑时翻身，让背部滚章接触赛道。亮片绘制、双人碰镲、动态气泡与赛道印迹属于后续交互设定。

重建其中一只时，从该角色的 `models/original.glb` 开始：

1. 用 gltfpack 1.3 执行高模预精简，参数为 `-si 0.012 -sp -se 0.18 -noq`。
2. 以预精简 GLB 作为输入运行 `tools/blender/prepare_toy.py`，输出 `models/game.glb`，最后两个参数为朝向角度 0 和最大水平跨度 1.55。这样鳐鱼展开双翼时也能放进游戏镜头。
3. 用 `tools/render-toy-review.cjs` 查看四个方向。确认材质、轮廓及朝向后，在静态模型检查记录标记 `visualReviewPassed`。
4. 在 Blender 中运行 `tools/blender/rig_persona.py -- 静态模型 动画模型 角色ID`。游戏使用 `teddy-playground/dist/characters/<角色ID>-animated.glb`。
5. 使用下方的动画 GLB 和浏览器检查命令验证，更新角色卡内的检查记录与选角头像。

## PIP、TIK、WOB 的模型与动作

| 角色 | 游戏三角面 | 动画 GLB 大小 | 差异动作 |
|---|---:|---:|---|
| PIP 兜兜飞鼠 | 23,999 | 约 5.4 MiB | 跳跃时小幅摆翼，减少独立头部扭动以保护头身衔接 |
| TIK 滴克 | 23,999 | 约 6.6 MiB | 独立发条骨骼，助跑与庆祝时转动 |
| WOB 歪团 | 21,889 | 约 3.7 MiB | 起跳预备、腾空和落地的压扁拉伸；短臂采用较小摆幅 |

九个基础动作共用原小熊的动作来源、名称和时间长度：`Idle`、`Run`、`Jump`、`Slide`、`SlideLeft`、`SlideRight`、`SitDown`、`StandUp`、`FinishWave`。新角色按自己的身体比例建立同名骨架并重定向，调整摆幅和权重，没有直接把小熊网格或骨架尺寸套上去。原小熊的动作和毛绒表现保留。

游戏文件位于 [`teddy-playground/dist/characters/`](../teddy-playground/dist/characters/)。人物清单在 [`characters.json`](../teddy-playground/dist/slide/characters.json)，共用动作驱动在 [`rider.js`](../teddy-playground/dist/slide/rider.js)。身体外观不改变速度、赛道控制或单人模式的碰撞参数。

## 模型检查与修复

先检查静态网格，再添加绑定和差异动作。三个原始模型均约 200 万三角面、8K 贴图，缺少显式法线；游戏版精简至约 2.2–2.4 万面、2K 贴图并重建平滑法线。处理 UV 接缝时保留原有面朝向，避免开放 UV 岛被错误翻面而产生可见缺口。

- PIP：保留脸、翼膜和卷尾；收紧尾巴的前后厚度，避免过度伸向镜头。
- TIK：缩短生成模型中过长的发条轴；木头、脸、按钮、短脚与金属发条保留。
- WOB：删除生成器补出的多余尾巴，封闭切口并从干净的身体区域取色；背面保留同色封口面。
- 对正面、侧面、背面、三分之四视图，以及滑行和跳跃姿态进行检查。结构校验覆盖位置、法线、UV、索引、内嵌贴图、有限数值、蒙皮权重和九个动画片段。

静态与滑行动作检查图位于 [`assets/toy-town-models/`](../assets/toy-town-models/)。概念画、AI 生成模型与游戏精简版之间存在造型差异；这是一套可试玩的原型资产，并非精雕生产模型。

## 来源与可复现流程

- [PIP 的 Hi3D 模型页](https://www.hi3d.ai/3d-model/c7e67ae289454e80a8221774c469b914)
- [TIK 的 Hi3D 模型页](https://www.hi3d.ai/3d-model/2cbf0120e832472c90b46638b1ddaaa4)
- [WOB 的 Hi3D 模型页](https://www.hi3d.ai/3d-model/091bd72af5d1482ca821eae096f8b059)

原始 GLB、单角色参考图、任务和来源记录保存在 `assets/toy-town-models/`。运行时只使用 `teddy-playground/dist/` 下的文件。

使用 Blender 4.5，按单个角色依次运行下列步骤；高面数处理建议串行，以降低内存压力：

1. `tools/blender/prepare_toy.py`：从原始 GLB 规范尺寸、精简和缩小贴图，输出静态 GLB 与检查记录。
2. `tools/blender/polish_toy.py`：修整轮廓、重建法线、处理接缝与封口。该步骤只对新准备的静态模型运行一次。
3. `tools/render-toy-review.cjs` 配合 `tools/toy-model-review.html`：从仓库根目录启动本地 HTTP 服务，生成四方向检查图。人工检查通过后更新对应 `.inspection.json` 的 `visualReviewPassed`。
4. `tools/blender/rig_toy.py`：仅接收已通过静态检查的模型，重定向共用动作并补充上述差异动作。
5. `node tools/check-character-glb.cjs <动画GLB> --animated`：校验游戏 GLB。
6. `DEMO_URL='http://localhost:8080/?mode=yard' node tools/check-toy-town.cjs`：检查经典滑梯中的所有可选人物、真实模型切换、跳跃、转向、终点与重开，以及持久化、失败回退、手机触控和默认单人入口的人物选择。

浏览器检查需要本机 Chrome 与 `playwright-core`，可通过 `PLAYWRIGHT_MODULE` 指定模块路径；模型检查工具不需要额外 Node 依赖。四方向渲染使用仓库根目录的服务，并通过 `REVIEW_URL` 指定地址。
