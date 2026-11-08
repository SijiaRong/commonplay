# 宣传片：脚本、分镜与渲染

## 泡泡星港 30 秒预告片

[播放 30 秒版](bubble-city/bubbleport-30s.mp4)

开场 10 秒按游戏内名称介绍五关，从玩具门廊全景切入土星弯道、炮筒、螺旋滑梯和大跳台。第 16–22 秒保留小熊出膛和空中跟拍，其余 14 秒用于四人竞速与终点挥手。每关从全景连续推向特色赛段，依次聚焦钟摆锤廊、土星回旋滑梯、玩具炮筒、螺旋滑梯和大跳台。最后 3 秒，四个玩偶挥手，背景渐渐虚化，中央先浮现游戏名「泡泡星港」，再在下方淡入「长大了，也要一起玩哦」。

复拍使用下节的游戏地址和混音流程。取帧参数改为 `--teaser`，给音效脚本的第三个参数传入 `30`。编码时设置 `-t 30` 并将音乐淡出设为 `afade=t=out:st=28.85:d=1.15`。

## 泡泡星港 40 秒短版

[播放四人竞速与小熊炮筒弹射](bubble-city/bubbleport-40s.mp4)

前 10 秒展示五关赛道。第 10–20 秒进入四人竞速，第 20–26 秒侧拍缝线小熊从第三关的玩具炮筒出膛、飞越赛道，第 26–40 秒回到四人比赛并在终点挥手。炮筒镜头由游戏发射碰撞区触发，以半速呈现。小熊穿过炮口平面时触发「嘭」声，随后镜头近距离跟随小熊。项目徽标和名称位于画面左上角。全片通过游戏设置将场景亮度设为 15%。

按下节启动静态服务后，在 `promo/render` 执行以下命令复拍。

```sh
node bubble-city-four.mjs http://127.0.0.1:8771/bubblecity-teddy-slide/dist/ out/short --short
python3 bubbleport-cannon-sound.py out/short/muzzle-exit.json out/short/cannon.wav
ffmpeg -framerate 30 -i out/short/%04d.jpg \
  -stream_loop -1 -i ../../bubblecity-teddy-slide/dist/music/orbital-sprint.m4a \
  -i out/short/cannon.wav \
  -filter_complex "[1:a]volume=0.78,afade=t=in:d=0.16,afade=t=out:st=38.8:d=1.2[m];[2:a]volume=0.91,pan=stereo|c0=c0|c1=c0[pop];[m][pop]amix=inputs=2:normalize=0[a]" \
  -map 0:v -map "[a]" -t 40 -c:v libx264 -pix_fmt yuv420p -crf 19 \
  -c:a aac -b:a 192k -movflags +faststart ../bubble-city/bubbleport-40s.mp4
```

## 泡泡星城四人竞速版

[播放 95 秒四人版](bubble-city/bubble-city-four-player.mp4) · [镜头表与渲染入口](render/bubble-city-four.mjs)

前 15 秒以五个空镜展示五关赛道。接下来的 80 秒由缝线小熊、兜兜飞鼠 PIP、滴克 TIK 和雨衣小鸭阿扣同场出镜，最后在终点合影。比赛取景使用游戏多人模式的 `CityPartyShow`、当前布景、原版角色模型及骨骼动画。每个赛段开拍时安排四个起始位置，四路脚本输入分别控制跑动与跳跃。收尾调用游戏的终点挥手动作。全片为 1600 × 900、30 fps，配乐使用游戏内的《Orbital Sprint》。

从仓库根目录启动服务，以便浏览器同时读取泡泡星城和共用的多人规则。另开终端执行取帧与编码命令。

```sh
python3 -m http.server 8771 --bind 127.0.0.1
```

```sh
cd promo/render
npm ci
node bubble-city-four.mjs http://127.0.0.1:8771/bubblecity-teddy-slide/dist/ out/four-player
ffmpeg -framerate 30 -i out/four-player/%04d.jpg \
  -stream_loop -1 -i ../../bubblecity-teddy-slide/dist/music/orbital-sprint.m4a \
  -map 0:v -map 1:a -t 95 -c:v libx264 -pix_fmt yuv420p -crf 19 \
  -af "volume=0.78,afade=t=in:d=0.16,afade=t=out:st=93.4:d=1.6" \
  -c:a aac -b:a 192k -movflags +faststart ../bubble-city/bubble-city-four-player.mp4
```

## 泡泡星城单人实机版

[播放 95 秒动态宣传片](bubble-city/bubble-city-promo.mp4) · [动态取景脚本](render/bubble-city-motion.mjs)

成片沿用 32 镜的顺序。单人赛每输出一帧推进两次 60 Hz 实机物理，使用游戏的碰撞、角色动画、机关和渲染管线。拍摄时将角色放在各赛段的入镜位置，推进方向由该段赛道切线决定。第 05、13、20、24、27 镜分别从摩天轮、土星地标、玻璃穹顶馆、弧面商店和星港总站看向赛道。配乐取自本版游戏的《Orbital Sprint》。

[逐镜浏览](bubble-city/index.html) · [32 镜总览图](bubble-city/contact-sheet.jpg) · [95 秒分镜视频](bubble-city/storyboard.mp4) · [取景脚本](render/bubble-city.mjs)

镜头 01–04 从选角进入单人赛起跑；05–12 展示玩具门廊；13–19 沿蜡笔峡谷进入第二关的土星回旋滑梯；20–30 巡览后三关；31–32 以经典滑梯与自由练习收尾。视频按前三十一镜各 3 秒、末镜 2 秒剪成静帧预演，供核对画面与节奏。

取景使用当前工作区的 `bubblecity-teddy-slide/dist`、默认材质和种子 20261108。游戏镜头通过真实试玩界面抓取，赛道镜头调用同一游戏的关卡编辑器渲染。复拍时先在仓库根目录启动静态服务，再在另一终端执行取景脚本（需要 Node.js 20+、Google Chrome 和上述游戏目录）。

```sh
python3 -m http.server 8771 --bind 127.0.0.1 --directory bubblecity-teddy-slide/dist
```

```sh
cd promo/render
npm ci
node bubble-city.mjs http://127.0.0.1:8771/
# 由新图重新剪出分镜预演（需要 ffmpeg）
ffmpeg -y -framerate 1/3 -i ../bubble-city/shots/%02d.jpg -t 95 -vf fps=24 -c:v libx264 -pix_fmt yuv420p -movflags +faststart ../bubble-city/storyboard.mp4
```

动态版从同一个游戏地址读取模型。启动上面的服务并在 `promo/render` 安装依赖后，运行以下命令生成 2,850 帧和带游戏配乐的 MP4。

```sh
node bubble-city-motion.mjs http://127.0.0.1:8771/ out/bubble-city-frames
ffmpeg -framerate 30 -start_number 0 -i out/bubble-city-frames/%04d.jpg \
  -stream_loop -1 -i ../../bubblecity-teddy-slide/dist/music/orbital-sprint.m4a \
  -map 0:v -map 1:a -t 95 -c:v libx264 -pix_fmt yuv420p -crf 19 \
  -af "volume=0.78,afade=t=in:d=0.16,afade=t=out:st=93.4:d=1.6" \
  -c:a aac -b:a 192k -movflags +faststart ../bubble-city/bubble-city-promo.mp4
```

## 小熊滑滑梯原版

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
