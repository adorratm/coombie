import bpy, math, random, os, json
from mathutils import Vector, Euler, Quaternion
from math import sin, cos, pi, exp
random.seed(812)
OUT=os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(OUT,'renders'),exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.render.fps=30
game=bpy.data.collections.new('01 • CHARACTER | engine export');scene.collection.children.link(game)
library=bpy.data.collections.new('02 • ABILITY PARTS | independent exports');scene.collection.children.link(library)
stage=bpy.data.collections.new('03 • STUDIO | excluded from exports');scene.collection.children.link(stage)
parts=[]
def move(o,col):
 for c in list(o.users_collection):c.objects.unlink(o)
 col.objects.link(o)
def material(name,col,rough=.7,metal=0,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if emission:p.inputs['Emission Color'].default_value=(*col,1);p.inputs['Emission Strength'].default_value=emission
 return m
skin=material('01 | Oxblood • necrotic hide',(.16,.028,.022))
bone=material('02 | Old ivory • bone',(.64,.49,.27),.55)
cloth=material('03 | Drowned teal • torn cloth',(.036,.10,.10),.9)
leather=material('04 | Tar • straps and cavities',(.027,.018,.018),.86)
flesh=material('05 | Raw wounds • vermilion',(.36,.047,.042),.57)
iron=material('06 | Tarnished bronze',(.23,.16,.067),.43,.65)
eye=material('07 | Virulent green • emissive',(.23,1,.012),.25,0,4)
red=material('08 | Danger crimson • emissive',(.95,.006,.016),.4,0,3)
for m in [skin,bone,cloth,leather,flesh,iron]:
 n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='Pigment';m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
def finish(o,name,ma,bind=None,collect=True):
 o.name=name;move(o,game);o.data.materials.clear();o.data.materials.append(ma)
 if bind:o.vertex_groups.new(name=bind).add(list(range(len(o.data.vertices))),1,'REPLACE')
 if collect:parts.append(o)
 return o
def mesh(name,vs,fs,ma,bind=None,collect=True):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);game.objects.link(o);return finish(o,name,ma,bind,collect)
def ell(name,p,s,ma=skin,bind=None,seg=16,rings=10,rot=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=p);o=bpy.context.object;o.scale=s
 if rot:o.rotation_euler=rot
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,ma,bind)
def tube(name,pts,rs,ma=skin,bind=None,n=10):
 vs=[];fs=[]
 # Parallel reference gives a stable frame along the sweeping shapes.
 for i,p in enumerate(pts):
  p=Vector(p);d=Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)]);d.normalize();ref=Vector((0,1,0))
  if abs(d.dot(ref))>.92:ref=Vector((0,0,1))
  u=d.cross(ref).normalized();v=d.cross(u).normalized();r=rs[i];a,b=(r,r) if isinstance(r,(float,int)) else r
  for j in range(n):
   ang=2*pi*j/n;vs.append(tuple(p+a*cos(ang)*u+b*sin(ang)*v))
 for i in range(len(pts)-1):
  for j in range(n):a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
 fs.extend([tuple(reversed(range(n))),tuple((len(pts)-1)*n+j for j in range(n))])
 return mesh(name,vs,fs,ma,bind)
def join(obs,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=obs[0];o.name=name
 for p in obs:
  if p in parts:parts.remove(p)
 parts.append(o);return o
def fuse(obs,name,voxel,ratio):
 o=join(obs,name);bpy.context.view_layer.objects.active=o
 m=o.modifiers.new('Anatomical union','REMESH');m.mode='VOXEL';m.voxel_size=voxel;bpy.ops.object.modifier_apply(modifier=m.name)
 m=o.modifiers.new('Sculpt relaxation','SMOOTH');m.factor=1.2;m.iterations=4;bpy.ops.object.modifier_apply(modifier=m.name)
 m=o.modifiers.new('Low polygon sculpt surface','DECIMATE');m.ratio=ratio;bpy.ops.object.modifier_apply(modifier=m.name)
 return o
def spike(name,pts,r=.13,bind='chest'):
 return tube(name,pts,[r,r*.65,.004],bone,bind,7)
def band(name,a,b,r,ma=leather,bind=None):return tube(name,[a,b],[r,r],ma,bind,12)

# Unified organic anatomy. All primitives are fused and sculpt-relaxed before retopology.
masses=[]
for name,p,s in [
 ('Pelvic girdle',(0,-.09,1.02),(.44,.29,.34)),('Sunken waist',(0,-.05,1.38),(.36,.27,.41)),
 ('Barrel ribcage',(0,-.05,1.90),(.65,.36,.53)),('Hunched trapezius',(0,-.22,2.20),(.63,.40,.46)),
 ('Right deltoid',(-.71,-.02,2.17),(.38,.34,.36)),('Left deltoid',(.66,-.03,2.12),(.32,.32,.34)),
 ('Thick neck',(0,.19,2.25),(.28,.28,.34)),('Cranium',(0,.40,2.38),(.30,.29,.34)),
 ('Jaw base',(0,.55,2.12),(.255,.21,.17)),('Left calf',(.29,.06,.48),(.17,.18,.30)),('Right calf',(-.28,-.06,.49),(.17,.17,.29))]:masses.append(ell(name,p,s))
arms={'R':[(-.74,0,2.20),(-1.18,.02,1.81),(-1.56,.36,1.22)],'L':[(.68,0,2.16),(.95,.15,1.76),(1.06,.50,1.43)]}
legs={'R':[(-.28,-.04,1.10),(-.31,.12,.66),(-.36,-.04,.18)],'L':[(.28,-.04,1.09),(.32,.20,.65),(.29,.02,.18)]}
for side,ps in arms.items():
 masses.append(tube('Arm mass '+side,ps,[(.28,.29),(.245,.23),(.16,.15)] if side=='R' else [(.25,.24),(.20,.19),(.13,.12)],n=14))
 masses.append(ell('Elbow '+side,ps[1],(.25,.23,.25) if side=='R' else (.20,.20,.20)))
for side,ps in legs.items():
 masses.append(tube('Leg anatomy '+side,ps,[(.235,.23),(.19,.19),(.12,.13)],n=12))
 masses.append(ell('Foot '+side,(ps[-1][0],.15,.115),(.185,.33,.115)))
body=fuse(masses,'Hooker | continuous sculpted hide',.032,.20)
# Designed planar face: sharp cheek wedges, heavy asymmetrical brow, split nose, gums and individual teeth.
for s in [-1,1]:
 tube('Zygomatic ridge',[(s*.24,.55,2.41),(s*.245,.67,2.28),(s*.19,.70,2.20)],[.105,.08,.035],skin,'head',7)
 ell('Deep orbital socket',(s*.132,.654,2.414),(.135,.047,.088),leather,'head',12,8,rot=(0,s*.12,s*.16))
 # Angular emissive eye slit, with a dark pupil set into the luminous shape.
 x=s*.132
 mesh('Poison eye',[(x-s*.102,.697,2.438),(x+s*.086,.707,2.452),(x+s*.078,.713,2.399),(x-s*.077,.712,2.382)],[(0,1,2,3)],eye,'head')
 ell('Slit pupil',(x,.721,2.418),(.013,.010,.033),leather,'head',8,6)
 tube('Overhanging brutal brow',[(s*.018,.66,2.49),(s*.125,.705,2.505),(s*.265,.61,2.47)],[.067,.086,.045],skin,'head',7)
 spike('Brow horn',[(s*.23,.48,2.60),(s*.30,.42,2.78),(s*.37,.35,2.83)],.09,'head')
 ell('Torn ear',(s*.315,.37,2.39),(.13,.055,.115),skin,'head',8,6,rot=(0,s*.4,0))
mesh('Broken nose',[(0,.68,2.47),(-.065,.69,2.34),(-.058,.80,2.29),(.045,.79,2.30),(.072,.68,2.35)],[(0,1,2),(0,2,3),(0,3,4),(1,4,3,2)],skin,'head')
ell('Nasal void',(-.013,.794,2.305),(.038,.012,.027),leather,'head',8,6)
ell('Jagged mouth cavity',(0,.712,2.17),(.21,.045,.089),leather,'jaw',16,8)
tube('Exposed lower gums',[(-.20,.708,2.126),(0,.759,2.094),(.19,.711,2.132)],[.037,.045,.028],flesh,'jaw',8)
for i,x in enumerate([-.165,-.11,-.057,.005,.067,.13,.18]):
 z=2.219-abs(x)*.11
 tube('Broken upper tooth',[(x,.745,z),(x-.009,.765,z-.045-random.random()*.035)],[.024,.004],bone,'head',5)
for i,x in enumerate([-.18,-.10,-.025,.055,.135]):
 tube('Lower jagged tusk',[(x,.749,2.105),(x+.009,.782,2.18+(.05 if i in [0,4] else 0))],[.027,.003],bone,'jaw',5)
spike('Chin ossification',[(-.06,.61,2.04),(-.085,.68,1.96),(-.10,.73,1.92)],.08,'jaw')
# Rib, tendon and scar accents are individually shaped rather than texture noise.
for s in [-1,1]:
 tube('Clavicle tendon',[(s*.07,.265,2.22),(s*.34,.30,2.20),(s*.57,.23,2.23)],[.045,.065,.028],skin,'chest',8)
 for j in range(3):
  z=1.94-j*.13
  tube('Subcutaneous ribs',[(s*.20,.286,z),(s*.39,.299,z+.07),(s*.54,.235,z+.11)],[.035,.049,.012],skin,'chest',7)
for j in range(3):
 x=-.29+j*.12
 tube('Claw wound • chest',[(x,.329,2.08),(x+.085,.358,1.94),(x+.13,.319,1.78)],[.016,.024,.009],flesh,'chest',5)
for j in range(5):
 z=1.54+j*.065
 tube('Sutured abdominal gash',[(-.17,.223,z),(-.10,.265,z+.025),(-.04,.25,z+.013)],[.009,.013,.006],leather,'spine',5)
 tube('Bone staple',[(-.135,.264,z-.013),(-.12,.282,z+.025)],[.009,.009],bone,'spine',5)
# Asymmetrical ossified shoulder mantle; silhouette spikes continue down the hunch.
for side,s in [('R',-1),('L',1)]:
 count=5 if side=='R' else 3
 for j in range(count):
  x=s*(.42+j*.09);y=-.14+(.10 if j%2 else -.08);z=2.48-abs(j-1)*.055
  ell('Bone growth socket',(x,y,z-.07),(.14,.13,.11),bone,'upper_arm.'+side,10,6)
  spike('Shoulder thorn',[(x,y,z-.06),(x+s*.12,y-.09,z+.17),(x+s*.22,y-.19,z+.28-(j*.025))],.115,'upper_arm.'+side)
for j in range(5):
 z=2.53-j*.19;y=-.41 if j<2 else -.39
 spike('Dorsal spinal osteophyte',[(0,y,z),(0,y-.18,z+.12),(.035,y-.30,z+.21)],.14-j*.012,'chest' if j<4 else 'spine')
# Left powerful hand and three long talons, plus hooked thumb.
ell('Left palm',(1.08,.62,1.35),(.19,.23,.14),skin,'hand.L',12,8)
for j in range(3):
 x=.94+j*.13
 tube('Left finger',[(x,.72,1.34),(x+.025,.92,1.29),(x+.04,.99,1.19)],[.066,.055,.036],skin,'finger.L',8)
 tube('Ivory talon',[(x+.04,.98,1.21),(x+.045,1.04,1.12),(x+.02,1.00,1.06)],[.041,.026,.002],bone,'finger.L',7)
tube('Left thumb',[(1.22,.56,1.33),(1.36,.72,1.28),(1.34,.85,1.18)],[.08,.066,.002],bone,'hand.L',8)
for side in ['L','R']:
 ps=arms[side];p=Vector(ps[1]);q=Vector(ps[2]);d=(q-p).normalized()
 for j in range(3 if side=='R' else 2):
  c=p.lerp(q,.25+j*.19);band('Forearm binding',c-d*.036,c+d*.036,.248-j*.021 if side=='R' else .198-j*.015,leather,'forearm.'+side)
 if side=='R':
  spike('Elbow exposed bone',[tuple(p+Vector((0,-.10,.02))),tuple(p+Vector((-.17,-.30,.08))),tuple(p+Vector((-.30,-.36,.17)))],.12,'forearm.R')
  for j in range(3):
   c=p.lerp(q,.30+j*.16)
   tube('Mutant raw tendon',[tuple(c+Vector((-.12,.16,.07))),tuple(c+Vector((-.16,.17,-.10)))],[.033,.018],flesh,'forearm.R',6)

# Hook: broad blade cross sections, swept barb and taper. Kept independently exportable.
hookparts=[]
start=len(parts)
hookpath=[(-1.56,.36,1.22),(-1.75,.50,1.05),(-2.03,.76,.87),(-2.30,1.04,.88),(-2.48,1.29,1.08),(-2.45,1.48,1.36),(-2.27,1.51,1.56),(-2.10,1.39,1.59),(-2.08,1.25,1.45)]
tube('Great ossuary hook',hookpath,[(.16,.15),(.19,.12),(.20,.105),(.205,.085),(.19,.075),(.15,.065),(.11,.048),(.065,.035),.003],bone,'hook.R',8)
tube('Hook carmine marrow ridge',[(x,y-.045,z+.08) for x,y,z in hookpath[1:-2]],[.047,.055,.057,.047,.035,.015],flesh,'hook.R',6)
for j in [1,2,3]:
 p=Vector(hookpath[j]);spike('Hook reverse barb',[tuple(p),tuple(p+Vector((.02,-.12,.16))),tuple(p+Vector((.10,-.19,.23)))],.08,'hook.R')
band('Hook root binding',(-1.57,.36,1.21),(-1.73,.49,1.07),.186,leather,'hook.R')
hookparts=parts[start:];hook=join(hookparts,'HookTip');hook['role']='Detachable projectile; local origin at HookSpawn; +Y travel direction';parts.remove(hook)

# Ragged, thick cloth panels with alternating triangular hems and authored folds.
def rag(name,x0,x1,y,z,drop,bind):
 vs=[];n=7
 for row in range(3):
  for i in range(n):
   t=i/(n-1);x=x0+(x1-x0)*t;zz=z-drop*row/2
   if row==2:zz+=([.05,-.10,.035,-.17,.03,-.11,.04][i])
   yy=y+sin(t*pi*5)*.028+(row*.035 if y>0 else -row*.025)
   vs.append((x,yy,zz))
 fs=[]
 for r in range(2):
  for i in range(n-1):a=r*n+i;fs.append((a,a+1,a+1+n,a+n))
 o=mesh(name,vs,fs,cloth,bind);bpy.context.view_layer.objects.active=o
 m=o.modifiers.new('Cloth thickness','SOLIDIFY');m.thickness=.018;bpy.ops.object.modifier_apply(modifier=m.name)
 return o
rag('Torn front tabard',-.38,.36,.28,1.16,.43,'pelvis')
rag('Long ragged rear cloth',-.38,.36,-.33,1.15,.49,'pelvis')
for side,s in [('R',-1),('L',1)]:
 tube('Tattered trouser leg '+side,[(s*.28,-.035,1.10),(s*.31,.06,.84),(s*.31,.13,.70)],[.255,.24,.205],cloth,'thigh.'+side,10)
 # Knee plates with split form, and narrow shin wrappings.
 ell('Exposed kneecap',(s*.31,.278,.65),(.125,.065,.145),bone,'shin.'+side,10,7)
 for j in range(4 if side=='R' else 2):
  z=.26+j*.07
  band('Shin winding',(s*.33,.02,z),(s*.33,.02,z+.039),.145,cloth if side=='L' else leather,'shin.'+side)
 for j in range(3):
  x=s*.33+(j-1)*.095
  tube('Exposed toe claw',[(x,.34,.11),(x,.45,.075)],[.045,.004],bone,'foot.'+side,6)
# Belt is an actual elliptical ring mesh, with bone buckle and trophy teeth.
def ring(name,center,rx,ry,width,depth,ma,bind=None,n=32):
 vs=[];fs=[];cx,cy,cz=center
 for dz,scale in [(-width/2,1),(width/2,1),(-width/2,1-depth),(width/2,1-depth)]:
  for j in range(n):a=2*pi*j/n;vs.append((cx+rx*scale*cos(a),cy+ry*scale*sin(a),cz+dz))
 for j in range(n):
  k=(j+1)%n;fs.extend([(j,k,n+k,n+j),(2*n+j,3*n+j,3*n+k,2*n+k),(j,2*n+j,2*n+k,k),(n+j,n+k,3*n+k,3*n+j)])
 return mesh(name,vs,fs,ma,bind)
ring('Broad waist belt',(0,-.02,1.17),.46,.34,.13,.09,leather,'pelvis')
ell('Skull buckle',(0,.35,1.18),(.105,.045,.115),bone,'pelvis',10,7)
for s in [-1,1]:ell('Buckle eye socket',(s*.035,.393,1.20),(.023,.013,.029),leather,'pelvis',8,5)
for j in range(7):
 a=.25+j*.40;x=.43*cos(a);y=.32*sin(a)-.02
 tube('Belt ossuary trophy',[(x,y,1.12),(x*.98,y+.025,.99-random.random()*.07)],[.035,.004],bone,'pelvis',5)
# Diagonal chest strap, articulated with the ribcage.
tube('Chest strap',[(.50,.22,2.29),(.28,.354,2.05),(.06,.337,1.82),(-.25,.275,1.57)],[.055,.055,.055,.055],leather,'chest',4)
for z,x in [(2.14,.37),(2.04,.28),(1.94,.18)]:ell('Strap bronze rivet',(x,.399,z),(.019,.013,.019),iron,'chest',8,5)

# Real hierarchical skeleton. +Y faces forward in Blender, +Z is up.
bpy.ops.object.armature_add(enter_editmode=True);rig=bpy.context.object;rig.name='Hooker_Rig';move(rig,game);arm=rig.data;arm.name='Hooker_Skeleton';arm.edit_bones.remove(arm.edit_bones[0]);defs={}
def addbone(n,a,b,parent=None,deform=True):
 e=arm.edit_bones.new(n);e.head=a;e.tail=b;e.use_deform=deform
 if parent:e.parent=arm.edit_bones[parent]
 defs[n]=(Vector(a),Vector(b));return e
addbone('root',(0,0,0),(0,0,.30))
addbone('pelvis',(0,-.04,1.03),(0,-.04,1.38),'root')
addbone('spine',(0,-.04,1.38),(0,-.10,1.88),'pelvis')
addbone('chest',(0,-.10,1.88),(0,-.12,2.27),'spine')
addbone('neck',(0,-.12,2.27),(0,.32,2.37),'chest')
addbone('head',(0,.32,2.37),(0,.66,2.42),'neck')
addbone('jaw',(0,.46,2.14),(0,.74,2.12),'head')
for side,ps in arms.items():
 addbone('clavicle.'+side,(0,-.1,2.22),ps[0],'chest')
 addbone('upper_arm.'+side,ps[0],ps[1],'clavicle.'+side)
 addbone('forearm.'+side,ps[1],ps[2],'upper_arm.'+side)
 if side=='L':
  addbone('hand.L',ps[2],(1.08,.77,1.33),'forearm.L');addbone('finger.L',(1.08,.77,1.33),(1.10,1,1.18),'hand.L')
for side,ps in legs.items():
 addbone('thigh.'+side,ps[0],ps[1],'pelvis');addbone('shin.'+side,ps[1],ps[2],'thigh.'+side);addbone('foot.'+side,ps[2],(ps[2][0],.36,.10),'shin.'+side)
w=Vector(arms['R'][-1]);addbone('hook.R',w,w+Vector((0,.25,0)),'forearm.R')
addbone('tether.R',w,w+Vector((0,.12,0)),'forearm.R')
addbone('HookSpawn',w,w+Vector((0,.10,0)),'forearm.R',False)
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True
for p in rig.pose.bones:p.rotation_mode='XYZ'
rig['asset']='Çengelci / Hooker Zombie';rig['forward']='+Y';rig['up']='+Z';rig['units']='meters';rig['gameplay']='Animations are cosmetic; player pull, range and collision are engine responsibilities.'
# Region-aware smooth weights over the welded anatomical skin.
def ds(p,a,b):
 d=b-a;t=max(0,min(1,(p-a).dot(d)/d.length_squared));return (p-a-t*d).length
for n in defs:
 if n not in ['HookSpawn','hook.R','tether.R','finger.L','hand.L']:body.vertex_groups.new(name=n)
for v in body.data.vertices:
 p=body.matrix_world@v.co;x,y,z=p;s='R' if x<0 else 'L'
 if z>2.15 and y>.20 and abs(x)<.40:candidates=['neck','head','jaw']
 elif abs(x)>.65 and z>1.05:candidates=['clavicle.'+s,'upper_arm.'+s,'forearm.'+s]
 elif z<1.1:candidates=['pelvis','thigh.'+s,'shin.'+s,'foot.'+s]
 else:candidates=['pelvis','spine','chest','neck','clavicle.'+s,'upper_arm.'+s]
 dd=sorted([(ds(p,*defs[n]),n) for n in candidates])[:3];ws=[exp(-d*18) for d,n in dd];total=sum(ws)
 for (_,n),weight in zip(dd,ws):
  if weight/total>.005:body.vertex_groups[n].add([v.index],weight/total,'REPLACE')
character=join(list(parts),'Hooker_Body');parts.remove(character)
# Vertex pigments are portable in glTF; no runtime procedural shader dependency.
def pigment(o):
 ca=o.data.color_attributes.get('Pigment') or o.data.color_attributes.new(name='Pigment',type='BYTE_COLOR',domain='CORNER')
 for p in o.data.polygons:
  ma=o.data.materials[p.material_index];base=Vector(ma.diffuse_color[:3]);shade=random.uniform(.94,1.055)
  for li in p.loop_indices:
   pos=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co
   f=shade
   if ma==skin:
    f*=.79+.25*max(0,min(1,(pos.z-.4)/2.2));f+=.05*sin(pos.x*19+pos.z*14)
   if ma==bone:f*=.78+.24*max(0,min(1,pos.z/2.6))
   ca.data[li].color=(*[max(0,min(1,c*f)) for c in base],1)
 o.data.color_attributes.active_color=ca
 for p in o.data.polygons:p.use_smooth=False
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.uv.smart_project(angle_limit=1.12,island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
for o in [character,hook]:pigment(o)
def skinmod(o):
 o.parent=rig;m=o.modifiers.new('Hooker bone deformation','ARMATURE');m.object=rig
skinmod(character);skinmod(hook)
# Bone attachment socket is an actual named object for engines that use node lookup.
socket=bpy.data.objects.new('HookSpawn',None);game.objects.link(socket);socket.empty_display_type='ARROWS';socket.empty_display_size=.14;socket.parent=rig;socket.parent_type='BONE';socket.parent_bone='HookSpawn'
bpy.context.view_layer.update();socket.matrix_world.translation=w
socket['role']='Projectile launch socket, attached to the mutated right wrist';socket['projectile']='HookTip.glb'
# Compact live tendon stretches with a real bone; standalone segment uses length 1 m.
tether=tube('HookTether_Animated',[tuple(w),tuple(w+Vector((0,.06,0))),tuple(w+Vector((0,.12,0)))],[.043,.033,.036],flesh,'tether.R',8);parts.remove(tether);pigment(tether);skinmod(tether)
tether['role']='Cosmetic stretch preview; replace or pool HookTether_Segment.glb at runtime'

# Animation authoring. World-axis offsets are converted into bone-local rotations.
rig.animation_data_create();actions=[]
def rot(n,xyz):
 q=rig.data.bones[n].matrix_local.to_quaternion();rig.pose.bones[n].rotation_euler=(q.inverted()@Euler(xyz).to_quaternion()@q).to_euler()
def offset(n,xyz):rig.pose.bones[n].location=rig.data.bones[n].matrix_local.to_quaternion().inverted()@Vector(xyz)
def reset():
 for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
 rig.pose.bones['tether.R'].scale.y=.01
def idle(t):
 a=sin(2*pi*t);rot('chest',(.018*a,.008*a,.012*a));rot('head',(-.026*a,0,.016*a));rot('jaw',(.025*(a+1),0,0));rot('upper_arm.R',(.018*a,.02*a,0));rot('forearm.L',(.025*a,0,0));offset('pelvis',(0,0,.012*a))
def walk(t):
 a=2*pi*t
 for side,phase,amp in [('L',0,.36),('R',pi,.23)]:
  swing=sin(a+phase);rot('thigh.'+side,(amp*swing,0,0));rot('shin.'+side,(-max(0,-swing)*.48,0,0));rot('foot.'+side,(-.13*swing,0,0))
 rot('pelvis',(0,.045*sin(a),.055*sin(a)));offset('pelvis',(.035*sin(a),0,.025*(1-cos(2*a))))
 rot('chest',(.055*sin(a+.5),0,-.06*sin(a)));rot('head',(-.05*sin(a+.5),0,.04*sin(a)))
 rot('upper_arm.L',(-.24*sin(a),0,0));rot('forearm.L',(-.10+.08*sin(a),0,0));rot('upper_arm.R',(.13*sin(a+.4),.035*sin(a),0))
def melee(t):
 wind=sin(pi*min(1,t/.4)/2) if t<.4 else max(0,1-(t-.4)/.22)
 slash=sin(pi*max(0,min(1,(t-.33)/.57)))
 rot('chest',(.08*slash,0,-.30*wind+.35*slash));rot('upper_arm.L',(-.65*wind+1.00*slash,.20*slash,-.65*wind+.55*slash));rot('forearm.L',(-.9*wind+.5*slash,0,0));rot('hand.L',(.2*slash,0,.4*slash));rot('finger.L',(.35*slash,0,0));rot('jaw',(.22*slash,0,0));offset('pelvis',(0,.12*slash,-.035*slash))
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def windup(t):
 a=smooth(t);rot('chest',(-.10*a,0,.24*a));rot('upper_arm.R',(-.72*a,-.22*a,-.20*a));rot('forearm.R',(-.62*a,0,0));rot('head',(.08*a,0,-.13*a));rot('upper_arm.L',(.18*a,0,.12*a));offset('pelvis',(0,-.10*a,-.05*a))
def cast(t):
 a=smooth(min(1,t/.34));windup(1-a)
 rot('upper_arm.R',(-.72*(1-a)+.28*a,-.22*(1-a),-.20*(1-a)));rot('forearm.R',(-.62*(1-a)+.10*a,0,0));rot('chest',(-.10*(1-a)+.10*a,0,.24*(1-a)-.15*a));rot('jaw',(.22*a,0,0))
 extension=3.6*smooth((t-.22)/.65);offset('hook.R',(0,extension,0));rig.pose.bones['tether.R'].scale.y=max(.01,extension/.12)
def recover(t):
 cast(1);a=smooth(t);offset('hook.R',(0,3.6*(1-a),0));rig.pose.bones['tether.R'].scale.y=max(.01,3.6*(1-a)/.12)
 for n in ['upper_arm.R','forearm.R','chest','jaw']:rig.pose.bones[n].rotation_euler=tuple(v*(1-a) for v in rig.pose.bones[n].rotation_euler)
 rot('head',(-.09*sin(pi*t),0,.05*sin(pi*t)));rot('upper_arm.L',(-.1*sin(pi*t),0,0))
def hit(t):
 a=sin(pi*t)*exp(-t*1.3);rot('chest',(-.34*a,.10*a,-.19*a));rot('head',(-.28*a,.15*a,.2*a));rot('upper_arm.L',(-.25*a,0,.23*a));rot('jaw',(.25*a,0,0));offset('pelvis',(0,-.18*a,-.05*a))
def death(t):
 a=smooth((t-.08)/.66);fall=smooth((t-.25)/.52)
 # Root pivots around the ground; +90 degrees X puts the chest onto its back.
 rot('root',(1.50*fall,0,-.17*fall));offset('root',(0,-.12*fall,.24*fall))
 rot('chest',(-.23*a,0,-.09*a));rot('head',(-.35*a,.16*a,0));rot('jaw',(.35*a,0,0))
 rot('thigh.L',(.30*a,0,-.15*a));rot('thigh.R',(.17*a,0,.1*a));rot('shin.L',(-.38*a,0,0));rot('shin.R',(-.35*a,0,0));rot('upper_arm.L',(.35*a,0,.65*a));rot('upper_arm.R',(.12*a,.1*a,-.12*a));rot('forearm.L',(-.45*a,0,0))
def animate(name,length,fn,loop=False,events=None):
 a=bpy.data.actions.new(name);rig.animation_data.action=a
 for f in range(1,length+1):
  scene.frame_set(f);reset();fn((f-1)/(length-1));bpy.context.view_layer.update()
  # Ground contact correction also accounts for the long hook during the fall.
  dg=bpy.context.evaluated_depsgraph_get();low=100
  for o in [character,hook]:
   ev=o.evaluated_get(dg);me=ev.to_mesh();low=min(low,min((ev.matrix_world@v.co).z for v in me.vertices));ev.to_mesh_clear()
  if low<.006:rig.pose.bones['root'].location+=rig.data.bones['root'].matrix_local.to_quaternion().inverted()@Vector((0,0,.006-low))
  for p in rig.pose.bones:
   for path in ['rotation_euler','location','scale']:p.keyframe_insert(data_path=path,frame=f,group=p.name)
 a.use_fake_user=True;a['loop']=loop;a['fps']=30
 if events:
  for label,f in events.items():m=a.pose_markers.new(label);m.frame=f
 tr=rig.animation_data.nla_tracks.new();tr.name=name;tr.strips.new(name,1,a);tr.mute=True
 actions.append(a);return a
animate('Idle',61,idle,True);animate('Walk',41,walk,True);animate('AttackMelee',31,melee,False,{'MeleeHit':17})
animate('HookWindup',25,windup,False,{'WarningOn':1,'HookReady':25})
animate('HookCast',22,cast,False,{'SpawnProjectile':6,'MaxReach':22})
animate('HookRecover',28,recover,False,{'Retract':1,'WarningOff':28})
animate('Hit',19,hit);animate('Death',55,death,False,{'DisableCollision':21,'DespawnReady':55})
rig.animation_data.action=actions[0];reset();scene.frame_set(1)

# Separate reusable tendon segment, centered at origin with start Y=0, end Y=1.
oldparts=list(parts);segmentparts=[]
segmentparts.append(tube('Organic tether core',[(0,0,0),(.015,.25,0),(-.012,.5,.01),(.012,.75,0),(0,1,0)],[.035,.031,.037,.03,.035],flesh,None,8))
for j in range(5):
 y=.08+j*.2
 segmentparts.append(tube('Tether sinew ridge',[(.03,y,-.01),(.044,y+.05,.01),(.025,y+.11,.02)],[.012,.016,.009],bone,None,5))
segment=join(segmentparts,'HookTether_Segment');pigment(segment);parts.remove(segment);move(segment,library);segment['stretch_axis']='+Y';segment['rest_length_m']=1.0
# Ground warning geometry is flat, additive-looking emission, and contains no opaque disc.
vs=[];fs=[]
def arc(r,w,start,end,n):
 k=len(vs)
 for i in range(n+1):
  a=start+(end-start)*i/n
  for rr in [r-w/2,r+w/2]:vs.append((rr*sin(a),rr*cos(a),.018))
 for i in range(n):a=k+i*2;fs.append((a,a+1,a+3,a+2))
arc(1,.055,0,2*pi,64);arc(.87,.018,-.64,.64,16)
for a in [0,pi/2,pi,pi*1.5]:
 c=Vector((sin(a),cos(a),0));u=Vector((cos(a),-sin(a),0));k=len(vs)
 vs.extend([tuple(c*.78+Vector((0,0,.019))),tuple(c*.63+u*.09+Vector((0,0,.019))),tuple(c*.63-u*.09+Vector((0,0,.019)))]);fs.append((k,k+1,k+2))
warning=mesh('HookWarning',vs,fs,red);parts.remove(warning);move(warning,library);warning['role']='Place on ground, scale XY to radius. Show during HookWindup, hide after recovery.'
for o in [segment,warning]:o.hide_render=True;o.hide_set(True)

# Static detachable hook has a socket-relative origin and no skeleton.
hook_export=bpy.data.objects.new('HookTip_Projectile',hook.data.copy());library.objects.link(hook_export)
hook_export.data.transform(hook.matrix_world);hook_export.data.transform(__import__('mathutils').Matrix.Translation(-w))
for vg in list(hook_export.vertex_groups):hook_export.vertex_groups.remove(vg)
hook_export.hide_render=True;hook_export.hide_set(True);hook_export['forward']='+Y';hook_export['origin']='HookSpawn / right wrist'
def export(path,obs,anim=False):
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,path),export_format='GLB',use_selection=True,export_animations=anim,export_animation_mode='NLA_TRACKS',export_skins=anim,export_yup=True,export_apply=False,export_extras=True,export_vertex_color='MATERIAL')
export('Zombie_Hooker.glb',[rig,character,hook,tether,socket],True)
for name,o in [('HookTip.glb',hook_export),('HookTether_Segment.glb',segment),('HookWarning.glb',warning)]:export(name,[o]);o.hide_set(True)

# Art-directed neutral studio, deliberately separate from game assets.
floor=material('STUDIO • charcoal',(.021,.030,.036),.84)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0));o=bpy.context.object;o.name='Studio ground';o.data.materials.append(floor);move(o,stage)
world=scene.world or bpy.data.worlds.new('Hooker studio');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.10,.14,.18,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35
def area(name,loc,power,col,size):
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;move(o,stage);o.data.energy=power;o.data.color=col;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((-.35,.15,1.4))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key • warm ivory',(-3,4,6),1000,(1,.78,.58),4)
area('Fill • cold moon',(4,2,3.5),750,(.48,.75,1),4)
area('Rim • jade silhouette',(-2,-4,5),1450,(.49,1,.78),3)
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Asset showcase camera';move(cam,stage);cam.data.type='ORTHO';scene.camera=cam
def camera(loc,target=(-.55,.25,1.4),scale=4.6):
 cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
camera((-4.3,7,4.0))
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1400;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
# Set a useful material viewport and hide studio clutter in the modeling viewport.
for o in stage.objects:
 if o!=cam:o.hide_set(True)
for ar in bpy.context.screen.areas if bpy.context.screen else []:
 if ar.type=='VIEW_3D':
  ar.spaces.active.region_3d.view_distance=6;ar.spaces.active.region_3d.view_location=(-.5,.2,1.4);ar.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion();ar.spaces.active.shading.type='MATERIAL'
rig.animation_data.action=actions[0];scene.frame_start=1;scene.frame_end=61;scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT');character.select_set(True);bpy.context.view_layer.objects.active=character
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Zombie_Hooker.blend'))
# Validate every bone clip against the actual evaluated skinned mesh, not just key counts.
report={'asset':'Çengelci Zombi / Hooker Zombie','blender':bpy.app.version_string,'units':'meters','source_axes':{'up':'+Z','forward':'+Y'},'gltf_axes':'standard glTF +Y up; Blender importer restores Z-up','bones':len(rig.data.bones),'clips':{},'geometry':{}}
for o in [character,hook,tether,segment,warning]:
 o.data.calc_loop_triangles();report['geometry'][o.name]={'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),'materials':len(o.data.materials),'uv_layers':len(o.data.uv_layers)}
for a in actions:
 rig.animation_data.action=a
 if a.slots:rig.animation_data.action_slot=a.slots[0]
 samples=[];mins=[]
 for f in [1,int(a.frame_range[1]/2),int(a.frame_range[1])]:
  scene.frame_set(f);dg=bpy.context.evaluated_depsgraph_get();dg.update();pts=[]
  for o in [character,hook]:
   ev=o.evaluated_get(dg);me=ev.to_mesh();pts.extend([ev.matrix_world@v.co for v in me.vertices]);ev.to_mesh_clear()
  assert all(math.isfinite(c) for p in pts for c in p)
  samples.append(pts);mins.append(min(p.z for p in pts))
 delta=max((p-q).length for p,q in zip(samples[0],samples[1]));report['clips'][a.name]={'frames':[1,int(a.frame_range[1])],'duration_seconds':(a.frame_range[1]-1)/30,'max_midpoint_motion_m':round(delta,5),'minimum_z_samples':mins,'passed':delta>.001,'markers':{m.name:m.frame for m in a.pose_markers}}
 assert delta>.001,a.name
report['unweighted_vertices']=sum(1 for o in [character,hook,tether] for v in o.data.vertices if not v.groups)
assert report['unweighted_vertices']==0
with open(os.path.join(OUT,'source_validation.json'),'w',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
rig.animation_data.action=actions[0];rig.animation_data.action_slot=actions[0].slots[0];scene.frame_set(1)
if not os.environ.get('ZOMBIE_SKIP_RENDER'):
 for name,loc,target,scale in [('01_Front',(0,9,2),(-.55,.2,1.40),4.6),('02_Side',(-9,.25,1.7),(-.55,.25,1.4),4.4),('03_Top',(-.55,.3,10),(-.55,.3,0),4.6),('04_Hero',(-4.3,7,4),(-.55,.25,1.4),4.6)]:
  camera(loc,target,scale);scene.render.filepath=os.path.join(OUT,'renders',name+'.png');bpy.ops.render.render(write_still=True)
print('HOOKER_BUILD_COMPLETE',json.dumps(report,ensure_ascii=False))
