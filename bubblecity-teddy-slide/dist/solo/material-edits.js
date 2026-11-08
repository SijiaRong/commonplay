import {materialSpecs} from '../vendor/bubbleport-materials.mjs';

export const gameFinishes = {
  road:'象牙涂层', resin:'薄荷树脂', coral:'珊瑚橙清漆', trim:'白蜡木饰条',
  brass:'黄铜', rubber:'软胶', lamp:'琥珀灯', acrylic:'蜜桃气泡亚克力',
  paint:'彩色模塑外壳', boost:'加速箭纹', checker:'终点棋格', emblem:'土星发光徽标',
  beaconBase:'航标灯黄铜底座', beaconAmber:'琥珀航标透镜', beaconJade:'翡翠航标透镜',
  quilt:'绗缝软垫', quiltEdge:'鼠尾草绿包边'
};
export const woodFinishes = {lostOak:'橡木贴皮', lostAsh:'白蜡木', lostStain:'染色白蜡木'};
export const labFinishes = Object.fromEntries(materialSpecs.map(s=>['lab-'+s.id,s.name]));
export const finishes = {...gameFinishes, ...woodFinishes, ...labFinishes};
export function materialEdits(seed, stage) {
  const key = 'bubblecity.level-materials.v1/'+seed+'/'+stage;
  let values = {};
  try {
    const data = JSON.parse(localStorage.getItem(key));
    for (const [id,v] of Object.entries(data || {})) {
      if (v && (v.preset === '' || Object.hasOwn(finishes,v.preset) || /^print-\d+$/.test(v.preset)) &&
        /^#[a-f\d]{6}$/i.test(v.color) && [v.roughness,v.metalness].every(n=>Number.isFinite(n)&&n>=0&&n<=1)) values[id]=v;
    }
  } catch {}
  const prefixes = new Set(Object.keys(values).map(id=>id.split('/')[0]));
  return {values, separate:id=>prefixes.has(id), save:()=>localStorage.setItem(key,JSON.stringify(values))};
}
export function editedMaterial(original, values, mats) {
  const source = values.preset ? mats[values.preset] : original;
  const material = source.clone();
  material.onBeforeCompile = source.onBeforeCompile;
  material.customProgramCacheKey = source.customProgramCacheKey;
  material.side = original.side;
  // An unchanged colour input represents the original tint, including HDR emissive signage.
  if ('#'+source.color.getHexString() !== values.color) material.color.set(values.color);
  if (material.isMeshStandardMaterial) {
    material.roughness = values.roughness;
    material.metalness = values.metalness;
  }
  return material;
}
export function presetSources(course, runway, wood) {
  const sources = {...course.mats, ...course.mats.cityFinishes, ...course.prints};
  if (wood) Object.assign(sources,{lostOak:wood.road, lostAsh:wood.trim, lostStain:wood.paint});
  runway?.traverse(mesh=>{
    for(const mat of [].concat(mesh.material || [])) {
      if(mat.name==='pbr_material') sources.quilt=mat;
      if(mat.name==='Sage fabric edge') sources.quiltEdge=mat;
    }
  });
  return sources;
}
export function applyGameEdits(course, edits, sources=presetSources(course,course.runway)) {
  const restored = [];
  course.group.traverse(mesh=>{
    if (!mesh.userData.component) return;
    const original = mesh.material;
    const slots = [].concat(original).map((mat,i)=>{
      const value = edits.values[mesh.userData.component+'/'+i];
      return value && (!value.preset || sources[value.preset]) ? editedMaterial(mat,value,sources) : mat;
    });
    if (slots.some((m,i)=>m!==[].concat(original)[i])) {
      mesh.material = Array.isArray(original) ? slots : slots[0];
      restored.push(()=>{mesh.material=original;slots.forEach((m,i)=>{if(m!==[].concat(original)[i])m.dispose();});});
    }
  });
  return ()=>restored.forEach(restore=>restore());
}
