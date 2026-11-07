import bpy, os, json, math, sys
from mathutils import Vector
OUT=os.path.dirname(os.path.abspath(__file__));scene=bpy.context.scene
rig=bpy.data.objects['Hooker_Rig'];body=bpy.data.objects['Hooker_Body'];hook=bpy.data.objects['HookTip'];tether=bpy.data.objects['HookTether_Animated'];socket=bpy.data.objects['HookSpawn']
names=['Idle','Walk','AttackMelee','HookWindup','HookCast','HookRecover','Hit','Death']
if '--preview' not in sys.argv:
 for previous in list(bpy.data.collections):
  if previous.name.startswith('04 • CROWD LOD'):
   for ob in list(previous.objects):bpy.data.objects.remove(ob,do_unlink=True)
   bpy.data.collections.remove(previous)
 # Final evaluated-pose contact pass, before GLB resampling.
 for tr in rig.animation_data.nla_tracks:tr.mute=True
 for name in names:
  a=bpy.data.actions[name];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
  for f in range(1,int(a.frame_range[1])+1):
   scene.frame_set(f);dg=bpy.context.evaluated_depsgraph_get();dg.update();low=100
   for ob in [body,hook]:
    ev=ob.evaluated_get(dg);me=ev.to_mesh();low=min(low,min((ev.matrix_world@v.co).z for v in me.vertices));ev.to_mesh_clear()
   if low<.009:
    p=rig.pose.bones['root'];p.location+=rig.data.bones['root'].matrix_local.to_quaternion().inverted()@Vector((0,0,.009-low));p.keyframe_insert(data_path='location',frame=f,group='root')
 rig.animation_data.action=bpy.data.actions['Idle'];rig.animation_data.action_slot=bpy.data.actions['Idle'].slots[0];scene.frame_set(1)
 bpy.ops.object.select_all(action='DESELECT')
 for ob in [rig,body,hook,tether,socket]:ob.select_set(True)
 bpy.context.view_layer.objects.active=rig
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Zombie_Hooker.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True,export_extras=True,export_vertex_color='MATERIAL')
 # Optional crowd LOD: preserve skinning and all authored clips.
 col=bpy.data.collections.new('04 • CROWD LOD | hidden reference');scene.collection.children.link(col)
 lods=[]
 for source,ratio in [(body,.43),(hook,.65)]:
  o=source.copy();o.data=source.data.copy();o.name=source.name+'_LOD1';col.objects.link(o);o.hide_set(False)
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
  m=o.modifiers.new('Crowd simplification','DECIMATE');m.ratio=ratio
  # Simplify rest geometry before skinning.
  while o.modifiers.find(m.name)>0:bpy.ops.object.modifier_move_up(modifier=m.name)
  bpy.ops.object.modifier_apply(modifier=m.name);lods.append(o)
 bpy.ops.object.select_all(action='DESELECT')
 for o in [rig,*lods,tether,socket]:o.select_set(True)
 bpy.context.view_layer.objects.active=rig
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Zombie_Hooker_LOD1.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True,export_extras=True,export_vertex_color='MATERIAL')
 counts={}
 for o in lods:o.data.calc_loop_triangles();counts[o.name]=len(o.data.loop_triangles);o.hide_render=True;o.hide_set(True)
 with open(os.path.join(OUT,'lod_validation.json'),'w') as f:json.dump(counts,f,indent=2)
 scene.frame_set(1)
 bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Zombie_Hooker.blend'))
 print('LOD_FINISH_OK',counts)
else:
 # A single labelled review reel, with all original clips as sequential NLA strips.
 for tr in rig.animation_data.nla_tracks:tr.mute=True
 rig.animation_data.action=None
 track=rig.animation_data.nla_tracks.new();track.name='PREVIEW_ONLY'
 timeline=[];frame=1
 for name in names:
  a=bpy.data.actions[name];length=int(a.frame_range[1]-a.frame_range[0]);s=track.strips.new(name,frame,a);s.action_frame_start=1;s.action_frame_end=length+1;s.blend_type='REPLACE';s.extrapolation='NOTHING'
  timeline.append((frame,frame+length,name));frame+=length
 # Let the fallen pose hold for half a second.
 track.strips[-1].extrapolation='HOLD_FORWARD';scene.frame_start=1;scene.frame_end=frame+15
 # Workbench renders are deliberately clearly described as motion review.
 scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.studiolight_rotate_z=.45
 scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH';scene.display.shading.curvature_ridge_factor=1.4;scene.display.shading.curvature_valley_factor=1.0
 scene.display.shading.background_type='WORLD';scene.world.color=(.018,.025,.035)
 scene.display.render_aa='8'
 for o in bpy.data.collections['03 • STUDIO | excluded from exports'].objects:
  if o.type=='MESH':o.hide_render=True
 cam=scene.camera;cam.data.type='ORTHO';cam.data.ortho_scale=7.6
 target=Vector((-.50,1.25,1.3));cam.location=(-5.6,9.6,6.3);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
 # Labels are camera children; the reel remains readable without sound.
 def label(name,txt,loc,size,ma):
  cu=bpy.data.curves.new(name,'FONT');cu.body=txt;cu.size=size;cu.extrude=0;ob=bpy.data.objects.new(name,cu);scene.collection.objects.link(ob);ob.parent=cam;ob.location=loc;cu.materials.append(ma);return ob
 white=bpy.data.materials.new('Preview type • pale');white.diffuse_color=(.75,.85,.85,1)
 accent=bpy.data.materials.new('Preview type • jade');accent.diffuse_color=(.38,.85,.24,1)
 title=label('Preview title','CENGELCI  /  HOOKER ZOMBIE',(-3.5,2.25,-8),.17,white)
 caption=label('Preview clip','Idle',(-3.5,-2.25,-8),.22,accent)
 label('Preview subtitle','BONE ANIMATION REVIEW  /  30 FPS',(-3.5,2.02,-8),.105,white)
 warning=bpy.data.objects['HookWarning'];warning.hide_set(False);warning.hide_render=False;warning.location=(-.8,1.4,0);warning.scale=(1.4,1.4,1)
 def handler(sc):
  current=next((n for a,b,n in timeline if a<=sc.frame_current<b),'Death');caption.data.body=current
  warning.hide_render=current not in ['HookWindup','HookCast','HookRecover']
 bpy.app.handlers.frame_change_pre.append(handler)
 scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100
 scene.render.image_settings.media_type='VIDEO';scene.render.image_settings.file_format='FFMPEG';scene.render.ffmpeg.format='MPEG4';scene.render.ffmpeg.codec='H264';scene.render.ffmpeg.constant_rate_factor='MEDIUM';scene.render.filepath=os.path.join(OUT,'Animation_Preview.mp4')
 with open(os.path.join(OUT,'preview_timeline.json'),'w') as f:json.dump(timeline,f,indent=2)
 bpy.ops.render.render(animation=True)
 print('PREVIEW_COMPLETE')
