import * as T from 'three';
import {Scene3D,focusRider} from './slide/film/scene.js';
import {loadDaylight,createContactShadow} from './slide/daylight.js';
import {restoreCourseMaterials} from './slide/course-materials.js';
import {dressPlush} from './slide/plush.js';
import {MarbleView} from './lm/js/render/marbles.js';
import {getMaterials as lostMaterials} from './lm/js/render/materials.js';
import {getMaterials as bearMaterials} from './teddy/materials.js';
import {stickerMaterial} from './lm/js/render/sticker.js';
import {glowTexture} from './lm/js/render/textures.js';
import {textTexture} from './teddy/textures.js';
import {getMaterials as portMaterials} from './port/solo/js/render/materials.js';
import {updateAcrylicBackdrop} from './port/solo/js/render/acrylic.js';
import {makeBeaconBase,makeBeaconLens,beaconColors} from './port/slide/harbor-lights.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';

const status=document.querySelector('output');
async function init(){
 const lite=matchMedia('(pointer: coarse)').matches,quality=lite?'low':'high';
 const film=new Scene3D(document.querySelector('canvas'),quality);
 const {camera,renderer,scene}=film;
 camera.fov=49;film.resize();
 const target=new T.Vector3(0,1.18,0),controls=new OrbitControls(camera,renderer.domElement);
 controls.enablePan=false;controls.minDistance=3;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.485;
 function reset(){camera.position.set(3.05,2.7,4.75);controls.target.copy(target);controls.update();focusRider(film,target,1.1,'ready',true)}
 reset();
 const lost=lostMaterials(quality,renderer,{lite}),bear=bearMaterials(quality);
 await Promise.all([loadDaylight(film,lite),lost.ready]);
 const marbleGroup=new T.Group();scene.add(marbleGroup);
 const marble=new MarbleView(marbleGroup,quality);marbleGroup.visible=false;
 for(const mesh of [marble.mesh,marble.shadowDecals,marble.causticDecals])mesh.count=1;
 const holder=new T.Group();scene.add(holder);
 const shadow=createContactShadow(1.15);shadow.position.y=.045;scene.add(shadow);
 const beacon={base:makeBeaconBase(),amber:makeBeaconLens(beaconColors.amber),jade:makeBeaconLens(beaconColors.jade)};
 const leftShadow=createContactShadow(1.15);leftShadow.visible=false;scene.add(leftShadow);
 const direction=new T.Vector3();
 let port,reference,paired=false,acrylicVisible=false;
 const stickers=stickerMaterial();
 const effects={
   shard:new T.MeshPhysicalMaterial({color:'#df6b85',roughness:.15,metalness:.1,clearcoat:1,side:T.DoubleSide,envMapIntensity:1.4}),
   dust:new T.PointsMaterial({map:glowTexture(),size:.35,transparent:true,opacity:.5,depthWrite:false,blending:T.AdditiveBlending,color:'#fff3dc'}),
   ring:new T.MeshBasicMaterial({color:'#69cfff',transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,toneMapped:false}),
   lamp:new T.MeshPhysicalMaterial({color:'#587464',roughness:.38,metalness:.35,clearcoat:.5,clearcoatRoughness:.2}),
   bulb:new T.MeshBasicMaterial({color:'#ffc78a'}),sticker:stickers,halo:stickers
 };
 const models=new Map(),signs=new Map();let release=null,revision=0,frames=0;
 async function model(id){
  if(!models.has(id))models.set(id,(async()=>{
    const gltf=await new GLTFLoader().loadAsync('./models/'+id+'.gltf');
    const mats=await gltf.parser.getDependencies('material');
    if(id!=='classic')return mats;
    const meshes=mats.map(m=>new T.Mesh(undefined,m));gltf.scene.add(...meshes);
    restoreCourseMaterials(gltf,renderer,{quality,lite});return meshes.map(m=>m.material);
  })());return models.get(id);
 }
 function geometry(shape){
  if(shape==='球体')return new T.SphereGeometry(1.18,64,48);
  if(shape==='圆柱')return new T.CylinderGeometry(1.12,1.12,2.1,80);
  if(shape==='平板')return new RoundedBoxGeometry(3.1,1.25,.16,4,.045);
  return new RoundedBoxGeometry(2.45,1.95,1.72,6,.22);
 }
 function sign(id){if(!signs.has(id)){
  const wide=id.endsWith('banner'),map=textTexture(wide?'START':'FINISH',{w:wide?1024:512,h:wide?150:160});
  signs.set(id,wide?new T.MeshPhysicalMaterial({map,roughness:.42,clearcoat:.5,clearcoatRoughness:.25}):new T.MeshStandardMaterial({map,roughness:.5}));
 }return signs.get(id)}
 function describe(mat,req){
  const values={'材质类型':mat.type.replace('Mesh','').replace('Material','')},maps=[];
  for(const [key,name] of [['roughness','基础粗糙度'],['metalness','基础金属度'],['clearcoat','清漆'],['clearcoatRoughness','清漆粗糙度'],['sheen','织物光泽']])if(mat[key]!=null)values[name]=mat[key].toFixed(2);
  if(mat.emissive?.getHex())values['自发光强度']=mat.emissiveIntensity.toFixed(2);
  if(req.id.startsWith('marble')||req.id==='port-acrylic')values['折射率']=mat.ior;
  for(const [k,n] of [['bumpMap','凹凸'],['map','底色'],['normalMap','法线'],['roughnessMap','粗糙度'],['metalnessMap','金属度'],['emissiveMap','自发光'],...Object.keys(mat.userData.layers||{}).map(k=>[k,k])]){
    const img=(mat[k]||mat.userData.layers?.[k])?.image;if(!img)continue;
    const c=document.createElement('canvas');c.width=144;c.height=96;c.getContext('2d').drawImage(img,0,0,144,96);if(k==='roughnessMap'||k==='metalnessMap'){
     const ctx=c.getContext('2d'),pixels=ctx.getImageData(0,0,c.width,c.height),ch=k==='roughnessMap'?1:2;
     for(let i=0;i<pixels.data.length;i+=4)pixels.data.fill(pixels.data[i+ch],i,i+3);ctx.putImageData(pixels,0,0);
    }maps.push([n,c.toDataURL()]);
  }
  parent.postMessage({revision:req.revision,values,maps},location.origin);
 }
 async function select(req){
  revision=req.revision;const {id,shape}=req;let mat;
  status.textContent='正在读取样本…';
  if(id.startsWith('marble'))mat=marble.mat;
  else if(id.startsWith('classic')||id.startsWith('runway')){const [file,num]=id.split('-');mat=(await model(file))[+num]}
  else if(id.startsWith('beacon-'))mat=beacon[id.slice(7)];
  else if(id.startsWith('port-')){
    port??=portMaterials(quality,renderer,{lite});await port.ready;mat=port[id.slice(5)];
  }
  else if(id.startsWith('fx-'))mat=effects[id.slice(3)];
  else if(id.startsWith('char'))mat=(await model(id.slice(5)))[0];
  else if(id.endsWith('sign')||id.endsWith('banner'))mat=sign(id);
  else mat=(id.startsWith('lm-')?lost:bear)[id.split('-')[1]];
  if(req.revision!==revision)return;
  if(reference){scene.remove(reference);reference.geometry.dispose();reference=null}
  paired=false;leftShadow.visible=false;acrylicVisible=id==='port-acrylic';
  shadow.scale.setScalar(1);shadow.position.set(0,.045,0);
  release?.();release=null;
  for(const g of new Set(holder.children.map(m=>m.geometry)))g.dispose();holder.clear();
  holder.scale.setScalar(1);holder.position.set(0,0,0);
  marbleGroup.visible=id.startsWith('marble');shadow.visible=!marbleGroup.visible;
  if(marbleGroup.visible){
   marble.setSkin(0,req.skin,.137,{f:req.finish});marble.place(0,0,1.22,0,1.18,0,0,0,0,false);
   marble.placeDecal(0,0,1.22,0,1.18,1,film.sunDir,1);marble.commit(0);
  }else{
   if(shape==='平面'){
    const count=id==='fx-sticker'?3:1,geo=new T.PlaneGeometry(count===1?2.5:.96,count===1?2.5:.96);
    geo.setAttribute('aShape',new T.InstancedBufferAttribute(new Float32Array(count===1?[3]:[0,1,2]),1));
    const colors=new Float32Array(count*3);for(let i=0;i<count;i++)new T.Color(count===1?'#ffe0b8':'#b6efac').toArray(colors,i*3);
    geo.setAttribute('aCol',new T.InstancedBufferAttribute(colors,3));const stamps=new T.InstancedMesh(geo,mat,count);
    for(let i=0;i<count;i++)stamps.setMatrixAt(i,new T.Matrix4().makeTranslation(i-(count-1)/2,1.25,0));holder.add(stamps);shadow.visible=false;
   }else if(shape==='点精灵'){
    const geo=new T.BufferGeometry(),pts=[];for(let i=0;i<26;i++)pts.push(Math.sin(i*4.1)*1.3,.4+(i%7)*.24,Math.cos(i*7.3)*.8);
    geo.setAttribute('position',new T.Float32BufferAttribute(pts,3));holder.add(new T.Points(geo,mat));shadow.visible=false;
   }else{
   const geo=shape==='圆环'?new T.RingGeometry(.98,1.17,64):geometry(shape);geo.computeBoundingBox();
   const mesh=new T.Mesh(geo,mat);holder.add(mesh);
   mesh.castShadow=mesh.receiveShadow=true;holder.position.y=.04-geo.boundingBox.min.y;
   if(mat.vertexColors){const tint=new T.Color(id.endsWith('paint')?'#ed816c':id.endsWith('rubber')?'#649a95':'#ffffff');
    const arr=new Float32Array(geo.attributes.position.count*3);for(let i=0;i<arr.length;i+=3)tint.toArray(arr,i);geo.setAttribute('color',new T.BufferAttribute(arr,3))}
   if(req.comparison){
    paired=true;const old=req.comparison==='oldGlobe';
    const ref=old?port.paint:(req.comparison.startsWith('lm-')?lost:bear)[req.comparison.split('-')[1]];
    const refGeo=geo.clone();
    if(ref.vertexColors){
      const color=new T.Color(old?'#efaa81':id.endsWith('paint')?'#ed816c':id.endsWith('rubber')?'#649a95':'#ffffff');
      const rgb=new Float32Array(refGeo.attributes.position.count*3);
      for(let i=0;i<rgb.length;i+=3)color.toArray(rgb,i);
      refGeo.setAttribute('color',new T.BufferAttribute(rgb,3));
    }
    reference=new T.Mesh(refGeo,ref);reference.castShadow=reference.receiveShadow=true;
    scene.add(reference);leftShadow.visible=true;
   }
   mesh.castShadow=!acrylicVisible;
   if(id==='char-teddy'){
    geo.scale(.16,.16,.16);holder.scale.setScalar(6.25);
    const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,.07+uv.getX(i)*.085,.025+uv.getY(i)*.08);
    // dressPlush selects skinned source meshes, then installs its two materials on their geometry.
    mesh.isSkinnedMesh=true;const freeNap=dressPlush(holder);delete mesh.isSkinnedMesh;
    mat=mesh.material;const layers=holder.children.map(m=>m.material);
    release=()=>{freeNap();layers.forEach(m=>m.dispose())};
   }
  }
  }
  describe(mat,req);status.textContent='';
 }
 window.addEventListener('message',({data,origin,source})=>{
  if(origin!==location.origin||source!==parent)return;
  if(data.reset)reset();else if(data.ping)parent.postMessage({ready:true},origin);
  else select(data).catch(e=>{if(revision===data.revision)status.textContent='样本读取失败：'+e.message;console.error(e)});
 });
 function reqWidth(geo){return Math.max(geo.boundingBox.max.x-geo.boundingBox.min.x,geo.boundingBox.max.z-geo.boundingBox.min.z)}
 let last=performance.now();function render(now){
  const dt=Math.min(.1,(now-last)/1000);last=now;controls.update();focusRider(film,target,1.1,'ready');
  if(paired){
    const size=Math.min(.84,camera.aspect*.63);
    const offset=(reqWidth(holder.children[0].geometry)+.45)*size/2;
    direction.setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(offset);
    const y=.04-holder.children[0].geometry.boundingBox.min.y*size;
    holder.scale.setScalar(size);reference.scale.setScalar(size);
    holder.position.set(direction.x,y,direction.z);reference.position.set(-direction.x,y,-direction.z);
    shadow.position.set(direction.x,.045,direction.z);leftShadow.position.set(-direction.x,.045,-direction.z);
    shadow.scale.setScalar(size);leftShadow.scale.setScalar(size);
  }
  if(acrylicVisible)updateAcrylicBackdrop(port.acrylic,film);
  if(marbleGroup.visible){const tex=frames>1?(film.gtao?film.rtA.texture:film.rtDof?.texture):null;marble.uniforms.uScene.value=tex||null;marble.uniforms.uSceneOn.value=tex?(tex.generateMipmaps?2:1):0;marble.commit(now/1000)}
  film.render(dt);frames++;requestAnimationFrame(render);
 }
 parent.postMessage({ready:true},location.origin);requestAnimationFrame(render);
}
init().catch(e=>{status.textContent='无法打开三维预览：'+e.message;console.error(e)});
