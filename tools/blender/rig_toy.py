"""Retarget the checked-in teddy action set to an inspected toy.

Blender --background --python tools/blender/rig_toy.py -- prepared.glb out.glb pip|tik|wob
The inspection JSON must be marked visualReviewPassed after viewing the mesh.
"""
import bpy, sys, json, math
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

src,dst,kind=sys.argv[sys.argv.index('--')+1:]
src,dst=Path(src),Path(dst)
inspection=json.loads(src.with_suffix('.inspection.json').read_text())
assert inspection['geometryChecksPassed'] and inspection['visualReviewPassed'], 'Review the prepared model before adding animation'
assert kind in ('pip','tik','wob')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src.resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in meshes:
    world=o.matrix_world.copy();o.parent=None;o.data.transform(world);o.matrix_world=Matrix.Identity(4)
allverts=[v.co for o in meshes for v in o.data.vertices]
half=max(abs(v.x) for v in allverts)
torso=[v.y for v in allverts if .2<v.z<.5 and abs(v.x)<half*.45]
body_y=sum(torso)/len(torso) if torso else 0
# Geometry-specific joint locations; every rig uses the same bone names/actions.
cfg={
 'pip':dict(hip=.19,chest=.37,head=.57,shoulder=.58,elbow=.58,wrist=.57,leg=.14,knee=.075,foot=.035,armFactor=.35,legFactor=.30,bodyFactor=.25),
 'tik':dict(hip=.14,chest=.34,head=.58,shoulder=.43,elbow=.31,wrist=.23,leg=.12,knee=.065,foot=.035,armFactor=.40,legFactor=.28,bodyFactor=.45),
 'wob':dict(hip=.10,chest=.34,head=.66,shoulder=.44,elbow=.35,wrist=.29,leg=.085,knee=.05,foot=.025,armFactor=.14,legFactor=.08,bodyFactor=.25),
}[kind]
rig=bpy.data.armatures.new(kind.upper()+' shared skeleton')
arm=bpy.data.objects.new(kind.upper()+' Rig',rig);bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def bone(name,a,b,parent=None):
    a=Vector(a);b=Vector(b);a.y+=body_y;b.y+=body_y
    k=rig.edit_bones.new(name);k.head=a;k.tail=b
    if parent:k.parent=rig.edit_bones[parent]
bone('Hips',(0,0,cfg['hip']),(0,0,cfg['chest']))
bone('Chest',(0,0,cfg['chest']),(0,0,cfg['head']),'Hips')
bone('Head',(0,0,cfg['head']),(0,0,.96),'Chest')
if kind=='tik':bone('WindupKey',(0,.20,.54),(0,.36,.54),'Chest')
for sign,suffix in [(1,'.L'),(-1,'.R')]:
    x=lambda value:sign*half*value
    bone('UpperArm'+suffix,(x(.58),0,cfg['shoulder']),(x(.83),-.01,cfg['elbow']),'Chest')
    bone('Forearm'+suffix,(x(.83),-.01,cfg['elbow']),(x(.94),-.025,cfg['wrist']),'UpperArm'+suffix)
    bone('Paw'+suffix,(x(.94),-.025,cfg['wrist']),(x(.98),-.04,cfg['wrist']-.035),'Forearm'+suffix)
    bone('Thigh'+suffix,(x(.32),0,cfg['leg']),(x(.34),-.01,cfg['knee']),'Hips')
    bone('Shin'+suffix,(x(.34),-.01,cfg['knee']),(x(.34),0,cfg['foot']),'Thigh'+suffix)
    bone('Foot'+suffix,(x(.34),0,cfg['foot']),(x(.34),-.12,cfg['foot']-.012),'Shin'+suffix)
bpy.ops.object.mode_set(mode='OBJECT')
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
for mesh in meshes:
    groups={b.name:mesh.vertex_groups.new(name=b.name) for b in rig.bones}
    for v in mesh.data.vertices:
        x,y,z=v.co;ax=abs(x);sf='.L' if x>0 else '.R'
        # Keep the squirrel's back tail with the torso, not its head or arms.
        back=smooth(.12,.25,y-body_y) if kind=='pip' else 0
        head=smooth(cfg['head']-.025,cfg['head']+.07,z)*(1-back)
        if kind=='pip' and z<.75:head*=1-smooth(half*.5,half*.75,ax)
        if kind=='tik':head=1 if z>.54 else 0
        if kind=='wob':head*=.38
        armw=(1-head)*(1-back)*smooth(half*.52,half*.74,ax)*smooth(cfg['wrist']-.06,cfg['wrist'],z)*(1-smooth(cfg['shoulder']+.02,cfg['shoulder']+.12,z))
        if kind=='pip':armw=(1-head)*(1-back)*smooth(half*.52,half*.74,ax)*smooth(.22,.5,z)*(1-smooth(.63,.74,z))
        leg=(1-smooth(cfg['leg']-.025,cfg['leg']+.07,z))*(1-armw)
        # WOB's low rear belly reaches foot height; only the forward pads turn with the legs.
        if kind=='wob':leg*=1-smooth(-.05,.12,y-body_y)
        rest=max(0,1-head-armw-leg);ch=smooth(cfg['hip'],cfg['head']-.05,z)
        elbow=1-smooth(cfg['elbow']-.025,cfg['elbow']+.03,z)
        wrist=1-smooth(cfg['wrist']-.025,cfg['wrist']+.025,z)
        knee=1-smooth(cfg['knee']-.02,cfg['knee']+.025,z)
        foot=1-smooth(cfg['foot']-.015,cfg['foot']+.02,z)
        weights={'Head':head,'Hips':rest*(1-ch),'Chest':rest*ch,
         'UpperArm'+sf:armw*(1-elbow),'Forearm'+sf:armw*elbow*(1-wrist),'Paw'+sf:armw*elbow*wrist,
         'Thigh'+sf:leg*(1-knee),'Shin'+sf:leg*knee*(1-foot),'Foot'+sf:leg*knee*foot}
        if kind in ('pip','wob'):
            for part in ('UpperArm','Forearm','Paw'):weights.pop(part+sf,None)
            weights['UpperArm'+sf]=armw
        if kind=='tik' and y-body_y>.20 and .37<z<.73:
            weights={'WindupKey':1}
        weights=sorted(((n,w) for n,w in weights.items() if w>1e-5),key=lambda e:-e[1])[:4]
        total=sum(w for n,w in weights)
        assert total>0
        for n,w in weights:groups[n].add([v.index],w/total,'REPLACE')
    mesh.parent=arm;mod=mesh.modifiers.new('Shared toy skin','ARMATURE');mod.object=arm

# Reuse the production teddy clips as the motion source, rather than giving each
# toy an unrelated set of timings. Rest-space rotations adapt to its proportions.
before=set(bpy.context.scene.objects)
donor_path=Path(__file__).resolve().parents[2]/'teddy-playground/dist/teddy-bear-animated.glb'
bpy.ops.import_scene.gltf(filepath=str(donor_path))
donor=next(o for o in bpy.context.scene.objects if o not in before and o.type=='ARMATURE')
source_fps=bpy.context.scene.render.fps
source_actions={a.name:a for a in bpy.data.actions}
for track in donor.animation_data.nla_tracks:track.mute=True
names=['Idle','Run','Jump','Slide','SlideLeft','SlideRight','SitDown','StandUp','FinishWave']
ad=arm.animation_data_create();scene=bpy.context.scene
for name in names:
    source=source_actions[name];first,last=source.frame_range
    duration=(last-first)/source_fps;frames=max(2,round(duration*30))
    wob_slide=kind=='wob' and (name.startswith('Slide') or name in ('SitDown','StandUp'))
    if wob_slide and name=='SitDown':frames=14
    if wob_slide and name=='StandUp':frames=27
    target=bpy.data.actions.new(kind.upper()+'_'+name);ad.action=target
    donor.animation_data.action=source
    if source.slots:donor.animation_data.action_slot=source.slots[0]
    for frame in sorted(set(list(range(0,frames+1,2))+[frames])):
        t=frame/frames;sample=first+t*(last-first);scene.frame_set(int(sample),subframe=sample%1)
        seat=smooth(0,.85,t) if name=='SitDown' else 1-smooth(.08,.92,t) if name=='StandUp' else 1
        for b in arm.pose.bones:
            if b.name=='WindupKey':
                rest=b.bone.matrix_local.to_quaternion()
                angle=2*math.pi*t if name in ('Run','FinishWave') else .35*math.sin(2*math.pi*t)
                b.rotation_mode='QUATERNION';b.rotation_quaternion=rest.inverted()@Quaternion((0,1,0),angle)@rest
                b.keyframe_insert(data_path='rotation_quaternion',frame=frame+1)
                continue
            origin=donor.pose.bones[b.name]
            source_rest=origin.bone.matrix_local.to_quaternion();target_rest=b.bone.matrix_local.to_quaternion()
            delta=source_rest@origin.rotation_quaternion@source_rest.inverted()
            factor=cfg['armFactor'] if any(part in b.name for part in ('Arm','Paw')) else cfg['legFactor'] if any(part in b.name for part in ('Thigh','Shin','Foot')) else cfg['bodyFactor']
            if kind=='pip' and b.name=='Head':factor=0
            if wob_slide:
                if b.name.startswith(('Thigh','Shin','Foot')):factor=.78
                elif b.name.startswith('UpperArm'):factor=.38
                elif b.name=='Chest':factor=.68
            delta=Quaternion().slerp(delta,factor)
            if wob_slide and b.name=='Hips':
                # Lean the whole bean back; the short legs alone are hidden from the chase camera.
                delta=Quaternion((1,0,0),-.20*seat)@delta
            if kind=='pip' and name=='Jump' and b.name.startswith('UpperArm'):
                sign=1 if b.name.endswith('.L') else -1
                delta=Quaternion((0,1,0),sign*.15*math.sin(2*math.pi*t))@delta
            b.rotation_mode='QUATERNION';b.rotation_quaternion=target_rest.inverted()@delta@target_rest
            b.keyframe_insert(data_path='rotation_quaternion',frame=frame+1)
            if kind=='wob' and b.name.startswith('Thigh'):
                # Bring the small foot pads in front of the broad belly as it settles.
                b.location=target_rest.inverted()@Vector((0,-.13*seat if wob_slide else 0,0))
                b.keyframe_insert(data_path='location',frame=frame+1)
            if b.name=='Hips':
                displacement=source_rest@origin.location*(cfg['hip']/.23)
                if kind=='pip':displacement*=.5
                b.location=target_rest.inverted()@displacement
                b.keyframe_insert(data_path='location',frame=frame+1)
                if kind=='wob':
                    pulse=.012*math.sin(2*math.pi*t)
                    if name=='Jump':pulse=.14*math.exp(-((t-.1)/.09)**2)-.08*max(0,math.sin(math.pi*(t-.2)/.65))+.12*math.exp(-((t-.9)/.08)**2)
                    elif name in ('SitDown','StandUp'):pulse=.06*math.sin(math.pi*t)
                    elif name in ('Run','FinishWave'):pulse=.035*math.sin(4*math.pi*t)
                    elif name.startswith('Slide'):pulse=.022*(1-math.cos(2*math.pi*t))
                    if wob_slide:pulse+=.30*seat
                    b.scale=(1+.5*pulse,1-pulse,1+.5*pulse)
                    b.keyframe_insert(data_path='scale',frame=frame+1)
    ad.action=None
    track=ad.nla_tracks.new();track.name=name;track.strips.new(name,1,target);track.mute=True
donor.animation_data.action=None
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
scene.render.fps=30;scene.frame_set(1)
for o in bpy.context.selected_objects:o.select_set(False)
arm.select_set(True)
for mesh in meshes:mesh.select_set(True)
dst.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(dst.resolve()),use_selection=True,export_format='GLB',export_animation_mode='NLA_TRACKS',export_force_sampling=True)
print('TOY_SHARED_RIG',kind,str(dst),names,flush=True)
