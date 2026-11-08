// Slope thresholds shared by slide physics and rider animation.
export const SLOPE_RULES=Object.freeze({enterDegrees:12,exitDegrees:3,enterSeconds:.12,flatSeconds:.7,minSlideSeconds:1.2,airGraceSeconds:.16,runSpeed:.65});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
// The solo simulation owns this latch. Other controllers can still evaluate it locally.
export class SlideMode {
 constructor(rules=SLOPE_RULES){this.rules=rules;this.reset()}
 reset(){this.sliding=false;this.steepTime=this.flatTime=this.slideTime=0}
 update(dt,{grounded,normalY=1,speed=0,slideAllowed=true,jump=false,lockSlide=false}){
  const r=this.rules;
  if(!slideAllowed){this.reset();return false}
  if(grounded){
   const slope=Math.acos(clamp(normalY,-1,1))*180/Math.PI;
   if(!this.sliding){
    this.steepTime=slope>=r.enterDegrees&&speed>r.runSpeed?this.steepTime+dt:0;
    if(lockSlide||this.steepTime+1e-9>=r.enterSeconds){this.sliding=true;this.slideTime=this.flatTime=0}
   }else{
    this.flatTime=slope<=r.exitDegrees&&!lockSlide?this.flatTime+dt:0;
    if(this.flatTime+1e-9>=r.flatSeconds&&this.slideTime+1e-9>=r.minSlideSeconds)this.reset();
   }
  }else if(jump){this.steepTime=this.flatTime=0}
  if(this.sliding)this.slideTime+=dt;
  return this.sliding;
 }
}
export class GroundMotion{
 constructor(duration,rules={}){this.duration=duration;this.rules={...SLOPE_RULES,...rules};this.mode=new SlideMode(this.rules);this.reset()}
 reset(){this.mode.reset();this.action='Idle';this.actionTime=0;this.sliding=false;this.airTime=0;this.seat=0;this.airborne=false}
 pose(name){if(this.action!==name){this.action=name;this.actionTime=0}}
 update(dt,input){
  const {grounded,speed=0,jump=false}=input,r=this.rules;
  dt=clamp(dt,0,.1);this.actionTime+=dt;
  this.airTime=grounded?0:this.airTime+dt;
  this.airborne=!grounded&&(jump||this.airTime>r.airGraceSeconds);
  this.sliding=input.sliding??this.mode.update(dt,{...input,jump:this.airborne});
  const walking=speed>r.runSpeed?'Run':'Idle';
  if(this.airborne)this.pose('Jump');
  else if(!grounded){/* Keep the current pose through tiny contact gaps. */}
  else if(this.action==='Jump')this.pose(this.sliding?'Slide':walking);
  else if(this.action==='SitDown'){
   if(this.actionTime+1e-9>=this.duration('SitDown'))this.pose(this.sliding?'Slide':'StandUp');
  }else if(this.action==='StandUp'){
   if(this.actionTime+1e-9>=this.duration('StandUp'))this.pose(this.sliding?'SitDown':walking);
  }else if(this.sliding){if(this.action!=='Slide')this.pose('SitDown')}
  else if(this.action==='Slide')this.pose('StandUp');
  else this.pose(walking);
  // These curves match the authored SitDown/StandUp hip motion in rig_teddy.py.
  this.seat=this.action==='Slide'?1:this.action==='SitDown'?ease(.08,.78,this.actionTime/this.duration('SitDown')):this.action==='StandUp'?1-ease(.12,.90,this.actionTime/this.duration('StandUp')):0;
  return this;
 }
}
