import * as T from '/lib/three.module.js';
import {route} from './course.js';

const cube = new T.BoxGeometry();
const cylinder = new T.CylinderGeometry(.5,.5,1,8);
const crown = new T.ConeGeometry(.5,1,5);
const cream = 0xffefc4, ink = 0x233f53, jade = 0x3a9996, flame = 0xf06536;
const lit = new T.MeshStandardMaterial({roughness:.84,flatShading:true});
const transform = new T.Object3D();
const color = new T.Color();
function matrix(x,y,z,w,h,d,yaw=0,tilt=0,roll=0) {
  transform.position.set(x,y,z);
  transform.rotation.set(tilt,yaw,roll,'YXZ');
  transform.scale.set(w,h,d);
  transform.updateMatrix();
  return transform.matrix;
}

export function landscape(scene,seed,stage) {
  const group = new T.Group();
  scene.add(group);
  const {parts,length,center} = route(seed,stage);
  const batches=new Map(), rotors=[];
  function piece(x,y,z,w,h,d,tint,geometry=cube,yaw=0,tilt=0,roll=0) {
    if(!batches.has(geometry)) batches.set(geometry,[]);
    batches.get(geometry).push([matrix(x,y,z,w,h,d,yaw,tilt,roll).clone(),tint]);
  }
  for(const p of parts) {
    const {x,y,z,w,h,depth:d,kind}=p;
    if(kind==='rotor') {
      const rotor=new T.Group();
      rotor.position.set(x,y,z);
      const beam=new T.Mesh(cube,new T.MeshStandardMaterial({color:flame}));
      beam.scale.set(w,h,d); rotor.add(beam);
      group.add(rotor); rotors.push({rotor,speed:p.speed});
      piece(x,.34,z,1.1,.68,1.1,ink,cylinder);
      continue;
    }
    if(kind==='vent') {
      piece(x,y,z,w,h,d,jade);
      for(let i=-1;i<=1;i++) piece(x,1.32,z+i*.43,1.55,.06,.15,ink);
      continue;
    }
    const bridge=kind==='bridge';
    piece(x,y,z,w,h,d,bridge?0x447b89:0xcc8f72);
    piece(x,-.039,z,w+.03,.10,d-.055,bridge?0x75a7a5:0xebbc92);
    for(const side of [-1,1]) {
      const edge=x+side*(w/2-.22);
      piece(edge,.028,z,.24,.025,d-.12,cream);
      piece(edge,-.46,z,.34,.45,d,bridge?ink:flame);
      if(!bridge) for(const k of [-1,1]) piece(edge+side*.22,-1.5,z+k*1.3,.12,.65,1.5,ink);
    }
    if(d<=7) piece(x,.032,z,.18,.03,1.1,cream);
  }
  // Signal arches mark the start and destination. A checkerboard is visible from both sides.
  for(const dist of [0,length]) {
    const x=center(dist), z=-dist;
    for(const side of [-1,1]) {
      piece(x+side*8,2.7,z,.65,5.4,.8,jade);
      piece(x+side*8,.45,z,1.3,.9,1.4,ink);
    }
    piece(x,5.5,z,16.7,.9,.85,ink);
    for(let i=0;i<20;i++) {
      piece(x+(i-9.5)*.8,5.55,z+.44,.8,.48,.05,i%2?cream:flame);
      piece(x+(i-9.5)*.8,.025,z,.8,.05,1,i%2?cream:ink);
    }
  }
  // Terraced islands, apartment windows, antennas and harbor cranes frame the running deck.
  let state=seed>>>0;
  const rand=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<90;i++) {
    const side=i%2?-1:1, x=side*(25+rand()*69), z=28-rand()*(length+78);
    const top=-6+rand()*10, w=4+rand()*7, d=5+rand()*7;
    piece(x,top-12,z,w,24,d,[0xa5b8b4,0xbd9986,0x74999d][i%3]);
    piece(x,top,z,w+.6,.5,d+.6,cream);
    for(let k=0;k<3;k++) piece(x,top-1.3-k*2.3,z+d/2+.02,w*.72,.65,.05,0x527d87);
    if(i%4===0) {
      piece(x,top+2,z,.28,4,.28,ink);
      piece(x+.9,top+3.6,z,2,.52,.12,flame);
    } else if(i%3===0) piece(x,top+1,z,2.3,2,2.3,jade,crown);
  }
  for(const [geometry,items] of batches) {
    const mesh=new T.InstancedMesh(geometry,lit,items.length);
    items.forEach(([mat,tint],i)=>{mesh.setMatrixAt(i,mat);mesh.setColorAt(i,color.setHex(tint));});
    group.add(mesh);
  }
  return {length, update(t){for(const {rotor,speed} of rotors) rotor.rotation.y=t*speed;},
    dispose(){group.traverse(o=>{if(o.isInstancedMesh)o.dispose();else if(o.isMesh)o.material.dispose();});scene.remove(group);}};
}

// One draw batch animates the individual limbs, helmets, visors and mail packs of all 50 couriers.
export function couriers(scene) {
  const batch=new T.InstancedMesh(cube,lit,50*12);
  batch.frustumCulled=false; scene.add(batch);
  const root=new T.Matrix4(), joined=new T.Matrix4();
  const coats=[jade,0x5674ac,0xf1b941,0xb3769e,0x78a579,0xcf7260];
  return function draw(runners,you,time) {
    let n=0;
    for(const r of runners) {
      if(!(r.flags&1)) continue;
      const speed=Math.hypot(r.vx,r.vz);
      const gait=Math.sin(time*13+r.id)*Math.min(1,speed/4)*.65;
      root.copy(matrix(r.x,r.y-(r.radius??.5),r.z,1,1,1,r.heading||0));
      function part(x,y,z,w,h,d,tint,tilt=0) {
        joined.multiplyMatrices(root,matrix(x,y,z,w,h,d,0,tilt));
        batch.setMatrixAt(n,joined);batch.setColorAt(n++,color.setHex(tint));
      }
      const coat=r.id===you?flame:coats[r.id%coats.length];
      part(0,.84,0,.55,.62,.34,coat);
      part(0,1.32,0,.47,.43,.43,cream);
      part(0,1.52,-.025,.53,.16,.51,coat);
      part(0,1.35,-.224,.37,.14,.05,ink);
      part(0,.85,.235,.42,.42,.19,ink);
      part(0,.91,.337,.27,.10,.025,cream);
      for(const side of [-1,1]) {
        part(side*.37,.84,-side*gait*.13,.17,.52,.19,coat,-side*gait);
        part(side*.15,.34,side*gait*.15,.21,.49,.23,ink,side*gait);
        part(side*.15,.1,side*gait*.26-.04,.23,.15,.32,cream,side*gait);
      }
    }
    batch.count=n;batch.instanceMatrix.needsUpdate=true;
    if(batch.instanceColor)batch.instanceColor.needsUpdate=true;
  };
}
