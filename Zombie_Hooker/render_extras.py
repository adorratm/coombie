import bpy, os, sys
from mathutils import Vector
OUT=os.path.dirname(os.path.abspath(__file__));sc=bpy.context.scene;cam=sc.camera
def shot(name,loc,target,scale):
 cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;sc.render.filepath=os.path.join(OUT,'renders',name+'.png');bpy.ops.render.render(write_still=True)
shot('04_Hero',(3.2,8,4.3),(-.75,.35,1.4),5.1)
if '--hero-only' in sys.argv:raise SystemExit
r=bpy.data.objects['Hooker_Rig'];r.animation_data.action=bpy.data.actions['HookCast'];r.animation_data.action_slot=r.animation_data.action.slots[0];sc.frame_set(22)
w=bpy.data.objects['HookWarning'];w.hide_set(False);w.hide_render=False;w.location=(-.8,2.6,.01);w.scale=(1.65,1.65,1)
sc.render.resolution_x=1600;sc.render.resolution_y=1200
shot('05_Deadly_Hook',(5.5,9.5,8),(-.7,2,1.2),7.9)
print('EXTRA_RENDERS_OK')
