// Original Bubbleport design study; no Lost Marbles mesh or generator is used.
export const meta = {
  id: 'flat',
  name: '苏打验票廊',
  tagline: '绕过气泡罐，再读灯穿过交替升降的验票门。',
  reference: 'Lost Marbles · pegs / bumperField / gates：将绕行与择时拆成两拍教学。',
  dimensions: '72 × 19.2；全程平地；入口/出口路面 Y=12',
  beats: ['0–8：整队与读图', '12–28：两只错位气泡罐，学习换线', '34–54：两组反相验票门，择时直穿或走侧廊', '58–72：出口收束与缓冲'],
  controls: ['主路：左右换线 + 看灯择时', '安全路：两侧 3.8 宽连续绕行廊', '目标耗时：12–18 秒，尚未实测']
};

export function build(k, {previewScenery = true} = {}) {
  const g = k.group();
  g.userData.animations = [];
  const C = { ivory:'#fff2dc', mint:'#76caba', deep:'#3c827e', peach:'#f5aa92', gold:'#dcb56c', glass:'#b7e3dc', pink:'#df7d85' };
  k.road(g, [[0,12,0],[0,12,72]], 19.2, {color:C.ivory,railColor:C.mint,railHeight:1.15,thickness:.72});

  // Separate structural legs leave the walking surface completely flat.
  for (const z of [5,21,37,53,67]) for (const x of [-7.8,7.8]) {
    k.cylinder(g,[x,5.5,z],.7,11,C.mint);
    k.cylinder(g,[x,.3,z],1.25,.6,C.ivory);
    k.torus(g,[x,10,z],.74,.12,C.gold,[Math.PI/2,0,0]);
  }
  // Uninterrupted turquoise edge marks distinguish the safe bypass lanes.
  for (const x of [-5.8,5.8]) k.box(g,[x,12.035,43.5],[.13,.035,27],C.mint);
  for (const z of [5,9,29,33,57,62,67]) {
    k.box(g,[0,12.045,z],[.17,.04,1.1],C.deep);
    k.beam(g,[0,12.065,z+.6],[-.55,12.065,z],.065,C.deep);
    k.beam(g,[0,12.065,z+.6],[.55,12.065,z],.065,C.deep);
  }
  // Teaching pair: broad rounded soda can bumpers, a clear S-shaped route.
  for (const [x,z] of [[-2.8,16],[2.8,24]]) {
    k.cylinder(g,[x,13.2,z],1.65,2.4,C.peach);
    k.sphere(g,[x,14.4,z],1.65,C.peach);
    k.torus(g,[x,12.28,z],1.7,.15,C.gold,[Math.PI/2,0,0]);
    k.torus(g,[x,14.15,z],1.69,.11,C.ivory,[Math.PI/2,0,0]);
    k.sphere(g,[x-.45,14.9,z+.7],.32,C.ivory);
    k.sphere(g,[x+.5,15.2,z-.4],.2,C.ivory);
    // Soft graphic circles read as soda machinery, rather than industrial bollards.
    k.cylinder(g,[x,15.65,z],.44,.17,C.mint);
  }

  for (let row=0; row<2; row++) {
    const z=40+row*10;
    // Portal frame is supported OUTSIDE the road; headroom is over 7 units.
    for (const x of [-10.3,10.3]) {
      k.cylinder(g,[x,15.8,z],.48,7.6,C.mint);
      k.sphere(g,[x,19.65,z],.65,C.ivory);
    }
    k.beam(g,[-10.3,19.6,z],[10.3,19.6,z],.4,C.mint);
    k.box(g,[0,20.35,z],[3.5,.95,.6],C.peach);
    for(const x of [-.8,0,.8]) k.sphere(g,[x,20.4,z-.38],.17,C.ivory);
    for (let lane=0; lane<2; lane++) {
      const x=lane===0?-3.1:3.1;
      const shutter=k.group(); shutter.position.y=12; g.add(shutter);
      k.box(shutter,[x,1.4,z],[5.2,2.8,.7],lane===0?C.peach:C.glass);
      for(const dx of [-1.7,0,1.7]) k.box(shutter,[x+dx,1.4,z-.365],[.18,1.9,.045],C.ivory);
      k.box(shutter,[x,.14,z],[5.3,.28,.85],C.gold);
      const lamp=k.sphere(g,[x,18.6,z-.1],.38,C.mint);
      lamp.material=lamp.material.clone();
      // 6s cycle: hold shut 2s, raise 1s, hold open 2s, lower 1s.
      // Opposite lanes/rows have a 3s phase offset. Design preview only.
      const phase=(lane+row)%2*3;
      g.userData.animations.push(t=>{
        const p=((t+phase)%6+6)%6;
        const lift=p<2?0:p<3?(p-2)*4.8:p<5?4.8:(6-p)*4.8;
        shutter.position.y=12+lift;
        if (lamp.material?.color) {
          lamp.material.color.set(lift >= 4.7 ? C.mint : C.pink);
          lamp.material.emissive?.copy(lamp.material.color);
        }
      });
      // A flush floor rectangle communicates each gate's swept footprint.
      k.box(g,[x,12.035,z],[5.2,.035,1.25],C.peach);
    }
  }
  // Raised numbered bubbles remain outside the usable deck envelope.
  for (const [z,n] of [[16,1],[40,2],[50,3]]) {
    k.cylinder(g,[-11.7,13.5,z],.2,3,C.gold);
    k.sphere(g,[-11.7,15.4,z],.9,C.mint);
    for(let j=0;j<n;j++) k.sphere(g,[-12.05+j*.35,15.4,z-.83],.12,C.ivory);
  }
  if (previewScenery) {
    // A small soda kiosk and orbital sign make the segment recognisably Bubbleport.
    k.box(g,[15,9.3,23],[6,7.2,8],C.ivory);
    k.box(g,[15,13.1,23],[6.7,.6,8.6],C.peach);
    k.box(g,[11.94,10.4,23],[.1,2.3,4.5],C.mint);
    for(const z of [21.5,24.5]) k.sphere(g,[11.78,10.45,z],.45,C.gold);
    k.cylinder(g,[15,14.2,23],1.15,1.6,C.mint);
    k.sphere(g,[15,15.1,23],1.15,C.glass);
    k.beam(g,[15.4,15.8,23],[16.2,17.8,23],.13,C.peach);
    k.sphere(g,[-14,17,53],2.1,C.peach);
    k.torus(g,[-14,17,53],3,.24,C.gold,[Math.PI/2-.3,.25,0]);
    k.beam(g,[-14,3,53],[-14,14.9,53],.28,C.mint);
    // Two tiny service robots wait outside the route.
    for(const [x,z] of [[12.5,7],[-12.5,64]]) {
      k.cylinder(g,[x,11.6,z],1.2,.8,C.ivory);
      k.cylinder(g,[x,5.6,z],.4,11.2,C.mint);
      k.cylinder(g,[x,12.8,z],.65,1.3,C.mint);
      k.sphere(g,[x,13.65,z],.72,C.ivory);
      k.sphere(g,[x-.22,13.75,z-.65],.11,C.deep);
      k.sphere(g,[x+.22,13.75,z-.65],.11,C.deep);
      k.beam(g,[x,14.25,z],[x,14.9,z],.08,C.gold);
      k.sphere(g,[x,14.95,z],.17,C.peach);
    }
  }
  g.userData.ports = {in:{position:[0,12,0],direction:[0,0,1],width:19.2},out:{position:[0,12,72],direction:[0,0,1],width:19.2}};
  return g;
}
