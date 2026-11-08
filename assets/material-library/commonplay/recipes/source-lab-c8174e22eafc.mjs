import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {materialSpecs,createBubbleportMaterials} from './materials.mjs';
const $=s=>document.querySelector(s),canvas=$('#world');
const renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.AgXToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=T.SRGBColorSpace;renderer.info.autoReset=false;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.1,300);camera.position.set(28,32,36);const controls=new OrbitControls(camera,canvas);controls.target.set(0,0,1);controls.enableDamping=true;controls.minDistance=7;controls.maxDistance=85;controls.maxPolarAngle=Math.PI*.47;
const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();
// Large reflected strips, kept outside the visible set: same exposure for all samples.
for(const [pos,size] of [[[0,9,-2],[16,.1,2.4]],[[-9,7,2],[2.5,.1,13]]]){const panel=new T.Mesh(new T.BoxGeometry(...size),new T.MeshBasicMaterial({color:new T.Color(5,4.8,4.3)}));panel.position.set(...pos);room.add(panel);}
const env=pmrem.fromScene(room,.025);scene.environment=env.texture;room.dispose();pmrem.dispose();
const hemi=new T.HemisphereLight('#fff5dc','#73887e',1);scene.add(hemi);const key=new T.DirectionalLight('#fff0d4',3);key.position.set(-18,28,13);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-25,right:25,top:24,bottom:-24,near:1,far:85});key.shadow.normalBias=.035;key.shadow.bias=-.00015;scene.add(key);const fill=new T.DirectionalLight('#cce7ee',1.2);fill.position.set(25,14,-18);scene.add(fill);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const bloom=new UnrealBloomPass(new T.Vector2(1,1),.14,.35,2.4);composer.addPass(bloom);composer.addPass(new OutputPass());
const mats=createBubbleportMaterials(),backing=new T.MeshStandardMaterial({color:'#e8e0cc',roughness:.75}),dark=new T.MeshStandardMaterial({color:'#344e49',roughness:.58}),pedestal=new T.MeshPhysicalMaterial({color:'#f7eedb',roughness:.6,clearcoat:.08});
function mesh(parent,geo,mat,pos){const m=new T.Mesh(geo,mat);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(p,size,pos,mat,r=.13){return mesh(p,new RoundedBoxGeometry(...size,3,Math.min(r,...size.map(v=>v*.24))),mat,pos)}
function sphere(p,r,pos,mat){return mesh(p,new T.SphereGeometry(r,48,32),mat,pos)}
function cylinder(p,r,h,pos,mat){return mesh(p,new T.CylinderGeometry(r,r,h,48),mat,pos)}
function tube(p,points,r,mat){const curve=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v)));return mesh(p,new T.TubeGeometry(curve,64,r,12,false),mat,[0,0,0]);}
const floor=box(scene,[300,.5,300],[0,-.7,0],backing,.1);floor.castShadow=false;
const points=[],sampleGroups=[],pins=[],spills=[],softObjects=[];const pinTargets=[];let selected='road',mode='studio',currentView='overview',transition=null,softMotion=true,finishVersion='v2';
const checkerCanvas=document.createElement('canvas');checkerCanvas.width=checkerCanvas.height=128;const cx=checkerCanvas.getContext('2d');for(let y=0;y<8;y++)for(let x=0;x<8;x++){cx.fillStyle=(x+y)%2?'#52716b':'#f9edce';cx.fillRect(x*16,y*16,16,16)}const checker=new T.CanvasTexture(checkerCanvas);checker.colorSpace=T.SRGBColorSpace;const checkerMat=new T.MeshStandardMaterial({map:checker,roughness:.6});
materialSpecs.forEach((s,i)=>{const x=(i%4-1.5)*7.4,z=i<4?-4.1:3.8,g=new T.Group();g.position.set(x,0,z);scene.add(g);sampleGroups.push(g);points.push(new T.Vector3(x,1,z));const base=box(g,[6.7,.36,6.8],[0,-.05,0],pedestal,.2);base.userData.materialId=s.id;
 box(g,[4.5,.22,2.0],[0,.25,1.65],s.id==='acrylic'?checkerMat:mats[s.id],.09);
 const ball=sphere(g,1.12,[-1.1,1.3,-.7],mats[s.id]);ball.userData.materialId=s.id;
 const column=cylinder(g,.65,1.65,[1.35,1.0,-.7],mats[s.id]);column.userData.materialId=s.id;
 const round=mesh(g,new T.TorusGeometry(.64,.17,16,48),mats[s.id],[1.35,1.15,1.6]);round.rotation.x=-Math.PI/2;round.userData.materialId=s.id;
 for(const child of g.children)child.userData.materialId=s.id;
 if(s.id==='peach'){
  ball.scale.set(1.05,.86,1.05);ball.position.y=1.18;
  column.visible=false;round.visible=false;
  const cushion=box(g,[2.05,1.25,2.15],[1.2,.92,-.45],mats.peach,.55);
  // Localized pressure depression across a rounded pad; keep outer rim supported.
  const attr=cushion.geometry.attributes.position;for(let j=0;j<attr.count;j++){let x=attr.getX(j),y=attr.getY(j),z=attr.getZ(j);if(y>.2)y-=.22*Math.exp(-(x*x+z*z)*2.8)*Math.min(1,(y-.2)/.3);attr.setY(j,y);}cushion.geometry.computeVertexNormals();
  softObjects.push({mesh:ball,scale:ball.scale.clone(),baseY:ball.position.y},{mesh:cushion,scale:cushion.scale.clone(),baseY:cushion.position.y});
 }
 if(s.id==='acrylic'){const board=box(g,[4.9,2.8,.06],[0,1.6,-1.95],checkerMat,.015);board.userData.materialId=s.id;const tile=box(g,[1.8,1.6,.25],[0,1.08,1.6],mats.acrylic,.05);tile.rotation.y=-.3;tile.userData.materialId=s.id;}
 if(['amber','signal'].includes(s.id)){const color=s.params.emissive;const housing=cylinder(g,1.2,.22,[-1.1,.23,-.7],mats.brass);housing.userData.materialId=s.id;const lamp=new T.PointLight(color,26,8,2);lamp.position.set(-1.1,1.7,-.7);g.add(lamp);spills.push(lamp);}
 const target=new T.Vector3(x,.3,z+3.0);pinTargets.push(target);const pin=document.createElement('button');pin.className='pin';pin.innerHTML=`<b>${String(i+1).padStart(2,'0')}</b>${s.name}`;pin.onclick=()=>select(s.id);$('#pins').append(pin);pins.push(pin);
 const button=document.createElement('button');button.dataset.material=s.id;const chip=document.createElement('span');chip.className='chip '+({brass:'metal',silver:'silver',acrylic:'glass',amber:'light',signal:'light'}[s.id]||'');chip.style.background=s.color;const text=document.createElement('span');text.innerHTML=`<strong>${s.name}</strong><small>${s.en}</small>`;button.append(chip,text);button.onclick=()=>select(s.id);$('#swatches').append(button);
});
// A small cross-section of course combines the exact same swatch materials.
const strip=new T.Group();strip.position.set(0,0,10.3);scene.add(strip);box(strip,[28.8,.35,3],[0,.15,0],mats.road,.16);
for(const z of [-1.45,1.45]){tube(strip,[[-14,.7,z],[-8,.7,z],[0,.7,z],[8,.7,z],[14,.7,z]],.14,mats.mint);for(let x=-13.7;x<14;x+=2.3){cylinder(strip,.075,.5,[x,.45,z],mats.brass);sphere(strip,.105,[x,.76,z],mats.amber);}for(const x of [-14,14])box(strip,[.65,.5,.45],[x,.63,z],mats.peach,.12);}
for(let i=-4;i<=4;i++)box(strip,[.025,.01,2.65],[i*3,.332,0],backing,.002);
const glass=box(strip,[6.5,1.25,.18],[7.6,1.0,-1.38],mats.acrylic,.04);glass.castShadow=false;
for(const x of [-10,0,10]){const lamp=new T.PointLight('#ffbc58',9,5,2);lamp.position.set(x,1.0,1.4);strip.add(lamp);spills.push(lamp);}
const stripes=new T.Group();strip.add(stripes);for(const x of [-10,-7,-4,-1,2,5,8,11]){box(stripes,[.7,.012,.10],[x,.34,.2],mats.mint,.01);}
const paramDefs=[['roughness','粗糙度',0,1,.01],['metalness','金属度',0,1,.01],['clearcoat','清漆层',0,1,.01],['clearcoatRoughness','清漆粗糙度',0,1,.01],['transmission','透射率',0,1,.01],['thickness','光学厚度',.05,2,.05],['emissiveIntensity','自发光强度',0,8,.1]];
function select(id){selected=id;const i=materialSpecs.findIndex(s=>s.id===id),s=materialSpecs[i],m=mats[id];$('#selected-number').textContent=String(i+1).padStart(2,'0');$('#selected-name').textContent=s.name;$('#selected-desc').textContent=s.desc;$('#selected-use').textContent=s.use;$('#parameters').replaceChildren();for(const [key,label,min,max,step] of paramDefs){if(key==='transmission'&&id!=='acrylic'||key==='thickness'&&id!=='acrylic'||key==='emissiveIntensity'&&!['amber','signal'].includes(id))continue;const field=document.createElement('label');field.className='parameter';const title=document.createElement('span'),output=document.createElement('output');output.textContent=m[key].toFixed(2);title.append(document.createTextNode(label),output);const input=document.createElement('input');Object.assign(input,{type:'range',min,max,step,value:m[key]});input.dataset.param=key;input.setAttribute('aria-label',label);input.oninput=()=>{const next=+input.value;if(['clearcoat','transmission'].includes(key)&&(m[key]>0)!==(next>0))m.needsUpdate=true;m[key]=next;output.textContent=(+input.value).toFixed(2);if(key==='emissiveIntensity'){savedEmit[id]=+input.value;applyLights();}};field.append(title,input);$('#parameters').append(field);}document.querySelectorAll('[data-material]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.material===id)));pins.forEach((b,j)=>b.setAttribute('aria-pressed',String(j===i)));if(currentView==='detail')setView('detail');}
const savedEmit={amber:4,signal:3.2};function applyLights(){const enabled=$('#lamps').checked;for(const id of ['amber','signal'])mats[id].emissiveIntensity=enabled?savedEmit[id]:0;spills.forEach(l=>l.visible=enabled&&$('#spill').checked);}
function setMode(value){mode=value;document.body.classList.toggle('night',value==='night');scene.background=new T.Color(value==='night'?'#1c2b2a':'#e2e8dd');scene.environmentIntensity=value==='night'?.3:.75;hemi.intensity=value==='night'?.2:.7;key.intensity=value==='night'?.35:2.2;fill.intensity=value==='night'?.25:.85;bloom.strength=value==='night'?.24:.12;backing.color.set(value==='night'?'#263b35':'#c5bfae');$('#mode-note').textContent=value==='night'?'低环境光 · 检查灯芯、反射与地面受光':'中性反射环境 · 暖色主光';document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===value)));}
function setFinish(version){
 finishVersion=version;
 const old=version==='v1';
 Object.assign(mats.road,old?{roughness:.48,clearcoat:.28,clearcoatRoughness:.32,bumpScale:.008}:{roughness:.16,clearcoat:1,clearcoatRoughness:.065,bumpScale:.0012});
 Object.assign(mats.peach,old?{roughness:.62,clearcoat:.08,clearcoatRoughness:.6,specularIntensity:1,ior:1.5}:{roughness:.39,clearcoat:.025,clearcoatRoughness:.38,specularIntensity:.4,ior:1.43});
 mats.peach.userData.softScattering.value=old?0:.32;softMotion=!old;
 $('#scatter').checked=!old;$('#soft-motion').checked=!old;
 $('#compare').textContent=old?'回到新版':'旧参数对照';$('#compare').setAttribute('aria-pressed',String(old));
 mats.road.needsUpdate=true;mats.peach.needsUpdate=true;select(selected);
}
$('#compare').onclick=()=>setFinish(finishVersion==='v2'?'v1':'v2');
function setView(value){currentView=value;let eye,target;if(value==='detail'){const index=materialSpecs.findIndex(s=>s.id===selected);target=points[index].clone();eye=target.clone().add(new T.Vector3(5.9,5.1,7.4).multiplyScalar(Math.max(1,.95/camera.aspect)));}else{target=new T.Vector3(0,.3,2);eye=value==='top'?new T.Vector3(0,48,2.01):new T.Vector3(21,25,30);eye=target.clone().add(eye.sub(target).multiplyScalar(Math.max(1,1.25/camera.aspect)));}transition={eye,target};document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===value)));}
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>setMode(b.dataset.mode);for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>setView(b.dataset.view);$('#reset').onclick=()=>{const s=materialSpecs.find(s=>s.id===selected),m=mats[selected];for(const key of ['roughness','metalness','clearcoat','clearcoatRoughness','transmission','thickness','emissiveIntensity']){if(key in s.params)m[key]=s.params[key];}if(selected in savedEmit)savedEmit[selected]=s.params.emissiveIntensity;m.needsUpdate=true;applyLights();select(selected);};$('#lamps').onchange=()=>{applyLights();select(selected)};$('#spill').onchange=applyLights;$('#bloom').onchange=()=>bloom.enabled=$('#bloom').checked;$('#scatter').onchange=()=>mats.peach.userData.softScattering.value=$('#scatter').checked?.32:0;$('#soft-motion').onchange=()=>softMotion=$('#soft-motion').checked;$('#exposure').oninput=()=>{renderer.toneMappingExposure=+$('#exposure').value;$('#exposure-value').textContent=renderer.toneMappingExposure.toFixed(2);};
$('#capture').onclick=()=>{draw();const a=document.createElement('a');a.download=`bubbleport-materials-${mode}-${selected}.png`;a.href=canvas.toDataURL('image/png');a.click();};
const raycaster=new T.Raycaster();let down=null;canvas.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);canvas.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const rect=canvas.getBoundingClientRect();raycaster.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=raycaster.intersectObjects(sampleGroups,true).find(h=>h.object.userData.materialId);if(hit)select(hit.object.userData.materialId);});controls.addEventListener('start',()=>transition=null);
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);composer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(canvas.parentElement);resize();
function updatePins(){pinTargets.forEach((p,i)=>{const q=p.clone().project(camera);const show=q.z>-1&&q.z<1&&Math.abs(q.x)<.97&&Math.abs(q.y)<.96;pins[i].hidden=!show;pins[i].style.left=(q.x*.5+.5)*canvas.clientWidth+'px';pins[i].style.top=(-q.y*.5+.5)*canvas.clientHeight+'px';});}
function draw(){renderer.info.reset();composer.render();updatePins();}
function tick(){const t=performance.now()/1000;softObjects.forEach((o,i)=>{const squeeze=softMotion?.5+.5*Math.sin(t*1.8+i*.8):0;const a=squeeze*.1;o.mesh.scale.set(o.scale.x*(1+a*.55),o.scale.y*(1-a),o.scale.z*(1+a*.55));o.mesh.position.y=o.baseY-a*.35;});if(transition){camera.position.lerp(transition.eye,.16);controls.target.lerp(transition.target,.16);if(camera.position.distanceTo(transition.eye)<.01){camera.position.copy(transition.eye);controls.target.copy(transition.target);transition=null;}}controls.update();draw();requestAnimationFrame(tick);}
select('road');setMode('studio');setView('overview');applyLights();requestAnimationFrame(tick);
window.__materials={ready:true,select,setMode,setView,setFinish,setImmediateView(v){setView(v);camera.position.copy(transition.eye);controls.target.copy(transition.target);transition=null;controls.update();draw();},draw,snapshot(){return{selected,mode,finishVersion,softScale:softObjects.map(o=>o.mesh.scale.toArray()),view:currentView,softMotion,scatter:mats.peach.userData.softScattering.value,bloom:bloom.enabled,lamps:$('#lamps').checked,spill:$('#spill').checked,lightsVisible:spills.filter(l=>l.visible).length,materials:Object.fromEntries(materialSpecs.map(s=>{const m=mats[s.id];return[s.id,{roughness:m.roughness,metalness:m.metalness,clearcoat:m.clearcoat,clearcoatRoughness:m.clearcoatRoughness,transmission:m.transmission,emissiveIntensity:m.emissiveIntensity}]})),render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}}}};
