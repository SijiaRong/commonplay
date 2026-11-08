import * as T from 'three';
export const materialSpecs=[
 {id:'road',name:'象牙路面',en:'IVORY DECK',color:'#f4e8d1',desc:'抛光象牙树脂与平滑清漆，长条灯箱反射可辨。微纹理减弱，保持亮面而非提高曝光。',use:'主路面、滑梯底面、平台',params:{roughness:.16,metalness:0,clearcoat:1,clearcoatRoughness:.065}},
 {id:'mint',name:'薄荷树脂',en:'MOLDED RESIN',color:'#8dc7ad',desc:'有厚度的模塑树脂，表面柔和反光，边缘保留一层清漆高光。',use:'护栏、导轨外壳、桥墩',params:{roughness:.29,metalness:0,clearcoat:.48,clearcoatRoughness:.22}},
 {id:'peach',name:'蜜桃软胶',en:'SOFT VINYL',color:'#eca18a',desc:'乳浊蜜桃软胶：柔和表面高光与受控背光散射。软垫演示受压与回弹；可分别关闭散射与形变。',use:'柱套、胶囊软垫、锤头包覆',params:{roughness:.39,metalness:0,clearcoat:.025,clearcoatRoughness:.38,specularIntensity:.4,ior:1.43}},
 {id:'brass',name:'香槟黄铜',en:'CHAMPAGNE BRASS',color:'#d1ac68',desc:'暖色导体反射，明暗会随环境与视角变化。细微拉丝沿表面展开。',use:'转轴、螺帽、灯座、接头',params:{roughness:.26,metalness:1,clearcoat:.08,clearcoatRoughness:.25}},
 {id:'silver',name:'拉丝铝',en:'BRUSHED ALUMINUM',color:'#c3cfce',desc:'中性的金属反射和较宽亮带，用于与黄铜及树脂直接比较。拉丝通过粗糙度和微弱凹凸表现。',use:'滑轨、活动杆、内侧衬板',params:{roughness:.34,metalness:1,clearcoat:0,clearcoatRoughness:.3}},
 {id:'acrylic',name:'薄荷亚克力',en:'TINTED ACRYLIC',color:'#d0efdf',desc:'有厚度的透色材料，利用透射、折射和吸收产生边缘色。底部与背后底纹用于检查透光。',use:'透明槽壁、灯罩、观测窗',params:{roughness:.09,metalness:0,clearcoat:1,clearcoatRoughness:.1,transmission:.94,thickness:.7,ior:1.46,attenuationColor:'#4d9f89',attenuationDistance:7}},
 {id:'amber',name:'暖琥珀灯',en:'AMBER EMITTER',color:'#ffe3a1',desc:'暖色灯芯负责自发光；点光源负责照亮邻近表面；Bloom 负责镜头里的光晕。三层可单独检查。',use:'路灯、门架灯、栏边灯带',params:{roughness:.22,metalness:0,clearcoat:.2,emissive:'#ffbb52',emissiveIntensity:4}},
 {id:'signal',name:'青绿指示灯',en:'MINT SIGNAL',color:'#bcf9e0',desc:'偏青的透亮指示色，与暖琥珀灯区分状态。发光强度保持局部，避免把薄荷壳体照成白色。',use:'门洞状态灯、路线引导灯',params:{roughness:.18,metalness:0,clearcoat:.3,emissive:'#65efc6',emissiveIntensity:3.2}}
];
function texture(kind){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d'),data=x.createImageData(256,256);let seed=613;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};const rows=Array.from({length:256},()=>rand());for(let y=0;y<256;y++)for(let z=0;z<256;z++){const v=kind==='brushed'?125+rows[y]*55+rand()*12:140+rand()*28;const i=(y*256+z)*4;data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255;}x.putImageData(data,0,0);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(kind==='brushed'?1:4,kind==='brushed'?2:4);return t;}
export function createBubbleportMaterials(){const noise=texture('grain'),brush=texture('brushed'),mats={};for(const s of materialSpecs){const m=new T.MeshPhysicalMaterial({color:s.color,...s.params});if(s.id==='road'){m.bumpMap=noise;m.bumpScale=.0012;}if(['brass','silver'].includes(s.id)){m.roughnessMap=brush;m.bumpMap=brush;m.bumpScale=.003;}if(s.id==='peach')applySoftScattering(m);m.name=s.name;mats[s.id]=m;}return mats;}

// Original PBR extension inspired by the Three.js/GDC 2011 inexpensive
// translucency example. This is a single-surface lighting approximation,
// NOT measured thickness or a volumetric/multiple-scattering simulation.
export function applySoftScattering(material){
 const strength={value:.32};material.userData.softScattering=strength;
 material.onBeforeCompile=shader=>{
  shader.uniforms.softScatterStrength=strength;
  shader.fragmentShader='uniform float softScatterStrength;\n'+shader.fragmentShader;
  const hook='RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const addition=`
  {
   vec3 softHalf = normalize(directLight.direction + geometryNormal * 0.28);
   float softBack = pow(saturate(dot(geometryViewDir, -softHalf)), 3.0);
   float softEdge = pow(1.0-saturate(dot(geometryNormal,geometryViewDir)), 1.5);
   reflectedLight.directDiffuse += material.diffuseColor * directLight.color * softScatterStrength * (softBack * 0.65 + softEdge * 0.035) * RECIPROCAL_PI;
  }
  `;
  const block=T.ShaderChunk.lights_fragment_begin.split(hook).join(hook+'\n'+addition);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',block);
 };
 material.customProgramCacheKey=()=> 'bubbleport-soft-scatter-v2';return material;
}
