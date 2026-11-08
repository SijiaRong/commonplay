# 方案三：歪团 WOB · 软胶怪萌玩偶

实现更新：已完成 Hi3D 建模与 demo 接入，见[模型与动作说明](toy-town-model-integration.zh-CN.md)。下文保留原始概念阶段的设计记录。

设计日期：2026-11-08。用于玩具城游乐园主题的派对竞速游戏角色探索；当前交付是概念图与建模说明，尚未制作或接入 3D 模型。

![歪团 WOB 概念板](../assets/toy-town-concepts/vinyl-concept.png)

## 一句话设定

**一个出厂时顶角被轻轻捏歪、努力装镇定的小软胶团子。** 体型是低重心的压扁豆形，顶端只有一个向侧边压倒的短折角，脸上是一条紧张的小歪嘴。它会害怕大坡道，但每次都假装自己准备好了。

## 外观与记忆点

- **主轮廓：** 头身一体的圆润不对称豆形，宽而短，脚小而贴地；不以大脑袋加小身体的娃娃比例呈现。
- **唯一主要异形：** 顶部一侧低矮折角与下方浅浅的拇指凹痕。它是身体被捏出的折痕，不是耳朵、角或头发。正面、背面和俯视均保留这个偏心轮廓。
- **脸：** 两颗小黑椭圆眼、一条短歪嘴、单侧桃色腮点。紧张但无攻击性；不使用锯齿牙、长耳、骷髅等既有怪萌 IP 的成套符号。
- **肢体：** 极短的一体圆臂、两只奶油色小脚，其中一只稍宽。脚的差异只用于细节趣味，不应成为远景识别的唯一依据。
- **背面：** 不挂背包和大饰品，保留顶角的方向与一条细模具合模线。竞速背视可以直接识别主体。

## 色板与材质

以下色值为建模起点，需在游戏灯光中调整，并非从概念图逐像素取色。

| 部位 | 建议色 | 表面 |
|---|---|---|
| 主体 | 浅长春花紫 `#ADA8CA` | 哑光搪胶，微细磨砂，无纤维，无明显皮革纹 |
| 脚 | 奶油黄 `#F0D5AE` | 同类软胶，稍低粗糙度 |
| 单侧腮点 | 桃橙 `#F6AA88` | 喷涂色块，边缘干净 |
| 眼嘴 | 深棕黑 `#302B29` | 轻微高光，不做玻璃宝石眼 |

以三种主要颜色和低装饰密度建立收藏玩具感。主体应保留柔和的轮廓高光及真实接触阴影；避免把搪胶做成毛绒，也避免镜面塑料感。概念板的微细颗粒只作为表面质感，建模时用细微法线或粗糙度即可，不生成毛发。

## 在游乐园里的表现

WOB 与 Lost Marbles 参考共享温暖儿童房、桌面微缩比例、木纹弯道、彩色积木护栏和柔光摄影感。角色表面简洁、冷浅紫与暖木色有对比，适合在相同场景里与毛绒 PIP、机械 TIK 共存。

动作重点是“嘴硬但紧张”：起跑时两手贴身、身体挺一下；到陡坡前微微后缩；滑行时小脚往前伸；碰撞时主体短促压扁、折角回弹；获胜后先松一口气，再得意地晃两下。不要一直夸张哭闹，避免只剩单一情绪。

## 替换弹珠的运动与碰撞建议

以下为原型建议，不表示当前代码已采用或验证。

1. 首轮可保留统一球形运动代理，WOB 作为独立视觉层绑定位置与地面方向。所有角色使用相同基础碰撞尺寸与速度，顶角、手脚不参与碰撞。这样先验证公平性及赛道适配。
2. 视觉主动作是坐姿滑行、身体倾斜和落地压缩；不要把球体旋转直接传给整个人偶，让它全程头朝下翻滚。失控或强撞时才短暂翻滚，然后回正。
3. 身体中心和脚底接触位置需要按物理代理校准；在陡坡、半管、跳跃、低护栏和检查点漏斗处检查悬浮、穿插及遮挡。压扁豆形与球的可见边界存在差异，需要实机调参。
4. 顶角短而贴身，有利于减少护栏穿插；表情压缩只影响视觉，不借此改变碰撞体。
5. 正式建模先做无骨骼静态模型验证缩略识别，再按需要增加主体挤压与折角回弹。多人表现中优先使用低成本形变或少量骨骼。

## 远景识别与变体原则

先保留 **偏心折角 + 豆形身体 + 低重心小脚** 三点。128px 缩略图检查脸，64px 和背视检查轮廓；这些是建议的验证规格，当前未完成游戏实机验证。不能只依赖腮红和歪嘴等细节。

后续可做浅海盐、杏仁奶、葡萄汽水等配色，仍保持同一张脸和同一折角；大型帽子会盖住识别点，首批不建议。换色与主题命名是设计探索，不代表已验证的市场偏好。

## 市场依据与适合人群

参考[独立市场调研](toy-market-research.zh-CN.md)中怪萌、情绪表达、拟人物件与收藏玩具方向。潜在受众是偏好低装饰收藏玩具、别扭小表情或“有点缺点”角色的玩家。这是产品推断，并无数据证明该原创造型一定热销或比动物更受欢迎。

相较毛绒动物，WOB 的重点是可被记住的情绪和雕塑轮廓；相较机械玩具，重点是简单而有触感的整体形体。可用同机位选择测试检查玩家是否把顶角认成耳朵、是否觉得脸过于平淡，以及实际背视是否足够独特。

## 可直接交给 3D 生成的提示词

> Original collectible soft-vinyl toy character WOB. A squat asymmetrical bean-shaped creature with one continuous head-and-body sculpt, matte pale periwinkle vinyl, one low soft folded crest bent sideways on the upper left corner with a subtle thumb dent below it. The crest is a squeezed rubber lump, not an ear, horn or hair. Two tiny dark oval eyes, a short crooked closed mouth looking nervous but brave, one small peach cheek dot. Very short integrated rounded arms, two cream stub feet with one slightly wider. Smooth simple silhouette, subtle back mold seam, three principal colors, no clothing or accessories. Full body, neutral standing pose, centered on a plain neutral background, even lighting, clear separated limbs, game-ready clean sculpt. No teeth, fur, long ears, skulls, logos, ball, base, scene, or existing character motifs.

生产整理：生成后核对折角正背一致性、左右脚数量、手臂是否粘连、底部接触面、法线和 UV。再统一尺寸和材质并验证赛道适配，不能将生成结果直接视为可用游戏资产。

## 本次概念图生成记录

使用内置 **imagegen**，未使用 API/CLI 回退。最终图：`assets/toy-town-concepts/vinyl-concept.png`。

实际图像提示词：

```text
Use case: stylized-concept
Asset type: polished original toy character design board for a warm miniature toy-town obstacle racing game.
Primary request: Design ONE original soft-vinyl art toy named WOB, an endearing awkward little creature. Make the same consistent character in a large three-quarter hero render, small front side back turnaround renders, and one toy-scale wooden amusement raceway scene.
Subject: WOB has a squat rounded asymmetrical bean/gumdrop body with the head and torso one continuous sculpt. Matte pale periwinkle soft vinyl. Its ONLY unusual silhouette signature is one low soft folded crest on the upper left corner, bent sideways like a small squeezed lump of rubber, with a subtle thumb dent beneath it; NOT ears, NOT horns, NOT hair. Two tiny black oval eyes, a short subtly crooked closed mouth trying to look brave, one tiny peach blush dot. Very short integrated rounded arms. Two little cream stub feet, one slightly wider. A discreet molded seam at the back. Minimal, memorable, slightly grumpy but lovable. Absolutely no teeth, long ears, skulls, fur, garments, accessories or existing brand motifs.
Composition: premium landscape concept presentation on warm ivory paper background. Main three-quarter full body hero on the left about 55 percent width; front, side, back views across upper right; a small wide scene lower right showing THE SAME character sitting and sliding in a curved oak toy half-pipe with coral and turquoise blocks, tiny striped rails, blurred warm playroom in the background. Do not make it spherical, and do not place it on a ball. Keep folded crest shape, facial layout, color and foot proportions consistent across views. Include a simple palette row of periwinkle, cream, peach. Restrained typography, only exact heading "WOB" and small labels "SOFT VINYL", "FRONT", "SIDE", "BACK"; no paragraphs.
Style/medium: believable manufactured collectible soft-vinyl toy photographed in a miniature world. Rounded sculpt, satin matte material, gentle edge highlights, tiny mold seam, physically plausible contact shadows. Warm oak wood grains, painted pastel wooden blocks, cream surroundings, soft daylight, tasteful miniature photography. The character must feel part of a tabletop toy amusement park, not a flat cartoon or glossy sci-fi robot.
Constraints: one original character only, no extra figures, no logos or watermark, no borrowed IP, no scary expression, no busy decoration; the small raceway scene must contain this character at matching scale.
```

目视检查：概念板包含主视图、正侧背、色板与赛道场景，主体和折角保持一致。它仍是概念设计而非严谨工程三视图，建模时需固定左右方向与尺寸。
