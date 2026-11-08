# 分镜截图是怎么拍的

`promo/shots/` 里的 33 张参考图就是用这里的脚本拍的。原理：给小熊滑滑梯做一份抓拍用的副本，在副本里加上「暂停/快进模拟」和「自由机位」，然后用一个常驻的无头浏览器按指令移动机位、截图。游戏本身（`teddy-playground/`）没有改动。

正式视频请用 [`../render/`](../render/)，它按帧渲染，画面时间是精确的。这里的脚本只适合拍静帧。

## 文件

| 文件 | 作用 |
|---|---|
| `../tools/build-capture.mjs` | 生成抓拍副本 `promo/.build/teddy`（与渲染脚本共用） |
| `drv.py` | 常驻浏览器（Python Playwright），在本机端口上收 JSON 指令：打开页面、执行 JS、点击、截图 |
| `c.sh` | 把一条 JSON 指令发给 `drv.py` |
| `helpers.js` | 页面里的工具函数：`PT(s)` 路径点、`FREE(eye,at,fov)` 自由机位、`FOLLOW(id)` 跟随、`CLEAN()` 隐藏界面、`FREEZE()` / `ADV(秒)` 暂停与快进、`UNTIL(s)` 快进到领先者到达某处 |
| `js.sh` | 执行一段页面 JS，可选同时截图：`js.sh '<js>' [等待秒] [图名]` |
| `shot.sh` | 执行 JS 后截图：`shot.sh <图名> '<js>' [等待秒]` |
| `adv_until.sh` | 一小步一小步快进，直到某个跑者的路程达到目标：`adv_until.sh 112 mid 0.5` |

## 步骤

```sh
pip install playwright && python -m playwright install chromium
node promo/tools/build-capture.mjs                       # 生成 promo/.build/teddy
python3 -m http.server 8080 --directory promo/.build/teddy &
python3 -m http.server 8891 --directory bubbleport-demo/dist &
python3 promo/stills/drv.py 1280 720 9300 &              # 第 3 个参数是指令端口
export STILLS_OUT=$PWD/promo/stills/out && mkdir -p $STILLS_OUT

S=promo/stills
$S/c.sh '{"goto":"http://localhost:8080/?seed=20261108","wait":15,"js":"1"}'
$S/js.sh "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()=='7 个').click();1" 1
$S/c.sh '{"click":"#go","wait2":0.3,"js":"FREEZE(true);L({type:\"auto\"});1"}'   # 暂停模拟，自己的小熊交给 AI
```

之后按下表移动机位、快进、截图。`ADV(秒)` 推进模拟；`CLEAN(true)` 隐藏界面；`OFF()` 回到游戏自带机位。
没有显卡的机器可以设 `SOFTWARE_GL=1` 用软件渲染，但每张要几十秒。

## 每张图的机位（种子 20261108，7 个机器人）

坐标是世界坐标。`PT(s)` 是当前关卡中线上路程为 s 的点。

| 图 | 关卡 | 时机 | 指令 |
|---|---|---|---|
| 01 | 第 1 关 | 开局 | `CLEAN(true);FREE([40,200,-20],[-135,70,-110],38,1)` |
| 02 | 第 2 关 | 开局 | `FREE([150,190,-10],[0,80,-125],40,1)` |
| 03 | 第 3 关 | 开局 | `FREE([260,180,-60],[135,55,-110],40,1)` |
| 04 | 第 4 关 | 开局 | `FREE([190,150,250],[75,45,110],40,1)` |
| 05 | 第 5 关 | 开局 | `FREE([60,170,280],[-80,35,110],40,1)` |
| 06 | 泡泡星港 | 选「月面摆锤」「加宽 19.2」后点「出发试玩」，再点「乐园全景」 | 游戏自带全景 |
| 07 | 第 1 关 | 开闸后约 3 秒，大家在移门前 | `const a=PT(60),b=PT(42);FREE([a.x+3,a.y+8,a.z],[b.x,b.y+1,b.z],42,1)` |
| 08 | 第 1 关 | `adv_until.sh 112 mid` | `const a=PT(132),b=PT(114);FREE([a.x-7,a.y+10,a.z],[b.x,b.y+1,b.z],44,1)` |
| 09 | 第 3 关 | 开闸后约 2 秒 | `const a=PT(64),b=PT(48);FREE([a.x+9,a.y+9,a.z+4],[b.x,b.y+1.5,b.z],46,1)` |
| 10 | 泡泡星港 | 月面摆锤出发后 | 游戏自带跟随机位 |
| 11 | 第 1 关 | `adv_until.sh 145 mid` | `const a=PT(160),b=PT(145);FREE([a.x+8,a.y+10,a.z],[b.x,b.y,b.z],44,1)` |
| 12 | 第 3 关 | `adv_until.sh 278 mid` | `const a=PT(294),b=PT(280);FREE([a.x+7,a.y+9,a.z],[b.x,b.y+0.5,b.z],46,1)` |
| 13 | 第 3 关 | `adv_until.sh 112 mid` | `const a=PT(126),b=PT(112);FREE([a.x-8,a.y+9,a.z+3],[b.x,b.y+1,b.z],46,1)` |
| 14 | 第 1 关 | 中位跑者约 175 | `FREE([-112,92,-50],[-138,70,-24],46,1)` |
| 15 | 第 4 关 | `adv_until.sh 180 mid` | `FREE([108,78,198],[83,51,172],46,1)` |
| 16 | 第 2 关 | 领先者约 490 | `FREE([-9.75,92,-20],[-9.75,62,-56],44,1)` |
| 17 | 第 3 关 | `adv_until.sh 393 mid` | `FREE([170,64,-100],[156,49,-117],46,1)` |
| 18 | 第 3 关 | 有人刚被炮管射出（路程 230 左右、x≈136 且离地） | `FREE([153,77,-108],[135,68,-110],50,1)` |
| 19 | 第 3 关 | 任意时刻 | `const a=PT(86);FREE([a.x+26,a.y+12,a.z+22],[a.x+2,a.y+2,a.z],44,1)` |
| 20 | 第 4 关 | 开闸后约 2 秒，大家在跳台前 | `FREE([116,78,58],[99,71,64],50,1)` |
| 21 | 局域网房间 | `teddy-playground/server` 里 `npm start`，打开 4180 端口点「创建房间」，再用 3 个 WebSocket 客户端发 `{"type":"join","room":"房间码","name":"…","character":"pip"}` 加入 | 游戏界面 |
| 22 | 第 1 关 | 开局 | `CLEAN(true);const a=PT(9);FREE([a.x+4,a.y+4.5,a.z],[-146,83.3,-195.6],42,1)` |
| 23 | 第 1 关 | `adv_until.sh 112 mid`（3 个机器人） | 左上 `OFF();CLEAN(false)`，其余三格 `CLEAN(true);FOLLOW(id)`，再用 Pillow 拼成 2×2 |
| 24 | 第 1 关 | 开闸后约 2.5 秒 | 手机视口：`drv.py 430 880 9301`，`OFF()` |
| 25 | 第 3 关 | 有跑者路程约 419 | 摆拍：`WEVAL('(()=>{const b=session.show.players[4].body;b.x=166.5;b.y=40.5;b.z=-93;b.vx=5;b.vy=4;b.vz=3;return 1})()')`，推进 0.65 秒后 `FREE([180,44,-72],[160,34,-94],48,1)` |
| 26 | 第 1 关 | 领先者冲线后 | `FREE([-108,72,-80],[-120,67,-100],44,1)` |
| 27 | 第 2 关 | 本关结束（`phase==='cut'`） | `OFF();CLEAN(false)` |
| 28 | 第 3 关 | 选卡（`phase==='draft'`） | `OFF();CLEAN(false)` |
| 29 | 第 5 关 | `phase==='podium'` | `OFF();CLEAN(false)` |
| 30 | 第 5 关 | `phase==='podium'` | `CLEAN(true);FREE([-112,7,174],[-125,4.6,174],46,1)` |
| 31–33 | — | 仓库现有参考图拼接：`assets/bubbleport-model-references/*/three-quarter.png`、`assets/toy-town-personas/bubbleport-lineup.jpg`、`demo-picker.jpg` | — |

机器人的选路和速度有随机性，所以同一个时机下画面里的人不一定一样；关卡和机关位置由种子决定，是固定的。
