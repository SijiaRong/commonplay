import {createMobileControls} from './slide/mobile-controls.js';
import {createPickerCamera} from './slide/picker-camera.js';
import {installSettings,settingsOpen} from './slide/settings.js';
import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';

import {loadRoster, installCharacterPicker} from './slide/character-picker.js?v=station';
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
  const framePicker=createPickerCamera(camera);
  const aim=new THREE.Vector3();
  const player=new THREE.Group(); scene.add(player);
  const light=new THREE.HemisphereLight(0xfff8ec,0xc4bbb0,1.7); scene.add(light);
  const sun=new THREE.DirectionalLight(0xffeed7,1.7);
  sun.castShadow=true; sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.1,far:12});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.003;
  scene.add(sun,sun.target);
  await installSettings({scene,sun,renderer,fill:light}, null, 'soda-pier');
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(160,160),new THREE.ShadowMaterial({opacity:.28}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const roster=await loadRoster(new GLTFLoader(),1);
  let rider=roster.rider;
  let bear=rider.model;
  player.add(bear);bear.rotation.y=.28;
  let airTime=null;
  function pose(name){
    rider.pose(name);
    const label={Idle:'待机',Run:'跑步',Jump:'跳跃'}[name];
    if(status.textContent!==label)status.textContent=label;
  }
  const keys=new Set(),cameraTarget=new THREE.Vector3();
  const cameraOffset=new THREE.Vector3(0,1.08,2.75);
  const pickerBlocked=installCharacterPicker(roster,{player,renderer,camera,scene,
    onOpen(){keys.clear();mobile.clear()},
    replace(next){
      next.model.rotation.y=bear.rotation.y;
      player.remove(bear);rider.dispose();
      rider=next;bear=rider.model;player.add(bear);
      airTime=null;player.position.y=0;pose('Idle');
    }
  });
  function jump(){if(airTime===null){airTime=0;pose('Jump')}}
  const tracked=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space'];
  window.addEventListener('keydown',e=>{
    if(pickerBlocked()||settingsOpen()||!tracked.includes(e.code)||e.metaKey||e.ctrlKey||e.altKey)return;
    if(e.code==='Space' && document.activeElement?.tagName==='BUTTON' && e.detail===0)return;
    if(e.target.closest?.('button'))e.target.blur();
    e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)jump();
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();mobile.clear()});
  const mobile = createMobileControls(renderer.domElement, [['Space','跳跃']], () => !pickerBlocked() && !settingsOpen());
  mobile.buttons.firstElementChild.onpointerdown = e => { e.preventDefault(); jump(); };
  document.querySelector('#reset').onclick=e=>{keys.clear();mobile.clear();airTime=null;player.position.set(0,0,0);cameraTarget.set(0,0,0);bear.rotation.y=.28;pose('Idle');e.currentTarget.blur()};
  function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
  resize();window.addEventListener('resize',resize);pose('Idle');
  const clock=new THREE.Clock();
  renderer.setAnimationLoop(()=>{
    const dt=Math.min(clock.getDelta(),.05);
    mobile.update(dt);
    if(settingsOpen()){keys.clear();mobile.clear();renderer.render(scene,camera);return}
    let x=mobile.move.x+Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    let z=mobile.move.y+Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
    const cos=Math.cos(mobile.yaw),sin=Math.sin(mobile.yaw);
    [x,z]=[x*cos+z*sin,z*cos-x*sin];
    const length=Math.hypot(x,z); x/=Math.max(1,length);z/=Math.max(1,length);
    if(length>.04){
      player.position.x+=x*1.8*dt;player.position.z+=z*1.8*dt;
      const diff=Math.atan2(x,z)-bear.rotation.y;bear.rotation.y+=Math.atan2(Math.sin(diff),Math.cos(diff))*(1-Math.exp(-15*dt));
    }
    if(airTime!==null&&!pickerBlocked()){
      const jumpTime=rider.duration('Jump');
      airTime+=dt;
      const t=THREE.MathUtils.clamp((airTime/jumpTime-.12)/.74,0,1);
      player.position.y=.69*4*t*(1-t);
      if(airTime>=jumpTime)airTime=null;
    }
    if(airTime===null)pose(length>.04?'Run':'Idle');
    rider.animate(dt,0,4.8);
    cameraTarget.x=THREE.MathUtils.lerp(cameraTarget.x,player.position.x,1-Math.exp(-8*dt));
    cameraTarget.z=THREE.MathUtils.lerp(cameraTarget.z,player.position.z,1-Math.exp(-8*dt));
    cameraTarget.y=player.position.y*.76;
    camera.position.copy(cameraTarget);
    camera.position.x += sin * cameraOffset.z;
    camera.position.z += cos * cameraOffset.z;
    camera.position.y += cameraOffset.y + Math.sin(mobile.pitch) * cameraOffset.z;
    aim.set(cameraTarget.x,.52+cameraTarget.y,cameraTarget.z);
    framePicker(camera.position,aim,rider,dt);camera.lookAt(aim);
    sun.target.position.set(player.position.x,0,player.position.z);
    sun.position.copy(sun.target.position).add(sunOffset);
    floor.position.set(player.position.x,0,player.position.z);
    renderer.render(scene,camera);
  });
}
const sunOffset=new THREE.Vector3(-2,4,2);
start().catch(e=>{console.error(e);status.textContent='加载失败，请启用 WebGL 后刷新页面。'});
