// Validate exported, uncompressed game GLBs before enabling character selection.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const file=process.argv[2];
assert(file,'Usage: node tools/check-character-glb.cjs model.glb [--animated]');
const bytes=fs.readFileSync(file);
assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
let json,bin;
for(let at=12;at<bytes.length;){const length=bytes.readUInt32LE(at),type=bytes.readUInt32LE(at+4),data=bytes.subarray(at+8,at+8+length);assert.equal(data.length,length);if(type===0x4e4f534a)json=JSON.parse(data.toString());if(type===0x004e4942)bin=data;at+=8+length}
assert(json&&bin,'GLB must embed its buffers');
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const types={5120:[1,'readInt8'],5121:[1,'readUInt8'],5122:[2,'readInt16LE'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
function accessor(index){
 const a=json.accessors[index],view=json.bufferViews[a.bufferView];assert(a&&!a.sparse&&view,'Expected dense accessor');
 const [size,read]=types[a.componentType],width=widths[a.type],stride=view.byteStride||size*width;
 const start=(view.byteOffset||0)+(a.byteOffset||0);assert(start+(a.count-1)*stride+size*width<=Math.min(bin.length,(view.byteOffset||0)+view.byteLength));
 const values=[];
 for(let i=0;i<a.count;i++)for(let k=0;k<width;k++){let value=bin[read](start+i*stride+k*size);assert(Number.isFinite(value),'Non-finite accessor '+index);if(a.normalized)value/=a.componentType===5121?255:65535;values.push(value)}
 return {values,width,count:a.count};
}
let triangles=0,vertices=0;
for(const mesh of json.meshes){for(const p of mesh.primitives){
 assert.equal(p.mode??4,4,'Expected triangles');const pos=accessor(p.attributes.POSITION);assert(pos.count>0);vertices+=pos.count;
 assert(p.attributes.TEXCOORD_0!==undefined,'Missing UVs');accessor(p.attributes.TEXCOORD_0);assert(p.material!==undefined,'Missing material');
 assert(p.attributes.NORMAL!==undefined,'Missing normals');accessor(p.attributes.NORMAL);
 const indices=p.indices===undefined?null:accessor(p.indices);if(indices)assert(indices.values.every(v=>v>=0&&v<pos.count),'Index outside mesh');triangles+=(indices?.count||pos.count)/3;
 if(p.attributes.WEIGHTS_0!==undefined){const weights=accessor(p.attributes.WEIGHTS_0);const joints=accessor(p.attributes.JOINTS_0);assert.equal(weights.width,4);assert.equal(joints.width,4);for(let i=0;i<weights.count;i++){const ws=weights.values.slice(i*4,i*4+4);assert(ws.every(w=>w>=0&&w<=1.0001));assert(Math.abs(ws.reduce((a,b)=>a+b,0)-1)<.015,'Invalid skin weights')}}
}}
assert(triangles>0&&triangles<=30000,'Unexpected triangle budget: '+triangles);
assert(json.images?.length,'No embedded textures');
for(const image of json.images){assert(image.bufferView!==undefined&&!image.uri,'Texture must be embedded');const view=json.bufferViews[image.bufferView];assert(view.byteLength>0&&(view.byteOffset||0)+view.byteLength<=bin.length)}
const animations=[];
for(const animation of json.animations||[]){let duration=0;for(const sampler of animation.samplers){const time=accessor(sampler.input);accessor(sampler.output);assert(time.values.every((t,i)=>t>=0&&(!i||t>=time.values[i-1])),'Invalid animation times');duration=Math.max(duration,...time.values)}assert(duration>0);animations.push({name:animation.name,duration})}
if(process.argv.includes('--animated')){
 const names=animations.map(a=>a.name);for(const name of ['Idle','Run','Jump','Slide','SlideLeft','SlideRight','SitDown','StandUp','FinishWave'])assert(names.includes(name),'Missing action '+name);
 assert(json.skins?.length,'Missing skin');for(const skin of json.skins)assert(skin.joints.length>0&&skin.joints.every(j=>json.nodes[j]));
}
console.log(JSON.stringify({file,bytes:bytes.length,triangles,vertices,meshes:json.meshes.length,textures:json.images.length,animations,passed:true},null,2));
