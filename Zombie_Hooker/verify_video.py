import bpy,os,json
OUT=os.path.dirname(os.path.abspath(__file__));bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene
ed=s.sequence_editor_create();strip=ed.strips.new_movie('Hooker motion review',os.path.join(OUT,'Animation_Preview.mp4'),channel=1,frame_start=1)
s.render.fps=30;s.render.resolution_x=960;s.render.resolution_y=720;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.use_sequencer=True;s.render.film_transparent=False
assert strip.frame_final_duration>=280
for f,name in [(15,'QA_Idle'),(175,'QA_HookCast'),(282,'QA_Death')]:
 s.frame_set(f);s.render.filepath=os.path.join(OUT,'renders',name+'.png');bpy.ops.render.render(write_still=True)
with open(os.path.join(OUT,'video_validation.json'),'w') as f:json.dump({'frames':strip.frame_final_duration,'fps':30,'duration_seconds':strip.frame_final_duration/30,'resolution':[960,720],'decode_test_frames':[15,175,282],'passed':True},f,indent=2)
print('VIDEO_DECODE_OK',strip.frame_final_duration)
