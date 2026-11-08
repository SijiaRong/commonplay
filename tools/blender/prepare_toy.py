"""Inspect/normalize a Hi3D mesh BEFORE rigging. Blender --background --python ... -- src.glb out.glb [yaw-degrees] [max-horizontal-span]."""
import bpy, bmesh, sys, os, json, math
from pathlib import Path
from mathutils import Matrix, Vector

args=sys.argv[sys.argv.index('--')+1:]
src,dst=map(Path,args[:2]); yaw=float(args[2]) if len(args)>2 else 0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src.resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert meshes, 'No meshes'
source_triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
for o in meshes:
    transform=Matrix.Rotation(math.radians(yaw),4,'Z')@o.matrix_world
    o.parent=None; o.data=o.data.copy(); o.data.transform(transform); o.matrix_world=Matrix.Identity(4)
vertices=[v.co for o in meshes for v in o.data.vertices]
assert all(math.isfinite(c) for v in vertices for c in v), 'Non-finite vertices'
lo=Vector(tuple(min(v[i] for v in vertices) for i in range(3)))
hi=Vector(tuple(max(v[i] for v in vertices) for i in range(3)))
height=hi.z-lo.z
assert height>1e-6, 'Invalid height'
scale = height
if len(args) > 3:
    max_span = float(args[3])
    assert max_span > 0
    scale = max(height, (hi.x - lo.x) / max_span, (hi.y - lo.y) / max_span)
center=Vector(((hi.x+lo.x)*.5,(hi.y+lo.y)*.5,lo.z))
for o in meshes:
    for v in o.data.vertices:v.co=(v.co-center)/scale
    bpy.context.view_layer.objects.active=o
    o.select_set(True)
    if source_triangles>26000:
        mod=o.modifiers.new('Toy game reduction','DECIMATE');mod.ratio=24000/source_triangles
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
    # Weld UV-split boundary vertices after reduction; per-corner UVs survive,
    # while the recalculated normals can be continuous across those boundaries.
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bm.to_mesh(o.data);bm.free()
    for polygon in o.data.polygons:polygon.use_smooth=True
    o.data.validate(verbose=True)
    o.data.update()
    assert o.data.uv_layers, 'Missing UVs: '+o.name
    assert len(o.data.materials), 'Missing materials: '+o.name

images=[im for im in bpy.data.images if im.users and im.type=='IMAGE']
assert images and all(min(im.size)>0 for im in images), 'Missing texture images'
source_images=[{'name':im.name,'size':list(im.size)} for im in images]
for im in images:
    w,h=im.size
    if max(w,h)>2048:im.scale(round(w*2048/max(w,h)),round(h*2048/max(w,h)))
    im.pack()
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
vertices=[v.co for o in meshes for v in o.data.vertices]
dimensions=[max(v[i] for v in vertices)-min(v[i] for v in vertices) for i in range(3)]
assert all(.01<d<4 for d in dimensions), ('Unexpected dimensions',dimensions)
for o in bpy.context.selected_objects:o.select_set(False)
for o in meshes:o.select_set(True)
dst.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(dst.resolve()),use_selection=True,export_format='GLB')
report={'source':str(src),'output':str(dst),'sourceTriangles':source_triangles,'triangles':triangles,
        'meshes':len(meshes),'normalizedDimensionsXYZ':dimensions,'yawDegrees':yaw,'sourceImages':source_images,
        'images':[{'name':im.name,'size':list(im.size)} for im in images],
        'geometryChecksPassed':True,'visualReviewPassed':False,
        'note':'Automated checks do not replace front/side/back visual review. No animation or character-specific action has been added.'}
dst.with_suffix('.inspection.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('TOY_INSPECTION',json.dumps(report),flush=True)
