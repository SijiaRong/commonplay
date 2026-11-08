# 木制发条机器人「滴克 TIK」

实现更新：已完成 Hi3D 建模与 demo 接入，见[模型与动作说明](toy-town-model-integration.zh-CN.md)。下文保留原始概念阶段的设计记录。

原创角色概念，2026-11-08。用于玩具城游乐园主题竞速游戏的美术探索；未修改游戏实现，也不代表已完成可用的 3D 模型。

![滴克设计板](../assets/toy-town-concepts/robot-concept.png)

## 一句话设定

一个总想替大家检修游乐设施、却会把自己绕进赛道里的木制发条小机器人。它的魅力来自笨拙的认真：身体像小木桶，头像刷了砖红漆的积木，一只眼睛略大，跑起来总带着一点歪斜。

## 与 Lost Marbles 的视觉关系

已查看本仓库 `assets/lost-marbles/full-room.png` 与 `stage-1-3-details.jpg`。参考的是自然木纹、彩色小护栏、微缩玩具尺度、房间日光与柔和阴影。滴克延续这些材质和尺度关系，将赛道的木制拼装语言带到角色本身；脸和头部使用大色块，避免与木质地面融为一体。设计板中的游乐设施为原创情景示意，并非原游戏截图。

## 外观规范

- **轮廓**：矮胖、头大、四肢短。目标整体高宽比约 1.2，身体为倒角鼓形木桶，头为大圆角长方体。主图属于概念表达，精确比例以建模阶段统一的正交图为准。
- **记忆点**：不对称黑木珠眼、小刻线微笑、胸前一枚薄荷绿圆按钮、背后的黄铜蝴蝶发条钥匙。头顶至背面的一道奶油色宽条纹提供后视识别。
- **身体结构**：头身不设细长脖子；肩部为薄荷绿木圆盘，短木榫臂连接厚实木手套；藏蓝短脚贴近身体。不要增加长天线、尖锐齿轮、细电线等远景噪声。
- **表情**：眼睛主要通过头部俯仰表现好奇；保持木珠眼和刻线嘴的玩具质感，避免变成发光屏幕脸。
- **发条**：正式游戏模型中应做得比设计主图更短、更贴背，避免横向轮廓膨胀；仅作为装饰与反馈动画，不承担碰撞。

| 部位 | 建议色值 | 材质与处理 |
|---|---|---|
| 木桶身体、手臂 | `#C79257` | 温暖蜂蜜木色，清晰但低对比木纹，哑光清漆 |
| 头部、按钮外圈 | `#BB6250` | 低饱和砖红木漆，边缘圆润，露出少量木纹 |
| 肩盘、胸前按钮 | `#A8BBA0` | 薄荷绿哑光木漆 |
| 面板、后脑条纹 | `#F1DFC0` | 奶油色木面板，刻线微笑 |
| 眼睛、短脚 | `#303846` | 深色木珠与藏蓝木漆，局部微弱高光 |
| 发条钥匙 | `#BD9145` | 少量拉丝黄铜，限制金属面积 |

以上色值为人工整理的美术建议，并非对生成图做取色测量。

## 赛道中的表现建议

滴克采用「倾身滑行、短腿忙着蹬」的动作语言。入弯时整个桶身倾向弯心，双臂略收；腾空时短脚打开一点，落地后头部小幅回弹。撞击后短暂眯眼或低头、发条转半圈，再恢复运动；不要通过长时间失控翻滚遮挡玩家朝向。

如果沿用弹珠式滚动物理，可保留统一球形碰撞代理，将木偶作为独立可见外观：位置跟随物理球，朝向依速度方向，倾斜和翻滚由美术层控制。普通滑行时保持面部可读；猛烈碰撞或跌落时允许短暂完整翻滚。这里是实现建议，未经当前游戏控制器验证。

以现有球碰撞半径 `R` 为标尺进行原型时，建议木偶总高从 `2.2R` 左右试起，宽度约 `1.8R`，脚底对齐球底；最终需验证窄门、半管、漏斗、加速带和顶视镜头。钥匙、手臂不参与碰撞。所有角色共用同一碰撞体与移动参数，避免机器人外形带来隐含优势。若视觉穿墙明显，应收窄外观或增大赛道余量，而不是偷偷更改该角色的有效体积。

## 建模交付与检查

优先分为头、桶身、双臂、双脚、钥匙几个粗部件；眼睛和按钮可以独立网格或材质。木纹密度与赛道木板一致，避免角色看起来像大型家具。建议以贴图或法线表达浅刻线，不建细木屑、真实齿轮、螺纹。首轮模型先验证纯色剪影和远景背影，再增加木纹。生成图正侧背之间的钥匙大小、肢体位置有概念图常见误差，建模时应以「短小贴背、不扩大碰撞」的规范统一，不能直接把各视图当精确工程投影。

3D 生成提示词：

> Original cute wooden wind-up robot toy, squat rounded barrel torso, oversized rounded rectangular brick-red painted wooden head, cream face panel, two dark wooden bead eyes with slightly different sizes, tiny engraved smile, honey-colored wood grain body, mint circular chest button inside brick-red ring, mint shoulder discs, short wooden dowel arms and mitten hands, tiny navy wooden feet, compact brass butterfly wind-up key close to center back, cream stripe over crown and back of head. Matte painted wood with rounded edges, warm realistic miniature toy materials, clear simple silhouette, approximately 1.2 height-to-width ratio. Neutral symmetrical standing pose, separated limbs with small readable gaps, single complete character, no base, no props, no text, no logos, no antenna, no exposed machinery, no plush, no screen face. Production-friendly simplified geometry, clean material separation.

## 概念图生成记录

使用内置 imagegen 工具，非 CLI。最终文件：`assets/toy-town-concepts/robot-concept.png`。生成提示词如下，供复现与继续迭代：

> Use case: stylized-concept. Create a polished landscape character concept board for an ORIGINAL wooden wind-up robot toy named 'TIK'. Theme: miniature toy-town amusement-park racing game. Visual reference is a real warm child's room containing natural oak and ash wood marble-run tracks with tiny pastel painted rails, soft daylight, physically believable miniature material, warm neutral ambient occlusion. Do not copy existing character IP. Character: squat rounded barrel torso made of honey-colored wooden drum with visible subtle grain; a rounded rectangular brick-red painted wooden head, broad cream face panel with TWO dark circular bead eyes of slightly different diameter and a tiny engraved smile. Short thick mint-painted shoulder discs and small mitten-like wooden hands on stubby dowel arms. Two tiny navy wooden feet tucked close to the barrel. On the BACK a low-profile brass butterfly wind-up key, compact so it doesn't stick far beyond silhouette; a broad cream vertical stripe on back of head makes orientation readable. A single large inset mint circular wooden button centered on torso, with a thin brick-red ring. Cute curious but determined expression. No antennas, no weapon, no screen-face, no exposed gears, no text decals, no ball underneath. Silhouette about 1.2 times taller than wide, recognizably a toy robot, not a plush animal. Express movement through tilting body and tucked limbs, ready to skid and tumble on wooden racetracks. Palette honey wood, muted brick red, mint, cream, dark navy, tiny brushed brass. Board layout: large highly detailed hero three-quarter product render occupying left half, bottom-right three consistent smaller front/side/back orthographic views, top-right small environmental vignette of SAME toy sliding around a wooden banked curve in a toy amusement park with pastel rails and a soft-focus room beyond. Small tasteful material chips along lower left. Warm off-white paper background, elegant airy editorial layout. Only short English labels 'TIK', 'WOOD / WIND-UP', 'FRONT', 'SIDE', 'BACK'. Consistent same design across all views. Premium original game character art, realistic painted wood and matte finish, softened edges, no grunge, no gritty sci-fi, no plastic look. Reference setting atmosphere, not a screenshot recreation.
