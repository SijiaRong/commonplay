import * as T from 'three';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {makeCourse,RADIUS,FLOOR} from '../course.mjs';
import {spawn,step} from '../physics.mjs';
import {makeToyArt,buildTrackArt} from './track-art.js';
import {focusRider} from './film/scene.js';
import {GroundMotion} from './ground-motion.mjs';
const $=s=>document.querySelector(s),mix=T.MathUtils.lerp,clamp=T.MathUtils.clamp,smooth=(r,dt)=>1-Math.exp(-r*dt);
export async function startTrackLab({film,player,lite,held,rider,contact,blocked,setMode}){
 const params=new URLSearchParams(location.search),kind=['slalom','hammers','loop'].includes(params.get('track'))?params.get('track'):'slalom',width=params.get('width')==='16'?16:19.2;
 const names={slalom:'胶囊绕行',hammers:'双摆锤',loop:'回环岔路'},course=makeCourse(kind,width),art=await makeToyArt(film.scene,film.renderer,lite),track=buildTrackArt(course,0,art,film.scene);
 // The decorative Hi3D shells never change the authored collision shapes.
 function fit(template,dimensions){const obj=template.clone(true),b=new T.Box3().setFromObject(obj),size=b.getSize(new T.Vector3());if(size.z>size.x)obj.rotation.y=Math.PI/2;obj.updateMatrixWorld(true);b.setFromObject(obj);const center=b.getCenter(new T.Vector3());b.getSize(size);obj.position.sub(center);const holder=new T.Group();holder.add(obj);holder.scale.set(dimensions[0]/size.x,dimensions[1]/size.y,dimensions[2]/size.z);obj.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.userData.sharedProp=true}});return holder}
 const loader=new GLTFLoader();
 const skins=await Promise.allSettled([loader.loadAsync('./assets/obstacle-capsule.glb'),loader.loadAsync('./assets/mallet-head.glb')]);
 if(skins[0].status==='fulfilled')for(const b of track.bumpers){b.group.add(fit(skins[0].value.scene,[5.2,1.6,1.6]));b.fallback.forEach(o=>o.visible=false)}
 if(skins[1].status==='fulfilled')for(const h of track.hammers){h.head.add(fit(skins[1].value.scene,[2.8,2.35,2.3]));h.fallback.forEach(o=>o.visible=false)}
 const motion=new GroundMotion(name=>rider().duration(name));
 let state,mode='ready',phase=0,seat=0,acc=0,overview=false,elapsed=0,steering=0,camReady=false;
 const up=new T.Vector3(0,1,0),n=new T.Vector3(),f=new T.Vector3(),right=new T.Vector3(),basis=new T.Matrix4(),q=new T.Quaternion(),eye=new T.Vector3(),target=new T.Vector3(),look=new T.Vector3(),focus=new T.Vector3();
 const launch=$('#launch'),go=$('#go');
 let inspection;if(params.has('inspect')){inspection=document.createElement('pre');inspection.id='inspection';document.body.append(inspection)}
 function change(value){mode=value;phase=0;setMode(value)}
 function reset(){motion.reset();state=spawn(course);change('ready');seat=0;acc=0;elapsed=0;held.clear();rider().reset();launch.hidden=false;go.disabled=false;go.textContent='出发滑行  →';$('#result').textContent=kind==='loop'?'右侧进入回环 · 左侧平路绕行':'木制新赛道 · '+(width===16?'基准宽度':'加宽 20%');camReady=false;draw(0,true)}
 function start(){if(blocked())return;if(mode==='finish')reset();if(mode!=='ready')return;launch.hidden=true;motion.reset();change('riding')}
 go.onclick=()=>{start();go.blur()};$('#reset').onclick=e=>{if(!blocked())reset();e.currentTarget.blur()};
 $('#view-toggle').onclick=()=>{overview=!overview;$('#view-toggle').textContent=overview?'跟随小熊':'俯瞰全景';camReady=false};
 const bindings={ArrowLeft:'KeyA',ArrowRight:'KeyD',ArrowUp:'KeyW',ArrowDown:'KeyS'};
 function press(code,repeat=false){held.add(code);if(!repeat&&(code==='Enter'||code==='Space')&&(mode==='ready'||mode==='finish')){held.delete(code);start()}}
 window.addEventListener('keydown',e=>{const code=bindings[e.code]||e.code;if(blocked()||e.metaKey||e.ctrlKey||e.altKey||!['KeyA','KeyD','KeyW','KeyS','Space','Enter'].includes(code)||e.target.closest?.('select,input'))return;if((code==='Enter'||code==='Space')&&e.target.closest?.('button,a'))return;e.preventDefault();press(code,e.repeat)});
 window.addEventListener('keyup',e=>held.delete(bindings[e.code]||e.code));window.addEventListener('blur',()=>held.clear());
 document.querySelectorAll('[data-key]').forEach(btn=>{btn.onpointerdown=e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);press(btn.dataset.key)};btn.onlostpointercapture=()=>held.delete(btn.dataset.key)});
 function finish(){change('finish');rider().pose('FinishWave');launch.hidden=false;go.textContent='再滑一次  →';$('#result').textContent=`完成 ${names[kind]} · 碰撞 ${state.hits} 次 · 重置 ${state.falls} 次`}
 function simulate(dt){phase+=dt;
 if(mode==='riding'){
  steering=Number(held.has('KeyD'))-Number(held.has('KeyA'));
  acc+=dt;while(acc>=1/240){const speed=state.v.reduce((v,x,i)=>v+x*state.forward[i],0),targetSpeed=held.has('KeyS')?5:held.has('KeyW')?19:12;
   const forward=state.time<state.boostUntil?1:clamp((targetSpeed-speed)*.35,-1,1);
   step(state,course,{forward,steer:-steering,jump:held.has('Space')},1/240);acc-=1/240;
  }
  motion.update(dt,{grounded:state.grounded,normalY:state.normal[1],speed:Math.hypot(...state.v),jump:held.has('Space')&&state.v[1]>1.5,lockSlide:!!state.loopGuide});
  rider().pose(motion.action);
  if(state.finished){if(motion.seat>.05){change('recovering');rider().pose('StandUp')}else finish()}
 }else if(mode==='recovering'&&phase>=rider().duration('StandUp'))finish();
 else if(mode==='finish'&&phase>=rider().duration('FinishWave'))rider().pose('Idle');
 }
 function draw(dt,snap=false){
  const bear=rider().model;
  n.fromArray(state.grounded||!motion.airborne?state.normal:[0,1,0]);f.fromArray(state.grounded||!motion.airborne?state.forward:[0,0,1]);right.crossVectors(n,f).normalize();basis.makeBasis(right,n,f);q.setFromRotationMatrix(basis);
  player.position.fromArray(state.p).addScaledVector(n,-RADIUS);player.quaternion.slerp(q,snap?1:smooth(16,dt));
  const recoveringSeat=1-T.MathUtils.smoothstep(phase/rider().duration('StandUp'),.12,.9);seat=mode==='riding'?motion.seat:mode==='recovering'?recoveringSeat:0;bear.position.y=.035+seat*rider().seatedOffset;bear.rotation.y=mode==='ready'?-2.05:0;
  contact().position.copy(player.position).addScaledVector(n,.035);contact().quaternion.setFromUnitVectors(up,n);contact().material.uniforms.grounded.value=state.grounded||mode==='ready'?1:0;
  const p=player.position,framing=mode==='ready'||mode==='finish';
  if(overview){target.set(kind==='loop'?-4:0,5,0);const framing=Math.max(1,1.2/film.camera.aspect);eye.copy(target).add(new T.Vector3(-width*1.4,40,-43).multiplyScalar(framing))}
  else if(state.loopGuide){eye.set(p.x-10,p.y+6,p.z-13);target.copy(p).addScaledVector(n,1.5)}
  else{eye.set(p.x-(framing?10.8:0),p.y+(framing?7:5),p.z-(framing?7.6:9.5));target.set(p.x,p.y+1.5,p.z+(framing?0:2.6))}
  if(snap||!camReady){film.camera.position.copy(eye);look.copy(target);camReady=true}else{film.camera.position.lerp(eye,smooth(9,dt));look.lerp(target,smooth(12,dt))}film.camera.lookAt(look);
  focus.copy(p).addScaledVector(n,rider().seatedHeight*.56);focusRider(film,overview?target:focus,overview?12:rider().seatedHeight*.5,mode,snap);
  const progress=state.finished?100:clamp((state.p[2]-course.start[2])/(course.finishZ-course.start[2])*100,0,99);$('progress').value=progress;$('#percent').textContent=Math.round(progress)+'%';$('#section').textContent=names[kind]+(width===16?' · 基准':' · +20%');
  if(inspection)inspection.textContent=JSON.stringify({mode,action:mode==='riding'?motion.action:mode==='recovering'?'StandUp':mode==='finish'?'FinishWave':'Idle',slope:+motion.slope.toFixed(1),seated:+seat.toFixed(2),kind,width,p:state.p.map(v=>+v.toFixed(2)),hits:state.hits,falls:state.falls,loopSeen:state.loopSeen,finished:state.finished});
 }
 film.resize();reset();const clock=new T.Clock();film.renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.06);elapsed+=dt;if(!blocked()&&mode!=='ready')simulate(dt);track.update(state.time);rider().animate(dt,steering,Math.hypot(...state.v));draw(dt);film.setFrameBudget(1/60,mode==='riding');film.render(dt)});
 return{start,reset};
}
