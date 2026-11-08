# Commonplay 材质与纹理合集

打开 [来源索引](index.html) 可以按来源、贴图通道、模型或源码路径检索。两组分别是 `lost-marbles/` 和 `commonplay/`。后者收录项目制作、委托生成、再加工及整合的材质。来源分组不等于版权归属，模型的授权记录、Poly Haven 扫描和参考实现的署名继续适用。关于第三方内容见仓库根目录 README。

- `textures/` 收录原尺寸图片，包括 GLB 内嵌纹理和环境 HDR。文件名末尾是 SHA-256 的前十二位，完整校验值在清单内。相同字节只归档一次，所有用法共用同一条记录。
- `model-materials/` 的 JSON 保存模型材质参数、采样器、各 primitive 使用的材质序号，以及纹理编号到图片的映射。images 中的 file 从合集根目录解析。这里保存的是模型文件内的定义，试玩加载后的覆盖逻辑可在 recipes 中追溯。
- `recipes/` 收录材质定义、着色器、Canvas 纹理生成代码与预设。源文件保留项目导入路径，需在对应项目中运行。材质实验台的历史快照和当前版本各自保留。
- `manifest.json` 记录 SHA-256、原路径、通道、尺寸和来源备注。glTF 的 metallicRoughnessTexture 使用 G 通道存粗糙度、B 通道存金属度。baseColorTexture 和 emissiveTexture 按 sRGB 读取，法线和标量图按线性数据读取。

扫描范围为当前工作树中 Git 已跟踪及未忽略的项目文件（包括符号链接）。资产包的解包源目录参与扫描；概念图、人物缩略图、截图、第三方引擎、依赖缓存、私有下载缓存不作为运行材质归档。程序纹理保留生成方法；同一程序运行时可产生多个变体。

在仓库根目录运行 `python3 tools/build-material-library.py` 可重新生成，依赖 Pillow 和 Node.js。ZIP 输出在 `.local/commonplay-material-library.zip`。两组目录包含实际贴图和材质文件，可直接取用。ZIP 同时携带离线页面和缩略图，解压后打开 index.html。
