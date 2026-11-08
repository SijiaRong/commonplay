# Lost Marbles · 34 类路段模块

每类一张 **4096 × 3072** JPG，共 34 张，以及一张 34 类总览。每张大图包括完整立体路段、入口出口俯视、另一侧机关结构。

- [完整逆向图录与分类索引](../../../docs/lost-marbles-module-atlas.zh-CN.md)
- [REA 逆向分析入口](../../../docs/lost-marbles-rea-analysis.zh-CN.md#module-atlas)
- [本地浏览索引](index.html)（下载仓库后用浏览器打开）
- [34 类总览](contact-sheet.jpg)
- [逐图生成参数清单](manifest.json)

## 复现

在仓库根目录运行：

```sh
node tools/render-lost-marbles-modules.cjs
```

需要 Playwright / playwright-core、Chrome，以及本机 `.local/lost-marbles/public/` 内已采集的原版模块、Three.js、`assets/room_1k.hdr` 和 oak_veneer_01 / ash_veneer 的 diff、nor_gl、rough 六张 JPG。可用 `PLAYWRIGHT_MODULE` 指定依赖位置，`CHROME_PATH` 指定 Chrome。

自编工具分别为 `tools/render-lost-marbles-modules.cjs`、`tools/lost-marbles-modules.html` 和 `tools/lost-marbles-module-catalog.json`。服务器在内存中为原生成器追加构建函数导出，原始第三方文件保持本地；公开提交只包含研究图片、参数清单、索引和自编渲染工具。

使用种子 20261108、宽度 16、关卡索引 2、基础坡度参数 0.082；机关停在 t = 2s。按路径最低点抬高独立模块，使最低路面离地约 8 单位。四类岔路和两个终点使用代表配置，详见图录；没有穷举所有随机变化，也没有进行通关验证。

## 来源与权利

游戏及相关视觉内容归原权利人所有。图像仅供学习、研究与技术交流，不通过仓库 MIT 许可授予第三方内容的使用权；[完整来源说明](../README.md#来源与权利)。
