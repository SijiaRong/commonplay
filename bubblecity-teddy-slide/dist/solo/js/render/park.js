import * as T from 'three';
import {GLTFLoader} from '../../../vendor/GLTFLoader.js';

const districts = [
  ['02-ferris-wheel','03-soda-cafe','12-umbrella-table','09-bench'],
  ['01-saturn-landmark','05-glass-dome-pavilion','15-ornamental-tree','14-rocket-gantry'],
  ['05-glass-dome-pavilion','15-ornamental-tree','09-bench','11-planter'],
  ['02-ferris-wheel','06-curved-shop','12-umbrella-table','03-soda-cafe','10-lamp'],
  ['14-rocket-gantry','07-terminal-station','08-service-robot','01-saturn-landmark','10-lamp']
];
const trees = '15-ornamental-tree';
const labels = {
  '01-saturn-landmark':'土星地标','02-ferris-wheel':'摩天轮','03-soda-cafe':'汽水咖啡馆',
  '05-glass-dome-pavilion':'玻璃穹顶馆','06-curved-shop':'弧面商店','07-terminal-station':'星港总站',
  '08-service-robot':'服务机器人','09-bench':'广场长椅','10-lamp':'街灯','11-planter':'花池',
  '12-umbrella-table':'遮阳茶座','14-rocket-gantry':'火箭发射塔','15-ornamental-tree':'观赏树'
};
export async function loadParkModels(stage) {
  const names = new Set([...(districts[stage] || districts.flat()), trees]);
  return new Map(await Promise.all([...names].map(async name=>{
    const url = new URL('../../models/park/'+name+'.glb',import.meta.url);
    try { return [name,(await new GLTFLoader().loadAsync(url.href)).scene]; }
    catch (error) { console.warn('星港景观未加载', name, error); return [name,null]; }
  })));
}

// A softly bevelled, tiled promenade, with raised galleries beside the starting lane.
export function buildPark(view,models) {
  const {stage,group} = view;
  const [xmin,,zmin,xmax,,zmax] = stage.bounds;
  const side = stage.path.x[0] < (xmin+xmax)/2 ? -1 : 1;
  const near = side<0 ? xmin : xmax, far = side<0 ? xmax : xmin;
  const x = near+side*14, across = far-side*12;
  const centerZ = (zmin+zmax)/2, depth = zmax-zmin+16;
  const plaza = stage.killY-1;
  const gallery = stage.path.y[0]-8;
  const material = color=>new T.MeshStandardMaterial({color,roughness:.46});
  const accent=['#8dc3b5','#8dc3b5','#a7c5a0','#e5a994','#86b7c5'][stage.index];
  const mint=material(accent), dark=material('#4e9189'), brass=material('#d5aa70'), ivory=material('#f9e7cc');
  const cv=document.createElement('canvas'); cv.width=cv.height=128;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#dbcebb';ctx.fillRect(0,0,128,128);
  for(let j=0;j<2;j++) for(let i=0;i<2;i++){
    ctx.fillStyle=['#f3e7d4','#eadfcd','#efe2ce','#f7ebdb'][j*2+i];
    ctx.fillRect(i*64+1,j*64+1,62,62);
  }
  const tiles=new T.CanvasTexture(cv);
  tiles.colorSpace=T.SRGBColorSpace;tiles.wrapS=tiles.wrapT=T.RepeatWrapping;tiles.repeat.set(.12,.12);
  view.textures.push(tiles);
  const paving=material('#ffffff');paving.map=tiles;
  function slab(id,label,cx,top,cz,w,h,d,r,mat) {
    const a=w/2,b=d/2,shape=new T.Shape();
    shape.moveTo(-a+r,-b);shape.lineTo(a-r,-b);shape.quadraticCurveTo(a,-b,a,-b+r);
    shape.lineTo(a,b-r);shape.quadraticCurveTo(a,b,a-r,b);shape.lineTo(-a+r,b);
    shape.quadraticCurveTo(-a,b,-a,b-r);shape.lineTo(-a,-b+r);shape.quadraticCurveTo(-a,-b,-a+r,-b);
    const bevel=Math.min(.28,h/4);
    const geo=new T.ExtrudeGeometry(shape,{depth:h-2*bevel,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,curveSegments:5});
    geo.rotateX(-Math.PI/2);
    const mesh=new T.Mesh(geo,mat);mesh.position.set(cx,top-h+bevel,cz);
    mesh.name=label;mesh.userData.component='park/'+id;
    mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  }
  const cx=(x+across)/2,w=Math.abs(x-across)+30;
  slab('skirt','薄荷色围板',cx,plaza-.7,centerZ,w,4,depth,8,dark);
  slab('rim','黄铜包边',cx,plaza-.4,centerZ,w+.4,.35,depth+.4,8,brass);
  slab('plaza','广场铺砖',cx,plaza,centerZ,w,.5,depth,8,paving);
  const length=depth-17;
  const z=t=>centerZ+(t-.5)*length;
  const lower=plaza+Math.min(7,(gallery-plaza)*.3);
  const upper=stage.index===0 ? gallery : plaza+(gallery-plaza)*.65;
  function terrace(id,px,cz,base,top,width,depth,r) {
    slab(id+'-wall','薄荷色台地',px,top-.65,cz,width,top-base-.65,depth,r,mint);
    slab(id+'-lip','黄铜檐口',px,top-.4,cz,width+.45,.32,depth+.45,r,brass);
    slab(id+'-walk','广场步道',px,top,cz,width+.6,.5,depth+.6,r,paving);
  }
  terrace('gallery',x,centerZ,plaza,lower,25,length,7);
  terrace('court',x,z(.29),lower,lower+4,23,length*.34,6);
  terrace('landmark',x,z(.68),lower,upper,22,length*.28,6);
  // Keep the final plaza alongside the finish bowl as its position changes with the seed.
  const finishZ=stage.finish.c[2];
  const gardenZ=stage.index===4 ? T.MathUtils.clamp(finishZ,z(.33),z(.67)) : z(.55);
  const garden=t=>gardenZ+(t-.55)*length;
  terrace('garden',across,gardenZ,plaza,plaza+1.4,20,length*.60,6);

  // Use the original bearing points, narrowing piers at banks and switchbacks.
  stage.supports.forEach((s,i)=>{
    const width=Math.max(2.4,s.hw*1.45),depth=Math.min(width,8);
    let top=s.y;
    for(let j=0;j<stage.path.n;j++){
      if(Math.hypot(s.x-stage.path.x[j],s.z-stage.path.z[j]) < width/2+stage.path.hw[j])
        top=Math.min(top,stage.path.y[j]-1.1);
    }
    if(top<=plaza+1)return;
    slab('pier-'+i,'台地承台',s.x,top-.55,s.z,width,top-plaza-.55,depth,Math.min(depth/3,2.5),mint);
    slab('capital-'+i,'象牙色压顶',s.x,top,s.z,width+.5,.55,depth+.5,Math.min(depth/3,2.5),ivory);
  });

  const district=districts[stage.index];
  function prop(name,id,px,py,pz,width,height,angle) {
    const obj=models?.get(name)?.clone();
    if(!obj)return;
    obj.rotation.y=angle;
    const box=new T.Box3().setFromObject(obj,true),size=box.getSize(new T.Vector3());
    const scale=Math.min(width/Math.max(size.x,size.z),height/size.y);
    obj.scale.multiplyScalar(scale);
    box.setFromObject(obj,true);
    const center=box.getCenter(new T.Vector3());
    obj.position.add(new T.Vector3(px-center.x,py-box.min.y,pz-center.z));
    let part=0;
    obj.traverse(m=>{if(m.isMesh){
      m.name=labels[name];m.userData.sharedParkAsset=true;
      m.userData.component='park/'+id+'-'+part++;m.castShadow=m.receiveShadow=true;
    }});
    group.add(obj);
  }
  prop(district[0],'landmark-model',x,upper,z(.68),22,31,.75);
  prop(district[1],'shop',x,lower+4,z(.26),18,20,-side*.8);
  prop(district[2],'terrace-detail',x,lower+4,z(.40),7,10,side*.4);
  prop(district[3],'garden-model',across,plaza+1.4,garden(.57),[6,18,9,16,18][stage.index],25,.7);
  if(stage.index===0){
    for(const [i,t] of [.39,.46,.64].entries())
      prop(district[2],'tea-table-'+i,across,plaza+1.4,garden(t),7,9,i);
  }
  if(stage.index===2){
    for(const [i,t] of [.37,.46,.65].entries()){
      prop('11-planter','flower-bed-'+i,across-side*4,plaza+1.4,garden(t),6,4,i*.4);
      prop('09-bench','garden-seat-'+i,across+side*5,plaza+1.4,garden(t),5,3,-side*Math.PI/2);
    }
  }
  if(stage.index>=3){
    for(const [i,t] of [.32,.46,.66,.78].entries())
      prop('10-lamp','promenade-light-'+i,across+side*7,plaza+1.4,garden(t),3,8,0);
    if(stage.index===3)
      for(const [i,t] of [.39,.47,.65].entries())
        prop('12-umbrella-table','cafe-table-'+i,across,plaza+1.4,garden(t),7,8,i);
    if(stage.index===4)
      for(const [i,t] of [.43,.69].entries())
        prop('08-service-robot','arrival-guide-'+i,across,plaza+1.4,garden(t),4,6,-side*.7);
  }
  for(const [i,t] of [.07,.50,.91].entries())
    prop(trees,'upper-tree-'+i,x+side*3,lower,z(t),7,11,i);
  for(const [i,t] of [.30,.73,.80].entries())
    prop(trees,'garden-tree-'+i,across,plaza+1.4,garden(t),8,14,i+.8);
}
