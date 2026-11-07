import bpy, os, json, math, struct
from mathutils import Vector
OUT=os.path.dirname(os.path.abspath(__file__))
expected=['Idle','Walk','AttackMelee','HookWindup','HookCast','HookRecover','Hit','Death']
def doc(path):
 with open(os.path.join(OUT,path),'rb') as f:
  magic,version,total=struct.unpack('<III',f.read(12));assert magic==0x46546C67 and version==2
  length,kind=struct.unpack('<II',f.read(8));return json.loads(f.read(length))
result={}
for path in ['Zombie_Hooker.glb','Zombie_Hooker_LOD1.glb','HookTip.glb','HookTether_Segment.glb','HookWarning.glb']:
 g=doc(path);clips=[a['name'] for a in g.get('animations',[])];tris=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
 result[path]={'animations':clips,'skins':len(g.get('skins',[])),'triangles':tris,'embedded_bytes':os.path.getsize(os.path.join(OUT,path)),'vertex_colors':all('COLOR_0' in p['attributes'] for m in g['meshes'] for p in m['primitives']) if 'Warning' not in path else True}
 if path.startswith('Zombie'):assert sorted(clips)==sorted(expected);assert any(n.get('name')=='HookSpawn' for n in g['nodes'])
 else:assert not g.get('skins')
 assert all('uri' not in b for b in g.get('buffers',[]))
# Reopen native source, then perform a completely fresh glTF import.
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'Zombie_Hooker.blend'))
assert bpy.data.objects.get('Hooker_Rig') and bpy.data.objects.get('HookSpawn')
assert all(bpy.data.actions.get(n) for n in expected)
result['blend_reopen']='PASS'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,'Zombie_Hooker.glb'))
scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE');meshes=[o for o in scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
result['import_bones']=len(rig.data.bones);result['import_skinned_meshes']=len(meshes);result['unweighted_vertices']=sum(1 for o in meshes for v in o.data.vertices if not v.groups)
assert result['unweighted_vertices']==0
tracks=list(rig.animation_data.nla_tracks)
for t in tracks:t.mute=True
motion={};snapshots={}
def points():
 dg=bpy.context.evaluated_depsgraph_get();dg.update();ps=[]
 for o in meshes:
  if 'Tether' in o.name:continue
  ev=o.evaluated_get(dg);me=ev.to_mesh();ps.extend([ev.matrix_world@v.co for v in me.vertices]);ev.to_mesh_clear()
 return ps
for t in tracks:
 a=t.strips[0].action;name=next((n for n in expected if n in t.name),t.name);rig.animation_data.action=a
 if a.slots:rig.animation_data.action_slot=a.slots[0]
 start,end=map(float,a.frame_range);samples=[];low=100
 # Every frame must remain finite and above ground after the export/import round trip.
 for f in sorted(set([start,end]+list(range(math.ceil(start),math.floor(end)+1)))):
  scene.frame_set(math.floor(f),subframe=f-math.floor(f));ps=points();assert all(math.isfinite(c) for p in ps for c in p);low=min(low,min(p.z for p in ps))
 for f in [start,start+(end-start)*.25,(start+end)/2,end]:
  scene.frame_set(math.floor(f),subframe=f-math.floor(f));samples.append(points())
 delta=max((p-q).length for sample in samples[1:] for p,q in zip(samples[0],sample));assert delta>.001,(name,delta)
 seam=max((p-q).length for p,q in zip(samples[0],samples[-1]));snapshots[name]=(samples[0],samples[-1])
 motion[name]={'frame_range':[start,end],'motion_m':round(delta,5),'minimum_z_all_frames':round(low,5),'loop_seam_m':round(seam,6) if name in ['Idle','Walk'] else None,'passed':True}
 assert low>-.006,(name,low)
 if name in ['Idle','Walk']:assert seam<.001,(name,seam)
assert sorted(motion)==sorted(expected),list(motion)
result['roundtrip_animations']=motion
result['ability_transition_max_vertex_gap_m']={}
for a,b in [('HookWindup','HookCast'),('HookCast','HookRecover')]:
 gap=max((p-q).length for p,q in zip(snapshots[a][1],snapshots[b][0]));result['ability_transition_max_vertex_gap_m'][a+' -> '+b]=round(gap,6);assert gap<.002
with open(os.path.join(OUT,'export_validation.json'),'w',encoding='utf8') as f:json.dump(result,f,indent=2,ensure_ascii=False)
print('ALL_EXPORT_TESTS_PASSED',json.dumps(result))
