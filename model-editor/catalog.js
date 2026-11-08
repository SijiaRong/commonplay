export const modelRoot = '../assets/model-library/';
export const materialRoot = '../assets/material-library/';
const facilities = ['土星地标','摩天轮','苏打咖啡馆','月球天文台','玻璃穹顶馆','弧形商店','终点站','服务机器人','长椅','路灯','花池','遮阳桌','咖啡椅','火箭门架','景观树','广场围栏'];
const versions = {runtime:'运行版',original:'原模',animated:'动画版',desktop:'桌面版',game:'游戏版'};
const groups = {characters:'玩偶与机器人',scenery:'星港设施',obstacles:'星港机关','track-studies':'赛道试模','track-parts':'赛道部件',windport:'风港快递','work-in-progress':'制作中间版','lost-marbles':'经典滑梯'};
async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw Error('读取资源失败 '+res.status);
  return res.json();
}
export async function catalog() {
  const [models, library] = await Promise.all([json(modelRoot+'manifest.json'),json(materialRoot+'manifest.json')]);
  for (const m of models) {
    const parts = m.file.replace(/\.glb$/,'').split('/');
    const leaf = parts.at(-1), parent = parts.at(-2);
    m.group = groups[parts.find(p=>groups[p])] || '其他模型';
    m.name = parts.includes('scenery') ? facilities[Number(leaf.slice(0,2))-1] || leaf : versions[leaf] ? parent : leaf;
    m.version = versions[leaf] || versions[parent] || parent;
    m.id = 'MDL-'+m.sha256.slice(0,8).toUpperCase();
  }
  models.sort((a,b)=>Number(b.file.includes('scenery/runtime'))-Number(a.file.includes('scenery/runtime')) || a.file.localeCompare(b.file));
  const textures = library.items.filter(i=>i.kind==='textures' && !i.file.endsWith('.hdr')).map(i=>({
    id:'TEX-'+i.sha256.slice(0,8).toUpperCase(), name:i.title, url:materialRoot+i.file, thumb:materialRoot+i.thumb
  }));
  const materials = library.items.filter(i=>i.kind==='model-materials').flatMap(item=>
    item.parameters.map((m,index)=>({id:'MAT-'+item.sha256.slice(0,8).toUpperCase()+'-'+(index+1),name:item.title+' / '+(m.name || '槽 '+(index+1)), item,index})));
  return {models,textures,materials};
}
export async function archivedMaterial(loader, {item,index}) {
  const record = await json(materialRoot+item.file);
  const gltf = await loader.parseAsync(JSON.stringify({
    asset:{version:'2.0'}, images:record.images.map(i=>({uri:new URL(materialRoot+i.file,location.href).href})),
    textures:record.textures, samplers:record.samplers, materials:record.materials,
    extensionsUsed:[...new Set(record.materials.flatMap(m=>Object.keys(m.extensions || {})))]
  }), '');
  const material = await gltf.parser.getDependency('material',index);
  for (const t of Object.values(material).filter(t=>t?.isTexture)) {
    const textureIndex=gltf.parser.associations.get(t)?.textures;
    const image=record.images[record.textures[textureIndex]?.source];
    if(image)t.userData.editorTextureId='TEX-'+image.sha256.slice(0,8).toUpperCase();
  }
  return material;
}
