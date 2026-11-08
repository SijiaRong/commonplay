import * as T from 'three';
import {createRider} from '../bubblecity-teddy-slide/dist/slide/rider.js';
import {GLTFLoader} from '../bubblecity-teddy-slide/dist/vendor/GLTFLoader.js';
import {loadDaylight} from '../bubblecity-teddy-slide/dist/slide/daylight.js';
import {applyRoom,prefs} from '../bubblecity-teddy-slide/dist/slide/preferences.js';
import {addHarborLights} from '../bubblecity-teddy-slide/dist/slide/harbor-lights.js';
import {getMaterials} from '../bubblecity-teddy-slide/dist/solo/js/render/materials.js';

const $=id=>document.getElementById(id), canvas=$('stage');
const scene=new T.Scene(), renderer=new T.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.toneMapping=T.ACESFilmicToneMapping;
const camera=new T.PerspectiveCamera(34,1,.12,350), loader=new GLTFLoader();
const assembled=new T.Group(),original=new T.Group(), landmark=new T.Group();
scene.add(assembled,original,landmark);original.visible=false;
const radius=14.5, half=Math.PI*radius, arc=3*half, first=-8,last=arc+14;
const vec=(x,y,z)=>new T.Vector3(x,y,z);
const material=(color,roughness=.5,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
const city=getMaterials('high',renderer,{lite:matchMedia('(pointer:coarse)').matches});
const {road:cream,coral,trim:oak,brass:gold,resin:jade}=city;
function solid(group,geo,mat,x,y,z){const o=new T.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;group.add(o);return o;}
function box(group,x,y,z,w,h,l,mat){return solid(group,new T.BoxGeometry(w,h,l),mat,x,y,z);}
function cylinder(group,x,y,z,r,h,mat){return solid(group,new T.CylinderGeometry(r,r,h,40),mat,x,y,z);}
const fill=new T.HemisphereLight(0xfff8ec,0xc4bbb0,1.7);
const sun=new T.DirectionalLight('#fff1dc',2.12);
sun.position.set(.62,.62,.48).normalize().multiplyScalar(70);
sun.castShadow=true;
Object.assign(sun.shadow.camera,{left:-39,right:39,top:40,bottom:-40,far:135});
sun.shadow.mapSize.set(1024,1024);sun.shadow.bias=-.00025;sun.shadow.normalBias=.04;
scene.add(fill,sun,sun.target);
let illuminate;
const player=new T.Group();assembled.add(player);
let rider,globe,finishedTime=0,lean=0;
const backdrop=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType});
let lastBackdrop=-Infinity;
function path(s,d=0){const a=T.MathUtils.clamp(s,0,arc)/radius;
return vec((radius+d)*Math.cos(a),s<0?16-.075*s:s>arc?4-.05*(s-arc):16-4*s/half,(radius+d)*Math.sin(a)+(s<0?s:s>arc?arc-s:0));}
// Bucket the actual textured triangles once. Ground contact follows the upper face of the selected deck.
function buildFloor(geo){
 const pos=geo.attributes.position.array,indices=geo.index.array,bins=new Map();
 const key=(x,z)=>Math.floor(x)+100*Math.floor(z);
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
  const xs=[pos[a],pos[b],pos[c]],zs=[pos[a+2],pos[b+2],pos[c+2]];
  for(let x=Math.floor(Math.min(...xs));x<=Math.floor(Math.max(...xs));x++)
   for(let z=Math.floor(Math.min(...zs));z<=Math.floor(Math.max(...zs));z++){
    const k=key(x,z);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);
   }
 }
 return (x,z)=>{
  let y=-Infinity;
  for(const i of bins.get(key(x,z))||[]){
   const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
   const vx=pos[b]-pos[a],vz=pos[b+2]-pos[a+2],wx=pos[c]-pos[a],wz=pos[c+2]-pos[a+2],det=vx*wz-vz*wx;
   if(Math.abs(det)<1e-9)continue;
   const dx=x-pos[a],dz=z-pos[a+2],u=(dx*wz-dz*wx)/det,v=(vx*dz-vz*dx)/det;
   if(u>=-1e-5&&v>=-1e-5&&u+v<=1.00001)y=Math.max(y,pos[a+1]+u*(pos[b+1]-pos[a+1])+v*(pos[c+1]-pos[a+1]));
  }
  return y;
 };
}
let sampleFloor;
function actual(s,d){const q=path(s,d);if(s<=0||s>=arc)return q;
 const n=Math.min(2,Math.floor(s/half)),a=s/radius-n*Math.PI;
 q.y=16-4*n+sampleFloor((radius+d)*Math.cos(a),(radius+d)*Math.sin(a));return q;
}
// Give the riding surface its own tileable UVs while retaining the scanned artwork on the shell.
function finishDeck(mesh){
 const g=mesh.geometry, pos=g.attributes.position, ids=g.index.array;
 const uv=new Float32Array(pos.count*2), shell=[], deck=[];
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),z=pos.getZ(i);
  uv[2*i]=radius*Math.atan2(z,x)/7;
  uv[2*i+1]=Math.hypot(x,z)/7;
 }
 const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),normal=new T.Vector3();
 for(let i=0;i<ids.length;i+=3){
  a.fromBufferAttribute(pos,ids[i]);b.fromBufferAttribute(pos,ids[i+1]);c.fromBufferAttribute(pos,ids[i+2]);
  normal.crossVectors(b.sub(a),c.sub(a)).normalize();
  const heightAboveDeck=a.y+4*Math.atan2(a.z,a.x)/Math.PI;
  const group=normal.y>.8 && Math.abs(heightAboveDeck)<.25 ? deck : shell;
  group.push(ids[i],ids[i+1],ids[i+2]);
 }
 const enamel=cream.clone();
 for(const slot of ['map','normalMap','roughnessMap']){
  enamel[slot]=cream[slot].clone();enamel[slot].channel=1;enamel[slot].needsUpdate=true;
 }
 g.setAttribute('uv1',new T.BufferAttribute(uv,2));
 g.setIndex(shell.concat(deck));g.clearGroups();
 g.addGroup(0,shell.length,0);g.addGroup(shell.length,deck.length,1);
 mesh.material=[mesh.material,enamel];
}
function straight(inlet){
 const l=inlet?8:14,grade=inlet?.075:.05,x=inlet?radius:-radius,top=inlet?16:4;
 const g=new T.Group();assembled.add(g);g.position.set(x,top,0);g.rotation.x=inlet?Math.atan(grade):-Math.atan(grade);
 const L=l*Math.sqrt(1+grade**2);
 box(g,0,-.28,-L/2,17.25,.56,L,oak);
 for(const side of [-1,1]){
  box(g,side*8.55,.62,-L/2,.42,1.7,L,coral);
  box(g,side*8.55,1.49,-L/2,.48,.15,L,cream);
 }
 for(let i=0;i<12;i++)box(g,(i-5.5)*1.38,.04,-L+1.15,1.38,.06,.7,i%2?(inlet?jade:cream):(inlet?cream:material('#49443c')));
}
let yaw=2.83,pitch=.49,zoom=1,mode='play',phase='loading',follow=false,rawModel,rawLoad,loaded=false;
let s=first,d=0,v=0,time=0;
const keys=new Set(), target=vec(0,12,0);
function pose(){const q=actual(s,d);if(!Number.isFinite(q.y))throw Error('滑面缺口');player.position.copy(q);player.rotation.y=-T.MathUtils.clamp(s,0,arc)/radius;}
function reset(){phase='ready';follow=false;s=first+.5;v=0;d=0;time=0;lean=0;finishedTime=0;rider.reset();rider.model.position.y=0;rider.model.rotation.x=0;pose();$('status').textContent='入口就绪';$('progress').value=0;$('start').textContent='出发';$('camera').hidden=true;$('touch').hidden=true;$('hint').textContent='拖动旋转 · 滚轮缩放';}
function run(){reset();phase='ride';follow=true;v=6;$('start').textContent='重新出发';$('camera').hidden=false;$('camera').textContent='全景';$('touch').hidden=false;$('hint').textContent='← → 横移 · 按住空格减速';}
$('start').onclick=()=>{if(loaded&&mode==='play')run();};
$('camera').onclick=()=>{follow=!follow;$('camera').textContent=follow?'全景':'跟随小熊';};
function step(dt){
 if(phase!=='ride')return;time+=dt;
 const axis=(keys.has('right')?1:0)-(keys.has('left')?1:0);
 d=T.MathUtils.clamp(d-axis*5.5*dt,-5,5);
 const grade=s<0?.075:s>arc?.05:4/half;
 v=T.MathUtils.clamp(v+(35*grade-.011*v*v-(keys.has('brake')?8:0))*dt,2.2,20);
 s=Math.min(last,s+v*dt);pose();
 $('status').textContent=s<0?'驶入滑梯':s>=arc?'出口直道':('第 '+(Math.floor(s/half)+1)+' 段回旋');
 $('progress').value=(s-first)/(last-first)*100;
 if(s===last){phase='done';follow=false;$('status').textContent='抵达终点 · '+time.toFixed(1)+' 秒';$('start').textContent='再滑一次';$('camera').hidden=true;$('touch').hidden=true;$('hint').textContent='拖动旋转 · 滚轮缩放';}
}
const bindings={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Space:'brake'};
window.addEventListener('keydown',e=>{if(phase==='ride'&&bindings[e.code]){e.preventDefault();keys.add(bindings[e.code]);}});
window.addEventListener('keyup',e=>keys.delete(bindings[e.code]));window.addEventListener('blur',()=>keys.clear());
for(const b of document.querySelectorAll('[data-act]')){b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);keys.add(b.dataset.act);};b.onlostpointercapture=()=>keys.delete(b.dataset.act);}
let drag;canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);drag=[e.clientX,e.clientY];};canvas.onpointermove=e=>{if(!drag||follow)return;yaw-=(e.clientX-drag[0])*.008;pitch=T.MathUtils.clamp(pitch+(e.clientY-drag[1])*.006,.1,1.48);drag=[e.clientX,e.clientY];};canvas.onlostpointercapture=()=>drag=null;
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(e.deltaY*.001),.65,1.5);},{passive:false});
async function select(raw){
 if(!loaded)return;mode=raw?'raw':'play';keys.clear();reset();assembled.visible=!raw;original.visible=raw;
 $('rawMode').setAttribute('aria-pressed',String(raw));$('playMode').setAttribute('aria-pressed',String(!raw));$('progress').hidden=raw;$('start').hidden=raw;
 if(!raw)return;
 $('status').textContent=rawModel?'原件 · 上下层分离':'正在读取 Hi3D 原件…';
 if(!rawModel){try{rawLoad??=loader.loadAsync('../assets/model-library/commonplay/bubbleport/track-studies/stage-2-saturn-slide.glb');rawModel=(await rawLoad).scene;rawModel.scale.setScalar(50);rawModel.position.set(1.65,10.9,-.2);original.add(rawModel);}catch{rawLoad=null;if(mode==='raw')$('status').textContent='原件读取失败，可切换后重试';return;}}
 if(mode==='raw')$('status').textContent='原件 · 上下层分离';
}
$('playMode').onclick=()=>select(false);$('rawMode').onclick=()=>select(true);
function resize(){backdrop.setSize(Math.max(1,Math.round(innerWidth*.4)),Math.max(1,Math.round(innerHeight*.4)));renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.onresize=resize;resize();
async function loadTeddy(){
 const root=new URL('../bubblecity-teddy-slide/dist/',import.meta.url);
 const roster=await (await fetch(new URL('slide/characters.json',root))).json();
 const teddy=roster.characters.find(character=>character.id==='teddy');
 return createRider(await loader.loadAsync(new URL(teddy.model,root).href),teddy);
}
function animateTeddy(dt){
 let action='Idle',seat=0;
 if(phase==='ride'){
  const t=T.MathUtils.clamp(time/rider.duration('SitDown'),0,1);
  action=t<1?'SitDown':'Slide';seat=T.MathUtils.smoothstep(t,0,1);
 }else if(phase==='done'){
  finishedTime+=dt;
  const stand=rider.duration('StandUp');
  action=finishedTime<stand?'StandUp':finishedTime<stand+rider.duration('FinishWave')?'FinishWave':'Idle';
  seat=1-T.MathUtils.smoothstep(finishedTime/stand,0,1);
 }
 const steer=phase==='ride'?Number(keys.has('right'))-Number(keys.has('left')):0;
 lean=T.MathUtils.damp(lean,steer,8,dt);
 rider.pose(action);rider.model.position.y=seat*rider.seatedOffset;
 rider.model.rotation.x=seat*Math.atan(s<0?.075:s>arc?.05:4/half);
 rider.animate(dt,lean,v);
}
function fitSaturnLamp(pillar){
 // Keep the original stem and plinth up to the lamp socket.
 const socketY=20;
 const cut=new T.Plane(vec(0,-1,0),socketY);
 renderer.localClippingEnabled=true;
 pillar.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat()){m.clippingPlanes=[cut];m.clipShadows=true;}});
 pillar.scale.setScalar(15);pillar.position.y=19.55;landmark.add(pillar);
 cylinder(landmark,0,socketY,0,1.9,.5,gold);
 const y=socketY+3.2;
 globe=solid(landmark,new T.SphereGeometry(3.2,64,40),city.acrylic,0,y,0);
 const orbit=new T.Group();orbit.position.y=y;orbit.rotation.z=.38;landmark.add(orbit);
 const ring=solid(orbit,new T.TorusGeometry(4.7,.28,16,96),gold,0,0,0);
 ring.rotation.x=Math.PI/2;ring.scale.z=.55;
 const edge=solid(orbit,new T.TorusGeometry(4.98,.065,8,96),city.lamp,0,0,0);
 edge.rotation.x=Math.PI/2;
}
async function init(){
 const [segment,pillar,teddy]=await Promise.all([loader.loadAsync('./slide-half.glb'),loader.loadAsync('../assets/model-library/commonplay/bubbleport/scenery/runtime/01-saturn-landmark.glb'),loadTeddy(),loadDaylight({scene}),city.ready]);
 applyRoom(scene,sun,fill);
 let mesh;segment.scene.traverse(o=>{if(o.isMesh){mesh=o;o.geometry.computeVertexNormals();o.castShadow=o.receiveShadow=true;}});finishDeck(mesh);sampleFloor=buildFloor(mesh.geometry);
 for(let n=0;n<3;n++){const section=segment.scene.clone();section.position.y=16-4*n;section.rotation.y=n*Math.PI;assembled.add(section);}
 straight(true);straight(false);
 for(let i=0;i<11;i++){const a=Math.PI+Math.PI*2*(i+.5)/11;for(const offset of [-6,6]){
  const q=path(a*radius,offset);if(q.z<0&&Math.abs(q.x+radius)<9&&q.z>-14)continue;
  cylinder(assembled,q.x,q.y/2-.25,q.z,.39,q.y-.5,oak);cylinder(assembled,q.x,.2,q.z,.56,.4,cream);
 }}
 for(const offset of [-6,6])cylinder(assembled,-radius+offset,1.6,-13,.4,3.2,oak);
 cylinder(landmark,0,6,0,2.25,12,cream);cylinder(landmark,0,.28,0,2.65,.56,gold);cylinder(landmark,0,11.85,0,2.6,.5,gold);
 fitSaturnLamp(pillar.scene);rider=teddy;player.add(rider.model);
 for(const lateral of [-5,0,5])for(let station=first;station<last;station+=.12){const q=actual(station,lateral);if(!Number.isFinite(q.y)||Math.abs(q.y-path(station).y)>.65)throw Error('滑面采样异常 '+station.toFixed(1));}
 const lampSites=[];
 for(let station=first+2;station<=last-1;station+=12){
  const q=path(station),a=T.MathUtils.clamp(station,0,arc)/radius;
  lampSites.push({s:station,x:q.x,y:q.y,z:q.z,tx:-Math.sin(a),tz:Math.cos(a),edge:8.15,spacing:11});
 }
 illuminate=addHarborLights(assembled,lampSites);
 const glow=new T.PointLight(0xffbf80,18*prefs.lamps/100,10,2);
 glow.position.set(0,24,0);landmark.add(glow);
 loaded=true;reset();$('start').disabled=false;
}
let previous=0,wasFollowing=false;renderer.setAnimationLoop(ms=>{
 const dt=Math.min((ms-previous)/1000,.15);previous=ms;if(!loaded)return;
 for(let left=dt;left>0;left-=1/60)step(Math.min(left,1/60));
 if(assembled.visible)animateTeddy(dt);
 let aim=target,eye;
 if(follow&&phase==='ride'){const height=rider.seatedHeight;
  const forward=vec(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y));
  aim=player.position.clone().add(vec(0,height*.68,0)).addScaledVector(forward,.9);
  eye=player.position.clone().addScaledVector(forward,-Math.max(5,height*2.5)).add(vec(0,Math.min(4.4,height+1.6),0));}
 else {const dist=zoom*Math.max(86,78/camera.aspect);eye=target.clone().add(vec(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(dist));}
 if(follow!==wasFollowing)camera.position.copy(eye);else camera.position.lerp(eye,1-Math.exp(-dt*(follow?13:9)));
 wasFollowing=follow;camera.lookAt(aim);
 if(assembled.visible)illuminate(player.position);
 if(ms-lastBackdrop>85){
  lastBackdrop=ms;globe.visible=false;renderer.setRenderTarget(backdrop);
  renderer.render(scene,camera);renderer.setRenderTarget(null);globe.visible=true;
  city.acrylic.userData.setBackdrop(backdrop.texture);
 }
 renderer.render(scene,camera);
});
camera.position.copy(target).add(vec(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(zoom*Math.max(86,78/camera.aspect)));
init().catch(e=>{$('status').textContent='装配失败 · '+e.message;console.error(e);});
