"""Repair reviewed toy geometry and smooth normals on the reduced mesh.
Blender --background --python tools/blender/polish_toy.py -- game.glb pip|tik|wob
"""
import bpy,bmesh,sys,json,math
from pathlib import Path
from mathutils import Vector,Matrix
file,kind=sys.argv[sys.argv.index('--')+1:];file=Path(file)
report_file=file.with_suffix('.inspection.json');report=json.loads(report_file.read_text())
assert not report.get('tailRepair'), 'Already polished; prepare again from the original before reapplying repairs'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(file.resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in meshes:
    world=o.matrix_world.copy();o.parent=None;o.data.transform(world);o.matrix_world=Matrix.Identity(4)
    bpy.context.view_layer.objects.active=o;bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bm=bmesh.new();bm.from_mesh(o.data)
    if kind=='wob':
        # The single-view reconstruction invented a rear tail. Cut only the
        # protrusion, seal the cut, and sample purple UVs from the nearby body.
        uv=bm.loops.layers.uv.active
        reference=min((loop for face in bm.faces for loop in face.loops),key=lambda l:(l.vert.co-Vector((0,.20,.64))).length_squared)
        color_uv=reference[uv].uv.copy() if uv else None
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(0,.285,0),plane_no=(0,1,0),clear_outer=True,clear_inner=False)
        border=[e for e in bm.edges if e.is_boundary and all(abs(v.co.y-.285)<1e-4 for v in e.verts)]
        result=bmesh.ops.holes_fill(bm,edges=border,sides=0)
        # UV seams can leave the cut as several open edge chains. Close their
        # convex rear cross-section explicitly instead of leaving an open back.
        points={ (round(v.co.x,6),round(v.co.z,6)):v for v in bm.verts if abs(v.co.y-.285)<1e-4 }
        keys=sorted(points)
        def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        lower=[];upper=[]
        for point in keys:
            while len(lower)>=2 and cross(lower[-2],lower[-1],point)<=0:lower.pop()
            lower.append(point)
        for point in reversed(keys):
            while len(upper)>=2 and cross(upper[-2],upper[-1],point)<=0:upper.pop()
            upper.append(point)
        hull=lower[:-1]+upper[:-1]
        if len(hull)>=3:
            bmesh.ops.delete(bm,geom=list(result['faces']),context='FACES_ONLY')
            result={'faces':[bm.faces.new([points[p] for p in hull])]}
        for face in result['faces']:
            face.normal_update()
            if face.normal.y<0:face.normal_flip()
            if uv:
                for loop in face.loops:loop[uv].uv=color_uv
        bmesh.ops.triangulate(bm,faces=result['faces'])
    elif kind=='pip':
        for v in bm.verts:
            if v.co.y>.08:v.co.y=.08+(v.co.y-.08)*.68
    elif kind=='tik':
        for v in bm.verts:
            if v.co.y>-.04:v.co.y=-.04+(v.co.y+.04)*.28
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    # Preserve the generator's winding. Reorienting disconnected UV islands as
    # separate volumes can flip entire surface patches and cause culled holes.
    bm.to_mesh(o.data);bm.free()
    for face in o.data.polygons:face.use_smooth=True
    o.data.update();o.data.validate()
    # Put the main body over the motion origin, excluding the tail silhouette.
    points=[v.co for v in o.data.vertices if .2<v.co.z<.5 and abs(v.co.x)<.2]
    body_y=sum(v.y for v in points)/len(points) if points else 0
    for v in o.data.vertices:v.co.y-=body_y
for o in bpy.context.selected_objects:o.select_set(False)
for o in meshes:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(file.resolve()),use_selection=True,export_format='GLB')
report.update(smoothNormals=True,uvSeamsWelded=True,tailRepair={'pip':'compressed rear depth to 68%','wob':'removed invented tail and sealed cut','tik':'shortened wind-up shaft to 28%'}.get(kind,'not needed'),visualReviewPassed=False)
report['triangles']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
vertices=[v.co for o in meshes for v in o.data.vertices]
report['normalizedDimensionsXYZ']=[max(v[i] for v in vertices)-min(v[i] for v in vertices) for i in range(3)]
report_file.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('TOY_POLISH',kind,report['triangles'],flush=True)
