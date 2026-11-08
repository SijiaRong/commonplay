import * as T from 'three';
import {createBubbleportMaterials, materialSpecs} from '../bubbleport-material-lab/materials.mjs';
import {RoomEnvironment} from '../bubbleport-material-lab/vendor/environments/RoomEnvironment.js';

export const surfaces = createBubbleportMaterials();
// The sample roads and raised walls are rendered from both sides.
surfaces.road.side = T.DoubleSide;
surfaces.mint.side = T.DoubleSide;

const palette = {
  road: ['fff2dc','fff0d8','fff2d9'],
  mint: ['76caba','92d9c9','9cdbce','8dc7ad'],
  brass: ['dcb56c','c99b63','d4b26e'],
  peach: ['f5aa92','f4b5a6','f5b49d','ea8d9c','df7d85'],
  acrylic: ['b7e3dc']
};
const byColor = new Map(Object.entries(palette).flatMap(([slot,colors])=>colors.map(color=>[color,surfaces[slot]])));
export function applySurfaces(group) {
  group.traverse(mesh=>{
    if (!mesh.isMesh || mesh.userData.stateLamp || mesh.material.isMeshPhysicalMaterial) return;
    const surface = byColor.get(mesh.material.color.getHexString());
    if (!surface) return;
    mesh.material = surface;
    if (surface===surfaces.road && !mesh.geometry.hasAttribute('uv')) {
      const positions=mesh.geometry.getAttribute('position'), uv=[];
      for(let i=0;i<positions.count;i++) uv.push(positions.getX(i)/8,positions.getZ(i)/8);
      mesh.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    }
  });
}

export function setupAppearance(renderer,scene,sun,hemi,fill) {
  const root=document.querySelector('#appearance'),pack=root.querySelector('select');
  const inputs=[...root.querySelectorAll('input')];
  const storageKey='bubbleport-design-appearance-v1';
  let saved;
  try { saved=JSON.parse(localStorage.getItem(storageKey)); } catch {}
  if (saved?.pack==='v1') pack.value='v1';
  for(const input of inputs) {
    const value=saved?.[input.name];
    if(Number.isFinite(value)) input.value=String(value);
  }

  const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);
  scene.environment=pmrem.fromScene(room,.04).texture;
  room.dispose();pmrem.dispose();
  const specs=Object.fromEntries(materialSpecs.map(s=>[s.id,s.params]));
  function changePack() {
    const old=pack.value==='v1';
    Object.assign(surfaces.road,old
      ? {roughness:.48,clearcoat:.28,clearcoatRoughness:.32,bumpScale:.008}
      : {...specs.road,bumpScale:.0012});
    Object.assign(surfaces.peach,old
      ? {roughness:.62,clearcoat:.08,clearcoatRoughness:.6,specularIntensity:1,ior:1.5}
      : specs.peach);
    surfaces.peach.userData.softScattering.value=old?0:.32;
  }
  function updateLights() {
    const values={};
    for(const input of inputs) {
      const value=input.valueAsNumber;
      values[input.name]=value;
      input.parentElement.querySelector('output').value=input.name==='angle'?value+'°':value.toFixed(2);
    }
    sun.intensity=values.key;
    const angle=T.MathUtils.degToRad(values.angle);
    sun.position.set(68*Math.cos(angle),110,68*Math.sin(angle));
    hemi.intensity=values.fill*1.5;
    fill.intensity=values.fill*1.2;
    scene.environmentIntensity=values.reflection;
    sun.shadow.intensity=values.shadow;
    renderer.toneMappingExposure=values.exposure;
  }
  function save() {
    const values=Object.fromEntries(inputs.map(input=>[input.name,input.valueAsNumber]));
    try {localStorage.setItem(storageKey,JSON.stringify({pack:pack.value,...values}));} catch {}
  }
  pack.addEventListener('change',()=>{changePack();save();});
  for(const input of inputs) {
    input.addEventListener('input',updateLights);
    input.addEventListener('change',save);
  }
  root.querySelector('button').onclick=()=>{
    for(const input of inputs) input.value=input.defaultValue;
    updateLights();save();
  };
  changePack();updateLights();
}
