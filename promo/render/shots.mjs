// Shot list for the 95-second promo, one entry per storyboard shot (promo/storyboard.zh-CN.md).
// World coordinates were measured on course seed 20261108; keep SEED unchanged or re-measure.
//
// part.kind
//   race      小熊滑滑梯 capture build, solo race with bots, deterministic frame stepping
//   split4    race, four follow cameras composed 2x2
//   mobile    race on a phone-sized viewport with the game HUD, composed onto a backdrop
//   lobby     LAN party server room, players joining (real time)
//   picker    character picker dialog, single still with a slow zoom
//   bubbleport 泡泡星港 demo panorama, slow mouse orbit
//   still     an image from promo/shots with a slow zoom
//   endcard   promo/render/endcard.html
//
// trigger (race kinds): fast-forward the simulation until all given conditions hold
//   stage: 0-4, phase: intro|countdown|race|cut|draft|podium, lead|mid|last: path distance reached by
//   that runner, runner: {pick, s} a picked runner reached distance s, expr: page expression.
// pick: {char:'tik'} prefers that character, else nearest runner to `near` (path distance), else 'me'.
// cam: see camAt() in render.mjs. Values given as [from, to] are interpolated over the part with easing.
// events: [{at: seconds, ...}] knock (push a runner for `for` seconds), teleport (offset + velocity),
//         hold (repeat the current frame for `hold` seconds = freeze frame).
// speed: simulation speed (0.5 = slow motion). title: [zh, en] shown for the whole part, fading in/out.

export const SEED = 20261108;
export const BOTS = 15; // 15 bots + you = 16 runners

const T = (zh, en) => [zh, en];

export const shots = [
  // ---------------------------------------------------------------- 第一幕 开场全景 0–12s
  {id: 1, parts: [{kind: 'race', dur: 3, trigger: {stage: 0, phase: 'intro'}, hold: true,
    cam: {type: 'free', eye: [[-30, 58, -30], [-62, 66, -66]], at: [[-120, 76, -100], [-132, 76, -108]], fov: [38, 40]}}]},
  {id: 2, parts: [{kind: 'race', dur: 4, trigger: {stage: 0, phase: 'intro'}, hold: true, title: T('欢迎来到玩具城', 'Welcome to Toy Town'),
    cam: {type: 'orbit', center: [-135, 72, -110], radius: [200, 190], height: [128, 112], angle: [27, 57], fov: 38}}]},
  {id: 3, note: '小熊伸懒腰需要新动画；当前用待机动作代替',
    parts: [{kind: 'race', dur: 2, trigger: {stage: 0, phase: 'intro'}, hold: true,
      cam: {type: 'runner', pick: 'me', mode: 'front', dist: [3.2, 2.6], up: 1.1, lift: 0.8, fov: 34}}]},
  {id: 4, parts: [
    {kind: 'race', dur: 0.75, trigger: {stage: 1, phase: 'intro'}, hold: true, cam: {type: 'free', eye: [[150, 190, -10], [140, 188, -2]], at: [0, 80, -125], fov: 40}},
    {kind: 'race', dur: 0.75, trigger: {stage: 2, phase: 'intro'}, hold: true, cam: {type: 'free', eye: [[260, 180, -60], [255, 178, -48]], at: [135, 55, -110], fov: 40}},
    {kind: 'race', dur: 0.75, trigger: {stage: 3, phase: 'intro'}, hold: true, cam: {type: 'free', eye: [[190, 150, 250], [180, 148, 258]], at: [75, 45, 110], fov: 40}},
    {kind: 'race', dur: 0.75, trigger: {stage: 4, phase: 'intro'}, hold: true, cam: {type: 'free', eye: [[60, 170, 280], [48, 168, 286]], at: [-80, 35, 110], fov: 40}},
  ]},

  // ---------------------------------------------------------------- 第二幕 赛道与机关 12–38s
  {id: 5, parts: [{kind: 'race', dur: 3, trigger: {stage: 0, lead: 28}, title: T('五关赛道，关关不同', 'Five courses'),
    cam: {type: 'path', s: 42, eye: {s: 60, side: 3, up: 8}, at: {s: 42, up: 1}, fov: 42}}]},
  {id: 6, parts: [{kind: 'race', dur: 3, trigger: {stage: 2, mid: 38}, speed: 0.5,
    cam: {type: 'path', eye: {s: 50, side: [9, 8], up: [2.5, 2.2]}, at: {s: 50, up: 2}, fov: 46}}]},
  {id: 7, parts: [{kind: 'race', dur: 2, trigger: {stage: 0, lead: 128},
    cam: {type: 'path', eye: {s: 147, up: 15, back: 2}, at: {s: 147, up: 0}, fov: 44}}]},
  {id: 8, parts: [{kind: 'race', dur: 2, trigger: {stage: 2, mid: 268},
    cam: {type: 'path', eye: {s: [278, 280], back: 6, side: -6, up: 2}, at: {s: 284, up: 1}, fov: 46}}]},
  {id: 9, parts: [{kind: 'race', dur: 2, trigger: {stage: 2, mid: 104},
    cam: {type: 'path', eye: {s: 126, side: -8, up: [3, 9]}, at: {s: [114, 120], up: [1, 4]}, fov: 46}}]},
  {id: 10, parts: [
    {kind: 'race', dur: 2, trigger: {stage: 0, mid: 165}, title: T('大型游乐设施', 'Giant rides'),
      cam: {type: 'orbit', center: [-137, 66, -30], radius: [30, 26], height: [24, 12], angle: [-60, 30], fov: 46}},
    {kind: 'race', dur: 2, trigger: {stage: 3, mid: 168}, title: T('大型游乐设施', 'Giant rides'),
      cam: {type: 'orbit', center: [85, 50, 172], radius: [34, 28], height: [26, 12], angle: [40, 130], fov: 46}},
  ]},
  {id: 11, parts: [{kind: 'race', dur: 4, trigger: {stage: 1, lead: 470},
    cam: {type: 'orbit', center: [-9.75, 62, -54.5], radius: [5, 4], height: [32, 26], angle: [90, 140], fov: 46}}]},
  {id: 12, parts: [{kind: 'race', dur: 2, trigger: {stage: 2, lead: 208},
    cam: {type: 'free', eye: [[136.5, 69, -122], [136.5, 66, -110]], at: [136.5, 62, -100], fov: 44}}]},
  {id: 13, parts: [
    {kind: 'race', dur: 4 / 3, place: 0, trigger: {stage: 2, mid: 78}, cam: {type: 'path', eye: {s: 86, side: [26, 24], up: 12, back: -22}, at: {s: 86, side: 2, up: 2}, fov: 44}},
    {kind: 'race', dur: 4 / 3, place: 2, trigger: {stage: 2, mid: 388}, cam: {type: 'free', eye: [[170, 64, -100], [168, 62, -104]], at: [156, 49, -117], fov: 46}},
    {kind: 'race', dur: 4 / 3, place: 1, trigger: {stage: 3, lead: 34}, cam: {type: 'free', eye: [[116, 78, 58], [117, 77, 62]], at: [99, 71, 64], fov: 50}},
  ]},

  // ---------------------------------------------------------------- 第三幕 集结与开赛 38–52s
  {id: 14, parts: [{kind: 'picker', dur: 3, title: T('选一个伙伴', 'Pick your buddy')}]},
  {id: 15, parts: [{kind: 'lobby', dur: 3, joiners: [{at: 0.4, name: '小满', character: 'pip'}, {at: 1.1, name: '阿树', character: 'duck'}, {at: 1.8, name: '七七', character: 'hedgehog'}]}]},
  {id: 16, parts: [{kind: 'race', dur: 3, trigger: {stage: 0, phase: 'intro'}, hold: true, countdown: true,
    cam: {type: 'free', eye: [[-150, 87.5, -177], [-142, 87.5, -177]], at: [[-149, 83.3, -195.6], [-143, 83.3, -195.6]], fov: 42}}]},
  {id: 17, note: '新录：开闸冲出', parts: [{kind: 'race', dur: 2, trigger: {stage: 0, phase: 'race'},
    cam: {type: 'path', eye: {s: 14, up: 1.6}, at: {s: 0, up: 1}, fov: 50}}]},
  {id: 18, parts: [{kind: 'race', dur: 3, trigger: {stage: 0, lead: 22},
    cam: {type: 'path', eye: {s: [20, 36], up: 4.5, back: 0}, at: {s: [30, 46], up: 1}, fov: 46}}]},

  // ---------------------------------------------------------------- 第四幕 赛中高光 52–80s
  {id: 19, parts: [{kind: 'split4', dur: 3, trigger: {stage: 0, mid: 106}, title: T('最多 16 人同场', 'Up to 16 players')}]},
  {id: 20, note: '机器人很少被锤中，这里在 0.6 秒时推一下滴克制造撞飞；成片前检查效果',
    parts: [{kind: 'race', dur: 3, trigger: {stage: 2, runner: {pick: {char: 'tik', near: 44}, s: 42}},
      events: [{at: 0.6, knock: {vx: 0, vy: 9, side: 11}, for: 0.12}, {at: 0.75, hold: 0.3}],
      cam: {type: 'path', eye: {s: 50, side: 12, up: 4}, at: {s: 48, up: 2}, fov: 48}}]},
  {id: 21, parts: [{kind: 'race', dur: 3, speed: 0.5,
    trigger: {stage: 2, expr: "ROWS().some(r=>r[10]>222&&r[10]<234&&r[1]>134&&r[2]>PT(r[10]).y+2)"},
    cam: {type: 'free', eye: [[153, 77, -108], [152, 78, -114]], at: [[135, 68, -110], [136, 70, -118]], fov: 50}}]},
  {id: 22, note: '摆拍：把一圈小刺猬移出护栏，让它掉下去',
    parts: [
      {kind: 'race', dur: 2, trigger: {stage: 2, runner: {pick: {char: 'hedgehog', near: 420}, s: 418}},
        events: [{at: 0.3, teleport: {dx: 9, dy: 1, dz: 5, vx: 5, vy: 4, vz: 3}}],
        cam: {type: 'runnerfixed', pick: 'picked', eye: [180, 44, -72], fov: 48}},
      {kind: 'race', dur: 1, cam: {type: 'runner', pick: 'picked', mode: 'behind', dist: 5, up: 2.4, lift: 0.6, fov: 50}},
    ]},
  {id: 23, parts: [{kind: 'race', dur: 3, trigger: {stage: 0, mid: 168},
    cam: {type: 'runner', pick: 'mid', mode: 'above', dist: 5, up: 8, lift: 0, fov: 48}}]},
  {id: 24, parts: [{kind: 'race', dur: 3, trigger: {stage: 1, runner: {pick: {char: 'ray', near: 480}, s: 482}},
    cam: {type: 'free', eye: [[-9.75, 92, -22], [-9.5, 88, -30]], at: [-9.75, 62, -56], fov: 44}}]},
  {id: 25, note: '脚手架可能挡镜头，先看预览再定机位', parts: [{kind: 'race', dur: 3, trigger: {stage: 4, lead: 338}, speed: 0.6,
    cam: {type: 'free', eye: [[-118, 62, 82], [-116, 58, 60]], at: [[-52, 44, 80], [-52, 36, 56]], fov: 46}}]},
  {id: 26, parts: [{kind: 'mobile', dur: 3, trigger: {stage: 0, lead: 30}, title: T('手机打开就能玩', 'Play in your browser')}]},
  {id: 27, parts: [{kind: 'race', dur: 4, trigger: {stage: 0, lead: 222},
    cam: {type: 'path', eye: {s: 256, up: 1.2}, at: {s: 238, up: 1}, fov: 44}}]},

  // ---------------------------------------------------------------- 第五幕 结算与收尾 80–95s
  {id: 28, parts: [
    {kind: 'race', dur: 1.5, trigger: {stage: 1, phase: 'cut'}, hud: true, cam: {type: 'game'}},
    {kind: 'race', dur: 1.5, trigger: {stage: 1, phase: 'draft'}, hud: true, cam: {type: 'game'}},
  ]},
  {id: 29, parts: [{kind: 'race', dur: 3, trigger: {stage: 4, phase: 'podium'}, hud: true, cam: {type: 'game'}, title: T('五关积分，谁都不淘汰', 'Points, no elimination')}]},
  {id: 30, parts: [{kind: 'race', dur: 3, trigger: {stage: 4, phase: 'podium'}, settle: 2,
    cam: {type: 'free', eye: [[-113, 6.6, 174], [-108, 8, 174]], at: [-125, 4.6, 174], fov: 46}}]},
  {id: 31, note: '摩天轮、土星装置、居民尚未建模：当前用泡泡星港试玩全景 + 居民概念图代替', parts: [
    {kind: 'bubbleport', dur: 2.5},
    {kind: 'still', dur: 1.5, image: 'promo/shots/32.jpg', zoom: [1.0, 1.08]},
  ]},
  {id: 32, parts: [{kind: 'endcard', dur: 2}]},
];
