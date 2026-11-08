"""Prepare independent Hi3D visual skins; never use this mesh as a collision world."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Matrix,Vector
root=Path(__file__).resolve().parent
source=root.parent/'.local/bubbleport-props'
records=[]
for key,outname in [('bumper','obstacle-capsule.glb'),('mallet','mallet-head.glb')]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(source/(key+'-raw.glb')))
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
 original=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
 for o in objects:
  transform=o.matrix_world.copy();o.parent=None;o.data=o.data.copy();o.data.transform(transform);o.matrix_world=Matrix.Identity(4)
 points=[v.co for o in objects for v in o.data.vertices];lo=Vector(tuple(min(v[k] for v in points) for k in range(3)));hi=Vector(tuple(max(v[k] for v in points) for k in range(3)));center=(lo+hi)/2
 for o in objects:
  for v in o.data.vertices:v.co-=center
  bpy.context.view_layer.objects.active=o
  mod=o.modifiers.new('Runtime silhouette budget','DECIMATE');mod.ratio=min(1,12000/max(1,original));mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
  for poly in o.data.polygons:poly.use_smooth=True
  o.data.update()
 for image in bpy.data.images:
  if image.size[0] and image.size[1] and max(image.size)>1024:
   factor=1024/max(image.size);image.scale(max(1,round(image.size[0]*factor)),max(1,round(image.size[1]*factor)))
 out=root/'dist/assets'/outname
 bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_normals=True,export_materials='EXPORT',export_image_format='AUTO')
 triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
 records.append({'key':key,'file':outname,'sourceTriangles':original,'triangles':triangles,'bytes':out.stat().st_size,'textureMax':1024,'purpose':'visual skin only; collision and pivots are original program geometry'})
(root/'prop-preparation.json').write_text(json.dumps(records,indent=2)+'\n')
(root/'dist/assets/props.json').write_text(json.dumps({'models':records},indent=2)+'\n')
print(json.dumps(records))
