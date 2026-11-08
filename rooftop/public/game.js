import * as T from '/lib/three.module.js';
import {couriers} from './models.js';
import {buildShow, STAGE_NAMES as titles} from '/track/shared/course.js';
import {CourseView} from '/track/js/render/courseView.js';
const $=id=>document.getElementById(id);
const scene=new T.Scene(), sky=0xb7d7d5;
scene.background=new T.Color(sky);
scene.fog=new T.FogExp2(sky,.012);
scene.add(new T.HemisphereLight(0xfff5dc,0x8b9b9c,2.35));
const light=new T.DirectionalLight(0xffdeb1,2.3);
light.position.set(-15,30,16);scene.add(light);
const camera=new T.PerspectiveCamera(57,1,.1,320);
let renderer;
try { renderer=new T.WebGLRenderer({canvas:$('world'),antialias:true}); }
catch(error){$('signal').textContent='3D 未启动';$('summary').textContent='请使用支持 WebGL 2 的浏览器，并启用图形加速后刷新。';$('join').hidden=true;throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
onresize=resize;resize();
const requestedSeed=new URLSearchParams(location.search).get('seed');
const replaySeed=/^\d{1,10}$/.test(requestedSeed) && Number(requestedSeed)<=0xffffffff ? Number(requestedSeed) : undefined;
let seed=replaySeed??71, stage=0, layoutSeed=seed, stages=buildShow(seed);
let course=new CourseView(stages[0],'low'), cameraYaw=0;
scene.add(course.group);
const draw=couriers(scene);
let practice=true;
let socket,you=-1,phase='welcome',until=0,lastTick=0,loadTick=0,seq=0;
let runners=[],previous=new Map(),received=0,roster=[],ranking=[],eliminated=false,qualified=false;
let sizes=new Map(), notice='', noticeEnd=0,queuedName='';
const keys=new Set(),names={
  polish:'极速鞋',rubber:'起步加速',lead:'抗撞配重',spring:'弹力靴',gyro:'空中转向',feather:'轻装冲刺',grip:'防滑鞋底',turbo:'主动加速',headstart:'抢跑推进',magnet:'奖励加成',aero:'低阻外套',tailwind:'顺风提速',recovery:'快速复位',bounce:'稳固底盘',bumper:'弹力护肩',slip:'尾流跟跑',comeback:'落后追击',front:'领先提速',double:'二段跳',gravwell:'快速下落',anchor:'主动定身',bully:'强力冲撞',second:'复位冲刺',sticky:'贴墙转向',pack:'结队提速',lone:'独行加速',clutch:'终段冲刺',highroller:'补给重抽',pogo:'主动高跳',shockwave:'主动震荡',ghost:'主动穿行',momentum:'连续加速',glass:'轻量疾跑',growth:'重装护具',pocket:'紧凑身形',triple:'三段跳',slingshot:'弯后加速',iron:'抗震装甲',rocket:'主动推进',lucky:'淘汰豁免',golden:'全能强化',warp:'主动跃迁',phoenix:'高速返场',crown:'加速补给',midas:'碰撞奖励'
};
function showAbility(id) {
  const hint = $('abilityHint');
  hint.hidden = !id;
  hint.textContent = id ? 'Shift / E　' + (names[id] || id) : '';
  $('pad').querySelector('[data-key="KeyE"]').hidden = !id;
}
function say(text,seconds=3){notice=text;noticeEnd=performance.now()+seconds*1000;}
function preview(){
  if(practice)return [];
  return stages[stage].grid.map(([x,y,z],id)=>({id,flags:1,x,y,z,vx:0,vz:0}));
}
function panel(title,description) {
  $('panel').hidden=false;$('panel').querySelector('h1').textContent=title;
  $('summary').textContent=description;$('join').hidden=true;$('room').hidden=true;$('choices').replaceChildren();
}
function send(m){if(socket?.readyState===1)socket.send(JSON.stringify(m));}
function connect() {
  socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/race');
  socket.binaryType='arraybuffer';
  socket.onopen=()=>{$('signal').textContent='局域网在线';if(queuedName)send({t:'join',name:queuedName,seed:replaySeed});};
  socket.onmessage=e=>typeof e.data==='string'?message(JSON.parse(e.data)):snapshot(e.data);
  socket.onclose=()=>{phase='offline';showAbility(null);panel('连接已断开','确认电脑和同伴处于同一局域网，然后重新进入房间。');$('signal').textContent='离线';$('hud').hidden=$('pad').hidden=true;const b=document.createElement('button');b.textContent='重新连接';b.onclick=()=>location.reload();$('choices').append(b);};
}
function showStage(i) {
  stage=Math.max(0,i);
  if(seed!==layoutSeed){stages=buildShow(seed);layoutSeed=seed;}
  if(course.stage!==stages[stage]){
    scene.remove(course.group);course.dispose();
    course=new CourseView(stages[stage],'low');scene.add(course.group);
  }
  const path=course.stage.path;
  cameraYaw=Math.atan2(path.tx[0],path.tz[0]);
  camera.userData.ready=false;
  runners=[];previous.clear();qualified=false;ranking=[];
  $('stage').textContent=titles[stage]+' · 种子 '+seed;
}
function message(m) {
  if(m.t==='mode'){
    practice=m.practice;
    if(practice){
      $('summary').textContent='自由练习移动、转向和跳跃。到达终点后返回起点。';
      $('join').querySelector('button').textContent='开始练习 →';
    }
    $('timer').hidden=practice;
    return;
  }
  if(m.t==='lobby'){
    phase='lobby';showAbility(null);panel('集合发车',m.host?'等同伴进入同一地址，再发车。空位由机器人补齐。':'已进入房间，等待房主发车。');
    $('room').hidden=false;$('start').hidden=!m.host;$('roster').textContent=m.players.join(' · ');
    $('hud').hidden=$('pad').hidden=true;you=-1;notice='';return;
  }
  if(m.t==='show'){
    const s=m.state;seed=m.seed;you=m.you;roster=m.players;phase=s.phase;until=s.phaseEnd;
    eliminated=you<0||!s.players[you]?.alive;loadTick=s.loadTick;lastTick=s.tick;sizes=new Map(s.players.map(p=>[p.id,p.r]));
    showAbility(!eliminated && s.players[you]?.act);showStage(s.stage);$('panel').hidden=true;$('hud').hidden=false;seq=0;
    $('pad').hidden=!matchMedia('(pointer:coarse)').matches||eliminated;
    if(you<0)say('本局观赛 · 下一局可加入',5);return;
  }
  if(m.t==='board'){ranking=m.r;return;}
  if(m.t!=='ev')return;
  switch(m.e){
    case 'phase':phase=m.phase;until=m.until;if(!['starter','draft','podium'].includes(phase))$('panel').hidden=true;break;
    case 'stage':showAbility(m.roster.find(([id])=>id===you)?.[2]);loadTick=m.loadTick;showStage(m.index);sizes=new Map(m.roster.map(([id,r])=>[id,r]));break;
    case 'draft':{
      panel('选择装备','本轮选择 '+m.need+' 件装备，倒计时结束会自动补选。');
      const picks=new Set(m.picks);
      m.options.forEach((option,i)=>{const b=document.createElement('button');b.textContent=names[option]||option;b.disabled=picks.has(i);b.onclick=()=>{send({t:'pick',i});picks.add(i);b.disabled=true;if(picks.size>=m.need)$('panel').hidden=true;};$('choices').append(b);});break;
    }
    case 'qualify':if(m.id===you){qualified=true;say('已送达 · 第 '+(m.order+1)+' 名',5);}break;
    case 'cut':if(m.ids.includes(you)){showAbility(null);eliminated=true;$('pad').hidden=true;say('本轮淘汰 · 跟随领先选手',5);}break;
    case 'results':{
      const ranked=m.results.slice().sort((a,b)=>a.place-b.place),self=ranked.find(p=>p.id===you);
      panel('送达榜',ranked.slice(0,3).map(p=>p.place+'. '+p.name).join('　')+(self?'　你的名次：'+self.place:'')+'。稍后返回房间。');break;
    }
  }
}
// Read the public snapshot layout. Network buffers stay separate from interpolated display poses.
function snapshot(buf){
  const v=new DataView(buf);lastTick=v.getUint32(1,true);received=performance.now();
  previous=new Map(runners.map(r=>[r.id,r]));
  const next=[];
  for(let i=0,o=66;i<v.getUint8(65);i++,o+=15){
    const id=v.getUint8(o),vx=v.getInt16(o+9,true)/100,vz=v.getInt16(o+13,true)/100;
    next.push({id,flags:v.getUint8(o+1),tp:v.getUint8(o+2),x:v.getInt16(o+3,true)/40,y:v.getInt16(o+5,true)/40,z:v.getInt16(o+7,true)/40,vx,vz,radius:sizes.get(id),heading:Math.hypot(vx,vz)>.5?Math.atan2(-vx,-vz):previous.get(id)?.heading||0});
  }
  runners=next;
}
$('join').onsubmit=e=>{e.preventDefault();queuedName=$('name').value.trim()||'信使 '+Math.floor(100+Math.random()*900);send({t:'join',name:queuedName,seed:replaySeed});};
$('start').onclick=()=>send({t:'start'});
const controls=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','KeyE','KeyF','ShiftLeft','ShiftRight','KeyR'];
function input(){
  if(phase!=='race'||eliminated)return;
  const held=(...codes)=>Number(codes.some(k=>keys.has(k)));
  const f=held('KeyW','ArrowUp')-held('KeyS','ArrowDown');
  const r=held('KeyD','ArrowRight')-held('KeyA','ArrowLeft');
  const mx=Math.round(100*(f*Math.sin(cameraYaw)-r*Math.cos(cameraYaw)));
  const mz=Math.round(100*(f*Math.cos(cameraYaw)+r*Math.sin(cameraYaw)));
  send({t:'i',q:[[++seq,mx,mz,held('Space')+2*held('KeyE','KeyF','ShiftLeft','ShiftRight','MouseRight')+4*held('KeyR')]]});
}
onkeydown=e=>{if(phase!=='race'||!controls.includes(e.code))return;e.preventDefault();keys.add(e.code);if(!e.repeat)input();};
onkeyup=e=>{keys.delete(e.code);if(controls.includes(e.code))input();};
onblur=()=>{keys.clear();input();};
for(const b of $('pad').querySelectorAll('button')){
  b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);input();};
  b.onlostpointercapture=()=>{keys.delete(b.dataset.key);input();};
}
$('world').oncontextmenu=e=>{if(phase==='race')e.preventDefault();};
$('world').onpointerdown=e=>{if(e.button===2 && phase==='race'){keys.add('MouseRight');input();}};
window.addEventListener('pointerup',e=>{if(e.button===2){keys.delete('MouseRight');input();}});
setInterval(input,50);
connect();
const target=new T.Vector3(),focus=new T.Vector3();
let last=0;
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.1,(now-last)/1000);last=now;
  const idle=['welcome','lobby','offline','starter'].includes(phase);
  const alpha=Math.min(1,(now-received)/50);
  const visible=idle?preview():runners.map(r=>{
    const prev=previous.get(r.id);
    if(!prev||prev.tp!==r.tp)return r;
    return {...r,x:T.MathUtils.lerp(prev.x,r.x,alpha),y:T.MathUtils.lerp(prev.y,r.y,alpha),z:T.MathUtils.lerp(prev.z,r.z,alpha)};
  });
  draw(visible,you,now/1000);course.update(idle?now/1000:(lastTick-loadTick)/60,dt,!idle&&!['intro','countdown'].includes(phase));
  const player=visible.find(r=>r.id===(eliminated?ranking[0]:you))||visible[0];
  if(idle||!player){
    const [x,y,z]=course.stage.grid[0];
    target.set(x+24,y+19,z-22);focus.set(x-2,y,z+12);
  }else{
    const path=course.stage.path;
    let nearest=0, best=Infinity;
    for(let i=0;i<path.n;i++){
      const d=(path.x[i]-player.x)**2+(path.y[i]-player.y)**2+(path.z[i]-player.z)**2;
      if(d<best){best=d;nearest=i;}
    }
    const yaw=Math.atan2(path.tx[nearest],path.tz[nearest]);
    const delta=yaw-cameraYaw;
    cameraYaw+=Math.atan2(Math.sin(delta),Math.cos(delta))*(1-Math.exp(-dt*6));
    const fx=Math.sin(cameraYaw), fz=Math.cos(cameraYaw);
    target.set(player.x-8.2*fx,player.y+5.7,player.z-8.2*fz);
    focus.set(player.x+4*fx,player.y+.55,player.z+4*fz);
  }
  if(!camera.userData.ready){camera.position.copy(target);camera.userData.ready=true;}
  camera.position.lerp(target,1-Math.exp(-dt*8));camera.lookAt(focus);
  $('timer').textContent=Math.max(0,Math.ceil((until-lastTick)/60))+' 秒';
  const place=ranking.indexOf(you)+1;
  $('standing').textContent=practice?'自由练习':eliminated?'观赛':qualified?'已送达':place?'第 '+place+' / '+ranking.length+' 名':'准备中';
  $('notice').textContent=phase==='countdown'?String(Math.max(1,Math.ceil((until-lastTick)/60))):phase==='intro'?titles[stage]:now<noticeEnd?notice:'';
  renderer.render(scene,camera);
}
requestAnimationFrame(frame);
