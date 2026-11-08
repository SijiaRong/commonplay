export const meta = {
  id: 'turn', name: '土星领航湾',
  tagline: '180° 回头弯 · 内圈抢线，外圈稳过',
  reference: 'Lost Marbles 30 平面回头弯：保留方向反转，重做成星港领航湾',
  dimensions: '净宽 19.2 · 中心半径 24 · 高度 12 · 中心线长 103.4',
  beats: ['14 单位直线读弯，先选择蜜桃内线或薄荷外线', '内圈两组慢速拨片，留出中外圈连续通道', '180° 回转后 14 单位直线汇合，离湾进入下一段'],
  controls: ['设计目标：减速入弯，沿色标选择路线', '内圈较短、要避拨片；外圈较长、没有机关', '预览展示机关周期，尚未接入角色物理'],
};

export function build(k, {previewScenery = true} = {}) {
  const g = k.group();
  const C = { cream:'#fff2d9', mint:'#9cdbce', teal:'#3d9f99', peach:'#f5b49d', pink:'#ea8d9c', brass:'#d4b26e', blue:'#719eaf' };
  const R = 24, y = 12, z0 = 14;
  const p = (angle, radius=R, h=y) => [R-radius*Math.cos(angle), h, z0+radius*Math.sin(angle)];
  const points = [[0,y,0],[0,y,7],[0,y,z0]];
  for (let i=1;i<=96;i++) points.push(p(Math.PI*i/96));
  points.push([48,y,7],[48,y,0]);
  k.road(g, points, 19.2, {color:C.cream, railColor:C.mint, railHeight:1.55, thickness:.85});

  // Two route ribbons are paint indicators, not raised barriers.
  for (const [radius,color] of [[18,C.peach],[30,C.teal]]) {
    for (let i=0;i<45;i++) {
      const a=.045+i*(Math.PI-.09)/45;
      k.beam(g,p(a,radius,y+.055),p(a+.038,radius,y+.055),.11,color);
    }
  }
  // Fork/merge chevrons, then a clean connection seam on both ends.
  for (const x of [0,48]) {
    const sign=x===0?1:-1;
    for (const z of [3,7,11]) {
      const tip=[x,y+.07,z+sign*.9];
      k.beam(g,[x-.65,y+.07,z-sign*.45],tip,.11,C.brass);
      k.beam(g,[x+.65,y+.07,z-sign*.45],tip,.11,C.brass);
    }
    k.box(g,[x,y+.03,.35],[18.8,.06,.45],C.teal);
  }

  // Low, clearly visible inner-lane rotating paddles. Their swept disks
  // never reach the outer safe lane (radius >= 26).
  g.userData.animations=[];
  for (const [i,a] of [Math.PI*.36,Math.PI*.64].entries()) {
    const pos=p(a,18,y+.7);
    k.cylinder(g,[pos[0],y+.35,pos[2]],.72,.7,C.brass);
    const rotor=k.group();g.add(rotor);rotor.position.set(...pos);
    k.beam(rotor,[-2.7,0,0],[2.7,0,0],.34,C.peach);
    k.sphere(rotor,[-2.7,0,0],.48,C.pink);
    k.sphere(rotor,[2.7,0,0],.48,C.pink);
    k.sphere(rotor,[0,.35,0],.62,C.cream);
    g.userData.animations.push(t=>{rotor.rotation.y=t*Math.PI/2+i*Math.PI/2;});
    // Warning dots start well before each moving disk.
    for(let j=1;j<=3;j++) k.sphere(g,p(a-.14-j*.055,18,y+.11),.17,C.brass);
  }

  if (previewScenery) {
    // Saturn beacon sits inside the road's clear inner courtyard.
    k.cylinder(g,[24,1,14],5.6,2,C.mint);
    k.cylinder(g,[24,6.2,14],3.4,9.4,C.cream);
    k.cylinder(g,[24,10.7,14],3.6,1,C.peach);
    k.sphere(g,[24,15.9,14],4.35,C.peach);
    k.torus(g,[24,15.9,14],6.4,.44,C.brass,[Math.PI/2-.25,.15,.22]);
    k.sphere(g,[24,21.1,14],.65,C.cream);
    for (let i=0;i<8;i++) {
      const a=Math.PI*2*i/8;
      k.box(g,[24+3.42*Math.cos(a),7.9,14+3.42*Math.sin(a)],[.55,1.6,.55],C.brass);
    }

  }
  // Outer beacons and slender stilt pairs make the stand-alone segment readable.
  for(let i=0;i<=8;i++) {
    const a=Math.PI*i/8;
    for (const r of [16,32]) {
      const q=p(a,r,5.35);
      k.cylinder(g,q,.44,10.7,C.mint);
      k.cylinder(g,[q[0],.35,q[2]],1.1,.7,C.cream);
    }
    const q=p(a,34.1,12.75);
    k.cylinder(g,[q[0],11.6,q[2]],.24,2.3,C.brass);
    k.sphere(g,q,.62,C.cream).name = 'outer-beacon';
  }
  for (const x of [0,48]) for(const z of [3,10]) {
    k.beam(g,[x-7,.6,z],[x-7,11.5,z],.42,C.mint);
    k.beam(g,[x+7,.6,z],[x+7,11.5,z],.42,C.mint);
  }
  // Entry/exit bollards remain outside the 19.2-unit clear width.
  for(const x of [0,48]) for(const dx of [-10.6,10.6]) {
    k.cylinder(g,[x+dx,13.4,1.4],.6,2.8,C.peach);
    k.sphere(g,[x+dx,15,1.4],.72,C.cream);
  }
  g.userData.connectors={entry:{position:[0,12,0],forward:[0,0,1],width:19.2},exit:{position:[48,12,0],forward:[0,0,-1],width:19.2}};
  return g;
}
