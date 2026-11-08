import * as T from 'three';
import {buildShow} from '../solo/shared/course.js';
import {loadParkModels} from '../solo/js/render/park.js';
import {CourseView} from '../solo/js/render/courseView.js';
import {getMaterials} from '../solo/js/render/materials.js';
import {stageNames,pieceNames,courseSeed} from '../solo/course-labels.js';
import {gameFinishes,labFinishes,woodFinishes,presetSources,materialEdits,editedMaterial} from '../solo/material-edits.js';
import {createSlideFilm,focusRider} from '../slide/film/scene.js';
import {updateAcrylicBackdrop} from '../solo/js/render/acrylic.js';
import {bindEnvironment} from '../slide/environment-controls.js';
import {applyTrackPack,loadLostPack} from '../slide/lost-pack.js';
import {applyRoom,prefs} from '../slide/preferences.js';
import {loadDaylight} from '../slide/daylight.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';

const $ = id=>document.getElementById(id);
async function start() {
  const params = new URLSearchParams(location.search);
  const seed = courseSeed(params);
  const index = T.MathUtils.clamp(parseInt(params.get('stage')) || 1,1,stageNames.length)-1;
  stageNames.forEach((name,i)=>$('stage').add(new Option('第 '+(i+1)+' 关 · '+name,i+1)));
  $('stage').value=index+1;
  $('stage').onchange=()=>{params.set('stage',$('stage').value);location.search=params.toString();};
  $('play').href='../?seed='+seed;
  const stage = buildShow(seed)[index];
  const canvas=document.querySelector('canvas');
  const {film,quality,lite}=createSlideFilm(canvas);
  const {renderer,scene,camera,sun}=film;
  const mats=getMaterials(quality,renderer,{lite});
  const [,,runway,wood,parkModels]=await Promise.all([loadDaylight(film),mats.ready,
    new GLTFLoader().loadAsync('../solo/models/quilted-runway.glb'),loadLostPack(renderer,lite),loadParkModels(index)]);
  if(prefs.pack==='lost') applyTrackPack(mats,wood);
  runway?.scene.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
  const course=new CourseView(stage,quality,runway?.scene,()=>true,parkModels);
  const sources=presetSources(course,runway.scene,wood);
  scene.add(course.group);
  scene.updateMatrixWorld(true);

  const zones=stage.pieces.map((piece,i)=>({label:(i+1)+' · '+(pieceNames[piece.name]||piece.name),piece,entries:[]}));
  const extra={label:'起终点与连接路段',entries:[]};
  const park={label:'游乐场底座与景观',entries:[]};
  const edits=materialEdits(seed,index);
  const meshes=[],byMesh=new Map();
  const shapeNames={box:'板件',kin:'活动机关',cyl:'柱件',lathe:'弧形构件',helix:'螺旋构件',banner:'横幅',sign:'标牌',bowl:'漏斗',saturnLamp:'土星灯',saturnEmblem:'土星徽标'};
  const roleNames={road:'路面',paint:'涂色构件',resin:'树脂构件',trim:'饰条',coral:'珊瑚橙护板',brass:'黄铜件',boost:'加速带',checker:'终点格纹',rubber:'软胶件',lamp:'灯带'};
  course.group.traverse(mesh=>{
    const id=mesh.userData.component;
    if(!id || !mesh.isMesh) return;
    const [prefix,role]=id.split('/');
    const n=Number(prefix.slice(1));
    let zone, label;
    if(prefix==='park'){zone=park;label=mesh.name;}
    else if(prefix==='runway') {
      zone=zones.find(z=>z.piece.name==='runway');label=mesh.name||'绗缝软垫';
    } else if(prefix.startsWith('beacon')) {
      const s=mesh.userData.routeDistance;
      zone=zones.find(({piece:p})=>s>=p.s0 && s<p.s1);label=mesh.name;
    } else if(prefix.startsWith('u')) {
      zone=zones.find(({piece:p})=>n>=p.u0 && n<p.u1);label='支架 · '+(roleNames[role]||role);
    } else {
      const v=stage.visuals[n];
      zone=zones.find(({piece:p})=>n>=p.v0 && n<p.v1);
      label=mesh.name || [shapeNames[v.k]||v.k,roleNames[role]||v.text].filter(Boolean).join(' · ');
    }
    zone ||= extra;
    const original=[].concat(mesh.material);
    const entry={id,mesh,zone,original,label};
    zone.entries.push(entry);meshes.push(mesh);byMesh.set(mesh,entry);
    original.forEach((m,i)=>{
      const value=edits.values[id+'/'+i];
      if(value && (!value.preset || sources[value.preset])) assign(entry,i,editedMaterial(m,value,sources));
    });
  });
  function assign(entry,i,material) {
    if (Array.isArray(entry.mesh.material)) {
      const slots=entry.mesh.material.slice();slots[i]=material;entry.mesh.material=slots;
    } else entry.mesh.material=material;
  }
  if(park.entries.length) zones.push(park);
  if(extra.entries.length) zones.push(extra);
  const groups=zones.filter(z=>z.entries.length);
  groups.forEach((z,i)=>$('zone').add(new Option(z.label,i)));
  $('preset').add(new Option('组件原材质',''));
  const prints=Object.fromEntries(Object.keys(course.prints).map(key=>{
    const v=stage.visuals[Number(key.slice(6))];
    return [key,(v.k==='banner'?'横幅 · ':'路牌 · ')+v.text];
  }));
  for(const [label,finishes] of [['试玩材质',gameFinishes],['星港材质实验台',labFinishes],['木纹材质包',woodFinishes],['本关印刷图案',prints]]){
    const group=document.createElement('optgroup');
    group.label=label;
    for(const [id,name] of Object.entries(finishes)) group.append(new Option(name,id));
    $('preset').append(group);
  }
  const outline=new T.BoxHelper(undefined,0x177c72);
  scene.add(outline);
  let current, slot=0;
  const focus=new T.Vector3();
  const portrait=canvas.clientHeight>canvas.clientWidth;
  let yaw=portrait ? .26 : .82, pitch=portrait ? 1.04 : .72,distance=100,pending=false;

  function draw() {
    if(pending)return;
    pending=true;
    requestAnimationFrame(()=>{
      pending=false;
      const r=distance*Math.cos(pitch);
      camera.position.set(focus.x+r*Math.sin(yaw),focus.y+distance*Math.sin(pitch),focus.z+r*Math.cos(yaw));
      camera.lookAt(focus);
      focusRider(film,focus,1,'ready',true);
      course.illuminate(focus,visibleBeacons);
      // Refresh the scene history for the acrylic lens after each camera or material change.
      film.render(0);
      if(pickable.some(mesh=>[].concat(mesh.material).some(mat=>mat.onBeforeCompile===mats.acrylic.onBeforeCompile))){
        updateAcrylicBackdrop(mats.acrylic,film);
        film.render(0);
      }
    });
  }
  let fittedSection=false;
  function frame(objects) {
    fittedSection=false;
    const bounds=new T.Box3();
    objects.forEach(mesh=>bounds.expandByObject(mesh));
    frameBounds(bounds);
  }
  function frameBounds(bounds) {
    fittedSection=false;
    bounds.getCenter(focus);
    const radius=bounds.getSize(new T.Vector3()).length()/2;
    distance=Math.max(2,radius*1.12/Math.sin(Math.atan(Math.tan(camera.fov*Math.PI/360)*Math.min(1,camera.aspect))));
    draw();
  }
  function refresh() {
    const m=[].concat(current.mesh.material)[slot];
    $('preset').value=edits.values[current.id+'/'+slot]?.preset||'';
    const layers=m.onBeforeCompile===mats['lab-acrylic'].onBeforeCompile ? '清漆高光 · 薄荷色折射与吸收 · 内部流纹（4 次深度采样）' :
      m.onBeforeCompile===mats.acrylic.onBeforeCompile ? '清漆高光 · 球体折射 · 流纹与悬浮气泡（6 次深度采样）' : '';
    $('layer-note').textContent=layers;
    $('layer-note').hidden=!layers;
    $('tint').value='#'+m.color.getHexString();
    for(const [id,prop] of [['rough','roughness'],['metal','metalness']]){
      $(id).disabled=!m.isMeshStandardMaterial;
      $(id).value=m[prop]??0; $(id+'-value').value=m.isMeshStandardMaterial?m[prop].toFixed(2):'—';
    }
    $('revert').disabled=!edits.values[current.id+'/'+slot];
    draw();
  }
  function choose(entry,i=0) {
    if(entry.zone!==current?.zone){
      $('zone').value=groups.indexOf(entry.zone);
      $('part').replaceChildren(...entry.zone.entries.map((e,j)=>new Option((j+1)+' · '+e.label,j)));
    }
    current=entry;slot=i;
    $('part').value=entry.zone.entries.indexOf(entry);
    $('slot').replaceChildren(...entry.original.map((m,j)=>new Option(m.name||'表面 '+(j+1),j)));
    $('slot').value=i;$('slots').hidden=entry.original.length===1;
    outline.setFromObject(entry.mesh);
    refresh();
  }
  let pickable=meshes, visibleBeacons=null;
  function setScope(sectionOnly) {
    pickable=sectionOnly ? current.zone.entries.map(e=>e.mesh) : meshes;
    visibleBeacons=sectionOnly ? new Set(current.zone.entries.filter(e=>e.id.startsWith('beacon')).map(e=>Number(e.id.split('/')[0].slice(6)))) : null;
    for(const mesh of meshes) mesh.visible=!sectionOnly || byMesh.get(mesh).zone===current.zone;
    $('section-view').setAttribute('aria-pressed',String(sectionOnly));
    $('overview').setAttribute('aria-pressed',String(!sectionOnly));
  }
  function fitSection() {
    // Use the playable surface and its obstacles to compose the shot. Support
    // towers extend to the room floor and may continue below the viewport.
    const body=current.zone.entries.filter(e=>!e.id.startsWith('u'));
    const entries=body.length ? body : current.zone.entries;
    const right=new T.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    const back=new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    const up=new T.Vector3().crossVectors(back,right);
    const basis=new T.Matrix4().makeBasis(right,up,back).transpose();
    const tanY=Math.tan(T.MathUtils.degToRad(camera.fov/2))*.94, tanX=tanY*camera.aspect;
    let left=Infinity,rightEdge=-Infinity,bottom=Infinity,top=-Infinity,near=-Infinity,far=Infinity;
    const point=new T.Vector3(),matrix=new T.Matrix4(),instance=new T.Matrix4();
    for(const {mesh} of entries) {
      const positions=mesh.geometry.attributes.position;
      for(let j=0;j<(mesh.isInstancedMesh ? mesh.count : 1);j++) {
        matrix.multiplyMatrices(basis,mesh.matrixWorld);
        if(mesh.isInstancedMesh){mesh.getMatrixAt(j,instance);matrix.multiply(instance);}
        for(let i=0;i<positions.count;i++) {
          point.fromBufferAttribute(positions,i).applyMatrix4(matrix);
          const {x,y,z}=point;
          left=Math.min(left,x-tanX*z);rightEdge=Math.max(rightEdge,x+tanX*z);
          bottom=Math.min(bottom,y-tanY*z);top=Math.max(top,y+tanY*z);
          far=Math.min(far,z);near=Math.max(near,z);
        }
      }
    }
    // Each vertex must fit between both sides of the perspective frustum.
    // Solve for the closest camera position, then center the two intervals.
    const cameraZ=Math.max((rightEdge-left)/(2*tanX),(top-bottom)/(2*tanY),near+camera.near*2);
    const centerZ=(near+far)/2;
    focus.copy(right).multiplyScalar((left+rightEdge)/2)
      .addScaledVector(up,(bottom+top)/2).addScaledVector(back,centerZ);
    distance=cameraZ-centerZ;
    fittedSection=true;
    draw();
  }
  function sectionView(){setScope(true);fitSection();}
  $('zone').onchange=()=>{choose(groups[Number($('zone').value)].entries[0]);sectionView();};
  $('part').onchange=()=>{choose(current.zone.entries[Number($('part').value)]);setScope(true);frame([current.mesh]);};
  $('slot').onchange=()=>{slot=Number($('slot').value);refresh();};
  $('focus-part').onclick=()=>{setScope(true);frame([current.mesh]);};
  $('section-view').onclick=sectionView;
  function overview() {
    setScope(false);
    // The park footprint includes both promenades. Include the starting gate's
    // elevation when framing the taller second course.
    if(park.entries.length){
      const bounds=new T.Box3(new T.Vector3(...stage.bounds.slice(0,3)),new T.Vector3(...stage.bounds.slice(3)));
      park.entries.forEach(({mesh})=>bounds.expandByObject(mesh));
      frameBounds(bounds);
    } else frame(meshes);
  }
  $('overview').onclick=overview;
  function replace(material){
    const previous=[].concat(current.mesh.material)[slot];
    assign(current,slot,material);
    if(previous!==current.original[slot])previous.dispose();
  }
  function save(){
    try{edits.save();$('saved').value='已保存到试玩';}catch{$('saved').value='本机保存失败';}
    refresh();
  }
  function change(resetValues){
    const preset=$('preset').value, original=current.original[slot];
    const source=preset?sources[preset]:original;
    const values={preset,color:resetValues?'#'+source.color.getHexString():$('tint').value,
      roughness:resetValues?source.roughness??0:Number($('rough').value),metalness:resetValues?source.metalness??0:Number($('metal').value)};
    edits.values[current.id+'/'+slot]=values;
    replace(editedMaterial(original,values,sources));
    save();
  }
  $('preset').onchange=()=>change(true);
  for(const id of ['rough','metal','tint']) $(id).oninput=()=>change(false);
  $('revert').onclick=()=>{delete edits.values[current.id+'/'+slot];replace(current.original[slot]);save();};

  function resize(){
    film.resize();if(fittedSection)fitSection();else draw();
  }
  resize();new ResizeObserver(resize).observe(canvas);
  const ray=new T.Raycaster();
  let origin,dragged=false;
  canvas.onpointerdown=e=>{origin=[e.clientX,e.clientY];dragged=false;canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{
    if(!origin)return;
    if(Math.hypot(e.clientX-origin[0],e.clientY-origin[1])>4)dragged=true;
    if(dragged){fittedSection=false;yaw-=e.movementX*.007;pitch=T.MathUtils.clamp(pitch+e.movementY*.006,.05,1.53);draw();}
  };
  canvas.onpointercancel=()=>{origin=null;};
  canvas.onpointerup=e=>{
    if(!origin)return;origin=null;
    if(dragged)return;
    const r=canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(2*(e.clientX-r.left)/r.width-1,1-2*(e.clientY-r.top)/r.height),camera);
    const hit=ray.intersectObjects(pickable,false)[0];
    if(hit){
      const wasOverview=pickable===meshes;
      choose(byMesh.get(hit.object),Array.isArray(hit.object.material)?hit.face.materialIndex:0);
      if(wasOverview)sectionView();
    }
  };
  canvas.onwheel=e=>{e.preventDefault();if(e.deltaY)fittedSection=false;distance=T.MathUtils.clamp(distance*Math.exp(e.deltaY*.001),1,1600);draw();};
  $('reset-environment').onclick=bindEnvironment($('environment'),()=>{applyRoom(scene,sun);draw();});
  choose(groups[0].entries[0]);if(location.hash==='#overview')overview();else sectionView();$('loading').hidden=true;
}
start().catch(error=>{console.error(error);$('loading').value='加载失败，请刷新重试';});
