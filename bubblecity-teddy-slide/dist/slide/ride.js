import {createPickerCamera} from './picker-camera.js';
import * as T from 'three';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {createSlideFilm, focusRider} from './film/scene.js';
import {addHarborLights} from './harbor-lights.js';
import {loadDaylight, createContactShadow} from './daylight.js';
import {SlideMode} from './ground-motion.mjs';
import {installSettings, settingsOpen} from './settings.js';
import {createRider} from './rider.js?v=dock';
import {loadRoster, installCharacterPicker} from './character-picker.js?v=dock';
import {getMaterials} from '../solo/js/render/materials.js';
import {restoreCourseMaterials} from './course-materials.js';

const $=s=>document.querySelector(s);
const go=$('#go'), launch=$('#launch'), meter=$('progress');
const clamp=T.MathUtils.clamp, mix=T.MathUtils.lerp;
const smooth=(rate,dt)=>1-Math.exp(-rate*dt);

async function play(){
  const canvas=document.createElement('canvas');
  $('#world').append(canvas);
  const {film,quality,lite}=createSlideFilm(canvas);
  const {renderer,camera,scene}=film;
  const loader=new GLTFLoader();
  const params=new URLSearchParams(location.search);
  const classic=params.get('mode')==='yard';
  const partyServer=document.querySelector('meta[name="party-endpoint"]');
  const party=partyServer && (params.get('mode')==='party'||params.has('room'));
  if(!party && partyServer){
    const rooms=document.createElement('a');
    rooms.href='?mode=party';rooms.textContent='多人房间';
    document.querySelector('nav').prepend(rooms);
  }
  // The raised camera clears the classic chute walls.
  const framePicker=createPickerCamera(camera,classic ? .7 : .13);
  const [roster,course,path]=await Promise.all([
    loadRoster(loader),classic?loader.loadAsync('./slide/wooden-chute.glb'):null,
    classic?fetch('./slide/path.json').then(r=>{if(!r.ok)throw Error('赛道路径读取失败');return r.json()}):null,
    loadDaylight(film), getMaterials(quality,renderer,{lite}).ready
  ]);
  await installSettings(film, getMaterials(quality,renderer,{lite}), classic ? 'stardust-slalom' : 'orbital-sprint');
  if(classic){
  scene.add(course.scene);
  course.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  await restoreCourseMaterials(course,renderer,{quality,lite});
  }
  const player=new T.Group();scene.add(player);
  let rider=roster.rider;
  let bear=rider.model, seatedOffset=rider.seatedOffset, seatedHeight=rider.seatedHeight;
  player.add(bear);
  let contact=createContactShadow(rider.shadowRadius);scene.add(contact);
  const pose=(name,immediate=false)=>rider.pose(name,immediate);
  const held=new Set();
  let mode='ready', game;
  let pickerBlocked=()=>false;
  function enablePicker(){
    pickerBlocked=installCharacterPicker(roster,{renderer,camera,scene,onOpen:()=>held.clear(),replace(next,character){
      player.remove(bear);
      rider.dispose();
      rider=next;bear=rider.model;player.add(bear);
      seatedOffset=rider.seatedOffset;seatedHeight=rider.seatedHeight;
      scene.remove(contact);contact.geometry.dispose();contact.material.dispose();
      contact=createContactShadow(rider.shadowRadius);scene.add(contact);
      roster.selected=character;game?.picked?.();
    }});
  }
  if(!classic){
    const {startSolo}=party ? await import('../solo/room-play.js') : await import('../solo/play.js?v=start5');
    let roomOptions={};
    if(party){
      const {loadParkModels}=await import('../solo/js/render/park.js');
      const {updateAcrylicBackdrop}=await import('../solo/js/render/acrylic.js');
      const {pieceNames}=await import('../solo/course-labels.js');
      roomOptions={partyOnly:true,definitions:roster.characters,character:()=>roster.selected.id,loader,createRider,
        createContactShadow,pieceNames,parkModels:await loadParkModels(),partyStyles:'./solo/room.css',
        lightCourse(course,position){course.illuminate(position);updateAcrylicBackdrop(course.mats.acrylic,film)}
      };
    }
    game=await startSolo({...roomOptions,framePicker,film,player,quality,lite,held,
      rider:()=>rider,contact:()=>contact,blocked:()=>pickerBlocked()||settingsOpen(),
      setMode:value=>{mode=value}
    });
    enablePicker();
    return;
  }
  enablePicker();
  const returnLink=document.createElement('a');returnLink.href='./';returnLink.textContent='单人闯关';
  document.querySelector('nav').prepend(returnLink);
  const surfaceUp=new T.Vector3(0,1,0),normal=new T.Vector3();
  const rows=path.rows, finish=path.finish, start=rows[0][0]+5;
  const illuminate = addHarborLights(course.scene, rows.map(row => ({
    s: row[0], x: row[1], z: row[2], tx: row[3], tz: row[4], y: row[11], edge: 5.12
  })));
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
  const bindings={ArrowLeft:'KeyA',ArrowRight:'KeyD',ArrowUp:'KeyW',ArrowDown:'KeyS'};
  const descent = new SlideMode();
  let s,lane,sideSpeed,speed,elapsed,flight,clockYaw,section,framing,phaseTime,seatAmount,steering;
  const target=new T.Vector3(),eye=new T.Vector3(),focus=new T.Vector3(),look=new T.Vector3();
  function reset(){
    descent.reset();mode='ready';s=start;lane=0;sideSpeed=0;speed=0;elapsed=0;flight=-1;clockYaw=0;section=0;framing=1;
    phaseTime=0;seatAmount=0;steering=0;held.clear();rider.reset();launch.hidden=false;go.disabled=false;go.textContent='出发滑行  →';$('#result').textContent='';
    draw(0,true);
  }
  function depart(){
    if(pickerBlocked())return;
    if(mode==='finish')reset();
    if(mode!=='ready')return;
    mode='approach';phaseTime=0;speed=0;pose('Run');launch.hidden=true;
  }
  function jump(){if(mode==='riding' && s<finish-20 && flight<0){flight=0;pose('Jump')}}
  go.onclick=()=>{depart();go.blur()};
  $('#reset').onclick=e=>{if(!pickerBlocked())reset();e.currentTarget.blur()};
  function press(code,repeat=false){
    held.add(code);
    if(!repeat && (code==='Enter'||code==='Space') && (mode==='finish'||mode==='ready')){depart();return}
    if(code==='Space'&&!repeat)jump();
  }
  const keys=['KeyA','KeyD','KeyW','KeyS','Space','Enter'];
  window.addEventListener('keydown',e=>{
    const code=bindings[e.code]||e.code;
    if(pickerBlocked()||settingsOpen())return;
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
    elapsed+=dt;phaseTime+=dt;
    const before=surface(s,lane),ahead=surface(s+1,lane);
    const grade=clamp(before.y-ahead.y,-.45,.7);
    const slideSpeed=clamp(13+12*grade+(held.has('KeyW')?5:0)-(held.has('KeyS')?8:0),5,23);
    let targetSpeed=slideSpeed;
    if(mode==='approach')targetSpeed=5.5;
    if(mode==='entering')targetSpeed=mix(5.5,10,clamp(phaseTime,0,1));
    if(mode==='recovering')targetSpeed=4.8;
    if(mode==='runout')targetSpeed=Math.min(4.8,Math.max(0,(finish+16-s)*1.45));
    speed=mix(speed,targetSpeed,smooth(mode==='approach'?3.5:2.3,dt));
    const steer=Number(held.has('KeyD'))-Number(held.has('KeyA'));
    sideSpeed=mix(sideSpeed,steer*(mode==='riding'?8.4:3),smooth(7,dt));
    const previousLane=lane;
    lane=clamp(lane+sideSpeed*dt,-5.16,5.16);
    // Respond to crossed distance, releasing the lean when a paw reaches the rail.
    steering=mix(steering,clamp((lane-previousLane)/Math.max(.001,dt*7),-1,1),smooth(8,dt));
    s+=speed*dt;
    if(flight>=0){flight+=dt;if(flight>=1){flight=-1;pose('Slide')}}
    const after=surface(s,lane);
    const downhill=Math.atan2(before.y-after.y,Math.max(.001,Math.hypot(after.x-before.x,after.z-before.z)))*180/Math.PI;
    const shouldSlide=descent.update(dt,{grounded:flight<0,downhill,speed,lockSlide:s<finish});
    if(mode==='approach'&&s<finish&&shouldSlide){
      mode='entering';phaseTime=0;pose('SitDown');
    }else if((mode==='riding'||mode==='entering')&&flight<0&&(!shouldSlide||s>=finish)){
      mode='recovering';phaseTime=0;pose('StandUp');
    }else if(mode==='approach'&&s>=finish){
      mode='runout';phaseTime=0;
    }else if(mode==='entering'&&phaseTime>=rider.duration('SitDown')){
      mode='riding';phaseTime=0;pose('Slide');
    }else if(mode==='recovering'&&phaseTime>=rider.duration('StandUp')){
      mode=s>=finish?'runout':'approach';phaseTime=0;pose('Run');
    }else if(mode==='runout'&&s>=finish+15.6){
      mode='finish';phaseTime=0;speed=0;pose('FinishWave');held.clear();
      $('#result').textContent='抵达终点 · '+elapsed.toFixed(1)+' 秒';
      launch.hidden=false;go.textContent='再滑一次  ↻';
    }
  }
  function draw(dt,snap=false){
    const p=surface(s,lane),next=surface(s+1.4,lane);
    while(section+1<path.zones.length&&path.zones[section+1][0]<=s)section++;
    const pct=clamp(Math.round((s-start)/(finish-start)*100),0,100);
    $('#percent').textContent=pct+'%';meter.value=pct;
    const groundLabels={ready:'起点站台',approach:'平地助跑',entering:'屈膝入滑',recovering:'收腿起身',runout:'终点缓冲台',finish:'抵达终点'};
    $('#section').textContent=groundLabels[mode]||path.zones[section][1];
    const jumpHeight=flight>=0?7.8*flight*(1-flight):0;
    const yaw=Math.atan2(p.tx,p.tz);
    clockYaw+=Math.atan2(Math.sin(yaw-clockYaw),Math.cos(yaw-clockYaw))*(snap?1:smooth(13,dt));
    player.position.set(p.x,p.y+jumpHeight,p.z);
    illuminate(player.position);
    player.rotation.y=clockYaw;
    // At the starting mark the bear looks back, then turns into the descent.
    bear.rotation.y=mode==='ready'?-2.05:mix(bear.rotation.y,0,smooth(4,dt));
    const slope=Math.atan2(next.y-p.y,Math.hypot(next.x-p.x,next.z-p.z));
    bear.rotation.x=mix(bear.rotation.x,-slope,snap?1:smooth(9,dt));
    bear.rotation.z=mix(bear.rotation.z,mode==='riding'?steering*.11:0,snap?1:smooth(7,dt));
    let targetSeat=mode==='riding'&&flight<0?1:0;
    if(mode==='entering')targetSeat=T.MathUtils.smoothstep(phaseTime,.08,.78);
    if(mode==='recovering')targetSeat=1-T.MathUtils.smoothstep(phaseTime/1.2,.12,.9);
    seatAmount=mix(seatAmount,targetSeat,snap?1:smooth(18,dt));
    bear.position.y=seatAmount*seatedOffset+.035;
    const dx=Math.sin(clockYaw),dz=Math.cos(clockYaw);
    const tight=section===2, back=tight?4.8:8.9, up=tight?3.55:5;
    framing=mix(framing,mode==='ready'||mode==='finish'?1:0,snap?1:smooth(2.5,dt));
    // Orbit around the rider when leaving the start or arriving at the finish.
    const angle=framing*(mode==='finish'?2.13:1.13), distance=mix(back,12,framing);
    const ox=(-dx*Math.cos(angle)-dz*Math.sin(angle))*distance;
    const oz=(-dz*Math.cos(angle)+dx*Math.sin(angle))*distance;
    eye.set(p.x+ox,p.y+up+framing*1.6+jumpHeight*.45,p.z+oz);
    if(mode==='finish'){
      // Keep the celebration camera inside the rails, including a wide finish.
      const side=clamp(lane+Math.sin(angle)*distance,-3.5,3.5)-lane;
      eye.x=p.x-dx*Math.cos(angle)*distance-dz*side;
      eye.z=p.z-dz*Math.cos(angle)*distance+dx*side;
    }
    target.set(p.x+dx*2.6*(1-framing),p.y+1.35+jumpHeight*.65,p.z+dz*2.6*(1-framing));
    framePicker(eye,target,rider,dt);
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
    if(settingsOpen()){held.clear();draw(0);film.render(0);return}
    if(mode!=='ready'&&mode!=='finish')simulate(dt);
    else if(mode==='finish'){
      phaseTime+=dt;if(phaseTime>=rider.duration('FinishWave'))pose('Idle');
    }
    rider.animate(dt,steering,speed);draw(dt);
    film.setFrameBudget(1/60,mode==='riding');
    film.render(dt);
  });
}
play().catch(e=>{console.error(e);$('#result').textContent='赛道加载失败，请刷新重试。';go.textContent='重新加载';go.disabled=false;go.onclick=()=>location.reload()});
