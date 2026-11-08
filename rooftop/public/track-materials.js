import * as T from '/lib/three.module.js';

// Local low-poly finishes. Patterns are generated in memory and require no external images.
function pattern(checker) {
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=checker?'#203a42':'#d86a39';
  ctx.fillRect(0,0,64,64);
  ctx.fillStyle='#fff2ce';
  if(checker){ctx.fillRect(0,0,32,32);ctx.fillRect(32,32,32,32);}
  else {ctx.beginPath();ctx.moveTo(14,8);ctx.lineTo(45,32);ctx.lineTo(14,56);ctx.lineWidth=10;ctx.strokeStyle='#fff2ce';ctx.stroke();}
  const texture=new T.CanvasTexture(canvas);
  texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.colorSpace=T.SRGBColorSpace;
  return texture;
}
const matte=color=>new T.MeshStandardMaterial({color,vertexColors:true,roughness:.86});
const materials={
  paint:matte(0xffffff),wood:matte(0xdcb48b),ash:matte(0xf1d9b2),rubber:matte(0xd5dade),
  checker:new T.MeshStandardMaterial({map:pattern(true)}),boost:new T.MeshStandardMaterial({map:pattern(false)})
};
export function getMaterials(){return materials;}
export function materialKey(key){return key==='plank'?'wood':Object.hasOwn(materials,key)?key:'paint';}
