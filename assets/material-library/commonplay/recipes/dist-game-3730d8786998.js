import {installSettings,settingsOpen} from './slide/settings.js';
import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';

import {loadWorkshop} from './slide/workshop.js';

const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
async function start(){
  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  stage.append(renderer.domElement);
  const scene=new THREE.Scene();
  await loadWorkshop(scene);
  const camera=new THREE.PerspectiveCamera(32,1,.03,80);
  const player=new THREE.Group(); scene.add(player);
  const light=new THREE.HemisphereLight(0xfff8ec,0xc4bbb0,1.7); scene.add(light);
  const sun=new THREE.DirectionalLight(0xffeed7,1.7);
  sun.castShadow=true; sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.1,far:12});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.003;
  scene.add(sun,sun.target);
  await installSettings({scene,sun,renderer,fill:light});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(160,160),new THREE.ShadowMaterial({opacity:.28}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const gltf=await new GLTFLoader().loadAsync('./teddy-bear-animated.glb');
  const bear=gltf.scene;player.add(bear);bear.rotation.y=.28;
  bear.traverse(o=>{if(o.isMesh)o.castShadow=true});
  const mixer=new THREE.AnimationMixer(bear);
  const clips=Object.fromEntries(gltf.animations.map(c=>[c.name,mixer.clipAction(c)]));
  const jumpTime=clips.Jump.getClip().duration;
  clips.Jump.setLoop(THREE.LoopOnce,1);clips.Jump.clampWhenFinished=true;
  let current,airTime=null;
  function pose(name){
    if(current===name)return;
    if(current)clips[current].fadeOut(.12);
    clips[name].reset().setEffectiveWeight(1).fadeIn(.12).play();current=name;
    status.textContent={Idle:'待机',Run:'跑步',Jump:'跳跃'}[name];
  }
  const keys=new Set(),stick=new THREE.Vector2(),cameraTarget=new THREE.Vector3();
  const cameraOffset=new THREE.Vector3(0,1.08,2.75);
  function jump(){if(airTime===null){airTime=0;pose('Jump')}}
  const tracked=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space'];
  window.addEventListener('keydown',e=>{
    if(settingsOpen()||!tracked.includes(e.code)||e.metaKey||e.ctrlKey||e.altKey)return;
    if(e.code==='Space' && document.activeElement?.tagName==='BUTTON' && e.detail===0)document.activeElement.blur();
    e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)jump();
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();stick.set(0,0);knob.style.transform=''});
  const pad=document.querySelector('#pad'),knob=pad.firstElementChild;
  function steer(e){const r=pad.getBoundingClientRect();stick.set((e.clientX-r.left-r.width/2)/32,(e.clientY-r.top-r.height/2)/32).clampLength(0,1);knob.style.transform='translate('+stick.x*24+'px,'+stick.y*24+'px)'}
  pad.onpointerdown=e=>{pad.setPointerCapture(e.pointerId);steer(e)};
  pad.onpointermove=e=>{if(pad.hasPointerCapture(e.pointerId))steer(e)};
  pad.onlostpointercapture=()=>{stick.set(0,0);knob.style.transform=''};
  document.querySelector('#leap').onclick=jump;
  document.querySelector('#reset').onclick=e=>{keys.clear();stick.set(0,0);airTime=null;player.position.set(0,0,0);cameraTarget.set(0,0,0);bear.rotation.y=.28;pose('Idle');e.currentTarget.blur()};
  function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
  resize();window.addEventListener('resize',resize);pose('Idle');
  const clock=new THREE.Clock();
  renderer.setAnimationLoop(()=>{
    const dt=Math.min(clock.getDelta(),.05);
    if(settingsOpen()){keys.clear();stick.set(0,0);renderer.render(scene,camera);return}
    let x=stick.x+Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    let z=stick.y+Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
    const length=Math.hypot(x,z); x/=Math.max(1,length);z/=Math.max(1,length);
    if(length>.04){
      player.position.x+=x*1.8*dt;player.position.z+=z*1.8*dt;
      const diff=Math.atan2(x,z)-bear.rotation.y;bear.rotation.y+=Math.atan2(Math.sin(diff),Math.cos(diff))*(1-Math.exp(-15*dt));
    }
    if(airTime!==null){
      airTime+=dt;
      const t=THREE.MathUtils.clamp((airTime/jumpTime-.12)/.74,0,1);
      player.position.y=.69*4*t*(1-t);
      if(airTime>=jumpTime)airTime=null;
    }
    if(airTime===null)pose(length>.04?'Run':'Idle');
    mixer.update(dt);
    cameraTarget.x=THREE.MathUtils.lerp(cameraTarget.x,player.position.x,1-Math.exp(-8*dt));
    cameraTarget.z=THREE.MathUtils.lerp(cameraTarget.z,player.position.z,1-Math.exp(-8*dt));
    cameraTarget.y=player.position.y*.76;
    camera.position.copy(cameraTarget).add(cameraOffset);
    camera.lookAt(cameraTarget.x,.52+cameraTarget.y,cameraTarget.z);
    sun.target.position.set(player.position.x,0,player.position.z);
    sun.position.copy(sun.target.position).add(sunOffset);
    floor.position.set(player.position.x,0,player.position.z);
    renderer.render(scene,camera);
  });
}
const sunOffset=new THREE.Vector3(-2,4,2);
start().catch(e=>{console.error(e);status.textContent='加载失败，请启用 WebGL 后刷新页面。'});
