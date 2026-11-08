import * as T from 'three';
import { GLTFLoader } from '../../bubbleport-demo/dist/vendor/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from '../../bubbleport-material-lab/vendor/geometries/RoundedBoxGeometry.js';
import { createBubbleportMaterials } from '../../bubbleport-material-lab/materials.mjs';

export const meta = {
  id: 'doors', name: '星港横移门', tagline: '看顶灯，沿打开的门洞换线。',
  dimensions: '64 × 19.2 · 三排横移门 · 门洞净宽 4.8',
  reference: '六段俯视概念图 02 · 星港移门',
  beats: ['入口观察第一排', '穿过三排移门，相邻两排间隔 15', '末段保留恢复空间'],
  controls: ['青绿灯亮时可通行，琥珀灯提示关门', '机关以 6 秒为周期，换洞时先开后关']
};
const asset = new URL('../../assets/model-library/commonplay/bubbleport/obstacles/runtime/starport-sliding-gate.glb', import.meta.url);
let track;
export async function prepare(k, materials) {
  if (track) return;
  const {scene: source} = await new GLTFLoader().loadAsync(asset.href);
  const mats = materials ?? createBubbleportMaterials();
  const g = k.group();
  const deck = k.road(g, [[0,0,0],[0,0,64]], 19.2, {railColor:'#8dc7ad',railHeight:.8,thickness:.55});
  const positions = deck.geometry.getAttribute('position');
  const uv = [];
  for (let i=0;i<positions.count;i++) uv.push(positions.getX(i)/8,positions.getZ(i)/8);
  deck.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  deck.material = mats.road;
  function block(name, size, pos, radius, material) {
    const mesh = new T.Mesh(new RoundedBoxGeometry(...size,2,radius),material);
    mesh.name=name; mesh.position.set(...pos); mesh.castShadow=true; mesh.receiveShadow=true; g.add(mesh);
    return mesh;
  }
  for (const x of [-9.68,9.68]) {
    block('Mint curb',[.65,.8,64],[x,.42,32],.25,mats.mint);
    for (const z of [1,8,25,40,56,63]) {
      block('Curb socket',[.82,.2,1.48],[x,.85,z],.09,mats.brass);
      block('Marker light',[.35,.12,.83],[x,1,z],.055,mats.amber);
    }
  }
  // The concept uses painted chevrons at the approaches.
  for (const z of [4,6,58,60]) for (const sign of [-1,1]) {
    const stroke=block('Lane marking',[.20,.018,1.4],[sign*.44,.018,z],.008,mats.peach);
    stroke.rotation.y=-sign*.73;
  }
  g.userData.animations=[];
  for (const [i,z] of [18,33,48].entries()) {
    const row=source.clone(true); row.position.z=z; g.add(row);
    row.traverse(o=>{
      if (!o.isMesh) return;
      const slot=o.material.name;
      o.material=slot==='peach' && i===1 ? mats.mint : mats[slot];
      o.castShadow=slot!=='acrylic'; o.receiveShadow=true;
    });
    const lanes=Array.from({length:3},(_,lane)=>{
      const leaves=row.getObjectByName('Panel_'+lane).children.map(node=>({node,closed:node.position.x}));
      const lamps=[row.getObjectByName('Lamp_'+lane)];
      if (lane===2) lamps.push(row.getObjectByName('Lamp_3'));
      const cores=lamps.flatMap(lamp=>lamp.children.filter(o=>o.material===mats.signal));
      return {leaves,cores};
    });
    // From the entrance, the player looks toward +Z and sees +X on the left.
    const initial=[1,2,0][i];
    g.userData.animations.push(time=>{
      const clock=((time-2)%6+6)%6;
      const step=Math.floor(clock/2), local=clock%2;
      const oldLane=(initial+step)%3, nextLane=(oldLane+1)%3;
      for (const [lane,{leaves,cores}] of lanes.entries()) {
        let open=0;
        if (lane===oldLane) open=1-T.MathUtils.smoothstep(local,1.45,1.95);
        if (lane===nextLane) open=T.MathUtils.smoothstep(local,.87,1.38);
        for (const {node,closed} of leaves) node.position.x=closed*(1-open);
        const safe=open>.999 && !(lane===oldLane && local>=.65);
        for (const core of cores) core.material=safe?mats.signal:mats.amber;
      }
    });
  }
  track=g;
}
export function build() { return track; }
