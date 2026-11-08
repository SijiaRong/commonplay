// Served in place of slide/ride.js only in the offline capture browser.
import * as T from 'three';
import {CityPartyShow} from '../solo/city-party.js';
import {CourseView} from '../solo/js/render/courseView.js';
import {getMaterials} from '../solo/js/render/materials.js';
import {loadParkModels} from '../solo/js/render/park.js';
import {updateAcrylicBackdrop} from '../solo/js/render/acrylic.js';
import {createSlideFilm,focusRider} from './film/scene.js';
import {loadDaylight,createContactShadow} from './daylight.js';
import {GroundMotion} from './ground-motion.mjs';
import {createRider} from './rider.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';

async function setup() {
  const canvas=document.createElement('canvas');
  document.querySelector('#world').append(canvas);
  const {film,quality,lite}=createSlideFilm(canvas);
  const {scene,renderer,camera}=film;
  const loader=new GLTFLoader();
  const roster=await (await fetch('./slide/characters.json')).json();
  const assets=['teddy','pip','tik','duck'].map(id=>roster.characters.find(def=>def.id===id));
  const [park,runway,riders]=await Promise.all([
    loadParkModels(),loader.loadAsync('./solo/models/quilted-runway.glb'),
    Promise.all(assets.map(async def=>{
      const rider=createRider(await loader.loadAsync(def.model),def);
      const root=new T.Group(),shadow=createContactShadow(rider.shadowRadius);
      root.add(rider.model);scene.add(root,shadow);
      return {root,shadow,rider,motion:new GroundMotion(name=>rider.duration(name))};
    })),loadDaylight(film),getMaterials(quality,renderer,{lite}).ready
  ]);
  const show=new CityPartyShow({seed:20261108,fieldSize:4,untimed:true,
    entrants:assets.map(def=>({name:def.name,bot:false}))});
  let course,shot,center,angle;
  const up=new T.Vector3(0,1,0);
  function nearest(s) {
    const p=show.stage.path;
    let best=0;
    for(let i=1;i<p.n;i++)if(Math.abs(p.s[i]-s)<Math.abs(p.s[best]-s))best=i;
    return best;
  }
  function begin(config) {
    shot=config;
    show.startStage(shot.stage-1);
    if(course?.stage.index!==show.stage.index) {
      if(course){scene.remove(course.group);course.dispose();}
      course=new CourseView(show.stage,quality,runway.scene.clone(true),()=>false,park);
      scene.add(course.group);
    }
    center=null;angle=null;
    const path=show.stage.path;
    if(shot.landmark) {
      riders.forEach(r=>{r.root.visible=false;r.shadow.visible=false;});
      course.group.updateMatrixWorld(true);
      const bounds=new T.Box3(),district=new T.Box3();
      course.group.traverse(m=>{if(m.userData.sharedParkAsset && m.name===shot.landmark)bounds.expandByObject(m);});
      if(bounds.isEmpty())throw Error('Missing district '+shot.landmark);
      for(let i=0;i<path.n;i++)district.expandByPoint(new T.Vector3(path.x[i],path.y[i],path.z[i]));
      shot.anchor=bounds.getCenter(new T.Vector3());
      shot.middle=district.getCenter(new T.Vector3());
      shot.size=bounds.getSize(new T.Vector3()).length();
      shot.courseSize=district.getSize(new T.Vector3()).length();
      return;
    }
    show.startRace();
    // Blocking is set at each cut. After the cut, only controller input moves the runners.
    const mark=shot.s==='finish'?path.finishS-18:shot.s;
    for(const p of show.players) {
      const id=p.id, i=nearest(mark+([0,2.7,1.1,3.8][(id+shot.stage)%4]));
      const lane=laneFor(p);
      Object.assign(p.body,{x:path.x[i]+path.tz[i]*lane,y:path.y[i]+p.body.r+.05,z:path.z[i]-path.tx[i]*lane,
        vx:path.tx[i]*3,vz:path.tz[i]*3,vy:0,grounded:true,gny:1,gnx:0,gnz:0});
      p.s=p.safeS=path.s[i];p.sampleIdx=i;
      if(shot.s==='finish') {
        show.qualify(p);
        const end=path.n-1;
        p.body.x=show.stage.penCenter[0]+path.tz[end]*lane*1.25;
        p.body.z=show.stage.penCenter[2]-path.tx[end]*lane*1.25;
        p.body.y=path.y[end]+p.body.r;p.body.grounded=true;p.body.groundT=0;
        p.s=path.s[end];p.sampleIdx=end;
      }
      riders[id].motion.reset();riders[id].rider.reset();
      riders[id].root.rotation.y=Math.atan2(path.tx[i],path.tz[i])+(shot.s==='finish'?Math.PI:0);
    }
    if(shot.cannon){
      const fork=show.stage.forks.find(f=>f.cannon);
      if(!fork)throw Error('No cannon on selected stage');
      shot.breech=new T.Vector3(...fork.cannon.breech);
      shot.direction=new T.Vector3(...fork.cannon.d).setY(0).normalize();
      shot.launched=false;
      const bear=show.players[0],i=fork.cannon.air[0]-5;
      Object.assign(bear.body,{x:path.x[i],y:path.y[i]+bear.body.r+.04,z:path.z[i],vx:0,vy:0,vz:0});
      bear.s=bear.safeS=path.s[i];bear.sampleIdx=i;bear.branchOf[fork.id]=fork.cannon.br;
    }
    if(shot.s==='finish')show.scoreStage();
  }
  function laneFor(player) {return [-3.3,-1.1,1.1,3.3][(player.id+shot.stage)%4];}
  function tick(frame) {
    const path=show.stage.path;
    for(const p of show.players) {
      if(shot.cannon && p.id===0){
        const input=shot.launched?0:.82;
        show.setInput(0,shot.direction.x*input,shot.direction.z*input,0);
        continue;
      }
      const i=nearest(p.s+4),lane=laneFor(p);
      const dx=path.x[i]+path.tz[i]*lane-p.body.x,dz=path.z[i]-path.tx[i]*lane-p.body.z;
      const length=Math.max(.001,Math.hypot(dx,dz));
      const jump=shot.jump && frame===24+p.id*6;
      const pressure=.72+.035*Math.sin(frame*.045+p.id);
      show.setInput(p.id,pressure*dx/length,pressure*dz/length,Number(jump));
    }
    show.step();
    if(shot.cannon && show.players[0].body.vy>25)shot.launched=true;
  }
  function draw(frame,render=true) {
    const t=frame/(shot.frames-1),path=show.stage.path;
    let focus;
    if(shot.landmark) {
      const {anchor,middle,size}=shot;
      focus=anchor.clone().lerp(middle,.22+.12*t);
      const away=anchor.clone().sub(middle);away.y=0;
      away.normalize().applyAxisAngle(up,.32-.52*t).multiplyScalar(size*(1.45+.38*t));
      away.y=size*(.68+.38*t);
      if(shot.stage>=3 || shot.stage===1){
        focus=middle.clone().lerp(anchor,.18);
        away.set(Math.sin(.69+.36*t),1.15+.08*t,Math.cos(.69+.36*t))
          .multiplyScalar(shot.courseSize*(.65-.07*t));
      }
      if(shot.stage===4) {
        // Sweep across the stacked lanes of the helix, with the park at the edge of frame.
        const i=nearest(202);
        focus.set(path.x[i],path.y[i],path.z[i]);
        away.set(34*Math.cos(.5*t),30+6*t,34*Math.sin(.5*t)+14);
      }
      camera.position.copy(focus).add(away);
    } else {
      const dt=shot.slow ? 1/60 : 1/30;
      if(shot.s!=='finish'){
        tick(frame);
        if(!shot.slow)tick(frame);
      }
      const points=[];
      for(const p of show.players) {
        const {rider,root,shadow,motion}=riders[p.id],b=p.body;
        const speed=Math.hypot(b.vx,b.vz),finished=p.finishOrder>=0;
        root.visible=b.active||finished;shadow.visible=root.visible && b.groundT<.10;
        motion.update(dt,{grounded:b.groundT<.10,speed,sliding:p.slideMode?.sliding,jump:b.vy>1.5});
        rider.pose(finished && frame<100-p.id*4?'FinishWave':motion.action);
        rider.model.position.y=motion.seat*rider.seatedOffset;
        root.position.set(b.x,b.y-b.r,b.z);
        const i=Math.max(0,p.sampleIdx||0);
        const facing=finished?Math.atan2(-path.tx[i],-path.tz[i]):speed>.5?Math.atan2(b.vx,b.vz):root.rotation.y;
        const turn=facing-root.rotation.y;
        root.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*.42;
        rider.animate(dt,0,speed);
        shadow.position.copy(root.position);shadow.position.y+=.03;
        if(root.visible)points.push(root.position.clone().addScaledVector(up,rider.previewSize.y*.48));
      }
      if(!points.length)throw Error('Race pack outside the course');
      const bounds=new T.Box3().setFromPoints(points),aim=bounds.getCenter(new T.Vector3());
      if(!center)center=aim;else center.lerp(aim,.28);
      focus=center;
      const i=nearest(show.players.reduce((sum,p)=>sum+p.s,0)/4);
      const direction=Math.atan2(path.tx[i],path.tz[i]);
      if(angle===null)angle=direction;
      angle+=Math.atan2(Math.sin(direction-angle),Math.cos(direction-angle))*.18;
      const orbit=angle+shot.bearing+(t-.5)*.21;
      const extent=bounds.getSize(new T.Vector3()).length();
      const distance=Math.max(8.3,extent*.84+3)*shot.zoom;
      camera.position.copy(focus).add(new T.Vector3(Math.sin(orbit)*distance,distance*shot.lift,Math.cos(orbit)*distance));
    }
    if(shot.cannon){
      const bear=riders[0].root.position.clone().addScaledVector(up,1.25);
      const muzzle=shot.breech.clone().addScaledVector(shot.direction,3.3).addScaledVector(up,5.25);
      const weight=shot.launched?.76:.27;
      focus=muzzle.clone().lerp(bear,weight);
      const side=new T.Vector3(-shot.direction.z,0,shot.direction.x);
      camera.position.copy(focus).addScaledVector(side,17).addScaledVector(shot.direction,6).addScaledVector(up,5);
      if(frame===shot.frames-1&&!shot.launched)throw Error('Bear did not trigger the cannon');
    }
    if(render) {
      camera.lookAt(focus);
      focusRider(film,focus,1.4,'riding',true);
      course.illuminate(focus);course.update(shot.landmark?t*3:show.stageTime(),1/30,true);
      updateAcrylicBackdrop(course.mats.acrylic,film);film.render(1/30);
    }
    return {active:riders.filter(r=>r.root.visible).length};
  }
  film.resize();film.setFrameBudget(1/30,false);
  window.raceCapture={begin,draw};
}
setup().catch(error=>{window.captureError=String(error);console.error(error);});
