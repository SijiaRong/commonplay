import * as T from 'three';
import {GLTFLoader} from '../bubbleport-demo/dist/vendor/addons/loaders/GLTFLoader.js';
import {OrbitControls} from '../bubbleport-material-lab/vendor/controls/OrbitControls.js';
import {RoomEnvironment} from '../bubbleport-material-lab/vendor/environments/RoomEnvironment.js';
import {materialSpecs} from '../material-atlas/dist/original/bubbleport/materials.mjs';
import {catalog,modelRoot,archivedMaterial} from './catalog.js';

const el = id=>document.getElementById(id);
const option = (value,label)=>new Option(label,value);
const channels = {map:'底色',normalMap:'法线',roughnessMap:'粗糙度',metalnessMap:'金属度',emissiveMap:'自发光',aoMap:'环境遮蔽',bumpMap:'凹凸'};
const presets = new Map(materialSpecs.map(s=>['MAT-BP-'+s.id.toUpperCase(),s]));
const loader = new GLTFLoader();
const data = await catalog();
const textures = new Map(data.textures.map(t=>[t.id,t]));
const archive = new Map(data.materials.map(m=>[m.id,m]));
const db = await new Promise((resolve,reject)=>{
  const request=indexedDB.open('commonplay-editor-images',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});
function imageStore(action,mode='readonly') {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('images',mode), request=action(tx.objectStore('images'));
    tx.oncomplete=()=>resolve(request.result); tx.onabort=()=>reject(tx.error);
  });
}
function registerImage(record) {
  if (!textures.has(record.id)) textures.set(record.id,{...record,url:URL.createObjectURL(record.blob)});
}
(await imageStore(s=>s.getAll())).forEach(registerImage);
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene(), camera=new T.PerspectiveCamera(36,1,.01,100);
const controls=new OrbitControls(camera,renderer.domElement);
const room=new RoomEnvironment(), generator=new T.PMREMGenerator(renderer);
scene.environment=generator.fromScene(room,.04).texture;
room.dispose(); generator.dispose();
scene.add(new T.HemisphereLight(0xfffcf3,0xb7c4bb,1.5));
const key=new T.DirectionalLight(0xfff4da,2);key.position.set(4,7,5);scene.add(key);
const grid=new T.GridHelper(20,80,0xafbfb4,0xc8d2cb);scene.add(grid);
const holder=new T.Group();scene.add(holder);
function draw(){renderer.render(scene,camera)}
controls.addEventListener('change',draw);
let focusHeight=1.2;
function frame(){
  const aspect=camera.aspect;
  controls.target.set(0,focusHeight,0);
  camera.position.set(3.5,2.1,4.8).multiplyScalar(Math.max(1,1/aspect)).add(controls.target);
  controls.update();draw();
}
el('frame').onclick=frame;
new ResizeObserver(()=>{
  const {width,height}=el('stage').getBoundingClientRect();
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();frame();
}).observe(el('stage'));

let current, gltf, slots=[], generation=0, changes={}, pending=0, exporting=false;
function buttons(){el('export').disabled=!gltf || pending>0 || exporting}
function save(){
  try{localStorage.setItem('commonplay-model:'+current.id,JSON.stringify(changes));el('saved').textContent='已保存到此浏览器'}
  catch{el('saved').textContent='浏览器存储已满，请导出 GLB'}
}
function renderList(){
  const term=el('search').value.trim().toLowerCase(),group=el('group').value;
  const rows=data.models.filter(m=>(!group || m.group===group) && [m.id,m.name,m.version,m.file].join(' ').toLowerCase().includes(term));
  el('count').textContent=rows.length;
  el('list').replaceChildren(...rows.map(m=>{
    const b=document.createElement('button'),title=document.createElement('b'),sub=document.createElement('span');
    title.textContent=m.name;sub.textContent=m.id+' · '+m.version;b.append(title,sub);
    b.title=m.file;b.setAttribute('aria-current',m===current);b.onclick=()=>openModel(m);return b;
  }));
  if(!rows.length)el('list').textContent='没有匹配的模型';
}
for(const group of new Set(data.models.map(m=>m.group)))el('group').add(option(group,group));
el('group').onchange=el('search').oninput=renderList;
for(const [k,v] of Object.entries(channels))el('channel').add(option(k,v));
for(const [id,m] of [...presets,...archive])el('preset').add(option(id,m.name+' · '+id));
el('preset').prepend(option('','模型原材质'));
function textureId(digest){
  return 'TEX-'+Array.from(new Uint8Array(digest).slice(0,4),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}
// Supply planar coordinates for the few unwrapped production meshes in the archive.
function ensureUV(geometry){
  if(geometry.attributes.uv)return;
  geometry.computeBoundingBox();
  const {min,max}=geometry.boundingBox;
  const [u,v]=['x','y','z'].sort((a,b)=>(max[b]-min[b])-(max[a]-min[a]));
  const p=new T.Vector3(),pos=geometry.attributes.position,uv=new Float32Array(pos.count*2);
  for(let i=0;i<pos.count;i++){
    p.fromBufferAttribute(pos,i);
    uv[i*2]=(p[u]-min[u])/(max[u]-min[u] || 1);
    uv[i*2+1]=(p[v]-min[v])/(max[v]-min[v] || 1);
  }
  geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
}
function disposeModel(root){
  const resources=new Set();
  root.traverse(o=>{if(o.geometry)resources.add(o.geometry); for(const m of [o.material].flat().filter(Boolean)){
    resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);
  }});
  resources.forEach(r=>r.dispose());
}
function clearSlot(s){
  s.owned.forEach(t=>t.dispose());s.owned=[];if(s.active!==s.base)s.active.dispose();
}
async function openModel(model){
  const gen=++generation;
  if(gltf){for(const s of slots){clearSlot(s);if(s.source && s.source!==s.base)disposeSource(s.source);s.assign(s.base)}disposeModel(gltf.scene)}
  holder.clear();gltf=null;slots=[];pending=0;current=model;buttons();el('panel').disabled=true;
  el('mid').textContent=model.id;el('name').textContent=model.name;el('version').textContent=model.group+' / '+model.version;
  el('message').textContent='正在载入模型…';el('saved').textContent='';renderList();draw();
  try{
    const result=await loader.loadAsync(modelRoot+model.file);
    if(gen!==generation){disposeModel(result.scene);return}
    const parser=result.parser;
    const usedTextures=new Set();
    result.scene.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))
      for(const t of Object.values(m))if(t?.isTexture)usedTextures.add(t)});
    await Promise.all(Array.from(usedTextures,async t=>{
      const index=parser.associations.get(t)?.textures;
      const source=parser.json.textures?.[index]?.source;
      const buffer=parser.json.images?.[source]?.bufferView;
      if(buffer==null)return;
      const bytes=await parser.getDependency('bufferView',buffer);
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      t.userData.editorTextureId=textureId(digest);
    }));
    if(gen!==generation){disposeModel(result.scene);return}
    gltf=result;
    const byMat=new Map();
    result.scene.traverse(obj=>{
      if(!obj.isMesh)return;
      [obj.material].flat().forEach((m,i)=>{
        if(!byMat.has(m))byMat.set(m,[]);byMat.get(m).push([obj,i]);
      });
    });
    slots=Array.from(byMat,([base,refs],i)=>({
      id:'MAT-'+model.sha256.slice(0,8).toUpperCase()+'-S'+(i+1),base,active:base,rev:0,owned:[],
      assign(m){this.active=m;for(const [obj,k] of refs){if(m!==base && Object.keys(channels).some(ch=>m[ch]))ensureUV(obj.geometry);if(Array.isArray(obj.material))obj.material[k]=m;else obj.material=m}}
    }));
    const box=new T.Box3().setFromObject(result.scene,true),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
    const scale=2.9/(Math.max(size.x,size.y,size.z)||1);
    focusHeight=size.y*scale/2;
    holder.scale.setScalar(scale);holder.position.set(-center.x,-box.min.y,-center.z).multiplyScalar(scale);holder.add(result.scene);
    changes=JSON.parse(localStorage.getItem('commonplay-model:'+model.id)||'{}');
    el('slot').replaceChildren(...slots.map((s,i)=>option(i,(s.base.name||'材质槽 '+(i+1))+' · '+s.id)));
    frame();el('message').textContent='';
    await Promise.all(slots.filter(s=>changes[s.id]).map(s=>apply(s)));
    if(gen!==generation)return;
    el('panel').disabled=!slots.length;buttons();sync();
  }catch(e){if(gen===generation){el('message').textContent='载入失败：'+e.message;gltf=null;buttons()}}
}
function selected(){return slots[Number(el('slot').value)]}
function config(s){return changes[s.id] || {}}
function sync(){
  const s=selected();if(!s)return;
  const c=config(s),m=s.active,ch=el('channel').value;
  el('preset').value=c.preset || '';
  el('color').value='#'+m.color.getHexString();
  for(const k of ['roughness','metalness']){
    el(k).disabled=!(k in m);el(k).value=m[k] ?? 0;el(k+'Value').value=m[k]?.toFixed(2) ?? '—';
  }
  const source=s.source || s.base;
  const original=source[ch];
  const tid=original?.userData.editorTextureId || 'TEX-'+(c.preset || s.id)+'-'+ch;
  const tex=c.maps?.[ch] ?? '';
  el('texture').replaceChildren(option('',original?'材质自带 · '+tid:'材质默认（无贴图）'),option('none','无贴图'),
    ...Array.from(textures,([id,t])=>option(id,t.name+' · '+id)));
  el('texture').value=tex;
  for(const [key,val] of Object.entries({repeatX:m[ch]?.repeat.x,repeatY:m[ch]?.repeat.y,angle:m[ch]?T.MathUtils.radToDeg(m[ch].rotation):undefined})){
    el(key).disabled=val===undefined;el(key).value=val===undefined?'':Number(val.toFixed(3));
  }
  const t=textures.get(tex || tid);el('thumb').hidden=!t;if(t)el('thumb').src=t.thumb || t.url;
}
el('slot').onchange=el('channel').onchange=sync;
async function apply(s){
  const gen=generation,rev=++s.rev,c=config(s),owned=[];
  const live=()=>gen===generation && rev===s.rev;
  let material,source=s.base;
  pending++;buttons();
  try{
    if(c.preset && c.preset===s.sourceId)source=s.source;
    else if(presets.has(c.preset)){
      const p=presets.get(c.preset);source=new T.MeshPhysicalMaterial({color:p.color,...p.params});
    }else if(archive.has(c.preset)) source=await archivedMaterial(loader,archive.get(c.preset));
    material=source.clone();material.side=s.base.side;
    for(const [ch,id] of Object.entries(c.maps || {})){
      if(id==='none'){material[ch]=null;continue}
      const t=textures.get(id);if(!t)throw Error('找不到纹理 '+id);
      const map=await new T.TextureLoader().loadAsync(t.url);owned.push(map);
      map.flipY=false;map.colorSpace=['map','emissiveMap'].includes(ch)?T.SRGBColorSpace:T.NoColorSpace;
      const ref=source[ch] || s.base[ch];
      if(ref){map.offset.copy(ref.offset);map.repeat.copy(ref.repeat);map.rotation=ref.rotation;map.channel=ref.channel;map.wrapS=ref.wrapS;map.wrapT=ref.wrapT}
      material[ch]=map;
    }
    for(const [ch,uv] of Object.entries(c.uv || {})){
      if(!material[ch])continue;
      let map=material[ch];
      if(!owned.includes(map)){map=map.clone();owned.push(map);material[ch]=map}
      map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(uv.x,uv.y);map.rotation=T.MathUtils.degToRad(uv.angle);
    }
    if(!live())return;
    if(c.color)material.color.set(c.color);
    for(const k of ['roughness','metalness'])if(c[k]!=null && k in material)material[k]=c[k];
    clearSlot(s);
    if(s.source && s.source!==source && s.source!==s.base)disposeSource(s.source);
    s.source=source;s.sourceId=c.preset;s.owned=owned;s.assign(material);
    if(s===selected())sync();draw();
  }catch(e){if(live()){el('saved').textContent='应用失败：'+e.message;throw e}}
  finally{
    if(material!==s.active){material?.dispose();owned.forEach(t=>t.dispose());if(source!==s.base && source!==s.source)disposeSource(source)}
    if(gen===generation){pending--;buttons()}
  }
}
function disposeSource(m){for(const v of new Set(Object.values(m)))if(v?.isTexture)v.dispose();m.dispose()}
async function update(s,next){
  const prev=config(s);changes[s.id]=next;
  try{await apply(s);if(slots.includes(s) && config(s)===next)save()}
  catch{if(slots.includes(s) && config(s)===next){changes[s.id]=prev;sync()}}
}
el('preset').onchange=e=>update(selected(),{preset:e.target.value});
function setMap(id){
  const s=selected(),c=config(s),maps={...c.maps},ch=el('channel').value;
  if(id)maps[ch]=id;else delete maps[ch];
  return update(s,{...c,maps});
}
el('texture').onchange=e=>setMap(e.target.value);
for(const key of ['repeatX','repeatY','angle'])el(key).onchange=()=>{
  const s=selected(),c=config(s),ch=el('channel').value;
  const [x,y,angle]=['repeatX','repeatY','angle'].map(k=>el(k).valueAsNumber);
  if(![x,y,angle].every(Number.isFinite) || x<=0 || y<=0){sync();return}
  update(s,{...c,uv:{...c.uv,[ch]:{x,y,angle}}});
};
for(const k of ['color','roughness','metalness'])el(k).oninput=e=>{
  const s=selected(),value=k==='color'?e.target.value:Number(e.target.value);
  if(s.active===s.base)s.assign(s.base.clone());
  if(k==='color')s.active.color.set(value);else{s.active[k]=value;el(k+'Value').value=value.toFixed(2)}
  changes[s.id]={...config(s),[k]:value};
  if(pending)update(s,changes[s.id]);else save();
  draw();
};
el('reset').onclick=()=>update(selected(),{});
el('upload').onchange=async e=>{
  const file=e.target.files[0],s=selected(),ch=el('channel').value;if(!file)return;
  try{
    const bitmap=await createImageBitmap(file);bitmap.close();
    const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
    const id=textureId(digest);
    if(!textures.has(id)){
      const record={id,name:file.name,blob:file};
      await imageStore(store=>store.put(record),'readwrite');registerImage(record);
    }
    if(slots.includes(s)){const c=config(s);await update(s,{...c,maps:{...c.maps,[ch]:id}})}
  }catch(err){el('saved').textContent='导入失败：'+err.message}
  e.target.value='';
};
el('export').onclick=async()=>{
  const model=current,result=gltf;exporting=true;el('list').inert=true;el('panel').disabled=true;buttons();el('saved').textContent='正在导出…';
  try{
    const {GLTFExporter}=await import('./vendor/GLTFExporter.js');
    result.scene.userData.modelId=model.id;
    for(const slot of slots){
      const cfg=config(slot),mat=slot.active;
      mat.userData.materialSlotId=slot.id;
      mat.userData.materialId=cfg.preset || slot.id;
      mat.userData.textureIds=Object.fromEntries(Object.keys(channels).filter(ch=>mat[ch]).map(ch=>
        [ch,cfg.maps?.[ch] || mat[ch].userData.editorTextureId || 'TEX-'+mat.userData.materialId+'-'+ch]));
    }
    const binary=await new GLTFExporter().parseAsync(result.scene,{binary:true,animations:result.animations});
    const url=URL.createObjectURL(new Blob([binary],{type:'model/gltf-binary'})),a=document.createElement('a');
    a.href=url;a.download=model.id+'-'+model.name+'.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    el('saved').textContent='已导出 GLB';
  }catch(e){el('saved').textContent='导出失败：'+e.message}
  finally{exporting=false;el('list').inert=false;el('panel').disabled=!slots.length;buttons()}
};
await openModel(data.models.find(m=>m.file.endsWith('runtime/02-ferris-wheel.glb')) || data.models[0]);
