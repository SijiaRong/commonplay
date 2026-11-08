import * as T from 'three';
import {GLTFLoader} from '../bubbleport-demo/dist/vendor/addons/loaders/GLTFLoader.js';
import {HDRLoader} from '../bubbleport-demo/dist/vendor/addons/loaders/HDRLoader.js';
import {RoundedBoxGeometry} from '../bubbleport-demo/dist/vendor/addons/geometries/RoundedBoxGeometry.js';
import {GroundedSkybox} from '../bubbleport-demo/dist/room/lost-marbles/GroundedSkybox.js';
import {lightBeacon, lightObservatory, lightPlatform, lightStreetLamp} from './lighting.mjs';
import {kit as k} from '../bubbleport-segment-designs/kit.mjs';
import {build as flat} from '../bubbleport-segment-designs/segments/flat.mjs';
import {build as turn} from '../bubbleport-segment-designs/segments/turn.mjs';
import {build as slide} from '../bubbleport-segment-designs/segments/slide.mjs';

const canvas=document.querySelector('canvas'), status=document.querySelector('#status');
const renderer=new T.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
const scene=new T.Scene(), cam=new T.PerspectiveCamera(38,1,.2,1800);
scene.background=new T.Color(0xe9e0ce);
scene.add(new T.HemisphereLight(0xffefda,0xe6c8a4,1.35));
const sun=new T.DirectionalLight(0xffefd6,1.65);sun.position.set(-65,175,-52);sun.target.position.set(22,0,45);scene.add(sun,sun.target);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
renderer.shadowMap.autoUpdate=false;sun.castShadow=true;
Object.assign(sun.shadow.camera,{left:-110,right:110,top:120,bottom:-120,near:1,far:350});
sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.09;sun.shadow.bias=-.0002;
const cream='#ffefd4',mint='#80c9b8',brass='#ceaa72',deep='#438079',peach='#eeac98';
function slab(x,y,z,w,h,d,c,r){
  const m=new T.Mesh(new RoundedBoxGeometry(w,h,d,3,r),new T.MeshStandardMaterial({color:c,roughness:.53}));
  m.position.set(x,y-h/2,z);m.receiveShadow=true;m.castShadow=true;scene.add(m);
}
slab(22,-1,45,145,5,176,deep,2);
slab(22,0,45,144,2,175,cream,.95);
// Inlaid plazas tie the buildings to the promenade; the piers sit above them.
for(const [x,z,w,d,tint] of [[-27,42,34,154,'#d9e5cc'],[23,35,23,73,'#f5d6bb'],[76,32,29,128,'#e1ead7']]){
 slab(x,.13,z,w,.27,d,tint,.12);
 for(const sign of [-1,1])k.box(scene,[x+sign*(w/2-1),.155,z],[.22,.035,d-1.5],brass);
 for(let dz=-d/2+8;dz<d/2-1;dz+=8)k.box(scene,[x,.15,z+dz],[w-2,.02,.1],cream);
}
// Terraced plinths ground the original high-level pier supports.
for(const [x,z,w,d] of [[0,31,23,84],[24,94,73,49]]){
  slab(x,11.4,z,w,11.4,d,mint,1.2);slab(x,12,z,w+.4,.9,d+.4,cream,.4);
}
const sections=[flat(k,{previewScenery:false}),turn(k,{previewScenery:false}),slide(k)];
sections[0].position.y=12;sections[1].position.set(0,12,72);
sections[2].position.set(48,0,72);sections[2].rotation.y=Math.PI;
scene.add(...sections);
sections[1].traverse(part => {
  if (part.name === 'outer-beacon') lightBeacon(part);
});
function apron(x,y,z,d){slab(x,y,z,19.2,1,d,cream,.35);for(const dx of [-7,7])k.cylinder(scene,[x+dx,(y-1)/2,z],.8,y-1,mint);}
apron(0,24,-6,12);apron(48,8,-23,14);
function gate(x,y,z,word){
 for(const dx of [-10,10]){k.cylinder(scene,[x+dx,y+3,z],.48,6,deep);k.sphere(scene,[x+dx,y+6,z],.7,brass);}
 const cv=document.createElement('canvas');cv.width=768;cv.height=96;const ctx=cv.getContext('2d');
 ctx.fillStyle='#397670';ctx.fillRect(0,0,768,96);ctx.fillStyle='#fff4da';ctx.textAlign='center';ctx.font='bold 56px system-ui';ctx.fillText(word,384,67);
 const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;
 const face=new T.MeshStandardMaterial({map:tex});const edge=new T.MeshStandardMaterial({color:brass});
 const b=new T.Mesh(new T.BoxGeometry(20,2.5,.65),[edge,edge,edge,edge,face,face]);b.position.set(x,y+6,z);scene.add(b);
 for(let i=0;i<16;i++)for(let j=0;j<2;j++)k.box(scene,[x+(i-7.5)*1.2,y+.025,z+j*.7],[1.2,.05,.7],(i+j)%2?deep:cream);
}
lightPlatform(scene, 0, 24, -8, false);
lightPlatform(scene, 48, 8, -22, true);
gate(0,24,-8,'01   •   DEPARTURES');gate(48,8,-22,'02   •   ARRIVALS');
const route=[];
for(const s of sections){s.updateMatrixWorld();const points=s.userData.roads[0].points.map(p=>s.localToWorld(new T.Vector3(...p)));
 if(route.length && route.at(-1).distanceTo(points[0])>1e-5)throw Error('赛道接缝不连续');
 route.push(...points.slice(route.length?1:0));}
const path=new T.CurvePath();const nodes=[new T.Vector3(0,24,-8),...route,new T.Vector3(48,8,-22)];
nodes.slice(1).forEach((p,i)=>path.add(new T.LineCurve3(nodes[i],p)));

// x,z, footprint limit, height limit, facing, ground elevation.
const plots={
 '01-saturn-landmark':[[24,86,23,37,0,12]],
 '02-ferris-wheel':[[-28,89,33,49,.55]],
 '03-soda-cafe':[[23,27,19,25,-.5]],
 '04-moon-observatory':[[66,110,27,35,-.4]],
 '05-glass-dome-pavilion':[[77,47,23,20,-.6]],
 '06-curved-shop':[[-29,45,26,26,.8]],
 '07-terminal-station':[[-23,-15,28,31,.7]],
 '08-service-robot':[[13,-8,4,6,.7],[61,-23,4,6,-.7]],
 '09-bench':[[74,12,6,3,1.5],[75,26,6,3,1.5],[-20,16,6,3,0]],
 '10-lamp':[[17,8,3,8,0],[29,8,3,8,0],[65,15,3,8,0],[65,34,3,8,0],[-18,30,3,8,0],[-18,62,3,8,0]],
 '11-planter':[[17,13,5,4,0],[29,13,5,4,0],[71,-8,6,4,0]],
 '12-umbrella-table':[[23,46,7,8,.4],[26,58,7,8,0]],
 '13-cafe-chair':[[17,46,3,4,1.5],[29,46,3,4,-1.5],[20,58,3,4,1.5]],
 '14-rocket-gantry':[[77,-20,21,33,-.7]],
 '15-ornamental-tree':[[-32,15,10,14,0],[-32,65,10,14,.9],[78,70,11,16,0],[79,87,10,14,.8],[26,-17,9,12,0]],
 '16-plaza-railing':[[18,67,8,4,0],[29,67,8,4,0],[78,4,9,4,0]]
};
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const sc=shadowCanvas.getContext('2d'),grad=sc.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'#413a33aa');grad.addColorStop(.65,'#51453952');grad.addColorStop(1,'#51453900');sc.fillStyle=grad;sc.fillRect(0,0,128,128);
const shadowMat=new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false});
async function populate(name,instances){
 const {scene:source}=await new GLTFLoader().loadAsync('./models/'+name+'.glb');
 for(const [x,z,w,h,yaw,y=0] of instances){
  const obj=source.clone();obj.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;m.material.metalness=.48;}});obj.rotation.y=yaw;let box=new T.Box3().setFromObject(obj,true),s=box.getSize(new T.Vector3());
  obj.scale.multiplyScalar(Math.min(w/Math.max(s.x,s.z),h/s.y));box=new T.Box3().setFromObject(obj,true);const center=box.getCenter(new T.Vector3());
  const paving=y===0?.14:0;obj.position.set(x-center.x,y+paving-box.min.y,z-center.z);scene.add(obj);
  if (name === '04-moon-observatory') lightObservatory(obj);
  if (name === '10-lamp') lightStreetLamp(scene, obj, box.clone().translate(obj.position));
  s=box.getSize(new T.Vector3());const shadow=new T.Mesh(new T.PlaneGeometry(s.x*1.25,s.z*1.25),shadowMat);
  shadow.rotation.x=-Math.PI/2;shadow.position.set(x,y+paving+.04,z);scene.add(shadow);
 }
}
const room='../bubbleport-demo/dist/room/workshop/';
async function studio(){const [photo,light]=await Promise.all([new T.TextureLoader().loadAsync(room+'studio-6k.jpg'),new HDRLoader().loadAsync(room+'studio-light-1k.hdr')]);
 photo.colorSpace=T.SRGBColorSpace;photo.mapping=light.mapping=T.EquirectangularReflectionMapping;
 const sky=new GroundedSkybox(photo,115,850,80);sky.position.set(22,108.8,45);scene.add(sky);scene.environment=light;scene.environmentIntensity=.45;}
const views=[[22,10,44,1.17,.57,258],[0,23,39,.75,.38,82],[23,24,88,.35,.38,94],[48,15,29,1.95,.33,99]];
let mode=0,focus=new T.Vector3(),yaw,pitch,distance,start=0;
function select(i){mode=i;document.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-pressed',j===i));if(i===4){start=performance.now();return;}
 const [x,y,z,a,b,d]=views[i];focus.set(x,y,z);yaw=a;pitch=b;distance=d;}
document.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>select(i));select(0);
canvas.onpointerdown=e=>canvas.setPointerCapture(e.pointerId);
canvas.onpointermove=e=>{if(mode!==4&&canvas.hasPointerCapture(e.pointerId)){yaw-=e.movementX*.006;pitch=T.MathUtils.clamp(pitch+e.movementY*.005,.08,1.49);}};
canvas.onwheel=e=>{e.preventDefault();distance=T.MathUtils.clamp(distance*Math.exp(e.deltaY*.001),26,380);};
function resize(){renderer.setSize(innerWidth,innerHeight,false);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();}onresize=resize;resize();
function frame(now){
 for(const s of sections)for(const animate of s.userData.animations)animate(now/1000);
 if(mode===4){const u=Math.min((now-start)/48000,1),p=path.getPoint(u),q=path.getPoint(Math.min(.99999,u+.027)),dir=path.getTangent(u);
 cam.position.copy(p).addScaledVector(dir,-5);cam.position.y+=14;cam.lookAt(q.x,q.y+5,q.z);if(u===1)select(3);}
 else {const r=distance*Math.max(1,1.42/cam.aspect);cam.position.set(focus.x+r*Math.cos(pitch)*Math.sin(yaw),focus.y+r*Math.sin(pitch),focus.z+r*Math.cos(pitch)*Math.cos(yaw));cam.lookAt(focus);}
 renderer.render(scene,cam);
}
renderer.setAnimationLoop(frame);
try{await Promise.all([studio(),...Object.entries(plots).map(([n,i])=>populate(n,i))]);renderer.shadowMap.needsUpdate=true;status.hidden=true;document.documentElement.dataset.ready='true';}
catch(e){status.textContent='场景资产加载失败，请刷新重试';console.error(e);}
