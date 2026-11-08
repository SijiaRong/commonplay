import bpy, math, os
from mathutils import Vector, Quaternion
from math import sin,cos,pi,radians
src=os.path.abspath('assets/teddy-bear/teddy-bear-game.glb')
dst=os.path.abspath('assets/teddy-bear/teddy-bear-animated.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
world=mesh.matrix_world.copy()
mesh.parent=None
from mathutils import Matrix
mesh.matrix_world=Matrix.Identity(4)
mesh.data.transform(world)
base=min(v.co.z for v in mesh.data.vertices)
for v in mesh.data.vertices:v.co.z-=base
mesh.name='Teddy'
rig=bpy.data.armatures.new('Teddy Skeleton')
arm=bpy.data.objects.new('Teddy Rig',rig)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode='EDIT')
def bone(name,a,b,parent=None):
    k=rig.edit_bones.new(name);k.head=a;k.tail=b
    if parent:k.parent=rig.edit_bones[parent]
bone('Hips',(0,0,.23),(0,0,.36))
bone('Chest',(0,0,.36),(0,0,.60),'Hips')
bone('Head',(0,0,.60),(0,0,.95),'Chest')
for s,suf in [(1,'.L'),(-1,'.R')]:
    for name,a,b,parent in [
        ('UpperArm',(.166,0,.554),(.256,0,.457),'Chest'),('Forearm',(.256,0,.457),(.314,-.016,.388),'UpperArm'+suf),('Paw',(.314,-.016,.388),(.341,-.035,.33),'Forearm'+suf),
        ('Thigh',(.104,.003,.258),(.113,-.01,.147),'Hips'),('Shin',(.113,-.01,.147),(.113,0,.06),'Thigh'+suf),('Foot',(.113,0,.06),(.113,-.122,.033),'Shin'+suf)]:
        bone(name+suf,(a[0]*s,*a[1:]),(b[0]*s,*b[1:]),parent)
bpy.ops.object.mode_set(mode='OBJECT')
groups={b.name:mesh.vertex_groups.new(name=b.name) for b in rig.bones}
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
for v in mesh.data.vertices:
    x,y,z=v.co;ax=abs(x);sf='.L' if x>0 else '.R'
    head=smooth(.581,.659,z)
    border=.213+(.46-z)*.52
    armw=(1-head)*smooth(border-.027,border+.027,ax)*smooth(.282,.324,z)*(1-smooth(.552,.619,z))
    leg=(1-smooth(.202,.316,z))*(1-armw)*(1-smooth(.112,.207,y))
    rest=1-head-armw-leg
    elbow=1-smooth(.421,.491,z);wrist=1-smooth(.362,.414,z);knee=1-smooth(.12,.18,z);foot=1-smooth(.048,.089,z);ch=smooth(.28,.46,z)
    ws={'Head':head,'Hips':rest*(1-ch),'Chest':rest*ch,'UpperArm'+sf:armw*(1-elbow),'Forearm'+sf:armw*elbow*(1-wrist),'Paw'+sf:armw*elbow*wrist,'Thigh'+sf:leg*(1-knee),'Shin'+sf:leg*knee*(1-foot),'Foot'+sf:leg*knee*foot}
    ws=sorted(((n,w) for n,w in ws.items() if w>.00001),key=lambda e:-e[1])[:4];tot=sum(w for n,w in ws)
    for n,w in ws:groups[n].add([v.index],w/tot,'REPLACE')
mesh.parent=arm
mod=mesh.modifiers.new('Plush skin','ARMATURE');mod.object=arm
scene=bpy.context.scene;scene.render.fps=30
ad=arm.animation_data_create()
for name,length,step in [('Idle',90,5),('Run',24,2),('Jump',30,2),('Slide',48,4)]:
    action=bpy.data.actions.new(name);ad.action=action
    for f in range(0,length+1,step):
        t=f/length; ph=2*pi*t;wave=sin(ph);lift=0
        angles={}
        if name=='Idle':
            lift=.006*(1-cos(ph));angles={'Chest':(-2*wave,0,0),'Head':(2*wave,1.6*wave,3*wave)}
        elif name=='Run':
            lift=.017*(1-cos(2*ph));angles={'Chest':(8,3*wave,6*wave),'Head':(-5,-2*wave,-4*wave)}
        elif name=='Slide':
            lift=-.154+.003*cos(2*ph)
            angles={'Chest':(-12+2*cos(ph),2*wave,0),'Head':(9,-3*wave,3*wave)}
        else:
            def curve(vals):
                for (a,v),(b,w) in zip(vals,vals[1:]):
                    if t<=b:return v+(w-v)*smooth(a,b,t)
                return vals[-1][1]
            tuck=curve([(0,0),(.12,1),(.27,-.35),(.55,.8),(.83,.15),(.92,.85),(1,0)])
            reach=curve([(0,0),(.12,-.3),(.35,1),(.68,.85),(.9,-.2),(1,0)])
            lift=-.035*max(0,tuck);angles={'Chest':(10*tuck,0,0),'Head':(-7*tuck,0,0)}
        for s,sf in [(1,'.L'),(-1,'.R')]:
            if name=='Idle':vals=(0,0,0,2*s*wave,-3,2*s*wave)
            elif name=='Run':
                p=wave*s
                vals=(-38*p-5,37*max(0,-p)+5,14*p,32*p,-14-12*max(p,0),5*p)
            elif name=='Slide':
                vals=(-82+3*s*wave,17+s*3*wave,-16,-22+5*s*wave,-16,5*s*wave)
            else:vals=(-35*tuck,58*tuck,-20*tuck,-44*reach,-16*reach,0)
            for n,val in zip(('Thigh','Shin','Foot','UpperArm','Forearm','Paw'),vals):
                if name=='Slide' and n in ('UpperArm','Thigh'):
                    angles[n+sf]=(val,-s*(46+4*s*wave if n=='UpperArm' else 9),0)
                    continue
                angles[n+sf]=(val,(-s*18*reach if name=='Jump' and n=='UpperArm' else 0),0)
        for b in arm.pose.bones:
            ax,ay,az=angles.get(b.name,(0,0,0));rest=b.bone.matrix_local.to_quaternion()
            rot=Quaternion((0,0,1),radians(az))@Quaternion((0,1,0),radians(ay))@Quaternion((1,0,0),radians(ax))
            b.rotation_quaternion=rest.inverted()@rot@rest;b.keyframe_insert(data_path='rotation_quaternion',frame=f+1)
        hip=arm.pose.bones['Hips'];hip.location=hip.bone.matrix_local.to_quaternion().inverted()@Vector((0,0,lift));hip.keyframe_insert(data_path='location',frame=f+1)
    ad.action=None
    track=ad.nla_tracks.new();track.name=name;track.strips.new(name,1,action);track.mute=True
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
for o in bpy.context.selected_objects:o.select_set(False)
arm.select_set(True);mesh.select_set(True)
bpy.ops.export_scene.gltf(filepath=dst,use_selection=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True)
