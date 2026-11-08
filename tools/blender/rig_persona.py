"""Bind a prepared toy and author the nine clips consumed by slide/rider.js.

blender -b -P tools/blender/rig_persona.py -- prepared.glb animated.glb character
"""
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

src, dst, kind = sys.argv[sys.argv.index('--') + 1:]
src, dst = Path(src), Path(dst)
stride = {'duck': .24, 'ray': .18, 'elephant': .18, 'gecko': .25,
          'hedgehog': .17, 'crab': .22}[kind]
inspection = json.loads(src.with_suffix('.inspection.json').read_text())
assert inspection['geometryChecksPassed'] and inspection['visualReviewPassed']

# Match the actual teddy timing so ride transitions stay synchronized.
donor = Path(__file__).resolve().parents[2] / 'teddy-playground/dist/teddy-bear-animated.glb'
with donor.open('rb') as stream:
    stream.seek(12)
    size, _ = struct.unpack('<II', stream.read(8))
    gltf = json.loads(stream.read(size))
durations = {}
for animation in gltf['animations']:
    inputs = [gltf['accessors'][s['input']] for s in animation['samplers']]
    durations[animation['name']] = max(i['max'][0] for i in inputs) - min(i['min'][0] for i in inputs)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src.resolve()))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for mesh in meshes:
    transform = mesh.matrix_world.copy()
    mesh.parent = None
    mesh.data.transform(transform)
    mesh.matrix_world = Matrix.Identity(4)
points = [v.co for mesh in meshes for v in mesh.data.vertices]
half_width = max(abs(v.x) for v in points)
height = max(v.z for v in points)
half_depth = max(abs(v.y) for v in points)
skeleton = bpy.data.armatures.new(kind + ' skeleton')
rig = bpy.data.objects.new(kind + ' rig', skeleton)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')

def add_bone(name, pivot, parent=None):
    bone = skeleton.edit_bones.new(name)
    bone.head = Vector(pivot)
    bone.tail = bone.head + Vector((0, .12, 0))
    if parent:
        bone.parent = skeleton.edit_bones[parent]

add_bone('Body', (0, 0, height * .48))
winged = kind == 'ray'
quadruped = kind in ('elephant', 'gecko', 'hedgehog', 'crab')
parts = []
for side in (-1, 1):
    for end in ((-1, 1) if quadruped else (0,)):
        name = ('Wing' if winged else 'Foot') + ('L' if side > 0 else 'R')
        name += {-1: 'Front', 1: 'Rear', 0: ''}[end]
        parts.append((name, side, end))
        add_bone(name, (side * half_width * (.33 if winged else .51),
                        end * half_depth * .39, height * (.45 if winged else .19)), 'Body')
bpy.ops.object.mode_set(mode='OBJECT')

def smooth(lo, hi, value):
    t = min(1, max(0, (value - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)

for mesh in meshes:
    groups = {bone.name: mesh.vertex_groups.new(name=bone.name) for bone in skeleton.bones}
    for v in mesh.data.vertices:
        x, y, z = v.co
        lateral = abs(x) / half_width
        if winged:
            weight = smooth(.28, .83, lateral)
        else:
            weight = (1 - smooth(.10, .27, z / height)) * smooth(.02, .37, lateral)
        groups['Body'].add([v.index], 1 - weight, 'REPLACE')
        for name, side, end in parts:
            if x * side <= 0 or weight == 0:
                continue
            share = smooth(-.22, .22, end * y / half_depth) if end else 1
            if share:
                groups[name].add([v.index], weight * share, 'REPLACE')
    mesh.parent = rig
    mesh.modifiers.new('Toy skin', 'ARMATURE').object = rig

scene = bpy.context.scene
scene.render.fps = 30
anim = rig.animation_data_create()
for clip, duration in durations.items():
    frames = max(2, round(duration * scene.render.fps))
    action = bpy.data.actions.new(kind + ' ' + clip)
    anim.action = action
    for frame in sorted(set(range(0, frames + 1, 2)) | {frames}):
        t = frame / frames
        wave = math.sin(2 * math.pi * t)
        arc = math.sin(math.pi * t)
        eased = t * t * (3 - 2 * t)
        body = rig.pose.bones['Body']
        pitch = bank = lift = 0.
        if clip == 'Run':
            lift = .045 * abs(wave)
            bank = (.12 if kind in ('duck', 'crab') else .045) * wave
        elif clip == 'Jump':
            pitch = -.26 * arc
            bank = .09 * wave
        elif clip.startswith('Slide'):
            pitch = .09
            bank = {'SlideLeft': .20, 'SlideRight': -.20}.get(clip, 0) + .025 * wave
        elif clip in ('SitDown', 'StandUp'):
            pitch = .09 * (eased if clip == 'SitDown' else 1 - eased)
        elif clip == 'FinishWave':
            bank = .20 * math.sin(4 * math.pi * t) * arc
            lift = .035 * arc
        else:
            pitch = .017 * wave
        if kind == 'hedgehog':
            # Rotate around the torso center to put the three stamp wheels on the track.
            if clip.startswith('Slide'):
                pitch = math.pi
            elif clip in ('SitDown', 'StandUp'):
                pitch = math.pi * (eased if clip == 'SitDown' else 1 - eased)
        body.rotation_mode = 'XYZ'
        body.rotation_euler = (pitch, bank, 0)
        body.location.z = lift * height
        body.keyframe_insert(data_path='rotation_euler', frame=frame + 1)
        body.keyframe_insert(data_path='location', frame=frame + 1)
        for name, side, end in parts:
            bone = rig.pose.bones[name]
            bone.rotation_mode = 'XYZ'
            if winged:
                flap = arc if clip == 'Jump' else wave
                bone.rotation_euler = (0, side * stride * flap, 0)
            else:
                step = stride * wave * side * (end or 1) if clip == 'Run' else 0.
                spread = side * .16 * arc if clip == 'Jump' else 0.
                bone.rotation_euler = (step, spread, 0)
            bone.keyframe_insert(data_path='rotation_euler', frame=frame + 1)
    anim.action = None
    track = anim.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, 1, action)
    track.mute = True

for bone in rig.pose.bones:
    bone.matrix_basis = Matrix.Identity(4)
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for mesh in meshes:
    mesh.select_set(True)
dst.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(dst.resolve()), use_selection=True, export_format='GLB',
                          export_animation_mode='NLA_TRACKS', export_force_sampling=True)
