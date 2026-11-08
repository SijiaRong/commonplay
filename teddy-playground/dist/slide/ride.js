import * as T from 'three';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {Scene3D, focusRider} from './film/scene.js';
import {loadDaylight, createContactShadow} from './daylight.js';
import {dressPlush} from './plush.js';
import {restoreCourseMaterials} from './course-materials.js';

const $=s=>document.querySelector(s);
const go=$('#go'), launch=$('#launch'), meter=$('progress');
const clamp=T.MathUtils.clamp, mix=T.MathUtils.lerp;
const smooth=(rate,dt)=>1-Math.exp(-rate*dt);

async function play(){
  const canvas=document.createElement('canvas');
  $('#world').append(canvas);
  const lite=matchMedia('(pointer: coarse)').matches;
  const quality=lite?'low':'high';
  const film=new Scene3D(canvas,quality);
  const {renderer,camera,scene}=film;
  film.autoQuality=true;
  camera.fov=49;
  camera.updateProjectionMatrix();
  const loader=new GLTFLoader();
  const [character,course,path]=await Promise.all([
    loader.loadAsync('./teddy-bear-animated.glb'),loader.loadAsync('./slide/wooden-chute.glb'),
    fetch('./slide/path.json').then(r=>{if(!r.ok)throw Error('赛道路径读取失败');return r.json()}),
    loadDaylight(film,lite)
  ]);
  scene.add(course.scene);
  course.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  await restoreCourseMaterials(course,renderer,{quality,lite});
  const player=new T.Group(),bear=character.scene;
  scene.add(player);player.add(bear);bear.scale.setScalar(3.1);
  bear.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false}});
  const mixer=new T.AnimationMixer(bear);
  const actions=Object.fromEntries(character.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
  actions.Jump.setLoop(T.LoopOnce,1);actions.Jump.clampWhenFinished=true;
  let action=null;
  function pose(name){
    if(action===name)return;
    const next=actions[name].reset().setEffectiveWeight(1).play();
    if(action)next.crossFadeFrom(actions[action],.15,false);
    action=name;
  }
  // Find the actual contact point of the seated skinned mesh at the start of the loop.
  pose('Slide');mixer.update(0);bear.updateMatrixWorld(true);
  const seatedBounds=new T.Box3().setFromObject(bear,true);
  dressPlush(bear);
  const seatedOffset=-seatedBounds.min.y;
  const seatedHeight=seatedBounds.max.y-seatedBounds.min.y;
  const contact=createContactShadow((seatedBounds.max.z-seatedBounds.min.z)*.5);
  scene.add(contact);
  const surfaceUp=new T.Vector3(0,1,0),normal=new T.Vector3();
  const rows=path.rows, finish=path.finish, start=8.2;
  function surface(distance,lane){
    let a=0,b=rows.length-1;
    while(b-a>1){const mid=(a+b)>>1;if(rows[mid][0]<=distance)a=mid;else b=mid}
    const lo=rows[a],hi=rows[b],t=clamp((distance-lo[0])/(hi[0]-lo[0]),0,1);
    const u=clamp(lane/.86+6,0,12),k=Math.min(11,Math.floor(u));
    const height=row=>mix(row[5+k],row[6+k],u-k);
    const tx=mix(lo[3],hi[3],t),tz=mix(lo[4],hi[4],t),len=Math.hypot(tx,tz);
    return {x:mix(lo[1],hi[1],t)-tz/len*lane,y:mix(height(lo),height(hi),t),
      z:mix(lo[2],hi[2],t)+tx/len*lane,tx:tx/len,tz:tz/len};
  }
  const held=new Set(),bindings={ArrowLeft:'KeyA',ArrowRight:'KeyD',ArrowUp:'KeyW',ArrowDown:'KeyS'};
  let mode,s,lane,sideSpeed,speed,elapsed,flight,clockYaw,section,framing;
  const target=new T.Vector3(),eye=new T.Vector3(),focus=new T.Vector3(),look=new T.Vector3();
  function reset(){
    mode='ready';s=start;lane=0;sideSpeed=0;speed=0;elapsed=0;flight=-1;clockYaw=0;section=0;framing=1;
    held.clear();pose('Slide');launch.hidden=false;go.disabled=false;go.textContent='出发滑行  →';$('#result').textContent='';
    draw(0,true);
  }
  function depart(){
    if(mode==='finish')reset();
    if(mode!=='ready')return;
    mode='riding';speed=8;launch.hidden=true;
  }
  function jump(){if(mode==='riding' && flight<0){flight=0;pose('Jump')}}
  go.onclick=()=>{depart();go.blur()};
  $('#reset').onclick=e=>{reset();e.currentTarget.blur()};
  function press(code,repeat=false){
    held.add(code);
    if(!repeat && (code==='Enter'||code==='Space') && mode!=='riding'){depart();return}
    if(code==='Space'&&!repeat)jump();
  }
  const keys=['KeyA','KeyD','KeyW','KeyS','Space','Enter'];
  window.addEventListener('keydown',e=>{
    const code=bindings[e.code]||e.code;
    if(!keys.includes(code)||e.metaKey||e.ctrlKey||e.altKey)return;
    if((code==='Enter'||code==='Space')&&e.target.closest?.('button,a'))return;
    e.preventDefault();press(code,e.repeat);
  });
  window.addEventListener('keyup',e=>held.delete(bindings[e.code]||e.code));
  window.addEventListener('blur',()=>held.clear());
  document.querySelectorAll('[data-key]').forEach(btn=>{
    btn.onpointerdown=e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);press(btn.dataset.key)};
    btn.onlostpointercapture=()=>held.delete(btn.dataset.key);
  });
  function simulate(dt){
    elapsed+=dt;
    const before=surface(s,lane),ahead=surface(s+1,lane);
    const slope=clamp(before.y-ahead.y,-.45,.7);
    const boost=held.has('KeyW')?5:0,brake=held.has('KeyS')?8:0;
    speed=mix(speed,clamp(13+12*slope+boost-brake,5,23),smooth(1.9,dt));
    const steer=Number(held.has('KeyD'))-Number(held.has('KeyA'));
    sideSpeed=mix(sideSpeed,steer*8.4,smooth(7,dt));
    lane=clamp(lane+sideSpeed*dt,-5.16,5.16);
    s=Math.min(finish+4,s+speed*dt);
    if(flight>=0){flight+=dt;if(flight>=1){flight=-1;pose('Slide')}}
    if(s>=finish+4){
      mode='finish';flight=-1;pose('Idle');held.clear();
      $('#result').textContent='抵达终点 · '+elapsed.toFixed(1)+' 秒';
      launch.hidden=false;go.textContent='再滑一次  ↻';
    }
  }
  function draw(dt,snap=false){
    const p=surface(s,lane),next=surface(s+1.4,lane);
    while(section+1<path.zones.length&&path.zones[section+1][0]<=s)section++;
    const pct=clamp(Math.round((s-start)/(finish-start)*100),0,100);
    $('#percent').textContent=pct+'%';meter.value=pct;
    $('#section').textContent=mode==='finish'?'抵达终点':path.zones[section][1];
    const jumpHeight=flight>=0?7.8*flight*(1-flight):0;
    const yaw=Math.atan2(p.tx,p.tz);
    clockYaw+=Math.atan2(Math.sin(yaw-clockYaw),Math.cos(yaw-clockYaw))*(snap?1:smooth(13,dt));
    player.position.set(p.x,p.y+jumpHeight,p.z);
    player.rotation.y=clockYaw;
    // At the starting mark the bear looks back, then turns into the descent.
    bear.rotation.y=mode==='ready'?-2.05:mix(bear.rotation.y,0,smooth(4,dt));
    const slope=Math.atan2(next.y-p.y,Math.hypot(next.x-p.x,next.z-p.z));
    bear.rotation.x=mix(bear.rotation.x,-slope,snap?1:smooth(9,dt));
    bear.rotation.z=mix(bear.rotation.z,mode==='riding'?sideSpeed*.022:0,snap?1:smooth(7,dt));
    bear.position.y=(action==='Slide'?seatedOffset:0)+.035;
    const dx=Math.sin(clockYaw),dz=Math.cos(clockYaw);
    const tight=section===2, back=tight?4.8:8.9, up=tight?3.55:5;
    framing=mix(framing,mode==='riding'?0:1,snap?1:smooth(2.5,dt));
    // Orbit around the rider when leaving the start or arriving at the finish.
    const angle=framing*(mode==='finish'?2.13:1.13), distance=mix(back,12,framing);
    const ox=(-dx*Math.cos(angle)-dz*Math.sin(angle))*distance;
    const oz=(-dz*Math.cos(angle)+dx*Math.sin(angle))*distance;
    eye.set(p.x+ox,p.y+up+framing*1.6+jumpHeight*.45,p.z+oz);
    target.set(p.x+dx*2.6*(1-framing),p.y+1.35+jumpHeight*.65,p.z+dz*2.6*(1-framing));
    if(snap){camera.position.copy(eye);look.copy(target)}
    else{camera.position.lerp(eye,smooth(11,dt));look.lerp(target,smooth(15,dt))}
    camera.lookAt(look);
    focus.set(p.x,player.position.y+seatedHeight*.56,p.z);
    focusRider(film,focus,seatedHeight*.5,mode,snap);
    const left=Math.max(-5.16,lane-.25),right=Math.min(5.16,lane+.25);
    const crossSlope=(surface(s,right).y-surface(s,left).y)/(right-left);
    normal.set(-p.tx*Math.tan(slope)+p.tz*crossSlope,1,-p.tz*Math.tan(slope)-p.tx*crossSlope).normalize();
    contact.position.set(p.x,p.y+.03,p.z);
    contact.quaternion.setFromUnitVectors(surfaceUp,normal);
    const alpha=contact.material.uniforms.grounded;
    alpha.value=mix(alpha.value,flight<0?1:0,snap?1:smooth(14,dt));
  }
  film.resize();reset();
  const clock=new T.Clock();
  renderer.setAnimationLoop(()=>{
    const dt=Math.min(clock.getDelta(),.08);
    if(mode==='riding')simulate(dt);
    mixer.update(dt);draw(dt);
    film.setFrameBudget(1/60,mode==='riding');
    film.render(dt);
  });
}
play().catch(e=>{console.error(e);$('#result').textContent='赛道加载失败，请刷新重试。';go.textContent='重新加载';go.disabled=false;go.onclick=()=>location.reload()});
