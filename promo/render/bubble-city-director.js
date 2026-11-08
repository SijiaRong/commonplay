// Loaded inside startSolo only by the offline renderer, after the game initializes.
const session = new SoloSession(seed);
let frameStage = -1, shotCamera, shotPiece, shotTime = 0;
function publishFrame() {
  const next = session.snapshot();
  if (frameStage !== next.stage) {
    worker.onmessage({data:{type:'course', stage:session.show.stages[next.stage]}});
    frameStage = next.stage;
  }
  worker.onmessage({data:{type:'state',state:next}});
}
function pathIndex(path, s) {
  let best = 0;
  for (let i=1;i<path.n;i++) if(Math.abs(path.s[i]-s)<Math.abs(path.s[best]-s)) best=i;
  return best;
}
function prepareScene([,stage,name,fraction=.48,side=12,height=13,along=-18]) {
  shotCamera=null;
  if(stage==='start') {
    session.start();
    while(session.snapshot().gateSeconds!==3) session.step();
  }
  if(typeof stage==='number') {
    const show=session.show;
    show.startStage(stage-1);
    show.startRace();
    const path=show.stage.path, runner=show.players[0], body=runner.body;
    shotPiece=show.stage.pieces.find(piece=>piece.name===name);
    const mark=shotPiece ? shotPiece.s0+fraction*(shotPiece.s1-shotPiece.s0) : 10;
    const i=pathIndex(path,Math.max(1,mark-9));
    Object.assign(body,{x:path.x[i],y:path.y[i]+body.r+.08,z:path.z[i],vx:path.tx[i]*4,vz:path.tz[i]*4,vy:0});
    runner.s=runner.safeS=path.s[i]; runner.sampleIdx=i;
    const j=pathIndex(path,mark);
    const target=new T.Vector3(path.x[j],path.y[j]+1,path.z[j]);
    const offset=new T.Vector3(path.tz[j]*side+path.tx[j]*along,height,-path.tx[j]*side+path.tz[j]*along);
    if(!name) {
      const bounds=new T.Box3();
      for(let k=0;k<path.n;k++) bounds.expandByPoint(new T.Vector3(path.x[k],path.y[k],path.z[k]));
      bounds.getCenter(target);
      const size=bounds.getSize(new T.Vector3());
      offset.set(.54,.98,.76).normalize().multiplyScalar(size.length()*1.35);
    }
    // At these obstacles the outside dolly passes behind support columns.
    // The game's chase camera keeps the runner and the road in the same view.
    shotCamera=['plunge','hammers','megaJump'].includes(name) ? null : {target,offset,overview:!name};
    motion.reset();snap=true;previous=null;
  }
  publishFrame();
  if(typeof stage==='number' && !name) {
    course.group.updateMatrixWorld(true);
    const boxes=new Map();
    course.group.traverse(mesh=>{
      if(!mesh.userData.sharedParkAsset)return;
      const bounds=boxes.get(mesh.name) || new T.Box3();
      bounds.expandByObject(mesh);boxes.set(mesh.name,bounds);
    });
    const landmark=['摩天轮','土星地标','玻璃穹顶馆','弧面商店','星港总站'][stage-1];
    const bounds=boxes.get(landmark);
    if(!bounds || boxes.size<4)throw Error('Missing park district models: '+[...boxes.keys()]);
    const center=bounds.getCenter(new T.Vector3());
    const district=shotCamera.target;
    const outward=center.clone().sub(district);outward.y=0;
    outward.normalize().applyAxisAngle(up,stage===1?.42:-.48);
    const size=bounds.getSize(new T.Vector3()).length();
    shotCamera.target=center.clone().lerp(district,.10);
    shotCamera.offset=outward.multiplyScalar(size*1.13);
    shotCamera.offset.y=size*.58;
    console.log('District '+stage+': '+[...boxes.keys()].join(', '));
  }
  if(stage==='start') {
    // Finish the selection drawer's camera transition before the countdown cut.
    for(let i=0;i<20;i++)draw(1/30,received+34);
  }
}
window.applyShotCamera = () => {
  if(!shotCamera)return;
  const {target,offset,overview}=shotCamera;
  const u=shotTime/3, aim=target.clone();
  if(!overview) aim.add(worldPos.clone().sub(target).clampLength(0,24).multiplyScalar(.42));
  const arm=offset.clone().applyAxisAngle(up,(u-.5)*(overview?.34:.24)).multiplyScalar(1.06-.12*u);
  camera.position.copy(aim).add(arm);camera.lookAt(aim);
  focusRider(film,aim,1,'ready',true);
};
window.prepareScene=prepareScene;
window.frameStep=frame=>{
  shotTime=frame/30;
  for(let step=0;step<2;step++) {
    if(session.running) {
      const show=session.show, r=show.players[0], p=show.stage.path;
      const i=Math.max(0,Math.min(p.n-1,r.sampleIdx||0));
      const jump=shotPiece && ['hopscotch','megaJump','hurdleDeck','bigAir'].includes(shotPiece.name) && frame===28;
      const moving=show.phase==='race';
      session.controls(moving?p.tx[i]:0,moving?p.tz[i]:0,jump?1:0);
      session.step();
    }
  }
  publishFrame();
  draw(1/30,received+34);
};
publishFrame();
