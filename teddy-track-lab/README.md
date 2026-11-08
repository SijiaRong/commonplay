# 小熊滑滑梯 · 赛道实验室

从 `teddy-playground/dist` 独立复制的子 demo；原项目未修改。

- 沿用小熊及现有角色动画、毛绒着色、木材扫描、房间 HDR、接触阴影与移轴镜头。
- 赛道菜单：经典滑梯、胶囊绕行、双摆锤、回环岔路。新赛道支持 16 / 19.2（+20%）净宽对照。
- 新赛道路面、护栏和碰撞来自同一套参数几何；机关碰撞使用程序胶囊、球体和摆杆。
- Hi3D 仅复用上一版已生成的独立胶囊/锤头外观，无新增积分消耗。
- 出发后自动滑行，A/D 转向，W 加速，S 减速，空格跳跃；可切换俯瞰。
- 回环右侧入环、左侧绕行。倒置段采用沿同一轨道采样的磁吸导向，空格可脱离；这是试玩辅助，并非原游戏刚体实现。
- 三类新路段是独立试玩站，尚未串成五关或接入多人模式。沿用素材的来源与授权边界未因本次 fork 改变，不宣称已完成版权清理。

## 本地运行

```sh
python3 -m http.server 8892 --directory dist
node --test tests/physics.test.mjs
```

用于核对的状态显示：网址加 `?inspect=1`，生产默认不显示。

## 来源

- 基础界面、角色、渲染：本仓库 `teddy-playground/dist`。
- 程序路段与碰撞：本仓库 `bubbleport-demo/dist/course.mjs`、`physics.mjs`。
- 新路段木纹使用原小熊 demo 的 Poly Haven oak/ash 贴图；房间保留原来源说明。
- Hi3D 外观与原始生成记录：`../bubbleport-demo/prop-sources.json`。
