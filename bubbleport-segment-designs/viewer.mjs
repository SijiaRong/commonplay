import * as T from 'three';
import {kit,label} from './kit.mjs';
import * as flat from './segments/flat.mjs';
import * as slide from './segments/slide.mjs';
import * as turn from './segments/turn.mjs';
import * as doors from './segments/doors.mjs';
import {surfaces,applySurfaces,setupAppearance} from './appearance.mjs';
let selection=0;
const modules=[flat,slide,turn,doors],$=s=>document.querySelector(s),canvas=$('#world');
const renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.AgXToneMapping;renderer.toneMappingExposure=1.05;
const scene=new T.Scene();scene.background=new T.Color('#e3e9df');const hemi=new T.HemisphereLight('#fff9e8','#a5bbb1',1.5);scene.add(hemi);const sun=new T.DirectionalLight('#fff0d4',2.5);sun.position.set(-55,110,-40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-95,right:95,top:95,bottom:-95,near:1,far:260});sun.shadow.normalBias=.08;sun.shadow.bias=-.0004;scene.add(sun);const fill=new T.DirectionalLight('#d8f2f4',1.2);fill.position.set(70,40,30);scene.add(fill);
setupAppearance(renderer,scene,sun,hemi,fill);
const floor=new T.Mesh(new T.PlaneGeometry(2000,2000),new T.MeshStandardMaterial({color:'#e3e9df',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.25;floor.receiveShadow=true;scene.add(floor);
const camera=new T.OrthographicCamera(-70,70,50,-50,.1,1400);let current,center=new T.Vector3(),extent=90,theta=-.65,phi=.75,zoom=1,view='perspective',drag=null,moving=false,time=2;
function metadata(v){return typeof v==='string'?v:JSON.stringify(v)}
modules.forEach((m,i)=>{const b=document.createElement('button');b.dataset.id=m.meta.id;b.innerHTML=`<b>0${i+1}</b><span><strong>${m.meta.name}</strong><small>${['平地直线 / 节奏关卡','下坡滑梯 / 纵向曲面','180° 回头弯 / 路线取舍','三洞横移 / 概念图 02'][i]}</small></span>`;b.onclick=()=>choose(i);$('#segments').append(b)});
async function choose(i){
 const token=++selection,m=modules[i];
 if(m===doors){
   await doors.prepare(kit,surfaces);
   if(token!==selection)return;
 }
 if(current)scene.remove(current);
 if(m===doors){time=2;floor.position.y=-.57;}else floor.position.y=-.25;
 $('#closeup').hidden=m!==doors;current=m.build(kit);applySurfaces(current);scene.add(current);const roads=[];current.traverse(o=>roads.push(...o.userData.roads||[]));if(roads.length && m!==doors){const a=roads[0].points[0],b=roads.at(-1).points.at(-1);label(current,'IN · 入口',[a[0],a[1]+5,a[2]],'#2c7c68');label(current,'OUT · 出口',[b[0],b[1]+5,b[2]],'#9d6a51');for(const point of [a,b]){kit.sphere(current,[point[0],point[1]+.65,point[2]],.65,'#e7ae7a');}}
 const box=new T.Box3().setFromObject(current);box.getCenter(center);const size=box.getSize(new T.Vector3());extent=Math.max(size.x,size.z,size.y*1.7)*1.18;zoom=1;theta=-.65;phi=.75;view='perspective';
 $('#type').textContent=['01 / FLAT CHALLENGE','02 / SODA SLIDE','03 / ORBIT TURN','04 / SLIDING GATES'][i];$('#name').textContent=m.meta.name;$('#tagline').textContent=m.meta.tagline;$('#dimensions').textContent=metadata(m.meta.dimensions);$('#reference').textContent='参考转译：'+metadata(m.meta.reference);$('#beats').replaceChildren(...m.meta.beats.map(s=>{const e=document.createElement('li');e.textContent=s;return e}));$('#controls').textContent=(m.meta.controls||[]).join('　·　');document.querySelectorAll('nav button').forEach((b,j)=>b.classList.toggle('selected',j===i));updateViewButtons();location.hash=m.meta.id;window.__design.current=m.meta.id;window.__design.roads=roads;resize();render();}
function updateViewButtons(){document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view))}
function updateCamera(){const aspect=canvas.clientWidth/canvas.clientHeight;let h=extent*(view==='top' && current && current===doors.build() ? .51 : .43)/zoom;h=Math.max(h,h/aspect);camera.left=-h*aspect;camera.right=h*aspect;camera.top=h;camera.bottom=-h;camera.updateProjectionMatrix();let offset;if(view==='detail'){const focus=new T.Vector3(0,1,18);camera.top=6;camera.bottom=-6;camera.left=-6*aspect;camera.right=6*aspect;camera.updateProjectionMatrix();camera.up.set(0,1,0);camera.position.set(8,12,-9);camera.lookAt(focus);return;}if(view==='top')offset=new T.Vector3(0,300,.001);else if(view==='side')offset=new T.Vector3(300,0,0);else offset=new T.Vector3(Math.sin(theta)*Math.cos(phi),Math.sin(phi),-Math.cos(theta)*Math.cos(phi)).multiplyScalar(300);camera.position.copy(center).add(offset);camera.up.set(0,1,0);if(view==='top' && current===doors.build()){camera.up.set(0,0,1);camera.position.set(center.x,center.y+300,center.z);}camera.lookAt(center);}
function resize(){renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);updateCamera()}
new ResizeObserver(resize).observe(canvas.parentElement);
function render(){current?.traverse(o=>{for(const fn of o.userData.animations||[])fn(time)});updateCamera();renderer.render(scene,camera)}
let last=performance.now();function tick(now){if(moving)time+=Math.min((now-last)/1000,.05);last=now;render();requestAnimationFrame(tick)}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);drag=[e.clientX,e.clientY]});canvas.addEventListener('pointermove',e=>{if(!drag)return;view='perspective';theta-=(e.clientX-drag[0])*.008;phi=T.MathUtils.clamp(phi+(e.clientY-drag[1])*.006,.12,1.5);drag=[e.clientX,e.clientY];updateViewButtons()});for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(-e.deltaY*.001),.5,2.4)},{passive:false});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;zoom=1;updateViewButtons();render()});$('#motion').onclick=()=>{moving=!moving;$('#motion').textContent=moving?'暂停机关':'播放机关';$('#motion').setAttribute('aria-pressed',String(moving))};$('#capture').onclick=()=>{render();const a=document.createElement('a');a.download=`bubbleport-${window.__design.current}-${view}.png`;a.href=canvas.toDataURL('image/png');a.click()};
window.__design={ready:false,select:id=>choose(modules.findIndex(m=>m.meta.id===id)),setView(v){view=v;zoom=1;updateViewButtons();render()},snapshot(){const box=new T.Box3().setFromObject(current);return {id:this.current,roads:this.roads.map(r=>({width:r.width,start:r.points[0],end:r.points.at(-1),points:r.points.length})),bounds:{min:box.min.toArray(),max:box.max.toArray()},calls:renderer.info.render.calls}}};
const initial=modules.findIndex(m=>m.meta.id===location.hash.slice(1));await choose(initial<0?0:initial);window.__design.ready=true;requestAnimationFrame(tick);
