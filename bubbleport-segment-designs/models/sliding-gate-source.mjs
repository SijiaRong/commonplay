import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
const slots = {}, geometries = new Map();
function group(parent, name, x=0) {
  const obj = new T.Group(); obj.name=name; obj.position.x=x; parent.add(obj); return obj;
}
function part(parent, name, slot, dims, pos, radius=.08) {
  const key=[...dims,radius].join(',');
  if (!geometries.has(key)) geometries.set(key,new RoundedBoxGeometry(...dims,2,radius));
  if (!slots[slot]) {slots[slot]=new T.MeshStandardMaterial({color:0xf5f5f5}); slots[slot].name=slot;}
  const mesh=new T.Mesh(geometries.get(key),slots[slot]); mesh.name=name; mesh.position.set(...pos); parent.add(mesh); return mesh;
}
const row=new T.Group(); row.name='Starport_Sliding_Gate';
for(let i=0;i<4;i++){
  const post=group(row,'Housing_'+i,(i-1.5)*6.4);
  // Front and rear cheeks enclose four independently sliding leaves.
  for(const side of [-1,1]){
    part(post,'Cheek','mint',[1.6,2.7,.26],[0,1.49,side*1.03],.12);
    part(post,'Inset','road',[1.19,1.63,.09],[0,1.46,side*1.17],.042);
    part(post,'Badge','brass',[.58,.58,.08],[0,1.48,side*1.24],.039).rotation.z=Math.PI/4;
  }
  part(post,'Sole','mint',[1.6,.25,2.32],[0,.125,0],.11);
  part(post,'Crown','mint',[1.6,.51,2.32],[0,2.96,0],.24);
  const lamp=group(row,'Lamp_'+i,post.position.x);
  part(lamp,'Bezel','brass',[1.06,.20,1.50],[0,3.22,0],.095);
  part(lamp,'Lens','acrylic',[.85,.23,1.28],[0,3.36,0],.11);
  for(const side of [-1,1]){
    const badge=part(lamp,'FaceSignal','signal',[.39,.39,.055],[0,1.48,side*1.29],.026);
    badge.rotation.z=Math.PI/4;
  }
  part(lamp,'Emitter','signal',[.54,.19,.92],[0,3.34,0],.09);
}
for(let bay=0;bay<3;bay++){
  const panel=group(row,'Panel_'+bay,(bay-1.5)*6.4);
  for(let n=0;n<4;n++){
    const leaf=group(panel,'Leaf_'+bay+'_'+n,1.4+n*1.2);
    // Nested U sections share a centreline. Smaller leaves retract inside the larger shells.
    const depth=1.72-n*.34, top=2.62-n*.21, base=.39;
    part(leaf,'CushionedCap','peach',[1.28,.15,depth],[0,top,0],.071);
    for (const side of [-1,1]) {
      const z=side*(depth/2-.065);
      part(leaf,'Apron','peach',[1.28,top-base,.13],[0,(top+base)/2,z],.063);
      part(leaf,'Inlay','road',[.84,.09,.022],[0,1.43,z+side*.071],.01);
      part(leaf,'Hem','brass',[1.28,.12,.14],[0,base,z],.055);
    }
  }
}
// Batch fixed pieces within each housing, lamp or sliding leaf, keeping the animation hierarchy.
const batches=new Map();
row.traverse(group=>{
  if (!group.children.length || !group.children.every(child=>child.isMesh)) return;
  const byMaterial=new Map();
  for(const part of [...group.children]){
    part.updateMatrix();
    const list=byMaterial.get(part.material) || [];
    byMaterial.set(part.material,list);list.push(part);group.remove(part);
  }
  for(const [material,parts] of byMaterial){
    const key=parts.map(part=>[part.geometry.uuid,...part.matrix.elements].join(',')).join('|');
    if(!batches.has(key)) batches.set(key,mergeGeometries(parts.map(part=>part.geometry.clone().applyMatrix4(part.matrix))));
    const mesh=new T.Mesh(batches.get(key),material);mesh.name=material.name;group.add(mesh);
  }
});
const data=await new GLTFExporter().parseAsync(row,{binary:true});
export default data;
