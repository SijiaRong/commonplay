import {SKINS,STYLE_INFO} from './lm/shared/skins.js';
export const entries=[];
function add(project,group,id,name,description,source,shape='圆角块'){
  entries.push({project,group,id,name,description,source,shape});
}
const lm='Lost Marbles',bear='小熊滑滑梯';
const track=[
 ['wood','橡木贴皮','赛道板使用橡木颜色、法线与粗糙度扫描，木纹沿板长方向旋转。'],
 ['ash','白蜡木','积木与立柱使用白蜡木三通道扫描，表层带薄清漆。'],
 ['paint','染色白蜡木','顶点着色透出白蜡木明暗纹理，表层有光泽清漆。'],
 ['rubber','软胶','粗糙表面配合 sheen 表现胶面的柔亮边缘。'],
 ['boost','加速箭纹','程序生成的箭纹同时驱动底色与自发光。'],
 ['checker','终点棋格','程序生成的棋盘格覆盖在清漆表面。']
];
for(const [id,name,desc] of track)add(lm,'赛道与标记','lm-'+id,name,desc,'render/materials.js · render/textures.js');
for(const [id,name,desc] of [
 ['wood','奶油色轨面','wood 槽使用暖色清漆与顶点色。'],['ash','薄荷色积木','ash 槽使用薄荷绿底色和清漆。'],
 ['paint','彩漆玩具','纯色清漆叠加关卡顶点色；这里用珊瑚色展示。'],...track.slice(3),
 ['brass','黄铜','金属表面用于赛道五金。'],['lamp','暖色灯罩','明亮的奶油色灯面叠加暖橙自发光。']
])add(bear,'单人赛道','bear-'+id,name,desc,'solo/js/render/materials.js');
for(const project of [lm,bear])for(const [id,name] of [['banner','印刷横幅'],['sign','路牌印字']])
 add(project,'赛道与标记',project+'-'+id,name,'Canvas 绘制文字和底色，中央平板保留完整图案。','render/courseView.js · render/textures.js','平板');
const patterns=['猫眼','丝带漩涡','星云','玛瑙','气泡玻璃','铬钢','油膜','洋葱层','熔岩','行星','雪景球','萤火虫','冰裂','极光','镜面舞球','活动眼睛'];
patterns.forEach((name,i)=>add(lm,'弹珠内纹','marble-'+i,name,STYLE_INFO[i]+' · '+SKINS.filter(s=>s.style===i).map(s=>s.name).join(' / '),'render/marbles.js · shared/skins.js · shared/looks.js','球体'));
['起点横幅','终点横幅','奶油清漆轨面','薄荷色漆','杏色立柱','加速箭纹','终点棋格'].forEach((name,i)=>add(bear,'经典滑梯','classic-'+i,name,'按烘焙赛道的 GLB 插槽和运行时替换规则取样。','slide/wooden-chute.glb · slide/course-materials.js',i<2?'平板':'圆角块'));
add(bear,'软垫跑道','runway-0','绗缝软垫','模型 UV 图集提供颜色与金属度／粗糙度。','solo/models/quilted-runway.glb','平板');
add(bear,'软垫跑道','runway-1','鼠尾草绿包边','软垫边缘的独立纯色材质。','solo/models/quilted-runway.glb');
const chars=await (await fetch('./models/characters.json')).json();
for(const c of chars)add(bear,'玩偶表面','char-'+c.id,c.name,c.id==='teddy'?'沿用原色图、程序绒纹与双层短绒；球面展示局部毛料。':'模型颜色与金属度／粗糙度图集按几何体 UV 展开。',c.id==='teddy'?'teddy-bear-animated.glb · slide/plush.js':'characters/'+c.id+'-animated.glb','球体');

for(const [id,name,desc,source] of [
 ['shard','彩纸与碎片','彩纸与玻璃碎片共用清漆表面，原场景按实例着色。','fx.js'],
 ['dust','浮尘光点','64 像素径向渐变驱动加法混合光点，火花也使用这张精灵纹理。','env.js · fx.js'],
 ['ring','冲击波环','双面圆环叠加到画面上；此处固定在展开状态。','fx.js'],
 ['lamp','台灯金属外壳','夜场道具的金属清漆在统一日光下取样。','night.js'],
 ['bulb','串灯灯泡','直接输出实例颜色的灯泡表面。','night.js'],
 ['sticker','夜光贴纸','程序距离场在平面上绘制圆点、星形和月牙。','night.js'],
 ['halo','灯泡光晕','同一平面着色器的径向衰减分支。','night.js']
])add(lm,'道具与特效','fx-'+id,name,desc,'render/'+source,id==='sticker'||id==='halo'?'平面':id==='dust'?'点精灵':id==='ring'?'圆环':'球体');

const port='泡泡星港版小熊滑滑梯';
for(const [id,name,description,bearSlot,lostSlot] of [
 ['acrylic','蜜桃气泡亚克力','回转弯土星灯球。抛光外壳折射背景，视线穿过桃色流纹与悬浮微泡，球心的桃色比边缘更浓。','oldGlobe',null],
 ['road','象牙涂层','单人跑道与经典滑梯的主体涂层，以底色、微法线及粗糙度三张图表现细微起伏。','wood','wood'],
 ['resin','薄荷树脂','薄荷树脂槽使用独立三通道贴图，替代原版的纯色清漆表面。','ash','ash'],
 ['trim','白蜡木饰条','门架与支架横撑，使用略带象牙色的白蜡木扫描。','ash','ash'],
 ['paint','彩色模塑外壳','顶点色控制部件颜色，叠加薄荷树脂的模具法线与粗糙度。','paint','paint'],
 ['rubber','软胶','触感较哑的软胶，带很薄的清漆。','rubber','rubber'],
 ['brass','拉丝黄铜','土星环与五金件。刷纹同时调制粗糙度和凹凸。','brass',null],
 ['lamp','琥珀灯面','轨边小灯使用暖色自发光。','lamp',null],
 ['boost','加速箭纹','箭纹同时进入底色与自发光通道。','boost','boost'],
 ['checker','终点棋格','程序棋格印在清漆表面。','checker','checker']
]){
 add(port,id==='acrylic'?'土星灯':'赛道表面','port-'+id,name,description,'bubblecity-teddy-slide / solo/js/render/'+(id==='acrylic'?'acrylic':'materials')+'.js',id==='acrylic'?'球体':'圆角块');
 const e=entries.at(-1);
 e.comparisons=[[id==='acrylic'?'oldGlobe':'bear-'+bearSlot,id==='acrylic'?'原版蜜桃彩漆灯球':'小熊滑滑梯 · '+entries.find(x=>x.id==='bear-'+bearSlot).name]];
 if(lostSlot)e.comparisons.push(['lm-'+lostSlot,'Lost Marbles · '+entries.find(x=>x.id==='lm-'+lostSlot).name]);
}

for(const [key,name,ref,title] of [
 ['base','航标灯黄铜底座','brass','黄铜'],['amber','琥珀航标透镜','lamp','暖色灯罩'],['jade','翡翠航标透镜','lamp','暖色灯罩']
]){
 add(port,'沿线航标','beacon-'+key,name,key==='base'?'沿线小航标的哑光黄铜底座与环箍。':'沿线航标的自发光表面，灯色按轨道两侧区分。','bubblecity-teddy-slide / slide/harbor-lights.js',key==='base'?'圆柱':'球体');
 entries.at(-1).comparisons=[['bear-'+ref,'小熊滑滑梯 · '+title]];
}
