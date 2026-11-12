import {loadProgressModel, upgradeModelTextures} from '../slide/progressive-assets.js';
import {createMobileControls} from '../slide/mobile-controls.js';
import {stageNames, pieceNames, courseSeed} from './course-labels.js';
import {loadLostPack} from '../slide/lost-pack.js';
import {materialEdits, applyGameEdits, woodFinishes, presetSources} from './material-edits.js';
import {settingsOpen} from '../slide/settings.js';
import * as T from 'three';
import {createViewInput} from './view-input.js';
import {openAuthority} from './transport.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {updateAcrylicBackdrop} from './js/render/acrylic.js';
import {CourseView} from './js/render/courseView.js';
import {focusRider} from '../slide/film/scene.js';
import {GroundMotion} from '../slide/ground-motion.mjs';

const $=s=>document.querySelector(s);
const cards={
  polish:['极速鞋','提高最高速度'],rubber:['起步弹力','提高加速度'],
  spring:['弹力靴','跳得更高，缩短跳跃冷却'],gyro:['空中平衡','增强空中转向'],
  feather:['轻装','减轻重量，提高加速度'],grip:['防滑脚掌','提高转向抓地力'],
  turbo:['涡轮冲刺','按 E 短时提速'],headstart:['起跑推进','开闸时获得加速'],
  aero:['轻风外套','降低阻力，提高速度'],tailwind:['顺风','提高速度和加速度'],
  recovery:['快速返场','缩短复位等待'],double:['二段跳','在空中再次按跳跃'],
  pogo:['弹跳推进','按 E 超高跳跃'],momentum:['连贯滑行','持续滑行积累速度'],
  ghost:['穿行','按 E 激活穿行能力'],rocket:['火箭推进','按 E 持续推进'],
  slingshot:['出弯加速','离开弯道时加速']
};
const canMove=phase=>['intro','countdown','race'].includes(phase);
const aliases={ArrowLeft:'KeyA',ArrowRight:'KeyD',ArrowUp:'KeyW',ArrowDown:'KeyS',ShiftLeft:'KeyE',ShiftRight:'KeyE'};
const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
const damping=(k,dt)=>1-Math.exp(-k*dt);
const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

export async function startSolo(host){
  let firstFrame, firstFailure;
  const firstReady = new Promise((resolve, reject) => {firstFrame = resolve;firstFailure = reject;});
  const {film,player,quality,held}=host,{scene,camera,renderer}=film;
  const style=document.createElement('link');style.rel='stylesheet';style.href='./solo/solo.css?v=start5';document.head.append(style);
  const seed=courseSeed(new URLSearchParams(location.search));
  const editorLink=document.createElement('a');
  editorLink.href='./editor/?seed='+seed;
  editorLink.textContent='材质编辑';
  $('nav').prepend(editorLink);
  let restoreEdits;
  const original=document.createElement('a');original.href='?mode=yard';original.textContent='经典滑梯';
  $('nav').prepend(original);
  const courseID=document.createElement('div');courseID.id='course-id';courseID.textContent='单人 · 种子 '+seed;
  $('#progress').append(courseID);
  const change=document.createElement('button');change.textContent='换赛道';change.onclick=()=>location.assign('?seed='+crypto.getRandomValues(new Uint32Array(1))[0]);
  $('nav').insertBefore(change,$('#reset'));
  $('.keys').innerHTML='<span><kbd>WASD</kbd> 移动</span><span><kbd>空格</kbd> 跳跃</span><span><kbd>R</kbd> 复位</span><span id="view-hint">点击场景控制视角</span><span id="ability-key" hidden><kbd>E</kbd> 技能</span>';
  const view=createViewInput(renderer.domElement,$('#view-hint'));
  let gamepad=null;
  const mobile = createMobileControls(renderer.domElement, [['KeyR','复位'], ['KeyE','技能'], ['Space','跳跃']],
    () => canMove(state?.phase) && !host.blocked());
  const pad = mobile.buttons;
  const countdown=document.createElement('div');countdown.id='gate-countdown';countdown.hidden=true;
  countdown.setAttribute('role','timer');
  countdown.setAttribute('aria-label','开赛倒计时');
  const reveal=document.createElement('section');reveal.id='starter-reveal';reveal.hidden=true;
  reveal.setAttribute('aria-live','polite');
  reveal.innerHTML='<h2>本局随机技能</h2><ul></ul>';
  document.body.append(countdown,reveal);
  const runwayUrl=new URL('./models/quilted-runway-startup.glb',import.meta.url);
  const parkModels = new Map();
  const [runway]=await Promise.all([loadProgressModel(new GLTFLoader(),runwayUrl.href,'runway',637812).then(gltf=>{upgradeModelTextures(gltf.scene,runwayUrl.href);return gltf.scene}).catch(error=>{
      console.warn('软垫模型加载失败，使用本地软垫',error);
      return null;
    })]);
  host.loading?.set('runway',1);
  runway?.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true}});
  const needsWood=stageNames.some((_,i)=>Object.values(materialEdits(seed,i).values).some(v=>Object.hasOwn(woodFinishes,v.preset)));
  const wood=needsWood ? await loadLostPack(renderer,host.lite) : null;
  let worker,course,state,previous,received=0,yaw=0,facing=0,snap=true;
  let section;
  let action='Idle',actionTime=0,sit=0,side=0,lastKeys='',lastPhase='';
  let celebrating=false;
  const motion=new GroundMotion(name=>host.rider().duration(name));
  const worldPos=new T.Vector3(),eye=new T.Vector3(),focus=new T.Vector3(),look=new T.Vector3(),normal=new T.Vector3(),up=new T.Vector3(0,1,0);
  function setAction(name,force=false){
    if(!force&&action===name)return;
    host.rider().pose(name,force);action=name;actionTime=0;
  }
  function controls(force=false){
    if(!worker)return;
    const f=clamp(Number(held.has('KeyW'))-Number(held.has('KeyS'))-mobile.move.y-(gamepad?.y||0),-1,1);
    const r=clamp(Number(held.has('KeyD'))-Number(held.has('KeyA'))+mobile.move.x+(gamepad?.x||0),-1,1);
    const heading=yaw+view.yaw+mobile.yaw;
    const x=f*Math.sin(heading)-r*Math.cos(heading),z=f*Math.cos(heading)+r*Math.sin(heading);
    const btn=Number(held.has('Space')||!!gamepad?.jump)+2*Number(held.has('KeyE')||!!gamepad?.skill)+4*Number(held.has('KeyR')||!!gamepad?.reset);
    const key=[Math.round(x*100),Math.round(z*100),btn].join(',');
    if(force||key!==lastKeys){worker.postMessage({type:'input',x,z,btn});lastKeys=key}
  }
  function release(){mobile.clear();gamepad=null;held.clear();controls(true)}
  function reset(startOnReady=false){
    view.reset();gamepad=null;worker?.terminate();state=previous=null;snap=true;side=sit=0;lastPhase=lastKeys='';
    motion.reset();host.rider().reset();setAction('Idle',true);held.clear();host.setMode('ready');
    $('#launch').hidden=false;$('#result').textContent='';$('#go').disabled=true;
    reveal.hidden=countdown.hidden=true;
    worker=openAuthority();
    worker.onerror=e=>{firstFailure?.(e.error || new Error('模拟加载失败'));view.unlock();console.error(e);$('#launch').hidden=false;$('#result').textContent='模拟加载失败，请重新开始';$('#go').textContent='重新加载';$('#go').disabled=false;state=null};
    worker.onmessage=({data:m})=>{
      if(m.type==='course'){
        if(course){restoreEdits();scene.remove(course.group);course.dispose()}
        const edits=materialEdits(seed,m.stage.index);
        course=new CourseView(m.stage,quality,runway,edits.separate,parkModels);
        restoreEdits=applyGameEdits(course,edits,presetSources(course,runway,wood));
        editorLink.href='./editor/?seed='+seed+'&stage='+(m.stage.index+1);
        scene.add(course.group);
        motion.reset();snap=true;previous=null;return;
      }
      if(m.type!=='state')return;
      previous=state;state=m.state;received=performance.now();
      if(previous?.tp!==state.tp||previous.stage!==state.stage){motion.reset();snap=true;previous=state}
      section=course.stage.pieces.find(piece=>state.s>=piece.s0&&state.s<piece.s1);
      updateUI();
      if(startOnReady&&state.phase==='ready'){startOnReady=false;start()}
    };
    worker.postMessage({type:'init',seed});
  }
  function updateUI(){
    const ph=state.phase,atStart=ph==='ready',atEnd=ph==='over'||ph==='podium';
    host.setMode(atStart?'ready':atEnd?'finish':'riding');
    $('#launch').hidden=!(atStart||atEnd);
    $('#go').disabled=!(atStart||atEnd);
    $('#go').textContent=atEnd?'重新挑战  ↻':'开始单人闯关  →';
    if(atEnd&&ph!==lastPhase)view.unlock();
    if(atEnd)$('#result').textContent='五关完成！';
    countdown.hidden=state.gateSeconds==null;
    if(!countdown.hidden && countdown.textContent!==String(state.gateSeconds))countdown.textContent=state.gateSeconds;
    reveal.hidden=!state.awarded;
    if(state.awarded&&ph!==lastPhase){
      reveal.querySelector('h2').textContent=ph==='draft'?'过关奖励':'本局随机技能';
      const list=reveal.querySelector('ul');list.replaceChildren();
      for(const id of state.awarded){
        const [name,description]=cards[id];
        const item=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('small');
        title.textContent=name;detail.textContent=description;
        item.append(title,detail);list.append(item);
      }
    }
    const hasSkill=ph==='race'&&!!state.ability;
    $('#ability-key').hidden=!hasSkill;pad.querySelector('[data-key="KeyE"]').hidden=!hasSkill;
    if(hasSkill)$('#ability-key').lastChild.textContent=' '+(cards[state.ability]?.[0]||'技能');
    if(ph!==lastPhase){if(!canMove(ph)||!canMove(lastPhase))release();lastPhase=ph}
    const trackLabel=pieceNames[section?.name];
    const label=ph==='cut'?'本关完成':!state.active&&ph==='race'?'检查点复位':(ph==='race'&&trackLabel)||stageNames[state.stage];
    $('#section').textContent=(state.stage+1)+'/5 · '+label;
    const pct=state.placed?100:clamp(Math.floor(state.s/course.stage.path.finishS*100),0,99);
    $('#percent').textContent=pct+'%';$('progress').value=pct;
  }
  function start(){
    if(state?.phase==='ready'){
      worker.postMessage({type:'start'});$('#go').disabled=true;$('#go').blur();
    }else if(!state||state.phase==='over'||state.phase==='podium')reset(true);
  }
  $('#go').onclick=e=>{
    if(host.blocked())return;
    start();
    if(e.detail>0&&matchMedia('(any-pointer:fine)').matches)view.capture(e);
  };
  renderer.domElement.addEventListener('pointerdown',e=>{
    if(e.button===0&&!host.blocked()&&canMove(state?.phase))view.capture(e);
  });
  $('#reset').onclick=()=>{if(!host.blocked())reset()};
  const supported=new Set(['KeyW','KeyA','KeyS','KeyD','KeyE','KeyR','Space']);
  function key(e,down){
    const k=aliases[e.code]||e.code;
    if(!supported.has(k)||host.blocked()||!canMove(state?.phase))return;
    e.preventDefault();if(down)held.add(k);else held.delete(k);controls();
  }
  window.addEventListener('keydown',e=>key(e,true));window.addEventListener('keyup',e=>key(e,false));window.addEventListener('blur',()=>{release();view.unlock()});
  function updatePause(){release();if(document.hidden||settingsOpen())view.unlock();worker?.postMessage({type:'pause',value:document.hidden||settingsOpen()});if(state)updateUI();}
  document.addEventListener('visibilitychange',updatePause);
  window.addEventListener('scene-settings-change',updatePause);
  for(const button of pad.querySelectorAll('button')){
    button.onpointerdown=e=>{if(!canMove(state?.phase))return;e.preventDefault();button.setPointerCapture(e.pointerId);held.add(button.dataset.key);controls()};
    button.onlostpointercapture=()=>{held.delete(button.dataset.key);controls()};
  }
  function draw(dt,now){
    mobile.update(dt);
    if(!state||!course)return;
    const a=state,b=previous||a,ph=a.phase,rider=host.rider();
    const t=clamp((now-received)/34,0,1);
    worldPos.set(lerp(b.x,a.x,t),lerp(b.y,a.y,t),lerp(b.z,a.z,t));
    const path=course.stage.path,idx=clamp(a.sample,0,path.n-1),trackYaw=Math.atan2(path.tx[idx],path.tz[idx]);
    yaw+=angle(yaw,trackYaw)*(snap?1:damping(6,dt));
    gamepad=canMove(ph)&&document.hasFocus()&&!document.hidden&&!host.blocked()?view.readPad(dt):null;
    if(canMove(ph))controls();
    const speed=Math.hypot(a.vx,a.vz),motionHeading=Math.atan2(a.vx,a.vz);
    const ready=ph==='ready'||ph==='starter',finished=a.placed||ph==='over';
    const desired=ready?yaw-2.55:finished?yaw+Math.PI:speed>.8?motionHeading:yaw;
    facing+=angle(facing,desired)*(snap?1:damping(12,dt));
    const racing=ph==='race'&&a.active&&!finished;
    actionTime+=dt;
    if(finished){
      if(!a.grounded)setAction('Jump');
      else if(!celebrating)setAction(sit>.2?'StandUp':'FinishWave');
      else if(action==='StandUp'&&actionTime>=rider.duration('StandUp'))setAction('FinishWave');
      else if(action==='FinishWave'&&actionTime>=rider.duration('FinishWave'))setAction('Idle');
    }else if(!canMove(ph)||!a.active){motion.reset();setAction('Idle')}
    else{
      motion.update(dt,{grounded:a.grounded,normalY:a.ny,speed,sliding:racing&&a.sliding,jump:!a.grounded&&a.vy>1.5,lockSlide:a.grounded&&a.ny<0});
      setAction(motion.action);
    }
    celebrating=finished&&a.grounded;
    const steering=clamp(Number(held.has('KeyD'))-Number(held.has('KeyA'))+mobile.move.x+(gamepad?.x||0),-1,1);
    side=lerp(side,steering,damping(8,dt));
    sit=finished?lerp(sit,action==='StandUp'?1-clamp(actionTime/rider.duration(action),0,1):0,damping(12,dt)):motion.seat;
    // Keep the visual upright on steep and inverted pieces; collisions are handled by Show.
    player.visible=a.active||finished;player.position.copy(worldPos);player.position.y-=a.r;
    player.rotation.y=facing;
    const model=rider.model;model.position.y=sit*rider.seatedOffset;model.rotation.z=side*sit*.08;
    model.rotation.x=lerp(model.rotation.x,a.grounded?clamp(Math.atan2(a.nx*Math.sin(facing)+a.nz*Math.cos(facing),a.ny),-.5,.5):0,damping(8,dt));
    rider.animate(dt,side,speed);
    const shadow=host.contact();shadow.visible=player.visible&&a.grounded;shadow.position.copy(player.position);shadow.position.y+=.03;
    normal.set(a.nx,a.ny,a.nz).normalize();shadow.quaternion.setFromUnitVectors(up,normal);
    course.illuminate(worldPos);
    const displayTime=a.clock+(ph==='race'?Math.min((now-received)/1000,.04):0);
    course.update(displayTime,dt,['race','cut','draft','podium','over'].includes(ph));
    const waiting=ph==='intro'||ph==='countdown';
    const camYaw=yaw+(ready ? 1.12 : view.yaw+mobile.yaw),back=ready||waiting?8.5:6.6;
    const baseHeight=waiting?6:ready?3.8:3.05;
    const pitch=ready?0:clamp(view.pitch+mobile.pitch,-.36,.85);
    const distance=back*Math.cos(pitch)-baseHeight*Math.sin(pitch);
    const height=baseHeight*Math.cos(pitch)+back*Math.sin(pitch);
    eye.set(worldPos.x-Math.sin(camYaw)*distance,worldPos.y+height,worldPos.z-Math.cos(camYaw)*distance);
    focus.set(worldPos.x,player.position.y+rider.seatedHeight*.56,worldPos.z);
    const dx=ready?0:Math.sin(camYaw)*1.5,dz=ready?0:Math.cos(camYaw)*1.5;
    focus.x+=dx;focus.z+=dz;
    host.framePicker(eye,focus,rider,dt);
    if(snap){camera.position.copy(eye);look.copy(focus)}else{camera.position.lerp(eye,damping(10,dt));look.lerp(focus,damping(18,dt))}
    camera.lookAt(look);
    focus.set(worldPos.x,player.position.y+rider.seatedHeight*.56,worldPos.z);
    focusRider(film,focus,rider.seatedHeight*.5,ready?'ready':finished?'finish':'riding',snap);snap=false;
    film.setFrameBudget(1/60,!host.blocked());
    updateAcrylicBackdrop(course.mats.acrylic,film);
    film.render(dt);
    if(firstFrame){host.loading?.set('course',1);firstFrame();firstFrame=null;}
  }
  reset();film.resize();
  let last=performance.now();
  renderer.setAnimationLoop(now=>{const dt=Math.min(.08,(now-last)/1000);last=now;draw(dt,now)});
  await firstReady;
  return {reset,start};
}
