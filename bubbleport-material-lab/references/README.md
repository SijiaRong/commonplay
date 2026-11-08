# 象牙亮面与软胶：成熟材质参考

2026-11-08。以下链接已从素材作者或官方文档核对。此页记录V1复核时的参考筛选。现已按建议制作V2亮面与软胶样板；没有购买或导入付费材质，旧参数仍可在实验台对照。

## 优先参考

| 目标 | 参考与来源 | 参考内容 | 使用判断 |
|---|---|---|---|
| 象牙亮面路面 | [ambientCG Plastic 010](https://ambientcg.com/view?id=Plastic010) | 官方标记为白色、光滑塑料，提供PBR贴图 | 可作为白色塑料表面基准；改成象牙色后，仍需匹配高光与环境 |
| 亮面表层的实时实现 | [Three.js Clearcoat示例](https://threejs.org/examples/webgl_materials_physical_clearcoat.html) / [MeshPhysicalMaterial官方文档](https://threejs.org/docs/pages/MeshPhysicalMaterial.html) | 基层与清漆高光分开控制，并使用环境反射 | 适合验证路面有连续高光，而非靠提曝光变白；在线文档版本可能新于本地r185，实际参数应按本地源码核对 |
| 不透光soft-touch | [Visune Soft Touch Plastic 001 Opaque](https://visune.io/products/soft-touch-plastic-001-opaque) | 作者描述为不透光、柔和哑光、绒感表面；KeyShot材质 | 适合干爽软包；不因“软”而默认增加透明度。此处看外观，KeyShot材质不是可直接套用的Three.js资源 |
| 带体积感的软胶方向 | [Visune Soft Touch Plastic 003 Diffused](https://visune.io/products/soft-touch-plastic-003-diffused) | 作者描述为内部均匀散射的柔触塑料，KeyShot材质 | 我们的美术选择：可借鉴其乳浊与柔和边缘，向蜜桃硅胶靠拢；它并非硅胶成分的实测材质 |
| 更通透的对照样本 | [Visune Soft Touch Plastic 005 Translucent](https://visune.io/products/soft-touch-plastic-005-translucent) | 柔触表面与明显透光 | 适合作对比，不建议默认把障碍软包做得像透明玻璃 |
| 玩具软乙烯的整体观感 | [Poly Haven Rubber Duck Toy](https://polyhaven.com/a/rubber_duck_toy) | 完整玩具模型与Diffuse、Roughness、Normal等贴图 | 参考圆润轮廓、成型细节和局部高光；不要直接照搬其磨损、颜色或把“Rubber”名称等同于哑光硅胶 |
| 软胶内部散射的实时实现 | [Three.js官方WebGL SSS示例](https://threejs.org/examples/webgl_materials_subsurface_scattering.html) / [官方Shader说明](https://threejs.org/docs/pages/module-SubsurfaceScatteringShader.html) | 实时次表面散射近似；示例基于Blinn-Phong | 只作为实现方案参考，不是给现有MeshPhysicalMaterial加一个属性即可得到完整SSS |

## 当前样板与目标之间的差异

这是结合本地代码与上述参考作出的判断：

- 路面当前roughness=.48、clearcoat=.28、clearcoatRoughness=.32，加上细颗粒bump，设计方向更接近半哑光面层。要有“抛光象牙树脂”观感，应让清漆更平滑，并在路面上形成可辨认的长条反射。
- 软胶当前roughness=.62、clearcoat=.08，主要用较散高光表达柔和，尚未加入内部散射和受压形态。调高粗糙度本身不能让硬圆柱必然读成柔软材料。
- 不透光soft-touch和乳浊硅胶是不同方向：前者可以完全不透光；后者可利用厚度相关散射。不能把SSS、透射与简单alpha透明混为一谈。
- [Blender Principled BSDF](https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/principled.html)把次表面散射、Coat、Sheen分别定义。Sheen主要表示细纤维，不宜当作通用“柔软度”开关。
- [Disney的PBR研究](https://www.disneyanimation.com/publications/physically-based-shading-at-disney/)强调材质和照明共同决定高光表现。制作亮面样板时，应在固定曝光下比较，避免用泛白与Bloom冒充镜面层。

## 建议的下一轮对照

保留当前样板，新增对照而非覆盖：

1. **抛光象牙树脂**：roughness=.12–.22、clearcoat=.8–1、clearcoatRoughness=.05–.12，bump减弱；增加能在平板上反射成长条的大型灯箱环境。metalness保持0。这些是美术调试起点，不是上述素材的实测参数。
2. **干爽柔触软胶**：roughness=.35–.5、清漆接近0；保留微细表面变化，样品增加圆角软垫和轻压凹陷，区别于硬圆柱。
3. **乳浊蜜桃硅胶**：与上一款共用颜色、相机和灯光，增加受控的厚度散射近似；不默认清澈透光。再加轻微挤压回弹对照，分清材质线索与几何形变线索。

先以“抛光象牙树脂 + 乳浊蜜桃硅胶”为泡泡星港主方向，干爽soft-touch作备选。这是本项目的美术建议，不是原作者对游戏用途的结论。

## 来源与可复用范围

- ambientCG素材官方说明为CC0，见[许可页](https://docs.ambientcg.com/license/)。Plastic010可下载贴图后在本项目测试；本轮未下载。
- Poly Haven页面标注CC0。该参考是完整模型，不是独立的通用软胶程序着色器。
- Visune为付费KeyShot资源，此处仅保存网页链接和外观观察，未购买、复制其材质文件，也不纳入已有CC0纹理包。
- Three.js示例提供实现参考；本地运行仍应匹配当前r185依赖。
