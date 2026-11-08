// Original fixed-step sphere controller and analytic obstacle contacts; no borrowed game physics.
import {V,RADIUS,hammerPose} from './course.mjs';const {add,sub,mul,dot,cross,len,norm}=V;const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function closestTriangle(p,a,b,c){const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return a;const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return add(a,mul(ab,d1/(d1-d3)));const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return add(a,mul(ac,d2/(d2-d6)));const va=d3*d6-d5*d4;if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0)return add(b,mul(sub(c,b),(d4-d3)/((d4-d3)+(d5-d6))));const denom=1/(va+vb+vc);return add(a,add(mul(ab,vb*denom),mul(ac,vc*denom)));}
function closestSegment(p,a,b){const d=sub(b,a);return add(a,mul(d,clamp(dot(sub(p,a),d)/(dot(d,d)||1),0,1)));}
export function spawn(course){return {p:[...course.start],v:[0,0,0],normal:[0,1,0],forward:[0,0,1],grounded:false,time:0,boostUntil:0,jumpLatch:false,finished:false,hits:0,falls:0,lastHit:-10,contacts:0,loopSeen:false};}
function obstacle(s,a,b,r,velocity=[0,0,0]){const q=closestSegment(s.p,a,b),d=sub(s.p,q),distance=len(d),limit=RADIUS+r;if(distance>=limit)return false;const n=distance>1e-6?mul(d,1/distance):[1,0,0];s.p=add(s.p,mul(n,limit-distance+.001));const rel=dot(sub(s.v,velocity),n);if(rel<0)s.v=sub(s.v,mul(n,1.35*rel));if(s.time-s.lastHit>.35){s.hits++;s.lastHit=s.time;}return true;}
// Optional magnetic guide on the inverted loop only. It follows the SAME road samples,
// integrates gravity along the tangent, and releases on jump or at the exit.
function guideStep(s,course,input,dt){
 const road=course.roads.find(r=>r.loop),g=s.loopGuide,ss=road.samples;
 let i=1;while(i<ss.length-1&&ss[i].arc<g.arc)i++;const a=ss[i-1],b=ss[i],t=clamp((g.arc-a.arc)/(b.arc-a.arc),0,1),blend=(k)=>norm(add(mul(a[k],1-t),mul(b[k],t))),f=blend('forward'),up=blend('up'),right=blend('right');
 g.speed=clamp(g.speed+((input.forward||0)*16-24*f[1]-.015*g.speed)*dt,6,44);
 g.sideVelocity=(g.sideVelocity||0)+(input.steer||0)*20*dt;g.sideVelocity*=Math.exp(-3.5*dt);g.side=clamp(g.side+g.sideVelocity*dt,-road.width/2+RADIUS,road.width/2-RADIUS);
 const point=add(mul(a.p,1-t),mul(b.p,t));s.p=add(add(point,mul(up,RADIUS+.002)),mul(right,g.side));s.v=add(mul(f,g.speed),mul(right,g.sideVelocity));s.normal=up;s.forward=f;s.grounded=true;s.loopSeen=true;
 g.arc+=g.speed*dt;
 if((input.jump&&!s.jumpLatch)||g.arc>=road.length){s.loopGuide=null;if(input.jump){s.v=add(s.v,mul(up,8.4));s.grounded=false;}else {const end=ss.at(-1);s.p=add(add(end.p,mul(end.up,RADIUS+.002)),mul(end.right,g.side));s.v=mul(end.forward,18);s.boostUntil=s.time;s.normal=end.up;s.forward=end.forward;}}
 s.jumpLatch=!!input.jump;
}
export function step(s,course,input,dt){if(s.finished)return;s.time+=dt;if(s.loopGuide){guideStep(s,course,input,dt);return;}
 const wasGrounded=s.grounded,up=wasGrounded?s.normal:[0,1,0],f=wasGrounded?s.forward:[0,0,1],right=norm(cross(up,f));
 const forward=(input.forward||0),steer=input.steer||0;
 s.v=add(s.v,mul(f,forward*(wasGrounded?25:4)*dt));s.v=add(s.v,mul(right,steer*(wasGrounded?29:9)*dt));
 if(wasGrounded){const lateral=dot(s.v,right);s.v=sub(s.v,mul(right,lateral*(1-Math.exp(-2.5*dt))));if(!forward)s.v=sub(s.v,mul(f,dot(s.v,f)*(1-Math.exp(-.65*dt))));const cap=s.time<s.boostUntil?44:19;const speed=dot(s.v,f);if(speed>cap)s.v=sub(s.v,mul(f,speed-cap));if(speed< -8)s.v=sub(s.v,mul(f,speed+8));}
 if(input.jump&&!s.jumpLatch&&wasGrounded){s.v=add(s.v,mul(up,8.4));s.p=add(s.p,mul(up,.06));}s.jumpLatch=!!input.jump;
 s.v[1]-=24*dt;const maxSpeed=48;if(len(s.v)>maxSpeed)s.v=mul(norm(s.v),maxSpeed);s.p=add(s.p,mul(s.v,dt));s.grounded=false;s.contacts=0;
 const nearby=course.near(s.p);
 for(let iteration=0;iteration<2;iteration++)for(const tri of nearby){if(s.p[1]<tri.min[1]-RADIUS-.1||s.p[1]>tri.max[1]+RADIUS+.1)continue;const q=closestTriangle(s.p,tri.a,tri.b,tri.c),delta=sub(s.p,q),distance=len(delta);if(distance>RADIUS+.003)continue;const signed=dot(delta,tri.normal);if(tri.role!=='rail'&&signed<-.13)continue;let n=distance>1e-5?mul(delta,1/distance):tri.normal;if(tri.role!=='rail'&&signed<0)n=tri.normal;if(distance<RADIUS)s.p=add(s.p,mul(n,RADIUS-distance+.0001));const vn=dot(s.v,n);if(vn<0)s.v=sub(s.v,mul(n,vn));if(tri.role!=='rail'){s.grounded=true;s.normal=tri.normal;s.forward=tri.tangent;s.contacts++;if(tri.role==='loop')s.loopSeen=true;}}
 for(const b of course.bumpers){const a=add(b.center,[-b.half,0,0]),z=add(b.center,[b.half,0,0]);obstacle(s,a,z,b.radius);}
 for(const h of course.hammers){const p=hammerPose(h,s.time);obstacle(s,p.head,p.head,h.radius,p.velocity);obstacle(s,h.pivot,p.head,.18,p.velocity);}
 for(const b of course.boosts)if(s.p[2]>=b.z0&&s.p[2]<=b.z1&&Math.abs(s.p[0]-b.x)<b.half&&s.grounded){s.v=[0,0,Math.max(s.v[2],b.speed)];s.boostUntil=s.time+4;}
 if(s.grounded&&s.loopSeen&&!s.loopGuide&&course.kind==='loop'&&s.normal[1]<.98){
 const road=course.roads.find(r=>r.loop);let best=null,dist=Infinity;
 for(const p of road.samples){const d=len(sub(s.p,add(p.p,mul(p.up,RADIUS))));if(d<dist){dist=d;best=p;}}
 if(best&&dist<road.width/2+.8&&best.arc<road.length-1){s.loopGuide={arc:best.arc,side:clamp(dot(sub(s.p,best.p),best.right),-road.width/2+RADIUS,road.width/2-RADIUS),speed:Math.max(22,dot(s.v,best.forward)),sideVelocity:0};}
 }
 if(s.p[2]>course.finishZ&&Math.abs(s.p[0])<course.width/2&&s.p[1]<7&&s.p[1]>2)s.finished=true;
 if(s.p[1]<-6||Math.abs(s.p[0])>50||s.p[2]<course.start[2]-12||s.p[2]>50){const falls=s.falls+1,time=s.time,hits=s.hits;Object.assign(s,spawn(course),{falls,time,hits});}
}
