import * as T from 'three';
import {clone as cloneSkinned} from 'three/addons/utils/SkeletonUtils.js';
import {openAuthority} from './transport.js';
import {openParty} from './party-link.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {CourseView} from './js/render/courseView.js';
import {getMaterials} from './js/render/materials.js';
import {focusRider} from '../slide/film/scene.js';

const $=s=>document.querySelector(s);
const stageNames=['玩具门廊','蜡笔峡谷','枕头山口','地毯回旋','玩具箱决赛'];
const deckNames={runway:'平地助跑',slalomDeck:'积木绕桩',hurdleDeck:'矮栏跑道',firstDoors:'第一道移门',hammerDeck:'钟摆锤廊',tileDeck:'波浪地板',finishDoors:'终点门廊'};
const slideNames={shortSlide:'直木滑梯',curvedSlide:'回旋滑梯'};
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
const medals=['🥇','🥈','🥉'];
const canMove=phase=>['intro','countdown','race'].includes(phase);
const aliases={ArrowLeft:'KeyA',ArrowRight:'KeyD',ArrowUp:'KeyW',ArrowDown:'KeyS',ShiftLeft:'KeyE',ShiftRight:'KeyE'};
const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
const damping=(k,dt)=>1-Math.exp(-k*dt);
const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const store={get(k,f){try{return localStorage.getItem(k)??f}catch{return f}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
const sessionStore={get(k){try{return sessionStorage.getItem(k)}catch{return null}},set(k,v){try{sessionStorage.setItem(k,v)}catch{}}};
const element=(tag,{dataset,...props}={},...children)=>{const e=Object.assign(document.createElement(tag),props);if(dataset)Object.assign(e.dataset,dataset);e.append(...children);return e};
// Runner rows from the simulation: [id,x,y,z,vx,vy,vz,tp,flags,sample,s,nx,ny,nz,r]
const F_GROUNDED=1,F_ACTIVE=2,F_PLACED=4,F_ONLINE=8;

export async function startSolo(host){
  const {film,player,lite,quality,held,partyOnly=false}=host,{scene,camera,renderer}=film;
  const style=document.createElement('link');style.rel='stylesheet';style.href=host.partyStyles||'./solo/solo.css';document.head.append(style);
  const params=new URLSearchParams(location.search);
  const seedParam=params.get('seed');
  const seed=/^\d{1,10}$/.test(seedParam||'')&&Number(seedParam)<=0xffffffff?Number(seedParam):20261108;
  const partyEndpoint=document.querySelector('meta[name="party-endpoint"]')?.content||null;
  const partyMax=Number(document.querySelector('meta[name="party-max"]')?.content||4);
  const pool=host.definitions.filter(d=>d.ready).map(d=>d.id);

  // ------------------------------------------------------------ page furniture
  if(partyOnly)$('nav').prepend(element('a',{href:'./',textContent:'单人闯关'}));
  const original=element('a',{href:'?mode=yard',textContent:'经典滑梯'});
  $('nav').prepend(original);
  const courseID=element('div',{id:'course-id'});
  $('#progress').append(courseID);
  const rankLine=element('div',{id:'live-rank',hidden:true});
  $('#progress').prepend(rankLine);
  const change=element('button',{textContent:'换赛道',onclick:()=>location.assign('?seed='+crypto.getRandomValues(new Uint32Array(1))[0])});
  $('nav').insertBefore(change,$('#reset'));
  $('.keys').innerHTML='<span><kbd>WASD</kbd> 移动</span><span><kbd>空格</kbd> 跳跃</span><span><kbd>R</kbd> 复位</span><span id="ability-key" hidden><kbd>E</kbd> 技能</span>';
  // Touch: a floating stick anywhere on the left half, jump / skill / reset on the right.
  const pad=$('.pad');
  pad.innerHTML='<div id="stick-zone" aria-label="按住拖动来移动"><div id="stick-base" hidden><div id="stick-knob"></div></div><p id="stick-hint">左手按住拖动 · 移动</p></div><div id="touch-buttons"><button data-key="KeyR" class="small" aria-label="回到检查点">复位</button><button data-key="KeyE" class="skill" hidden>技能</button><button data-key="Space" class="jump" aria-label="跳跃">跳</button></div>';
  const stick={x:0,y:0,id:null,ox:0,oy:0};
  const stickZone=pad.querySelector('#stick-zone'),stickBase=pad.querySelector('#stick-base'),stickKnob=pad.querySelector('#stick-knob');
  const STICK_RADIUS=46;
  function moveStick(e){
    let dx=e.clientX-stick.ox,dy=e.clientY-stick.oy;
    const d=Math.hypot(dx,dy);
    if(d>STICK_RADIUS){
      // Drag past the rim and the base follows the thumb.
      stick.ox+=dx*(1-STICK_RADIUS/d);stick.oy+=dy*(1-STICK_RADIUS/d);
      dx=e.clientX-stick.ox;dy=e.clientY-stick.oy;
      stickBase.style.left=stick.ox+'px';stickBase.style.top=stick.oy+'px';
    }
    const k=Math.min(1,Math.hypot(dx,dy)/STICK_RADIUS),dead=.12;
    const scale=k<dead?0:(k-dead)/(1-dead)/Math.max(1e-6,k);
    stick.x=dx/STICK_RADIUS*scale;stick.y=dy/STICK_RADIUS*scale;
    stickKnob.style.transform=`translate(${dx}px,${dy}px)`;
    controls();
  }
  stickZone.addEventListener('pointerdown',e=>{
    if(stick.id!==null||!canMove(state?.phase)||you<0)return;
    e.preventDefault();stickZone.setPointerCapture(e.pointerId);
    stick.id=e.pointerId;stick.ox=e.clientX;stick.oy=e.clientY;
    stickBase.style.left=stick.ox+'px';stickBase.style.top=stick.oy+'px';stickBase.hidden=false;
    document.body.classList.add('stick-used');
    moveStick(e);
  });
  stickZone.addEventListener('pointermove',e=>{if(e.pointerId===stick.id)moveStick(e)});
  const dropStick=e=>{if(e.pointerId!==stick.id)return;stick.id=null;stick.x=stick.y=0;stickBase.hidden=true;stickKnob.style.transform='';controls()};
  stickZone.addEventListener('pointerup',dropStick);stickZone.addEventListener('pointercancel',dropStick);stickZone.addEventListener('lostpointercapture',dropStick);
  const countdown=element('div',{id:'gate-countdown',hidden:true},element('span',{textContent:'开闸倒计时'}),element('strong'));
  countdown.setAttribute('role','timer');
  const reveal=element('section',{id:'starter-reveal',hidden:true},element('h2',{textContent:'本局随机技能'}),element('ul'));
  reveal.setAttribute('aria-live','polite');
  const board=element('aside',{id:'scoreboard',hidden:true},element('h2',{textContent:'积分榜'}),element('ol'));
  const stageCard=element('section',{id:'stage-card',hidden:true},element('h2'),element('ol'));
  const finalCard=element('section',{id:'final-card',hidden:true},element('h2',{textContent:'最终排名'}),element('ol'));
  const tags=element('div',{id:'name-tags'});
  const fps=element('output',{id:'fps-meter',hidden:!params.has('fps')});
  document.body.append(tags,countdown,reveal,board,stageCard,finalCard,fps);

  // Launch menu: name, solo with optional bots, and (when served by the party server) rooms.
  const nameInput=element('input',{id:'player-name',maxLength:12,autocomplete:'nickname',
    value:store.get('commonplay-name','')||'玩家'+(10+Math.floor(Math.random()*90))});
  nameInput.onchange=()=>{nameInput.value=nameInput.value.trim().slice(0,12)||'玩家';store.set('commonplay-name',nameInput.value);sendProfile();if(mode==='solo'&&state?.phase==='ready')connectSolo()};
  const botChoices=[0,3,7,15];
  let soloBots=Number(store.get('commonplay-bots','3'));if(!botChoices.includes(soloBots))soloBots=3;
  const botRow=element('div',{className:'choice-row',role:'radiogroup'},element('span',{textContent:'机器人陪跑'}),
    ...botChoices.map(n=>element('button',{type:'button',textContent:n?n+' 个':'不加',dataset:{bots:n},onclick:()=>{if(soloBots===n)return;soloBots=n;store.set('commonplay-bots',String(n));renderMenu();if(mode==='solo'&&(!state||['ready','over','podium'].includes(state.phase)))connectSolo()}})));
  if(partyOnly)soloBots=0;
  const codeInput=element('input',{id:'room-code',maxLength:4,placeholder:'房间码',autocomplete:'off',inputMode:'text'});
  codeInput.oninput=()=>{codeInput.value=codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'')};
  const partyRow=element('div',{className:'party-entry',hidden:true},
    element('button',{type:'button',id:'create-room',textContent:'创建房间',onclick:()=>joinRoom('')}),
    codeInput,
    element('button',{type:'button',id:'join-room',textContent:'加入',onclick:()=>{if(codeInput.value.length===4)joinRoom(codeInput.value);else{codeInput.focus();setNotice('请输入 4 位房间码')}}}));
  const notice=element('p',{id:'menu-notice',role:'status'});
  const menu=element('div',{id:'launch-menu'},element('label',{className:'name-field'},element('span',{textContent:'昵称'}),nameInput),...(partyOnly?[]:[botRow]));
  $('#launch').insertBefore(menu,$('#result'));
  $('#launch').append(partyRow,notice);
  const roomPanel=element('section',{id:'room-panel',hidden:true});
  document.body.append(roomPanel);
  function setNotice(text){notice.textContent=text||''}
  function renderMenu(){
    for(const b of botRow.querySelectorAll('button'))b.setAttribute('aria-pressed',String(Number(b.dataset.bots)===soloBots));
  }
  renderMenu();

  // ------------------------------------------------------------ assets
  const materials=getMaterials(quality,renderer,{lite});
  const runwayUrl=new URL('./models/quilted-runway.glb',import.meta.url);
  const [runway]=await Promise.all([
    new GLTFLoader().loadAsync(runwayUrl.href).then(gltf=>gltf.scene).catch(error=>{
      console.warn('软垫模型加载失败，使用本地软垫',error);
      return null;
    }),
    materials.ready
  ]);
  runway?.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true}});

  // Other runners share one loaded model per character and skip the fur shell to stay light on phones.
  const templates=new Map();
  function template(id){
    const def=host.definitions.find(d=>d.id===id&&d.ready)||host.definitions.find(d=>d.id==='teddy');
    if(!templates.has(def.id))templates.set(def.id,host.loader.loadAsync(def.model));
    return templates.get(def.id).then(gltf=>({def,gltf}));
  }
  const remotes=new Map();
  async function addRemote(entry,token){
    let made;
    try{
      const {def,gltf}=await template(entry.character);
      if(token!==rosterToken)return;
      const rider=host.createRider({scene:cloneSkinned(gltf.scene),animations:gltf.animations},{...def,material:null});
      if(token!==rosterToken)return;
      const group=new T.Group();group.add(rider.model);group.visible=false;scene.add(group);
      const contact=host.createContactShadow(rider.shadowRadius);contact.visible=false;scene.add(contact);
      const tag=element('span',{className:'name-tag'+(entry.human?'':' bot'),textContent:entry.name});tags.append(tag);
      made={entry,rider,group,contact,tag,action:'',actionTime:0,sit:0,facing:0,celebrating:false,snap:true};
      rider.pose('Idle',true);
      remotes.set(entry.id,made);
    }catch(error){console.warn('选手模型加载失败',entry.name,error)}
  }
  function clearRemotes(){
    for(const r of remotes.values()){scene.remove(r.group,r.contact);r.contact.geometry.dispose();r.contact.material.dispose();r.tag.remove()}
    remotes.clear();
  }

  // ------------------------------------------------------------ connection state
  let link=null,mode='solo',course=null,roster=[],you=0,rosterToken=0;
  let room=null,results=null,joining=false;
  const buffer=[];// recent states, oldest first
  let state=null,clockOffset=null,yaw=0,facing=0,snap=true,section;
  let action='Idle',actionTime=0,sit=0,side=0,lastKeys='',lastPhase='',celebrating=false,lastTp=-1;
  const worldPos=new T.Vector3(),eye=new T.Vector3(),focus=new T.Vector3(),look=new T.Vector3(),normal=new T.Vector3(),up=new T.Vector3(0,1,0),projected=new T.Vector3();
  function setAction(name,force=false){
    if(!force&&action===name)return;
    host.rider().pose(name,force);action=name;actionTime=0;
  }
  function controls(force=false){
    if(!link||you<0)return;
    let f=Number(held.has('KeyW'))-Number(held.has('KeyS'))-stick.y,r=Number(held.has('KeyD'))-Number(held.has('KeyA'))+stick.x;
    const length=Math.hypot(f,r);if(length>1){f/=length;r/=length}
    const x=f*Math.sin(yaw)-r*Math.cos(yaw),z=f*Math.cos(yaw)+r*Math.sin(yaw);
    const btn=Number(held.has('Space'))+2*Number(held.has('KeyE'))+4*Number(held.has('KeyR'));
    const key=[Math.round(x*100),Math.round(z*100),btn].join(',');
    if(force||key!==lastKeys){link.postMessage({type:'input',x:Math.round(x*100)/100,z:Math.round(z*100)/100,btn});lastKeys=key}
  }
  function release(){held.clear();stick.x=stick.y=0;stick.id=null;stickBase.hidden=true;stickKnob.style.transform='';controls(true)}

  function resetView(){
    state=null;buffer.length=0;clockOffset=null;snap=true;side=sit=0;lastPhase=lastKeys='';lastTp=-1;
    host.rider().reset();setAction('Idle',true);held.clear();host.setMode('ready');
    reveal.hidden=countdown.hidden=stageCard.hidden=finalCard.hidden=true;board.hidden=true;rankLine.hidden=true;
  }
  function handle(m){
    if(m.type==='roster'){
      you=m.you;roster=m.players;rosterToken++;clearRemotes();
      for(const entry of roster)if(entry.id!==you)addRemote(entry,rosterToken);
      return;
    }
    if(m.type==='course'){
      if(course){scene.remove(course.group);course.dispose()}
      course=new CourseView(m.stage,quality,runway,undefined,host.parkModels);scene.add(course.group);
      snap=true;buffer.length=0;clockOffset=null;for(const r of remotes.values())r.snap=true;
      return;
    }
    if(m.type==='state'){
      const now=performance.now();
      state=m.state;
      const serverTime=state.tick/60;
      // Smoothed estimate of local time minus server time; late packets don't drag it forward.
      const offset=now/1000-serverTime;
      clockOffset=clockOffset==null||offset<clockOffset?offset:lerp(clockOffset,offset,.02);
      buffer.push({t:serverTime,state});
      if(buffer.length>12)buffer.shift();
      updateUI();
      return;
    }
    if(m.type==='room'){room=m;renderRoom();return}
    if(m.type==='joined'){
      sessionStore.set('commonplay-room-token',m.token);sessionStore.set('commonplay-room-code',m.code);
      history.replaceState(null,'','?room='+m.code);joining=false;setNotice('');return;
    }
    if(m.type==='results'){results=m;return}
    if(m.type==='error'){joining=false;setNotice(m.message);if(mode==='party'&&!room)leaveRoom(false);return}
  }

  function connectSolo(startOnReady=false){
    link?.terminate();mode='solo';room=null;results=null;resetView();
    roomPanel.hidden=true;menu.hidden=false;partyRow.hidden=!partyEndpoint;
    $('#launch').hidden=false;$('#result').textContent='';$('#go').disabled=true;$('#go').hidden=partyOnly;
    change.hidden=partyOnly;$('#reset').lastChild.textContent=' 重来';
    courseID.textContent='单人 · 种子 '+seed;
    if(partyOnly){
      link=null;
      rosterToken++;clearRemotes();roster=[];
      document.body.classList.remove('in-race');
      courseID.textContent='多人房间';
      player.visible=true;player.position.set(0,0,0);player.rotation.y=.4;
      host.contact().visible=false;
      camera.position.set(3,2.8,6);camera.lookAt(0,1.2,0);
      film.render(0);
      return;
    }
    link=openAuthority();
    link.onerror=e=>{console.error(e);$('#launch').hidden=false;$('#result').textContent='模拟加载失败，请重新开始';$('#go').textContent='重新加载';$('#go').disabled=false;state=null};
    link.onmessage=({data:m})=>{
      handle(m);
      if(m.type==='state'&&startOnReady&&m.state.phase==='ready'){startOnReady=false;start()}
    };
    link.postMessage({type:'init',seed,name:nameInput.value,character:host.character(),bots:soloBots,pool});
  }
  function joinRoom(code){
    if(!partyEndpoint||joining)return;
    // Keep the current scene as a backdrop until the room's first race arrives.
    joining=true;link?.terminate();mode='party';room=null;results=null;held.clear();
    rosterToken++;clearRemotes();roster=[];you=0;
    setNotice(code?'正在加入房间 '+code+'…':'正在创建房间…');
    const token=code&&sessionStore.get('commonplay-room-code')===code?sessionStore.get('commonplay-room-token'):null;
    link=openParty(partyEndpoint,{type:'join',room:code,name:nameInput.value,character:host.character(),token});
    link.onmessage=({data:m})=>handle(m);
    link.onerror=error=>{
      joining=false;
      if(mode!=='party')return;
      setNotice(error.message||'与房间的连接已断开');
      // A dropped phone (screen lock, Wi-Fi hop) rejoins its seat automatically.
      const again=room?.code||code;
      if(!again||error.final){leaveRoom(false);return}
      const dropped=link;
      setTimeout(()=>{if(link===dropped&&dropped.closed)joinRoom(again)},1500);
    };
  }
  function leaveRoom(tell=true){
    if(tell)link?.postMessage({type:'leave'});
    sessionStore.set('commonplay-room-code','');history.replaceState(null,'',partyOnly?'?mode=party':location.pathname);
    if(course){scene.remove(course.group);course.dispose();course=null}
    connectSolo();
  }
  function sendProfile(){if(mode==='party')link?.postMessage({type:'profile',name:nameInput.value,character:host.character()})}

  // ------------------------------------------------------------ room lobby
  function renderRoom(){
    if(!room)return;
    const racing=room.inGame;
    menu.hidden=true;partyRow.hidden=true;$('#go').hidden=true;change.hidden=true;
    $('#reset').lastChild.textContent=' 离开房间';
    roomPanel.hidden=racing;$('#launch').hidden=racing;
    if(racing)return;
    courseID.textContent='房间 '+room.code+' · '+room.members.length+'/'+room.max+' 人';
    const inviteURL=new URL(location.pathname,location.origin);
    const lanHost=document.querySelector('meta[name="party-lan-host"]')?.content;
    if(lanHost && ['localhost','127.0.0.1','[::1]'].includes(inviteURL.hostname))inviteURL.hostname=lanHost;
    inviteURL.searchParams.set('room',room.code);
    const invite=inviteURL.href;
    const list=element('ul',{className:'room-members'});
    room.members.forEach((m,i)=>{
      const def=host.definitions.find(d=>d.id===m.character);
      const item=element('li',{className:i===room.you?'me':''},
        def?.preview?element('img',{src:def.preview,alt:''}):element('span',{className:'avatar',textContent:'🧸'}),
        element('strong',{textContent:m.name}),
        element('small',{textContent:(i===room.host?'房主 · ':'')+(m.online?(def?.name||''):'掉线中')}));
      list.append(item);
    });
    for(let i=room.members.length;i<room.max;i++)list.append(element('li',{className:'empty'},element('span',{className:'avatar',textContent:'＋'}),element('small',{textContent:'等待加入'})));
    const field=room.members.length+room.bots;
    const bots=element('div',{className:'choice-row'},element('span',{textContent:'机器人补位'}),
      element('button',{type:'button',textContent:'－',disabled:!room.isHost||room.bots<=0}),
      element('output',{textContent:String(room.bots)}),
      element('button',{type:'button',textContent:'＋',disabled:!room.isHost||field>=room.field}));
    const [minus,,plus]=[...bots.children].slice(1);
    minus.onclick=()=>sendBots(room.bots-1);plus.onclick=()=>sendBots(room.bots+1);
    const copy=element('button',{type:'button',className:'copy-link',textContent:'复制邀请链接',onclick:async()=>{
      try{await navigator.clipboard.writeText(invite);copy.textContent='已复制'}catch{
        const field=element('input',{value:invite,readOnly:true,ariaLabel:'邀请链接'});
        copy.replaceWith(field);field.focus();field.select();
      }
    }});
    const startButton=element('button',{type:'button',id:'room-start',
      textContent:room.inGame?'比赛进行中…':room.isHost?'开始比赛  →':'等待房主开始',disabled:!room.isHost||room.inGame,
      onclick:()=>{link.postMessage({type:'start'})}});
    roomPanel.replaceChildren(
      element('div',{className:'room-head'},element('small',{textContent:'房间码'}),element('strong',{textContent:room.code}),copy),
      list,bots,
      element('p',{className:'room-hint',textContent:'同一 Wi-Fi 下打开邀请链接，或在首页输入房间码加入。共 '+field+' 名选手。'}),
      startButton);
  }
  function sendBots(count){link.postMessage({type:'bots',count})}

  // ------------------------------------------------------------ HUD
  const nameOf=id=>roster.find(p=>p.id===id)?.name??'选手';
  function renderBoard(list,rows,showStage){
    list.replaceChildren(...rows.map(([id,score,order,gained],i)=>element('li',{className:(id===you?'me ':'')+(order>=0?'done':'')},
      element('span',{className:'place',textContent:medals[i]||String(i+1)}),
      element('strong',{textContent:nameOf(id)}),
      element('span',{className:'points',textContent:showStage&&gained!=null?'+'+gained:String(score)}),
      showStage?element('small',{textContent:order>=0?'第 '+(order+1)+' 个到达':'未到达'}):'')));
  }
  function updateUI(){
    const ph=state.phase,atStart=ph==='ready',atEnd=ph==='over'||ph==='podium',many=roster.length>1;
    host.setMode(atStart?'ready':atEnd?'finish':'riding');
    if(mode==='solo'){
      $('#launch').hidden=!(atStart||atEnd);
      $('#go').disabled=!(atStart||atEnd)||host.blocked();
      $('#go').textContent=atEnd?'再来一局  ↻':soloBots?'和 '+soloBots+' 个机器人比赛  →':'开始单人闯关  →';
      menu.hidden=!(atStart||atEnd);
    }
    const mine=state.runners[you];
    if(atEnd){
      const place=state.board.findIndex(([id])=>id===you);
      $('#result').textContent=!many?'五关完成！总分 '+(state.board[0]?.[1]??0):place>=0?'你获得第 '+(place+1)+' 名！':'比赛结束';
    }else $('#result').textContent='';
    countdown.hidden=state.gateSeconds==null&&state.graceLeft==null;
    if(!countdown.hidden){
      countdown.firstChild.textContent=state.gateSeconds!=null?'开闸倒计时':'本关结束倒计时';
      countdown.querySelector('strong').textContent=state.gateSeconds??state.graceLeft;
    }
    reveal.hidden=!state.awarded;
    if(state.awarded&&ph!==lastPhase){
      reveal.querySelector('h2').textContent=ph==='draft'?'过关奖励':'本局随机技能';
      const list=reveal.querySelector('ul');list.replaceChildren();
      for(const id of state.awarded){
        const [name,description]=cards[id]||[id,''];
        list.append(element('li',{},element('strong',{textContent:name}),element('small',{textContent:description})));
      }
    }
    document.body.classList.toggle('in-race',canMove(ph)&&you>=0);
    const hasSkill=ph==='race'&&!!state.ability;
    $('#ability-key').hidden=!hasSkill;pad.querySelector('[data-key="KeyE"]').hidden=!hasSkill;
    if(hasSkill){const name=cards[state.ability]?.[0]||'技能';$('#ability-key').lastChild.textContent=' '+name;pad.querySelector('[data-key="KeyE"]').textContent=name}
    if(ph!==lastPhase){if(!canMove(ph)||!canMove(lastPhase))release();lastPhase=ph}
    // Section label and progress follow you, or the leader while spectating.
    const followed=mine||state.runners[state.live[0]];
    const s=followed?.[10]??0;
    section=course?.stage.pieces.find(piece=>s>=piece.s0&&s<piece.s1);
    const trackLabel=host.pieceNames?.[section?.name]||slideNames[section?.name]||deckNames[section?.name];
    const active=followed?followed[8]&F_ACTIVE:true,placed=followed?followed[8]&F_PLACED:false;
    const label=ph==='countdown'?'起跑 '+state.remaining:ph==='cut'?'本关完成':!active&&ph==='race'?'检查点复位':(ph==='race'&&trackLabel)||stageNames[state.stage];
    $('#section').textContent=(state.stage+1)+'/5 · '+label;
    const pct=placed?100:course?clamp(Math.floor(s/course.stage.path.finishS*100),0,99):0;
    $('#percent').textContent=pct+'%';$('progress').value=pct;
    // Live position in the race and the points table.
    const liveIndex=state.live.indexOf(you);
    rankLine.hidden=!many||!['race','countdown','intro'].includes(ph)||liveIndex<0;
    rankLine.textContent=liveIndex>=0?'第 '+(liveIndex+1)+' / '+roster.length+' 名':'';
    board.hidden=!many||atStart||atEnd||ph==='cut';
    if(!board.hidden)renderBoard(board.querySelector('ol'),state.board.slice(0,lite?5:8),false);
    stageCard.hidden=!(many&&ph==='cut');
    if(!stageCard.hidden){
      stageCard.querySelector('h2').textContent='第 '+(state.stage+1)+' 关 · '+stageNames[state.stage]+(state.stage===4?'（双倍积分）':'')+' 结算';
      const rows=state.board.slice().sort((a,b)=>(a[2]<0)-(b[2]<0)||a[2]-b[2]);
      renderBoard(stageCard.querySelector('ol'),rows,true);
    }
    finalCard.hidden=!(many&&atEnd);
    if(!finalCard.hidden)renderBoard(finalCard.querySelector('ol'),state.board,false);
    if(mode==='party')renderRoom();
  }
  function start(){
    if(mode!=='solo'||partyOnly)return;
    if(state?.phase==='ready'){
      link.postMessage({type:'start'});$('#go').disabled=true;$('#go').blur();
    }else if(!state||state.phase==='over'||state.phase==='podium')connectSolo(true);
  }
  $('#go').onclick=()=>{if(!host.blocked())start()};
  $('#reset').onclick=()=>{if(host.blocked())return;if(mode==='party')leaveRoom();else connectSolo()};
  const supported=new Set(['KeyW','KeyA','KeyS','KeyD','KeyE','KeyR','Space']);
  function key(e,down){
    if(e.target.closest?.('input'))return;
    const k=aliases[e.code]||e.code;
    if(!supported.has(k)||host.blocked()||!canMove(state?.phase)||you<0)return;
    e.preventDefault();if(down)held.add(k);else held.delete(k);controls();
  }
  window.addEventListener('keydown',e=>key(e,true));window.addEventListener('keyup',e=>key(e,false));window.addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{release();if(mode==='solo')link?.postMessage({type:'pause',value:document.hidden})});
  for(const button of pad.querySelectorAll('button')){
    button.onpointerdown=e=>{
      if(!canMove(state?.phase))return;e.preventDefault();button.setPointerCapture(e.pointerId);held.add(button.dataset.key);controls();
      if(button.dataset.key==='Space')navigator.vibrate?.(12);
    };
    button.onlostpointercapture=()=>{held.delete(button.dataset.key);controls()};
  }

  // ------------------------------------------------------------ interpolation
  // Render a little in the past so two received states bracket the frame; 30 Hz updates need ~2 frames of delay.
  const sampled=new Map();
  function sample(now){
    sampled.clear();
    if(!buffer.length)return null;
    const delay=mode==='party'?.075:.045;
    const t=now/1000-clockOffset-delay;
    let a=buffer[0],b=buffer[0];
    for(let i=buffer.length-1;i>=0;i--){if(buffer[i].t<=t){a=buffer[i];b=buffer[Math.min(i+1,buffer.length-1)];break}}
    if(t<buffer[0].t)a=b=buffer[0];
    const k=b.t>a.t?clamp((t-a.t)/(b.t-a.t),0,1):1;
    const rowsA=a.state.runners,rowsB=b.state.runners;
    for(let i=0;i<rowsB.length;i++){
      const rb=rowsB[i],ra=rowsA[i]||rb,teleported=ra[7]!==rb[7]||a.state.stage!==b.state.stage;
      const f=teleported?(k<.5?0:1):k,src=f<.5?ra:rb;
      sampled.set(rb[0],{x:lerp(ra[1],rb[1],f),y:lerp(ra[2],rb[2],f),z:lerp(ra[3],rb[3],f),vx:rb[4],vy:rb[5],vz:rb[6],tp:src[7],
        sliding:!!(src[8]&16),grounded:!!(src[8]&F_GROUNDED),active:!!(src[8]&F_ACTIVE),placed:!!(src[8]&F_PLACED),online:!!(src[8]&F_ONLINE),
        sample:src[9],s:src[10],nx:src[11],ny:src[12],nz:src[13],r:src[14]});
    }
    return {clock:lerp(a.state.clock,b.state.clock,k)};
  }

  // ------------------------------------------------------------ per-frame drawing
  function poseRunner(r,a,ph,dt){
    // Shared animation rules for remote runners.
    const speed=Math.hypot(a.vx,a.vz),finished=a.placed||ph==='over';
    const piece=course.stage.pieces.find(p=>a.s>=p.s0&&a.s<p.s1);
    const onSlide=state.stage===0?Boolean(slideNames[piece?.name]):!deckNames[piece?.name];
    const racing=ph==='race'&&a.active&&!finished;
    const set=name=>{if(r.action!==name){r.rider.pose(name,r.snap);r.action=name;r.actionTime=0}};
    r.actionTime+=dt;
    if(finished&&speed<.65){
      if(!a.grounded)set('Jump');
      else if(!r.celebrating)set(r.sit>.2?'StandUp':'FinishWave');
      else if(r.action==='StandUp'&&r.actionTime>=r.rider.duration('StandUp'))set('FinishWave');
      else if(r.action==='FinishWave'&&r.actionTime>=r.rider.duration('FinishWave'))set('Idle');
    }else if(!a.active)set('Idle');
    else if(!a.grounded&&(a.vy>1.5||r.action==='Jump'))set('Jump');
    else if(racing&&(partyOnly&&r.entry.human ? a.sliding : onSlide&&a.s>1&&speed>(state.stage===0?.65:3))){
      if(r.action==='SitDown'){if(r.actionTime>=r.rider.duration('SitDown'))set('Slide')}
      else if(r.action!=='Slide')set(r.action==='Jump'?'Slide':'SitDown');
    }else if(r.action==='Slide'||r.action==='SitDown')set('StandUp');
    else if(r.action!=='StandUp'||r.actionTime>=r.rider.duration('StandUp'))set(speed>.65?'Run':'Idle');
    r.celebrating=finished&&a.grounded&&speed<.65;
    r.sit=lerp(r.sit,r.action==='Slide'?1:r.action==='SitDown'?clamp(r.actionTime/r.rider.duration('SitDown'),0,1):r.action==='StandUp'?1-clamp(r.actionTime/r.rider.duration('StandUp'),0,1):0,damping(12,dt));
    const path=course.stage.path,idx=clamp(a.sample,0,path.n-1),trackYaw=Math.atan2(path.tx[idx],path.tz[idx]);
    const desired=finished&&speed<.65?trackYaw+Math.PI:speed>.8?Math.atan2(a.vx,a.vz):trackYaw;
    r.facing+=angle(r.facing,desired)*(r.snap?1:damping(12,dt));
    r.group.visible=a.active||finished;
    r.group.position.set(a.x,a.y-a.r,a.z);r.group.rotation.y=r.facing;
    const model=r.rider.model;model.position.y=r.sit*r.rider.seatedOffset;
    model.rotation.x=lerp(model.rotation.x,a.grounded?clamp(Math.atan2(a.nx*Math.sin(r.facing)+a.nz*Math.cos(r.facing),a.ny),-.5,.5):0,damping(8,dt));
    r.rider.animate(dt,0,speed);
    r.contact.visible=r.group.visible&&a.grounded;r.contact.position.copy(r.group.position);r.contact.position.y+=.03;
    normal.set(a.nx,a.ny,a.nz).normalize();r.contact.quaternion.setFromUnitVectors(up,normal);
    r.snap=false;
  }
  function placeTag(r,a){
    const height=r.rider.seatedHeight*(1.05-.3*r.sit);
    projected.set(a.x,a.y-a.r+height,a.z);
    const distance=projected.distanceTo(camera.position);
    projected.project(camera);
    const show=r.group.visible&&projected.z<1&&distance<(lite?26:40)&&Math.abs(projected.x)<1.1&&Math.abs(projected.y)<1.1;
    r.tag.hidden=!show;
    if(show){
      r.tag.style.transform=`translate(-50%,-100%) translate(${(projected.x+1)/2*innerWidth}px,${(1-projected.y)/2*innerHeight}px)`;
      r.tag.style.opacity=String(clamp(1.4-distance/(lite?26:40),.35,1));
    }
  }
  function draw(dt,now){
    if(!state||!course||clockOffset==null)return;
    const timing=sample(now);
    const ph=state.phase,rider=host.rider();
    const leaderId=state.live[0]??0;
    const mineRow=sampled.get(you);
    const followed=mineRow||sampled.get(leaderId);
    const ready=ph==='ready'||ph==='starter';
    const a=followed?followed:{x:state.spawnX??0,y:state.spawnY??0,z:state.spawnZ??0,vx:0,vy:0,vz:0,sample:0,s:0,nx:0,ny:1,nz:0,r:.5,grounded:true,active:true,placed:false,tp:0};
    if(lastTp!==a.tp){snap=snap||lastTp>=0;lastTp=a.tp}
    worldPos.set(a.x,a.y,a.z);
    const path=course.stage.path,idx=clamp(a.sample,0,path.n-1),trackYaw=Math.atan2(path.tx[idx],path.tz[idx]);
    yaw+=angle(yaw,trackYaw)*(snap?1:damping(6,dt));
    if(canMove(ph)){
      if(host.blocked()){if(held.size||stick.id!==null)release()}else controls();
    }
    // Your own runner.
    const speed=Math.hypot(a.vx,a.vz),motionHeading=Math.atan2(a.vx,a.vz);
    const finished=a.placed||ph==='over';
    const racing=ph==='race'&&a.active&&!finished;
    if(mineRow||ready){
      const desired=ready?yaw-2.55:finished&&speed<.65?yaw+Math.PI:speed>.8?motionHeading:yaw;
      facing+=angle(facing,desired)*(snap?1:damping(12,dt));
      const onSlide=state.stage===0?Boolean(slideNames[section?.name]):!deckNames[section?.name];
      const slideSpeed=state.stage===0 ? .65 : sit>.4 ? 3 : 6;
      const sliding=racing&&(partyOnly ? a.sliding : onSlide&&a.s>1&&speed>slideSpeed);
      actionTime+=dt;
      if(finished&&speed<.65){
        if(!a.grounded)setAction('Jump');
        else if(!celebrating)setAction(sit>.2?'StandUp':'FinishWave');
        else if(action==='StandUp'&&actionTime>=rider.duration('StandUp'))setAction('FinishWave');
        else if(action==='FinishWave'&&actionTime>=rider.duration('FinishWave'))setAction('Idle');
      }else if(!canMove(ph)&&!finished||!a.active)setAction('Idle');
      else if(!a.grounded && (a.vy>1.5||action==='Jump'))setAction('Jump');
      else if(sliding){
        if(action==='SitDown'){if(actionTime>=rider.duration('SitDown'))setAction('Slide')}
        else if(action!=='Slide')setAction(action==='Jump'?'Slide':'SitDown');
      }else if(action==='Slide'||action==='SitDown')setAction('StandUp');
      else if(action!=='StandUp'||actionTime>=rider.duration('StandUp'))setAction(speed>.65?'Run':'Idle');
      celebrating=finished&&a.grounded&&speed<.65;
      const steering=Number(held.has('KeyD'))-Number(held.has('KeyA'));
      side=lerp(side,steering,damping(8,dt));
      sit=lerp(sit,action==='Slide'?1:action==='SitDown'?clamp(actionTime/rider.duration(action),0,1):action==='StandUp'?1-clamp(actionTime/rider.duration(action),0,1):0,damping(12,dt));
      player.visible=a.active||finished;player.position.copy(worldPos);player.position.y-=a.r;
      player.rotation.y=facing;
      const model=rider.model;model.position.y=sit*rider.seatedOffset;model.rotation.z=side*sit*.08;
      model.rotation.x=lerp(model.rotation.x,a.grounded?clamp(Math.atan2(a.nx*Math.sin(facing)+a.nz*Math.cos(facing),a.ny),-.5,.5):0,damping(8,dt));
      rider.animate(dt,side,speed);
      const shadow=host.contact();shadow.visible=player.visible&&a.grounded;shadow.position.copy(player.position);shadow.position.y+=.03;
      normal.set(a.nx,a.ny,a.nz).normalize();shadow.quaternion.setFromUnitVectors(up,normal);
    }else{player.visible=false;host.contact().visible=false}
    // Everyone else.
    for(const [id,r] of remotes){
      const row=sampled.get(id);
      if(!row||ready){r.group.visible=r.contact.visible=false;r.tag.hidden=true;continue}
      poseRunner(r,row,ph,dt);placeTag(r,row);
    }
    host.lightCourse?.(course,worldPos);
    const displayTime=timing.clock;
    course.update(displayTime,dt,['race','cut','draft','podium','over'].includes(ph));
    const waiting=ph==='intro'||ph==='countdown';
    // Tall phone screens pull the camera back and up so the course ahead stays in view.
    const portrait=clamp((1.25-camera.aspect)/.7,0,1);
    const fov=49+11*portrait;if(Math.abs(camera.fov-fov)>.05){camera.fov=fov;camera.updateProjectionMatrix()}
    const camYaw=yaw+(ready ? 1.12 : waiting ? .38 : 0),back=(ready||waiting?8.5:6.6)*(1+.45*portrait);
    const seatedHeight=rider.seatedHeight;
    eye.set(worldPos.x-Math.sin(camYaw)*back,worldPos.y+(waiting?6:ready?3.8:3.05)+portrait*(ready?1:2.2),worldPos.z-Math.cos(camYaw)*back);
    focus.set(worldPos.x,worldPos.y-a.r+seatedHeight*.56,worldPos.z);
    const dx=ready?0:Math.sin(yaw)*1.5,dz=ready?0:Math.cos(yaw)*1.5;
    if(snap){camera.position.copy(eye);look.copy(focus)}else{camera.position.lerp(eye,damping(10,dt));look.lerp(focus,damping(18,dt))}
    camera.lookAt(look.x+dx,look.y,look.z+dz);
    focusRider(film,focus,seatedHeight*.5,ready?'ready':finished?'finish':'riding',snap);snap=false;
    film.setFrameBudget(1/60,racing);film.render(dt);
  }

  // Pick up an invitation link, otherwise open the solo menu.
  const invited=(params.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
  connectSolo();
  if(partyEndpoint&&invited.length===4){codeInput.value=invited;joinRoom(invited)}
  film.resize();
  let last=performance.now();
  // ?fps=1 shows frame rate and field size, for checking how many runners a phone can draw.
  let frames=0,fpsSince=performance.now();
  renderer.setAnimationLoop(now=>{
    const dt=Math.min(.08,(now-last)/1000);last=now;draw(dt,now);
    if(!fps.hidden&&++frames&&now-fpsSince>1000){
      const visible=[...remotes.values()].filter(r=>r.group.visible&&!r.tag.hidden).length+(player.visible?1:0);
      fps.textContent=Math.round(frames*1000/(now-fpsSince))+' fps · '+visible+'/'+roster.length+' 人在画面中';
      frames=0;fpsSince=now;
    }
  });
  return {
    reset:()=>mode==='party'?leaveRoom():connectSolo(),
    start,
    picked(){sendProfile()}
  };
}
