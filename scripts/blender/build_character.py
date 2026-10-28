# 실습장 사람(학생 아바타·NPC 교관 공용) 3D 캐릭터 생성 스크립트 — Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_character.py -- <출력.glb> [미리보기.png] [HDRI]
# 특정 인물을 닮지 않은 일반 얼굴·체형(키 1.72 m)이다. 옷은 재질 이름으로만 나눠 둔다(Top·Bottom·Shoes) — 실습복 색·모양은 사진을 받은 뒤 정한다.
# 뼈대 15개(Hips·Spine·Chest·Neck·Head, 팔·다리 좌우 3개씩)에 몸을 자동 가중치로 붙이고, 동작 3개(Idle·Walk·Gesture)를 넣는다.
# Blender 좌표: X 오른쪽(캐릭터의 왼쪽 = +X), Y 앞(+Y가 얼굴, glTF에서 -z), Z 위. 노드: Character(뿌리) > Armature, Body.
import bpy, bmesh, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'character.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None
FPS = 24

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

def material(name, color, metal=0.0, rough=0.6):
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*lin(color), 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*lin(color), 1)
    return m

# 옷 색은 임시(앱에서 학생·교관별로 바꾼다)
M = {'Skin': material('Skin', '#e2b796', rough=0.55), 'Hair': material('Hair', '#1e1a17', rough=0.7),
     'Top': material('Top', '#2f5fb3', rough=0.8), 'Bottom': material('Bottom', '#2b3a55', rough=0.85),
     'Shoes': material('Shoes', '#1c1c1c', rough=0.5), 'Eye': material('Eye', '#121212', rough=0.2)}
SLOT = ['Skin', 'Hair', 'Top', 'Bottom', 'Shoes', 'Eye']

# ---------------- 관절 위치(서 있는 자세, 팔은 몸 옆으로 살짝 벌림) ----------------
J = {
    'pelvis': (0, 0, 0.98), 'spine': (0, -0.005, 1.17), 'chest': (0, -0.01, 1.36), 'neck': (0, 0, 1.49), 'headTop': (0, 0.005, 1.72),
}
for s, sx in (('L', 1), ('R', -1)):
    J['shoulder' + s] = (sx * 0.20, -0.01, 1.42)
    J['elbow' + s] = (sx * 0.245, -0.03, 1.15)
    J['wrist' + s] = (sx * 0.27, 0.0, 0.90)
    J['hand' + s] = (sx * 0.275, 0.01, 0.80)
    J['hip' + s] = (sx * 0.095, 0, 0.93)
    J['knee' + s] = (sx * 0.10, 0.01, 0.52)
    J['ankle' + s] = (sx * 0.10, -0.02, 0.09)
    J['toe' + s] = (sx * 0.10, 0.12, 0.03)

# ---------------- 몸(스킨 모디파이어로 관절을 이은 뒤 세분화) ----------------
R = {'pelvis': (0.16, 0.115), 'spine': (0.145, 0.10), 'chest': (0.175, 0.112), 'neck': (0.055, 0.055),
     'shoulder': (0.068, 0.066), 'elbow': (0.052, 0.05), 'wrist': (0.038, 0.032), 'hand': (0.04, 0.02),
     'hip': (0.098, 0.098), 'knee': (0.068, 0.07), 'ankle': (0.05, 0.05), 'toe': (0.04, 0.03)}
names = ['pelvis', 'spine', 'chest', 'neck'] + [k + s for s in ('L', 'R') for k in ('shoulder', 'elbow', 'wrist', 'hand', 'hip', 'knee', 'ankle', 'toe')]
edges = [('pelvis', 'spine'), ('spine', 'chest'), ('chest', 'neck')]
for s in ('L', 'R'):
    edges += [('chest', 'shoulder' + s), ('shoulder' + s, 'elbow' + s), ('elbow' + s, 'wrist' + s), ('wrist' + s, 'hand' + s),
              ('pelvis', 'hip' + s), ('hip' + s, 'knee' + s), ('knee' + s, 'ankle' + s), ('ankle' + s, 'toe' + s)]
me = bpy.data.meshes.new('BodySkel')
me.from_pydata([J[n] for n in names], [(names.index(a), names.index(b)) for a, b in edges], [])
body = bpy.data.objects.new('Body', me); scene.collection.objects.link(body)
sk = body.modifiers.new('skin', 'SKIN'); sk.use_smooth_shade = True; sk.branch_smoothing = 0.6
for i, n in enumerate(names):
    key = n.rstrip('LR') if n[-1] in 'LR' and n not in ('pelvis',) else n
    rx, ry = R[key]
    body.data.skin_vertices[0].data[i].radius = (rx, ry)
body.data.skin_vertices[0].data[0].use_root = True
sub = body.modifiers.new('sub', 'SUBSURF'); sub.levels = 2

def apply_all(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(o == ob)
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
apply_all(body)

# 면마다 가장 가까운 뼈 구간으로 재질 정하기(목·손 = 피부, 허리 아래·다리 = 아래옷, 발 = 신발, 나머지 = 윗옷)
def seg_dist(p, a, b):
    a, b = Vector(a), Vector(b); ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length
for k in SLOT: body.data.materials.append(M[k])
WAIST_Z, NECK_Z, CUFF_Z = 0.975, 1.465, 0.925   # 옷 경계 높이(벨트·옷깃·소매 끝이 이 자리를 덮는다)
for f in body.data.polygons:
    c = f.center
    arm_ = abs(c.x) > 0.19 and c.z > 0.7
    if c.z > NECK_Z and abs(c.x) < 0.12: mat = 'Skin'
    elif arm_: mat = 'Skin' if c.z < CUFF_Z else 'Top'
    elif c.z < 0.11: mat = 'Shoes'
    elif c.z < WAIST_Z: mat = 'Bottom'
    else: mat = 'Top'
    f.material_index = SLOT.index(mat)

# ---------------- 뼈대 ----------------
arm_data = bpy.data.armatures.new('Rig')
arm = bpy.data.objects.new('Armature', arm_data); scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
for o in bpy.context.view_layer.objects: o.select_set(o == arm)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
def bone(name, head, tail, parent=None):
    b = eb.new(name); b.head = Vector(head); b.tail = Vector(tail); b.roll = 0.0
    if parent: b.parent = eb[parent]; b.use_connect = False
    return b
bone('Hips', J['pelvis'], J['spine'])
bone('Spine', J['spine'], J['chest'], 'Hips')
bone('Chest', J['chest'], J['neck'], 'Spine')
bone('Neck', J['neck'], (0, 0, 1.56), 'Chest')
bone('Head', (0, 0, 1.56), J['headTop'], 'Neck')
for s in ('L', 'R'):
    bone('UpperArm.' + s, J['shoulder' + s], J['elbow' + s], 'Chest')
    bone('LowerArm.' + s, J['elbow' + s], J['wrist' + s], 'UpperArm.' + s)
    bone('Hand.' + s, J['wrist' + s], J['hand' + s], 'LowerArm.' + s)
    bone('UpperLeg.' + s, J['hip' + s], J['knee' + s], 'Hips')
    bone('LowerLeg.' + s, J['knee' + s], J['ankle' + s], 'UpperLeg.' + s)
    bone('Foot.' + s, J['ankle' + s], J['toe' + s], 'LowerLeg.' + s)
bpy.ops.object.mode_set(mode='OBJECT')

# 몸에 자동 가중치
for o in bpy.context.view_layer.objects: o.select_set(o in (body, arm))
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')

# ---------------- 머리·머리카락·눈·신발(뼈 하나에 통째로 붙임) ----------------
def rigid(ob, group, mat):
    ob.data.materials.clear(); [ob.data.materials.append(M[k]) for k in SLOT]
    for p in ob.data.polygons: p.material_index = SLOT.index(mat)
    vg = ob.vertex_groups.new(name=group); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    return ob
def sphere(loc, scale, segs=24, rings=14):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1, location=loc)
    ob = bpy.context.active_object; ob.scale = scale
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True); ob.data.shade_smooth()
    return ob
extra = []
def ring(z, rx, ry, h, group, mat, cx=0.0, cy=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1, depth=h, location=(cx, cy, z))
    ob = bpy.context.active_object; ob.scale = (rx, ry, 1)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = h * 0.3; bv.segments = 2
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='bv'); ob.data.shade_smooth()
    return rigid(ob, group, mat)
extra.append(ring(WAIST_Z, 0.168, 0.122, 0.045, 'Hips', 'Shoes'))          # 벨트(신발과 같은 짙은 색)
extra.append(ring(NECK_Z + 0.005, 0.07, 0.068, 0.035, 'Chest', 'Top', cy=-0.004))  # 옷깃
extra.append(rigid(sphere((0, 0.008, 1.605), (0.092, 0.104, 0.118)), 'Head', 'Skin'))
hair = sphere((0, -0.006, 1.63), (0.098, 0.11, 0.105))
bm = bmesh.new(); bm.from_mesh(hair.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 1.625 - 0.035 * (1 if v.co.y > 0.04 else 0) - (0.06 if v.co.y < -0.02 else 0)], context='VERTS')
bm.to_mesh(hair.data); bm.free()
sol = hair.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.012
bpy.context.view_layer.objects.active = hair; bpy.ops.object.modifier_apply(modifier='sol')
extra.append(rigid(hair, 'Head', 'Hair'))
for sx in (1, -1):
    extra.append(rigid(sphere((sx * 0.035, 0.097, 1.615), (0.011, 0.006, 0.013), 12, 8), 'Head', 'Eye'))
    extra.append(rigid(sphere((sx * 0.094, 0.0, 1.605), (0.014, 0.026, 0.032), 12, 8), 'Head', 'Skin'))   # 귀
extra.append(rigid(sphere((0, 0.108, 1.585), (0.014, 0.016, 0.022), 12, 8), 'Head', 'Skin'))            # 코
for s, sx in (('L', 1), ('R', -1)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(sx * 0.10, 0.045, 0.045))
    sh = bpy.context.active_object; sh.scale = (0.105, 0.28, 0.09)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    bv = sh.modifiers.new('bv', 'BEVEL'); bv.width = 0.035; bv.segments = 4
    bpy.context.view_layer.objects.active = sh; bpy.ops.object.modifier_apply(modifier='bv'); sh.data.shade_smooth()
    extra.append(rigid(sh, 'Foot.' + s, 'Shoes'))
bpy.ops.object.select_all(action='DESELECT')
for o in extra: o.select_set(True)
body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body = bpy.context.active_object; body.name = 'Body'

# ---------------- 동작 ----------------
pb = arm.pose.bones
for b in pb: b.rotation_mode = 'XYZ'
arm.animation_data_create()

def clip(name, frames, fn):
    act = bpy.data.actions.new(name); act.use_fake_user = True
    arm.animation_data.action = act
    for f in range(0, frames + 1, 2):
        t = f / frames
        for b in pb: b.rotation_euler = (0, 0, 0); b.location = (0, 0, 0)
        fn(t)
        for b in pb:
            b.keyframe_insert('rotation_euler', frame=f)
            if b.name == 'Hips': b.keyframe_insert('location', frame=f)
    return act

D = math.radians
def walk(t):
    a = 2 * math.pi * t
    for s, ph in (('L', 0.0), ('R', math.pi)):
        sw = math.sin(a + ph)
        pb['UpperLeg.' + s].rotation_euler.x = D(26) * sw
        pb['LowerLeg.' + s].rotation_euler.x = -D(8) - D(32) * max(0.0, math.sin(a + ph + 1.2))
        pb['Foot.' + s].rotation_euler.x = D(12) * math.sin(a + ph - 0.6)
        pb['UpperArm.' + s].rotation_euler.x = -D(22) * sw
        pb['LowerArm.' + s].rotation_euler.x = D(18) + D(10) * max(0.0, -sw)
    pb['Hips'].location.y = 0.018 * math.cos(2 * a)   # 뼈 지역 Y = 위쪽(척추 방향): 걸음마다 오르내림
    pb['Spine'].rotation_euler.y = D(5) * math.sin(a)
    pb['Chest'].rotation_euler.y = -D(7) * math.sin(a)
def idle(t):
    a = 2 * math.pi * t
    pb['Chest'].rotation_euler.x = D(1.8) * math.sin(a)
    pb['Head'].rotation_euler.z = D(6) * math.sin(a * 0.5 + 0.4)
    for s in ('L', 'R'):
        pb['UpperArm.' + s].rotation_euler.x = D(2) * math.sin(a + 0.8)
        pb['LowerArm.' + s].rotation_euler.x = D(6)
def gesture(t):
    a = 2 * math.pi * t
    up = math.sin(math.pi * t) ** 0.6
    # 이 뼈대에서 팔·다리 지역 X 회전 + = 앞으로
    pb['UpperArm.R'].rotation_euler.x = D(58) * up
    pb['LowerArm.R'].rotation_euler.x = D(28) * up
    pb['Hand.R'].rotation_euler.z = D(18) * math.sin(3 * a) * up
    pb['Head'].rotation_euler.z = D(8) * up
    pb['LowerArm.L'].rotation_euler.x = D(6)
    pb['Chest'].rotation_euler.x = D(1.5) * math.sin(a)

acts = {'Walk': clip('Walk', FPS, walk), 'Idle': clip('Idle', FPS * 3, idle), 'Gesture': clip('Gesture', FPS * 2, gesture)}
arm.animation_data.action = acts['Idle']
for b in pb: b.rotation_euler = (0, 0, 0); b.location = (0, 0, 0)
# NLA 트랙에 동작을 올려 두면 내보낼 때 각각 하나의 애니메이션이 된다
for nm, act in acts.items():
    tr = arm.animation_data.nla_tracks.new(); tr.name = nm
    tr.strips.new(nm, 0, act)
arm.animation_data.action = None

root = bpy.data.objects.new('Character', None); scene.collection.objects.link(root)
arm.parent = root

# ---------------- 점검 · 내보내기 ----------------
body.data.calc_loop_triangles()
print('TRIS', len(body.data.loop_triangles), 'VGROUPS', len(body.vertex_groups))
bb = [body.matrix_world @ Vector(c) for c in body.bound_box]
print('BBOX z %.3f..%.3f x %.3f..%.3f' % (min(v.z for v in bb), max(v.z for v in bb), min(v.x for v in bb), max(v.x for v in bb)))
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
                          export_cameras=False, export_lights=False, export_skins=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_def_bones=False, export_frame_range=False,
                          export_draco_mesh_compression_enable=False,
                          export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression')
print('EXPORTED', OUT, os.path.getsize(OUT))

# ---------------- 미리보기(서 있기 · 걷기 두 순간 · 손짓) ----------------
if PREVIEW:
    world = bpy.data.worlds.new('W'); scene.world = world
    if world.node_tree is None: world.use_nodes = True
    if HDRI:
        nt = world.node_tree; env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDRI)
        nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
    fl = bpy.context.active_object; fl.data.materials.append(material('Floor', '#1e7d4b', rough=0.35))
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(45), 0, math.radians(200)); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 50
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 700, 1000
    for tr in arm.animation_data.nla_tracks: tr.mute = True
    base_, ext = os.path.splitext(PREVIEW)
    shots = [('idle_front', 'Idle', 0, (1.2, 3.6, 1.2)), ('walk_a', 'Walk', 6, (3.6, 0.6, 1.1)), ('walk_b', 'Walk', 18, (3.6, 0.6, 1.1)),
             ('walk_34', 'Walk', 6, (2.4, 2.8, 1.3)), ('gesture', 'Gesture', 24, (1.6, 3.4, 1.3)), ('gesture_side', 'Gesture', 24, (-3.6, 0.6, 1.2))]
    for tag, an, fr, loc in shots:
        arm.animation_data.action = acts[an]
        scene.frame_set(fr)
        cam.location = loc
        d = Vector((0, 0, 0.92)) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
