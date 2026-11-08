// Original parametric roads. Render meshes and collisions consume the same vertices.
export const RADIUS=.65, FLOOR=5.2;
export const V={add:(a,b)=>a.map((v,i)=>v+b[i]),sub:(a,b)=>a.map((v,i)=>v-b[i]),mul:(a,k)=>a.map(v=>v*k),dot:(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len:a=>Math.hypot(...a),norm:a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n)}};
const {add,sub,mul,cross,norm,dot}=V;
export function makeCourse(kind='slalom',width=19.2){
 const c={kind,width,roads:[],triangles:[],bumpers:[],hammers:[],boosts:[],start:[0,FLOOR+RADIUS+.04,-23],finishZ:23,length:48};
 function triangle(a,b,d,tangent,role){let normal=norm(cross(sub(b,a),sub(d,a)));c.triangles.push({a,b,c:d,normal,tangent,role,min:a.map((n,i)=>Math.min(n,b[i],d[i])),max:a.map((n,i)=>Math.max(n,b[i],d[i]))});}
 function road(name,curve,n,w,loop=false,open=false){const samples=[];for(let i=0;i<=n;i++){const t=i/n,p=curve(t),p0=curve(Math.max(0,t-.0001)),p1=curve(Math.min(1,t+.0001)),forward=norm(sub(p1,p0));let up=loop?[0,Math.cos(t*Math.PI*2),-Math.sin(t*Math.PI*2)]:[0,1,0];up=norm(sub(up,mul(forward,dot(up,forward))));const right=norm(cross(up,forward));samples.push({p,up,right,forward,width:typeof w==='function'?w(t):w});}
 const top=[],rails=[];for(let i=0;i<n;i++){const a=samples[i],b=samples[i+1],L=add(a.p,mul(a.right,-a.width/2)),R=add(a.p,mul(a.right,a.width/2)),l=add(b.p,mul(b.right,-b.width/2)),r=add(b.p,mul(b.right,b.width/2));top.push([L,l,R],[R,l,r]);triangle(L,l,R,a.forward,loop?'loop':'floor');triangle(R,l,r,b.forward,loop?'loop':'floor');
 for(const side of (open?[]:[-1,1])){const A=add(a.p,mul(a.right,side*(a.width/2+.12))),B=add(b.p,mul(b.right,side*(b.width/2+.12))),AA=add(A,mul(a.up,1.1)),BB=add(B,mul(b.up,1.1));rails.push([A,B,AA],[AA,B,BB]);triangle(A,B,AA,a.forward,'rail');triangle(AA,B,BB,b.forward,'rail');}}
 let arc=0;for(let i=0;i<samples.length;i++){if(i)arc+=V.len(V.sub(samples[i].p,samples[i-1].p));samples[i].arc=arc;}c.roads.push({name,samples,width:typeof w==='function'?Math.max(...samples.map(s=>s.width)):w,top,rails,loop,length:arc});return samples;}
 const straight=(name,x,z0,z1,w=width)=>road(name,t=>[x,FLOOR,z0+(z1-z0)*t],Math.ceil(Math.abs(z1-z0)/1.3),w);
 if(kind!=='loop'){
 straight('deck',0,-25,25);
 if(kind==='slalom')for(let i=0;i<6;i++)c.bumpers.push({center:[(i%2?1:-1)*2.0,FLOOR+.8,-14+i*5.6],half:1.8,radius:.8});
 if(kind==='hammers')for(let i=0;i<2;i++)c.hammers.push({pivot:[0,FLOOR+7.2,-7+i*16],length:6,radius:1.35,phase:i*Math.PI*.8,speed:1.65,amplitude:.95});
 }else{
 c.start=[0,FLOOR+RADIUS+.04,-31];c.finishZ=32;c.length=66;const branch=width*.38,x=-width*.25,shift=branch+4;
 straight('approach',0,-33,-23);
 road('funnel-approach',t=>[0,FLOOR,-23+8*t],12,t=>width+(width*.5+branch-width)*t);straight('exit',0,26,34);
 straight('inrun',x,-15,-6,branch);
 c.boosts.push({x,half:branch/2,z0:-17,z1:-7,speed:34});
 road('orbit',t=>{const a=t*Math.PI*2;return [x-shift*(a-Math.sin(a))/(Math.PI*2),FLOOR+6*(1-Math.cos(a)),-6+6*Math.sin(a)]},200,branch,true);
 const returning=t=>{const s=t*t*(3-2*t);return [(x-shift)*(1-s),FLOOR,-6+32*t]};
 road('return',t=>returning(t*.75),34,branch);road('return-merge',t=>returning(.75+t*.25),12,branch,false,true);
 straight('bypass',width*.25,-15,18,branch);
 road('merge',t=>[width*.25*(1-t*t*(3-2*t)),FLOOR,18+8*t],12,branch,false,true);
 }
 // Spatial hash: curved roads remain real surfaces, including inverted loop sections.
 c.grid=new Map();const cell=4;
 c.triangles.forEach((t,i)=>{for(let x=Math.floor(t.min[0]/cell);x<=Math.floor(t.max[0]/cell);x++)for(let z=Math.floor(t.min[2]/cell);z<=Math.floor(t.max[2]/cell);z++){const k=x+','+z;if(!c.grid.has(k))c.grid.set(k,[]);c.grid.get(k).push(i);}});
 c.near=p=>{const ids=new Set();for(let x=Math.floor((p[0]-RADIUS)/cell);x<=Math.floor((p[0]+RADIUS)/cell);x++)for(let z=Math.floor((p[2]-RADIUS)/cell);z<=Math.floor((p[2]+RADIUS)/cell);z++)for(const id of c.grid.get(x+','+z)||[])ids.add(id);return [...ids].map(i=>c.triangles[i]);};
 return c;
}
export function hammerPose(h,time){const a=h.amplitude*Math.sin(time*h.speed+h.phase),w=h.amplitude*h.speed*Math.cos(time*h.speed+h.phase);return {angle:a,head:add(h.pivot,[h.length*Math.sin(a),-h.length*Math.cos(a),0]),velocity:[h.length*Math.cos(a)*w,h.length*Math.sin(a)*w,0]};}
