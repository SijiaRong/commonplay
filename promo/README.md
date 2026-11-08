# 宣传片：脚本、分镜与渲染

| 内容 | 入口 |
|---|---|
| 脚本、角色、分镜、待补素材 | [storyboard.zh-CN.md](storyboard.zh-CN.md) |
| 33 张分镜参考图 | [shots/](shots/) |
| 参考图是怎么拍的（静帧抓拍脚本与每张图的机位） | [stills/](stills/) |
| 整片渲染脚本 | [render/](render/) |
| 抓拍副本生成器（渲染与静帧共用） | [tools/build-capture.mjs](tools/build-capture.mjs) |

## 在另一台电脑上渲染

需要：Node.js 20+、ffmpeg、带显卡的电脑（Mac 即可）。整片约 2900 帧（30 fps），有显卡时大约半小时到一小时；软件渲染会慢几十倍，不要用。

```sh
git clone https://github.com/SijiaRong/commonplay.git && cd commonplay
brew install ffmpeg                       # 或系统自带的包管理器
cd promo/render
npm install
npx playwright install chromium           # 已装 Google Chrome 时可跳过，改用 --chrome
```

**第一步：预览。** 每个镜头只渲染中间一帧，几分钟内跑完，用来检查机位和触发时机。

```sh
node render.mjs --preview                 # 结果在 out/preview/index.html
```

开头会打印 `WebGL renderer:`。如果显示 SwiftShader / llvmpipe（软件渲染），加 `--headed`（打开可见的浏览器窗口）或 `--chrome` 再试。

**第二步：整片。**

```sh
node render.mjs                           # 1920×1080 @ 30fps → out/promo.mp4
node render.mjs --size 3840x2160 --best   # 4K、更慢更清晰的编码
node render.mjs --only 20,25              # 只重渲某几个镜头 → out/shot20.mp4 …
node render.mjs --fps 60                  # 60 帧
```

每个镜头也会单独输出 `out/shotNN.mp4`，方便在剪辑软件里替换。`out/report.json` 记录每段是否成功；失败的镜头会在终端列出，可用 `--only` 单独重试。成片不含音乐和音效，配乐在剪辑软件里加。

其他参数：`--png` 无损帧，`--keep-frames` 保留逐帧图片，`--out <目录>`，`--port <端口>`（默认 8790，局域网房间用下一个端口）。

## 渲染脚本怎么工作

1. `tools/build-capture.mjs` 把 `teddy-playground/dist` 复制到 `promo/.build/teddy`，在副本里加上暂停/快进模拟、自由机位和隐藏界面的开关。游戏本身不改。如果游戏代码改动导致补丁对不上，脚本会直接报错并指出位置。
2. `tools/page-helpers.js` 在页面加载前接管时钟：`performance.now`、`requestAnimationFrame` 只在脚本推进时前进。每帧固定推进 1/30 秒，模拟同步推进 2 个 tick，所以机器再慢，画面里的动作速度也是准的。
3. `render/shots.mjs` 是 32 个镜头的清单：类型、时长、触发条件（第几关、哪个阶段、领先者跑到哪）、机位关键帧、字幕、摆拍事件（推人、停帧）。改镜头只改这个文件。
4. 每个镜头新开一局（种子 20261108，15 个机器人，自己的小熊交给 AI），快进到触发点后逐帧截图，再用 ffmpeg 编码。四分屏、手机竖屏和静帧缩放也由 ffmpeg 合成。

## 已知限制

- 机器人有随机性，每次渲染里谁在前面、谁走哪条岔路会不同。触发条件按路程设，镜头都能拍到，但画面里的人可能不一样，不满意就用 `--only` 重渲。
- 第 3 镜（伸懒腰）暂用待机动作；第 31 镜（泡泡星港片尾）暂用试玩全景和居民概念图。
- 第 20 镜（撞飞）和第 22 镜（掉落）是人为推动跑者的摆拍，成片前看一下效果。
- 第 15 镜（房间加人）会启动 `teddy-playground/server` 的局域网服务器，第一次运行会在那里 `npm install`。
- 这套脚本写好后只做了语法和数据检查，没有在有显卡的机器上跑过；第一次请先跑预览。
