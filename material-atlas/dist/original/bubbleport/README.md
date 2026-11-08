# 材质与纹理使用

本目录是统一材质库的原创分类：material-atlas/dist/original/bubbleport。实验台和赛段资源库均引用此处，旧路径使用兼容链接，不再维护第二份贴图。Lost Marbles 的研究材质保留在 material-atlas/dist/lm，由材质标本室独立列出。

V2：象牙路面 roughness=.16、clearcoat=1、clearcoatRoughness=.065；蜜桃软胶 roughness=.39、低清漆，并使用可开关的背光散射近似。源代码内的散射不是物理体积SSS；回弹属于样品形变，不能由PNG表达。

八种材质的当前实际参数在 [presets.json](presets.json)，源码快照在 source/materials.mjs，灯光与Bloom在 [lighting-presets.json](lighting-presets.json)。共有28张无损PNG。

## 两种使用方式，选择其中一种

1. **复现现有材质实验台**：使用 presets.json 的颜色和数值，路面读取 shared/road-grain-height.png 作为bump；金属读取 shared/metal-brush-microstructure.png 同时作为bump和roughnessMap。repeat和bumpScale已记录。材质参数与共享纹理组合最接近当前效果。
2. **使用逐材质贴图**：按 [texture-workflow.json](texture-workflow.json) 接入各材质目录的basecolor、roughness、metallic和灯光emissive。底色已写入图片，材质color设白；粗糙度已烘焙乘数，材质roughness设1；metalness设1并由metallic贴图控制。发光图使用白色emissive乘对应强度。不要再次乘默认颜色或粗糙度。

## 贴图含义

| 文件 | 分辨率 / 来源 | 颜色空间与用途 |
|---|---|---|
| 每材质basecolor.png | 64×64纯色 | sRGB；是颜色载体，不是扫描或手绘细节 |
| 每材质roughness.png | 金属256×256，其余64×64 | 线性数据；金属含实际微纹理×对应粗糙度，其他为常数 |
| 每材质metallic.png | 64×64纯灰度 | 线性数据；金属为白，其他为黑 |
| amber/signal的emissive.png | 64×64纯色 | sRGB；需对应发光强度，单独贴图不会照亮其他物体 |
| shared/road-grain-height.png | 256×256，实际Canvas原始导出 | 线性高度数据；重复4×4，bumpScale .0012 |
| shared/metal-brush-microstructure.png | 256×256，实际Canvas原始导出 | 线性数据；重复1×2，bumpScale .003；运行版也作为粗糙度乘子 |

PNG对连续粗糙度数值有8位量化误差，参数方式保留原始浮点值。所有灰度贴图RGB三通道相同，适应不同引擎的通道约定；本包未制作glTF ORM打包贴图。未生成AO、切线法线或位移网格，不应把height当作normalMap直接使用。

亚克力还需要transmission、IOR、thickness、attenuationColor/Distance及环境反射；不能靠一张PNG还原。MeshPhysicalMaterial的透射并非简单alpha透明。清漆、微表面和曝光也要在引擎设置。灯光分为emissive、PointLight受光和Bloom，三层参数分别保存。

环境PMREM运行时由RoomEnvironment生成，源码快照与MIT许可已保存；本包没有冒称已导出HDR贴图。材质与照明预设以Three.js r185为基准，移植其他引擎需要重新检查颜色空间、单位和曝光。
