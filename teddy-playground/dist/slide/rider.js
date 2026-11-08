import * as T from 'three';
import {dressPlush} from './plush.js';

export const RIDER_CLIPS = ['Idle','Run','Jump','Slide','SlideLeft','SlideRight','SitDown','StandUp','FinishWave'];
const slides = ['Slide','SlideLeft','SlideRight'];

// All riders use the same action vocabulary. A model becomes selectable only
// after its geometry, materials and exported animation clips have been checked.
export function createRider(gltf, definition) {
  const model = gltf.scene;
  const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
  const missing = RIDER_CLIPS.filter(name => !clips.has(name));
  if (missing.length) {
    disposeRiderModel(model);
    throw Error('角色动作缺失：'+missing.join(', '));
  }
  for (const clip of clips.values()) {
    if (!(clip.duration>0) || !Number.isFinite(clip.duration) || !clip.tracks.length) {
      disposeRiderModel(model);throw Error('角色动作数据无效：'+clip.name);
    }
    for (const track of clip.tracks) {
      const target=T.PropertyBinding.parseTrackName(track.name);
      if (!T.PropertyBinding.findNode(model,target.nodeName) || !track.times.every(Number.isFinite) || !track.values.every(Number.isFinite)) {
        disposeRiderModel(model);throw Error('角色动作无法绑定：'+track.name);
      }
    }
  }
  model.scale.setScalar(definition.scale);
  model.traverse(o => {
    if (o.isMesh) { o.castShadow=true; o.receiveShadow=true; o.frustumCulled=false; }
  });
  const mixer = new T.AnimationMixer(model);
  const actions = Object.fromEntries([...clips].map(([name,clip]) => [name,mixer.clipAction(clip)]));
  for (const name of ['Jump','SitDown','StandUp','FinishWave']) {
    actions[name].setLoop(T.LoopOnce,1);
    actions[name].clampWhenFinished=true;
  }
  let action=null;
  function pose(name,immediate=false) {
    if (action===name && !immediate) return;
    action=name;
    for (const key of name==='Slide' ? slides : [name]) {
      const clip=actions[key], weight=clip.isRunning()?clip.getEffectiveWeight():0;
      clip.reset().setEffectiveWeight(immediate?Number(key===name):weight).play();
    }
    if (immediate) for (const [key,clip] of Object.entries(actions)) if (key!==name) clip.stop();
  }
  function animate(dt,turn,speed) {
    if (action==='Run') actions.Run.timeScale=T.MathUtils.clamp(speed/4.8,.45,1.35);
    for (const [name,clip] of Object.entries(actions)) {
      let goal=Number(action===name);
      if (action==='Slide' && slides.includes(name))
        goal=name==='Slide'?1-Math.abs(turn):Math.max(0,name==='SlideLeft'?-turn:turn);
      if (!clip.enabled || (!clip.isScheduled()&&!goal)) continue;
      const weight=T.MathUtils.lerp(clip.getEffectiveWeight(),goal,1-Math.exp(-18*dt));
      if (!goal && weight<.001 && !(action==='Slide'&&slides.includes(name))) clip.stop();
      else clip.setEffectiveWeight(weight);
    }
    mixer.update(dt);
  }
  pose('Slide',true); mixer.update(0); model.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(model,true);
  const size=box.getSize(new T.Vector3());
  if (![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite) || size.y<=0 || size.x<=0 || size.z<=0) {
    mixer.stopAllAction(); mixer.uncacheRoot(model); disposeRiderModel(model);
    throw Error('角色模型尺寸无效');
  }
  const disposeSurface=definition.material==='teddy-plush'?dressPlush(model):null;
  return {
    model, pose, animate,
    seatedOffset:-box.min.y, seatedHeight:size.y, shadowRadius:size.z*.5,
    duration:name=>actions[name].getClip().duration,
    reset(){ pose('Idle',true); mixer.update(0); },
    dispose(){ mixer.stopAllAction(); mixer.uncacheRoot(model); disposeSurface?.(); disposeRiderModel(model); }
  };
}

export function disposeRiderModel(model) {
  const geometries=new Set(), materials=new Set(), textures=new Set(), skeletons=new Set();
  model.traverse(o=>{
    if (o.geometry) geometries.add(o.geometry);
    if (o.skeleton) skeletons.add(o.skeleton);
    if (o.material) for (const m of [o.material].flat()) materials.add(m);
  });
  for (const m of materials) {
    for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
  }
  geometries.forEach(g=>g.dispose());
  materials.forEach(m=>m.dispose());
  textures.forEach(t=>t.dispose());
  skeletons.forEach(s=>s.dispose());
}
