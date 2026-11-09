import {bindLensSettings} from './lens-settings.js';
import * as T from 'three';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {Scene3D, focusRider} from './film/scene.js';
import {loadDaylight, createContactShadow} from './daylight.js';
import {createRider} from './rider.js';
import {restoreCourseMaterials} from './course-materials.js';

const $=s=>document.querySelector(s);
const go=$('#go'), launch=$('#launch'), meter=$('#progress progress');
const clamp=T.MathUtils.clamp, mix=T.MathUtils.lerp;
const smooth=(rate,dt)=>1-Math.exp(-rate*dt);

export async function play(progress){
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
  const classic=new URLSearchParams(location.search).get('mode')==='yard';
  const [catalog,course,path]=await Promise.all([
    fetch('./slide/characters.json').then(r=>{if(!r.ok)throw Error('人物列表读取失败');return r.json()}),classic?loader.loadAsync('./slide/wooden-chute.glb'):null,
    classic?fetch('./slide/path.json').then(r=>{if(!r.ok)throw Error('赛道路径读取失败');return r.json()}):null,
    loadDaylight(film,lite)
  ]);
  if(classic){
  scene.add(course.scene);
  course.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  await restoreCourseMaterials(course,renderer,{quality,lite});
  }
  progress.value = 2;
  const definitions=catalog.characters;
  const defaultCharacter=definitions.find(c=>c.id==='teddy'&&c.ready);
  if(!defaultCharacter)throw Error('默认人物缺失');
  let selected=defaultCharacter, savedId;
  try{savedId=localStorage.getItem('commonplay-rider')}catch{}
  selected=definitions.find(c=>c.id===savedId&&c.ready)||defaultCharacter;
  let initial;
  try{initial=await loader.loadAsync(selected.model)}catch(error){
    if(selected===defaultCharacter)throw error;
    selected=defaultCharacter;initial=await loader.loadAsync(selected.model);
  }
  const player=new T.Group();scene.add(player);
  let rider;
  try{rider=createRider(initial,selected)}catch(error){
    if(selected===defaultCharacter)throw error;
    selected=defaultCharacter;rider=createRider(await loader.loadAsync(selected.model),selected);
  }
  progress.value = 3;
  let bear=rider.model, seatedOffset=rider.seatedOffset, seatedHeight=rider.seatedHeight;
  player.add(bear);
  let contact=createContactShadow(rider.shadowRadius);scene.add(contact);
  const pose=(name,immediate=false)=>rider.pose(name,immediate);
  const held=new Set();
  const settings=$('#lens-settings');
  bindLensSettings(settings.querySelector('[data-lens]'), film);
  $('#open-settings').onclick=()=>{
    if(document.pointerLockElement)document.exitPointerLock();
    held.clear();
    settings.showModal();
    window.dispatchEvent(new Event('scene-settings-change'));
  };
  settings.querySelector('[data-close]').onclick=()=>settings.close();
  settings.onclose=()=>window.dispatchEvent(new Event('scene-settings-change'));
  let mode='ready',soloGame;
  const picker=$('#character-picker'), choices=$('#character-options'), choose=$('#choose-character');
  const pickerStatus=$('#character-status');
  let switching=false;
  function renderChoices(){
    $('#character-name').textContent=selected.name;
    for(const button of choices.children){
      const definition=definitions.find(c=>c.id===button.dataset.character);
      button.disabled=!definition.ready||switching;
      button.setAttribute('aria-pressed',String(definition.id===selected.id));
      button.querySelector('.character-state').textContent=definition.ready?(definition.id===selected.id?'已选择':'选择人物'):'即将加入';
    }
  }
  for(const definition of definitions){
    const button=document.createElement('button');button.type='button';button.className='character-card';
    button.dataset.character=definition.id;
    const portrait=document.createElement(definition.preview?'img':'span');
    if(definition.preview){portrait.src=definition.preview;portrait.alt=''}
    else{portrait.className='teddy-portrait';portrait.textContent='🧸'}
    const title=document.createElement('strong');title.textContent=definition.name;
    const description=document.createElement('small');description.textContent=definition.tagline;
    const state=document.createElement('span');state.className='character-state';
    button.append(portrait,title,description,state);choices.append(button);
    button.onclick=async()=>{
      if(switching||!definition.ready||!(mode==='ready'||mode==='finish'))return;
      if(definition.id===selected.id){picker.close();soloGame?.picked?.();return}
      switching=true;go.disabled=true;$('#reset').disabled=true;
      pickerStatus.textContent='正在准备'+definition.name+'…';renderChoices();
      let candidate;
      try{
        const gltf=await loader.loadAsync(definition.model);
        candidate=createRider(gltf,definition);
        // Compile before replacing the current rider so a failed load keeps it usable.
        await renderer.compileAsync(candidate.model,camera,scene);
        const previous=rider;player.remove(bear);rider=candidate;candidate=null;
        bear=rider.model;player.add(bear);selected=definition;
        seatedOffset=rider.seatedOffset;seatedHeight=rider.seatedHeight;
        scene.remove(contact);contact.geometry.dispose();contact.material.dispose();
        contact=createContactShadow(rider.shadowRadius);scene.add(contact);
        previous.dispose();
        try{localStorage.setItem('commonplay-rider',selected.id)}catch{}
        // The solo rider is already on the starting mark. Keep its course and worker
        // alive while browsing the roster; finishing a run still triggers a full reset.
        if(soloGame) rider.reset();
        else reset();
        pickerStatus.textContent='';picker.close();soloGame?.picked?.();
      }catch(error){
        candidate?.dispose();console.error('角色切换失败',error);
        pickerStatus.textContent='这个人物暂时没准备好，请重试或选择其他人物。';
      }finally{
        switching=false;go.disabled=false;$('#reset').disabled=false;renderChoices();
      }
    };
  }
  choose.onclick=()=>{
    if(switching||!(mode==='ready'||mode==='finish'))return;
    held.clear();pickerStatus.textContent='';renderChoices();picker.showModal();
  };
  $('#close-character-picker').onclick=()=>{if(!switching)picker.close()};
  picker.addEventListener('cancel',event=>{if(switching)event.preventDefault()});
  renderChoices();
  if(!classic){
    const {startSolo}=await import('../solo/play.js');
    soloGame=await startSolo({film,player,quality,lite,held,definitions,loader,createRider,createContactShadow,
      character:()=>selected.id,
      rider:()=>rider,contact:()=>contact,blocked:()=>switching||picker.open||settings.open,
      setMode:value=>{mode=value}
    });
    return;
  }
  const returnLink=document.createElement('a');returnLink.href='./';returnLink.textContent='单人闯关';
  document.querySelector('nav').prepend(returnLink);
  const surfaceUp=new T.Vector3(0,1,0),normal=new T.Vector3();
  const rows=path.rows, finish=path.finish, start=rows[0][0]+5;
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
  let s,lane,sideSpeed,speed,elapsed,flight,clockYaw,section,framing,phaseTime,seatAmount,steering;
  const target=new T.Vector3(),eye=new T.Vector3(),focus=new T.Vector3(),look=new T.Vector3();
  function reset(){
    if(soloGame){soloGame.reset();return}
    mode='ready';s=start;lane=0;sideSpeed=0;speed=0;elapsed=0;flight=-1;clockYaw=0;section=0;framing=1;
    phaseTime=0;seatAmount=0;steering=0;held.clear();rider.reset();launch.hidden=false;go.disabled=false;go.textContent='出发滑行  →';$('#result').textContent='';
    draw(0,true);
  }
  function depart(){
    if(switching||picker.open)return;
    if(mode==='finish')reset();
    if(mode!=='ready')return;
    mode='approach';phaseTime=0;speed=0;pose('Run');launch.hidden=true;
  }
  function jump(){if(mode==='riding' && s<finish-20 && flight<0){flight=0;pose('Jump')}}
  go.onclick=()=>{depart();go.blur()};
  $('#reset').onclick=e=>{if(!switching)reset();e.currentTarget.blur()};
  function press(code,repeat=false){
    held.add(code);
    if(!repeat && (code==='Enter'||code==='Space') && (mode==='finish'||mode==='ready')){depart();return}
    if(code==='Space'&&!repeat)jump();
  }
  const keys=['KeyA','KeyD','KeyW','KeyS','Space','Enter'];
  window.addEventListener('keydown',e=>{
    const code=bindings[e.code]||e.code;
    if(picker.open||switching||settings.open)return;
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
    if(mode==='approach'&&s>=-3.6){
      mode='entering';phaseTime=0;pose('SitDown');
    }else if(mode==='entering'&&phaseTime>=rider.duration('SitDown')){
      mode='riding';phaseTime=0;pose('Slide');
    }else if(mode==='riding'&&s>=finish){
      mode='recovering';phaseTime=0;pose('StandUp');
    }else if(mode==='recovering'&&phaseTime>=rider.duration('StandUp')){
      mode='runout';phaseTime=0;pose('Run');
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
    if(settings.open){film.render(0);return}
    if(mode!=='ready'&&mode!=='finish')simulate(dt);
    else if(mode==='finish'){
      phaseTime+=dt;if(phaseTime>=rider.duration('FinishWave'))pose('Idle');
    }
    rider.animate(dt,steering,speed);draw(dt);
    film.setFrameBudget(1/60,mode==='riding');
    film.render(dt);
  });
}
