# 玩具城角色提案 A：兜兜飞鼠 PIP

实现更新：已完成 Hi3D 建模与 demo 接入，见[模型与动作说明](toy-town-model-integration.zh-CN.md)。下文保留原始概念阶段的设计记录。

独立设计方向：毛绒动物。2026-11-08。概念提案，尚未替换游戏资源，也不代表市场调研已验证的用户偏好。

![兜兜飞鼠设计板](../assets/toy-town-concepts/plush-concept.png)

## 一句话形象

一只把自己当成滑翔高手的圆肚小飞鼠：榛果色短毛绒、奶油脸、贴身青绿色翼膜、卷在背上的粗尾巴。木制赛道上，它像被孩子放下去的一颗毛绒栗子，滑得认真，落地却总有一点软乎乎的狼狈。

## 轮廓与记忆点

- 主体是矮胖梨形，头与身连成一个柔软体块；没有细脖子。脸占正面约一半，耳朵短而略尖，口鼻部轻微前突，避免与泰迪熊混淆。
- 两只短手臂和身体之间是一对贴身翼膜，呈收拢的小披风轮廓，青绿色内衬让俯视镜头也能认出角色。
- 尾巴短粗、向上回卷并贴背，形成侧后方的圆拱轮廓；不使用拖地的大尾巴。
- 背上只有一块奶油色月牙补丁；和青绿翼膜一起提供背面识别。多人配色可改变翼膜与补丁颜色，但保持深浅关系。
- 刺绣小眼、栗色鼻和轻微微笑；不用堆叠装饰来表现个性。

## 色板与材质

| 部位 | 建议色值 | 材质与呈现 |
| --- | --- | --- |
| 主体毛绒 | `#A86D43` | 榛果色短绒，主要用细噪声法线、柔和高粗糙度与少量轮廓绒感表现 |
| 脸与肚皮 | `#F2E3C6` | 奶油白磨毛布，保持大面积清楚色块 |
| 翼膜内衬 | `#438F8B` | 青绿色棉布，比毛绒更平整，有轻微织纹 |
| 鼻与刺绣眼 | `#39281F` | 深栗色刺绣，保持远景对比度 |
| 缝线与补丁 | `#D8BC8E` | 暖米色粗缝线；缩小时烘焙进纹理 |

所有数值是制作建议，概念图不作为精确测色标准。柔光、木纹、彩色积木围栏和真实玩具尺度，参考仓库中 Lost Marbles 图库；角色本身为原创设计。无需长毛模拟，避免远景噪点和成本过高。

## 性格与动作

性格是“努力的小冒险家”：起跑会抬起双手展开翼膜，滑下坡时趴平；跳起时双臂短暂展开，落地有一次轻柔压扁和回弹。撞上护栏后先摇头，再立刻摆正继续冲。胜利动作为抱住自己的卷尾巴转半圈。

翼膜只参与表现，不建议首版赋予真实滑翔能力，以免不同外形同时引入操控差异。

## 如何替换弹珠

以下是待原型验证的实现建议：

1. 第一版保留一致的球形玩法碰撞体；毛绒网格作为独立视觉层。主体体积尽量贴近球体，耳朵、翼膜、尾巴均不额外碰撞，避免卡进漏斗、细栏杆与半管边缘。
2. 运动时让视觉朝向跟随水平速度平滑转动；允许转弯侧倾、落地压缩和短暂翻滚，但不持续机械地继承球的全部角速度，否则多数时间看不到脸。
3. 地面运动采用低趴滑行与短促扑腾，跳跃展开翼膜；视觉离地高度根据主体底部校正，防止脚与木板穿插。静止、冲刺、空中、受撞四种状态足以验证角色是否成立。
4. 用现有最窄岔路、半管、漏斗和多人拥挤画面检查轮廓；外形不能遮挡玩家脚下的落点。模型最大宽度以可通行宽度为准，不因角色看起来柔软就允许不一致的碰撞公平性。
5. 在实际游戏相机和目标设备上确认识别与性能后，再决定是否需要骨骼与绒毛效果。不可把概念板直接当作可用的游戏模型。

## 交给 3D 生成的提示词

```text
Original plush flying squirrel toy named PIP. Compact rounded pear-shaped hazelnut-brown body, cream oval face and belly, tiny pointed ears, short squirrel muzzle, dark brown embroidered oval eyes and chestnut nose. Short rounded arms attached to torso with a snug teal fabric gliding membrane, folded close to the body. One cream crescent sewn patch on upper back. A short very thick tail curled upward tightly against the back, no long tail. Tiny rounded feet. Handmade short-pile plush fabric, sparse visible seams, soft cotton membrane, large readable forms. Neutral symmetrical pose with arms slightly open so membrane is readable, full body, clean plain background, no props, no text, no base. Keep the body close to a rounded volume suitable for a small racing character. No existing IP, no bear anatomy, no clothing, no glass marble, no long thin limbs, no mechanical parts.
```

建模拆分建议：主体与脸、左右短臂和翼膜、短脚、贴背尾巴。短毛主要由材质承担；翼膜无需薄到真实单层布料，以免生成破面。另做低面数版本与简化材质后再导入引擎。

## 设计板生成说明

使用内置 `image_gen` 工具，类型为 `stylized-concept`。设计板包括主三分之四视图、正侧背辅助视图、配色与木制半管场景；这些是概念图，辅助视图仍需在模型阶段校准。

生成提示词要点：`polished original 3D toy character design sheet; warm ivory landscape board; original plush flying squirrel PIP; hazelnut short plush; cream face and belly; teal folded gliding membrane; tightly curled thick tail; crescent back patch; consistent front/side/back; giant 3/4 hero render; wooden miniature half-pipe vignette; warm daylight; physical toy materials; sparse English labels; no existing IP`。详细角色约束见上方 3D 提示词。

最终设计板提示词：

```text
Use case: stylized-concept. Asset type: polished original 3D toy character design sheet for a miniature wooden amusement-park racing game. Create a landscape design board on warm ivory with an original plush flying squirrel called 'PIP'. Visual identity: a very plump rounded pear body in toasted hazelnut short plush, cream oval face and belly, small pointed triangular ears, tiny embroidered dark brown oval eyes, short pointed squirrel muzzle with a chestnut nose, no human hair. The memorable feature is a snug teal fabric gliding membrane linking short arms to the sides of the belly, scalloped like a little folded cape, visible from above; one cream crescent-shaped stitched patch on the upper back. A short thick squirrel tail curls tightly upward against its back, never long or thin; tiny rounded feet, no clothing, no accessories, no helmet, no vehicle. Kind curious slight smile, handmade toy construction, large readable forms, tasteful seams and sparse embroidery, soft short pile with believable fibers rather than exaggerated shaggy hair. Coherent model in every view. Layout: left 55% giant hero three-quarter product render, upper right tidy front/side/back orthographic-style mini views of SAME character with consistent proportions, lower right rectangular in-world vignette of PIP belly-sliding playfully along a wooden half-pipe beside colorful painted wooden block rails, a simple arch and funnel, children's room floor softly blurred behind, tiny toy scale. Present tiny five circular color swatches below hero. Lighting: realistic miniature toy photography, warm indirect daylight, soft ambient contact shadows, subtle depth of field only in environment vignette, physical textures, delicate wood grain and pastel painted wooden trim. Overall understated premium game concept art, closer to physical plush toy macro photography than flat cartoon. Only text allowed: 'PIP' large top left, and small labels 'PLUSH GLIDER', 'FRONT', 'SIDE', 'BACK'. All forms must remain original, no existing character IP, no logos or watermarks. Not a bear, not a rabbit, no glass marble, no robotic features, no vinyl sheen. Crisp detailed composition.
```
