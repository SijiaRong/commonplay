import * as T from 'three';
const materials=new Map();
function material(color){if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.3,metalness:.08,side:T.DoubleSide}));return materials.get(color);}
function mesh(parent,geometry,color,pos){const m=new T.Mesh(geometry,material(color));if(pos)m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export const kit={
 group(){return new T.Group()},
 box(p,pos,size,c){return mesh(p,new T.BoxGeometry(...size),c,pos)},
 sphere(p,pos,r,c){return mesh(p,new T.SphereGeometry(r,24,16),c,pos)},
 cylinder(p,pos,r,h,c){return mesh(p,new T.CylinderGeometry(r,r,h,24),c,pos)},
 beam(p,a,b,r,c){const A=new T.Vector3(...a),B=new T.Vector3(...b),d=B.clone().sub(A);const m=mesh(p,new T.CylinderGeometry(r,r,d.length(),12),c,A.clone().add(B).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return m},
 torus(p,pos,r,t,c,rot=[0,0,0]){const m=mesh(p,new T.TorusGeometry(r,t,12,64),c,pos);m.rotation.set(...rot);return m},
 road(p,points,width,{color='#fff4dd',railColor='#80cdbd',railHeight=1.1,thickness=.65,rails=true,wallHeight=0}={}){
  const edges=points.map((v,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz)||1;const rx=dz/len*width/2,rz=-dx/len*width/2;return [[v[0]-rx,v[1],v[2]-rz],[v[0]+rx,v[1],v[2]+rz]];});
  const vertices=[];const tri=(a,b,c)=>vertices.push(...a,...b,...c),quad=(a,b,c,d)=>{tri(a,b,c);tri(a,c,d)},low=v=>[v[0],v[1]-thickness,v[2]];
  for(let i=0;i<edges.length-1;i++){const [a,b]=edges[i],[c,d]=edges[i+1];quad(a,c,d,b);quad(low(b),low(d),low(c),low(a));quad(a,low(a),low(c),c);quad(b,d,low(d),low(b));}
  for(const e of [edges[0],edges.at(-1)])quad(e[0],e[1],low(e[1]),low(e[0]));
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeVertexNormals();const m=mesh(p,g,color);
  if(wallHeight>0){const wall=[];for(let i=0;i<edges.length-1;i++)for(const side of [0,1]){const a=edges[i][side],b=edges[i+1][side],A=[a[0],a[1]+wallHeight,a[2]],B=[b[0],b[1]+wallHeight,b[2]];wall.push(...a,...b,...A,...A,...b,...B);}const wg=new T.BufferGeometry();wg.setAttribute('position',new T.Float32BufferAttribute(wall,3));wg.computeVertexNormals();mesh(p,wg,railColor);}
  if(rails)for(const side of [0,1]){const path=new T.CatmullRomCurve3(edges.map(e=>new T.Vector3(e[side][0],e[side][1]+railHeight,e[side][2])));mesh(p,new T.TubeGeometry(path,Math.max(16,points.length*2),.22,8,false),railColor);for(let i=0;i<edges.length;i+=Math.max(1,Math.round(points.length/18))){const a=edges[i][side];kit.beam(p,a,[a[0],a[1]+railHeight,a[2]],.10,railColor);}}
  const root=p;root.userData.roads??=[];root.userData.roads.push({points,width});return m;
 }
};
export function label(parent,text,pos,color='#305a59',scale=1){const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');x.fillStyle='#fffcf0';x.beginPath();x.roundRect(4,4,504,120,25);x.fill();x.fillStyle=color;x.font='bold 44px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,256,64);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const s=new T.Sprite(new T.SpriteMaterial({map:tex,depthTest:false}));s.position.set(...pos);s.scale.set(10*scale,2.5*scale,1);parent.add(s);return s;}
