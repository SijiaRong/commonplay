# Lost Marbles 完整赛道图库

原版程序化生成器种子 **20261108** 的五关赛道，2026-11-08 渲染。每关三张 **3200 × 4000** 大图，关闭景深模糊，机关统一停在关卡时间 `t = 2s`。

- **01 完整路线俯视图**：起点 S、检查点或终点 F；适合辨认岔路和赛道走向。
- **02 斜向全景图**：保留完整路线、支架、坡度和机关的立体关系。
- **03 机关细节图**：左侧完整路线并标注 1–3；右侧对应三个原生 3D 特写。

可直接打开 [本地浏览索引](index.html)；在 GitHub 上点击下方图片可查看原尺寸。

## 独立路段模块

新增[34 类完整路段模块图录](../../docs/lost-marbles-module-atlas.zh-CN.md)，每类一张 4096 × 3072 大图。也可查看[模块素材目录](modules/README.md)或下载后打开[模块浏览索引](modules/index.html)。

## 五关同场全景

[斜向全景](full-overview.png) · [完整俯视](full-top.png) · [房间环境](full-room.png)

![五关完整场景](full-overview.png)

## 第 1 关 · The Bookshelf Drop

重点机关：鼓壁螺旋、三路岔道、半管滑槽。

**完整路线俯视图**

[![第 1 关 · 完整路线俯视图](stage-1-1-top.jpg)](stage-1-1-top.jpg)

**斜向全景图**

[![第 1 关 · 斜向全景图](stage-1-2-overview.jpg)](stage-1-2-overview.jpg)

**路线与机关细节**

[![第 1 关 · 路线与机关细节](stage-1-3-details.jpg)](stage-1-3-details.jpg)

## 第 2 关 · Crayon Canyon

重点机关：陡降、活动琴键、检查点漏斗。

**完整路线俯视图**

[![第 2 关 · 完整路线俯视图](stage-2-1-top.jpg)](stage-2-1-top.jpg)

**斜向全景图**

[![第 2 关 · 斜向全景图](stage-2-2-overview.jpg)](stage-2-2-overview.jpg)

**路线与机关细节**

[![第 2 关 · 路线与机关细节](stage-2-3-details.jpg)](stage-2-3-details.jpg)

## 第 3 关 · Pillow Pass

重点机关：回环与钉阵、弹射炮、漩涡漏斗。

**完整路线俯视图**

[![第 3 关 · 完整路线俯视图](stage-3-1-top.jpg)](stage-3-1-top.jpg)

**斜向全景图**

[![第 3 关 · 斜向全景图](stage-3-2-overview.jpg)](stage-3-2-overview.jpg)

**路线与机关细节**

[![第 3 关 · 路线与机关细节](stage-3-3-details.jpg)](stage-3-3-details.jpg)

## 第 4 关 · Rug Rumble

重点机关：摆锤、下降螺旋、漩涡漏斗。

**完整路线俯视图**

[![第 4 关 · 完整路线俯视图](stage-4-1-top.jpg)](stage-4-1-top.jpg)

**斜向全景图**

[![第 4 关 · 斜向全景图](stage-4-2-overview.jpg)](stage-4-2-overview.jpg)

**路线与机关细节**

[![第 4 关 · 路线与机关细节](stage-4-3-details.jpg)](stage-4-3-details.jpg)

## 第 5 关 · Toy Box Finale

重点机关：陡降、大跳跃、终点漏斗。

**完整路线俯视图**

[![第 5 关 · 完整路线俯视图](stage-5-1-top.jpg)](stage-5-1-top.jpg)

**斜向全景图**

[![第 5 关 · 斜向全景图](stage-5-2-overview.jpg)](stage-5-2-overview.jpg)

**路线与机关细节**

[![第 5 关 · 路线与机关细节](stage-5-3-details.jpg)](stage-5-3-details.jpg)

## 复现说明

运行 `node tools/render-lost-marbles.cjs`。渲染脚本与排版页面分别位于仓库的 `tools/render-lost-marbles.cjs` 和 `tools/lost-marbles-gallery.html`；图像清单见 [manifest.json](manifest.json)。

脚本需要 Playwright / playwright-core、Chrome，以及本机 `.local/lost-marbles/public/` 中已采集的原版共享生成器、Three.js 和渲染模块。运行时需要 `assets/` 下的 `room_1k.hdr`、`room_bg_4k.jpg`、oak_veneer_01 / ash_veneer 的 diff、nor_gl、rough JPG 六张贴图。本机现有的贴图和环境图已可供复现；第三方游戏源码与采集证据仍保留在忽略的 `.local/` 目录中，没有随本次图片提交上传。可使用 `PLAYWRIGHT_MODULE` 和 `CHROME_PATH` 指定本机依赖路径。

渲染时从未平移的原始视觉描述重新计算位置，避免原生成器中与碰撞体共享数组的加速带被房间平移两次；没有改变赛道模块、岔路或机关布局。图库中的场景是固定种子的一个实例，不代表所有随机种子的关卡。静帧只展示机关某一时刻的姿态。

## 来源与权利

参考游戏：[Lost Marbles / Meticulai](https://meticulai.com/games/lost-marbles/)。木纹和房间 HDR 全景源自 Poly Haven，原素材标注 CC0。游戏赛道设计、程序化生成器、第三方代码及相关视觉内容的权利归各自权利人所有；这些研究渲染图不通过本仓库 MIT 许可授予第三方内容的使用权。仅供学习、研究和技术交流；权利问题可通过仓库 Issues 联系。
