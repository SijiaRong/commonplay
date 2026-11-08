import bpy, sys, os, math
from mathutils import Vector
src, game = sys.argv[sys.argv.index('--')+1:]
def inspect(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    total=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    images=[im for im in bpy.data.images if im.users and im.type=='IMAGE']
    print('CHECK',path,total,'triangles',len(meshes),'meshes',len(bpy.data.armatures),'armatures',[(im.name,tuple(im.size)) for im in images],flush=True)
    assert total>0 and images and all(min(im.size)>0 for im in images)
    return meshes,total,images
meshes,total,images=inspect(src)
if total>30000:
    for o in meshes:
        bpy.context.view_layer.objects.active=o
        m=o.modifiers.new('Game mesh','DECIMATE')
        m.ratio=min(1,20000/total)
        bpy.ops.object.modifier_apply(modifier=m.name)
    for im in images:
        w,h=im.size
        if max(w,h)>2048:
            im.scale(round(w*2048/max(w,h)),round(h*2048/max(w,h)))
            im.pack()
    bpy.ops.export_scene.gltf(filepath=game,export_format='GLB')
    inspect(game)
