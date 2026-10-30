# 다이얼 게이지(0.01 mm, 1회전 1 mm) + 마그네틱 베이스 스탠드 생성 스크립트 — Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_dial_gauge.py -- <출력.glb> [미리보기.png] [HDRI] [pose=h]
#   pose=v(기본): 측정축이 아래(작업대 위 물체 윗면 측정) → dial-gauge.glb
#   pose=h: 측정축이 옆(+X, 세워 물린 디스크 면 측정 — 사진 11) → dial-gauge-h.glb. 노드 이름은 같다.
# 사진 11·29·30(디스크 런아웃·차동기어 백래시 측정)의 일반적인 기계식 다이얼 게이지 모양이다. 상표·글자 없음(눈금·숫자는 앱이 덧그린다).
# 작동: 측정축(Spindle)이 밀려 들어가면 랙·피니언·기어열이 큰 바늘(Needle)을 돌린다(1 mm = 1바퀴 = 100눈금),
#       회전계 바늘(CounterNeedle)은 1 mm마다 1칸. 베젤(Bezel)을 돌려 눈금판 0을 바늘에 맞춘다.
# 노드: DialGauge(뿌리, 바닥 가운데) > Stand, Indicator(눈금판 가운데, 앞 = +Y) > Case, Bezel, Needle, CounterNeedle, Spindle, Crystal, ContactPoint
# Blender 좌표: Z 위, +Y 앞(glTF에서 -z). 길이 m.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
POSE = next((a.split('=', 1)[1] for a in argv if a.startswith('pose=')), 'v')
argv = [a for a in argv if not a.startswith('pose=')]
OUT = argv[0] if argv else 'dial-gauge.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------- 치수(앱 DIAL_GAUGE와 같아야 한다) ----------------
DIAL_R = 0.0285        # 몸통 반지름(눈금판 지름 약 57 mm 급)
FACE_R = 0.0250        # 눈금판 반지름
CASE_D = 0.022         # 몸통 두께(앞뒤)
STEM_R, STEM_L = 0.004, 0.018
SPINDLE_R, SPINDLE_L = 0.0024, 0.014
BALL_R = 0.0025
COUNTER = (0.0, 0.0105, 0.0058)   # 회전계: 눈금판 위쪽(x, z 위치, 반지름)
IND_POS = Vector((0.16, 0.0, 0.135))  # 스탠드에 물린 게이지 눈금판 가운데(뿌리 기준)
BASE = (0.06, 0.05, 0.055)          # 마그네틱 베이스 폭(x)·깊이(y)·높이(z)
POST_H = 0.26
# 옆으로 누운 자세: 가로 팔 끝 클램프가 게이지 위 스템을 물고, 측정축은 +X를 향한다
IND_POS_H = Vector((0.175, 0.0, 0.43))   # 측정축 높이 = 디스크 측정 위치 높이(build_disc_fixture.py AXIS_Z + DISC_R − MEASURE_IN)
POST_H_H = 0.47
if POSE == 'h':
    IND_POS, POST_H = IND_POS_H, POST_H_H

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

def material(name, color, metal=0.0, rough=0.5, alpha=1.0):
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*lin(color), 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
        if hasattr(m, 'surface_render_method'): m.surface_render_method = 'BLENDED'
    m.diffuse_color = (*lin(color), 1)
    return m

M = {
    'Chrome': material('Chrome', '#d7dbdf', metal=1.0, rough=0.16),
    'Satin': material('Satin', '#b9bec3', metal=0.9, rough=0.38),
    'DialFace': material('DialFace', '#f6f6f2', rough=0.45),
    'Crystal': material('Crystal', '#e8f2f6', rough=0.04, alpha=0.18),
    'Needle': material('Needle', '#c62828', rough=0.35),
    'Black': material('Black', '#151515', rough=0.5),
    'MagBody': material('MagBody', '#3b3f45', metal=0.3, rough=0.55),
    'Knob': material('Knob', '#b71c1c', rough=0.4),
    'Rod': material('Rod', '#c9cdd1', metal=1.0, rough=0.22),
}

def finish(ob, mat):
    ob.data.materials.clear(); ob.data.materials.append(M[mat])
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def cyl(mat, r, depth, loc, axis='Z', verts=32, name='part', bevel=0.0):
    rot = {'Z': (0, 0, 0), 'Y': (math.pi / 2, 0, 0), 'X': (0, math.pi / 2, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    if bevel:
        bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 2
        bpy.ops.object.modifier_apply(modifier='bv')
    return finish(ob, mat)

def box(mat, size, loc, name='part', bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object; ob.name = name; ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 2
        bpy.ops.object.modifier_apply(modifier='bv')
    return finish(ob, mat)

def sphere(mat, r, loc, name='part', segs=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=r, location=loc)
    ob = bpy.context.active_object; ob.name = name
    return finish(ob, mat)

def annulus(mat, r_out, r_in, y0, y1, name, segs=64):
    # 앞뒤(Y) 방향 두께를 가진 고리(베젤)
    bm = bmesh.new()
    rings = []
    for y in (y0, y1):
        for r in (r_out, r_in):
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), y, r * math.sin(2 * math.pi * i / segs))) for i in range(segs)])
    o0, i0, o1, i1 = rings
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((o0[i], o0[j], o1[j], o1[i]))      # 바깥
        bm.faces.new((i0[j], i0[i], i1[i], i1[j]))      # 안
        bm.faces.new((o1[i], o1[j], i1[j], i1[i]))      # 앞
        bm.faces.new((o0[j], o0[i], i0[i], i0[j]))      # 뒤
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    return finish(ob, mat)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object; ob.name = name
    return ob

def set_origin(ob, point):
    # 메시를 옮기지 않고 원점만 point(세계 좌표)로
    off = Vector(point) - ob.matrix_world.translation
    ob.data.transform(Matrix.Translation(-off))
    ob.matrix_world.translation = Vector(point)

def parent(child, par):
    bpy.context.view_layer.update()   # 방금 만든 물체는 matrix_world가 아직 갱신 전일 수 있다
    w = child.matrix_world.copy()
    child.parent = par
    child.matrix_world = w

# ---------------- 다이얼 게이지 본체(눈금판 가운데 = 원점, 앞 = +Y) ----------------
case_parts = [
    cyl('Satin', DIAL_R, CASE_D, (0, -CASE_D / 2, 0), axis='Y', verts=64, bevel=0.0015),
    box('Satin', (0.012, 0.004, 0.016), (0, -CASE_D - 0.002, 0.0), bevel=0.001),                 # 뒤 귀(러그)
    cyl('Satin', 0.0035, 0.0042, (0, -CASE_D - 0.002, 0.0), axis='Y', verts=20),                   # 러그 구멍 테
    cyl('Chrome', STEM_R, STEM_L, (0, -CASE_D / 2, -DIAL_R - STEM_L / 2 + 0.001), verts=24),       # 아래 스템
    cyl('Chrome', STEM_R * 0.9, 0.008, (0, -CASE_D / 2, DIAL_R + 0.003), verts=24),                # 위 스템(측정축 뚜껑 받침)
]
case = join(case_parts, 'Case')

# 베젤(눈금판과 함께 돈다): 고리 + 흰 눈금판 + 회전계 작은 판
bezel_parts = [
    annulus('Chrome', DIAL_R + 0.0012, FACE_R, -0.001, 0.0055, 'ring'),
    cyl('DialFace', FACE_R, 0.0008, (0, 0.0006, 0), axis='Y', verts=64),
]
bezel = join(bezel_parts, 'Bezel')
# 베젤 바깥 홈(손으로 돌리는 잔톱니) — 작은 상자 90개
knurl = []
for i in range(90):
    a = 2 * math.pi * i / 90
    k = box('Chrome', (0.0007, 0.0045, 0.0008), (0, 0, 0))
    k.location = ((DIAL_R + 0.0013) * math.cos(a), 0.0022, (DIAL_R + 0.0013) * math.sin(a))
    k.rotation_euler = (0, -a, 0)
    bpy.context.view_layer.objects.active = k
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    knurl.append(k)
bezel = join([bezel] + knurl, 'Bezel')
set_origin(bezel, (0, 0, 0))

def needle_mesh(name, length, tail, width, y, center, mat, cap_r):
    # 가운데(center)를 원점으로 위(+Z)를 가리키는 바늘 + 가운데 뚜껑
    bm = bmesh.new()
    pts = [(-width / 2, -tail), (width / 2, -tail), (width * 0.18, length), (-width * 0.18, length)]
    vs = [bm.verts.new((x, y, z)) for x, z in pts]
    vs2 = [bm.verts.new((x, y + 0.0005, z)) for x, z in pts]
    bm.faces.new(vs2); bm.faces.new(list(reversed(vs)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vs[i], vs[j], vs2[j], vs2[i]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    finish(ob, mat)
    cap = cyl('Black', cap_r, 0.0012, (0, y + 0.0006, 0), axis='Y', verts=20)
    ob = join([ob, cap], name)
    ob.location = Vector(center)
    return ob

needle = needle_mesh('Needle', FACE_R * 0.9, FACE_R * 0.22, 0.0016, 0.0020, (0, 0, 0), 'Needle', 0.0018)
cx, cz, cr = COUNTER
counter = needle_mesh('CounterNeedle', cr * 0.85, cr * 0.2, 0.0009, 0.0016, (cx, 0, cz), 'Black', 0.0008)

crystal = cyl('Crystal', FACE_R + 0.0004, 0.0008, (0, 0.0048, 0), axis='Y', verts=64, name='Crystal')

# 측정축: 아래로 나온 축 + 볼 접촉자 + 위 뚜껑(같이 움직인다). 원점 = 쉴 때 볼 아래 끝
stem_bottom = -DIAL_R - STEM_L + 0.001
sp_top_cap = cyl('Chrome', 0.0028, 0.006, (0, -CASE_D / 2, DIAL_R + 0.010), verts=20)
sp_rod = cyl('Chrome', SPINDLE_R, SPINDLE_L, (0, -CASE_D / 2, stem_bottom - SPINDLE_L / 2 + 0.002), verts=20)
sp_ball = sphere('Black', BALL_R, (0, -CASE_D / 2, stem_bottom - SPINDLE_L + 0.002 - BALL_R * 0.6), segs=16)
spindle = join([sp_rod, sp_ball, sp_top_cap], 'Spindle')
tip_z = stem_bottom - SPINDLE_L + 0.002 - BALL_R * 1.6
set_origin(spindle, (0, -CASE_D / 2, tip_z))

contact = bpy.data.objects.new('ContactPoint', None); scene.collection.objects.link(contact)
contact.location = (0, -CASE_D / 2, tip_z)

indicator = bpy.data.objects.new('Indicator', None); scene.collection.objects.link(indicator)
for o in (case, bezel, needle, counter, crystal, spindle, contact):
    parent(o, indicator)
indicator.location = IND_POS
if POSE == 'h':
    indicator.rotation_euler = (0, -math.pi / 2, 0)   # 측정축(−Z) → +X, 눈금판 앞(+Y)은 그대로

# ---------------- 마그네틱 베이스 스탠드 ----------------
bw, bd, bh = BASE
sx = 0.0  # 기둥 x
ind_axis_y = -CASE_D / 2   # 측정축이 지나는 y(게이지 기준)
stand_parts = [
    box('MagBody', (bw, bd, bh), (0, 0, bh / 2), bevel=0.003),
    box('Satin', (bw + 0.001, bd * 0.9, 0.006), (0, 0, 0.003)),                                     # 바닥 철판
    box('Satin', (0.003, bd * 0.92, bh * 0.92), (0, 0, bh / 2)),                                      # 가운데 띠(자석 극)
    cyl('Knob', 0.009, 0.012, (-bw / 2 - 0.006, 0, bh * 0.55), axis='X', verts=24, bevel=0.001),   # ON/OFF 손잡이
    box('Black', (0.003, 0.012, 0.004), (-bw / 2 - 0.0125, 0, bh * 0.55)),
    cyl('Satin', 0.006, 0.01, (sx, 0, bh + 0.005), verts=24),                                         # 기둥 받침
    cyl('Rod', 0.006, POST_H, (sx, 0, bh + POST_H / 2), verts=24),                                    # 세운 기둥
    cyl('Knob', 0.007, 0.01, (0.018, 0.012, bh + 0.006), verts=24),                                   # 미세 조정 손잡이
]
# 기둥 위 십자 클램프 + 가로 팔
arm_z = IND_POS.z if POSE == 'h' else IND_POS.z + DIAL_R + STEM_L * 0.2 + 0.03
clamp1 = box('MagBody', (0.022, 0.024, 0.026), (sx, 0, arm_z), bevel=0.002)
clamp1_knob = cyl('Black', 0.008, 0.006, (sx, 0.016, arm_z), axis='Y', verts=20, bevel=0.001)
if POSE == 'h':
    # 팔이 게이지 위 스템(지금은 −X쪽 가로)까지 와서 그 끝 클램프가 스템을 문다
    c2x = IND_POS.x - DIAL_R - 0.006
    arm_len = c2x - sx
    arm = cyl('Rod', 0.0045, arm_len, (sx + arm_len / 2, ind_axis_y, arm_z), axis='X', verts=20)
    clamp2 = box('MagBody', (0.016, 0.02, 0.022), (c2x - 0.004, ind_axis_y, arm_z), bevel=0.002)
    clamp2_knob = cyl('Black', 0.006, 0.005, (c2x - 0.004, ind_axis_y + 0.013, arm_z), axis='Y', verts=20, bevel=0.0008)
    stand = join(stand_parts + [clamp1, clamp1_knob, arm, clamp2, clamp2_knob], 'Stand')
else:
    arm_len = IND_POS.x - sx + 0.01
    arm = cyl('Rod', 0.0045, arm_len + 0.02, (sx + arm_len / 2, 0, arm_z), axis='X', verts=20)
    # 팔 끝 클램프 + 게이지 위 스템을 무는 짧은 막대
    clamp2 = box('MagBody', (0.018, 0.02, 0.02), (IND_POS.x, ind_axis_y, arm_z), bevel=0.002)
    clamp2_knob = cyl('Black', 0.006, 0.005, (IND_POS.x, ind_axis_y + 0.013, arm_z), axis='Y', verts=20, bevel=0.0008)
    holder_top = IND_POS.z + DIAL_R + 0.007 + 0.004
    holder = cyl('Rod', 0.0035, arm_z - holder_top, (IND_POS.x, ind_axis_y, (arm_z + holder_top) / 2), verts=16)
    stand = join(stand_parts + [clamp1, clamp1_knob, arm, clamp2, clamp2_knob], 'Stand')
    # 게이지 위 스템을 무는 막대는 스탠드에 합친다(게이지는 따로 움직이지 않음)
    stand = join([stand, holder], 'Stand')

root = bpy.data.objects.new('DialGauge', None); scene.collection.objects.link(root)
parent(stand, root)
parent(indicator, root)

# ---------------- 점검 · 내보내기 ----------------
tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
print('TRIS', tris)
bpy.context.view_layer.update()
cp = contact.matrix_world.translation
print('CONTACT %.4f %.4f %.4f' % tuple(cp))
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_cameras=False, export_lights=False, export_animations=False,
                          export_draco_mesh_compression_enable=False,
                          export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression')
print('EXPORTED', OUT, os.path.getsize(OUT))

# ---------------- 미리보기 ----------------
if PREVIEW:
    world = bpy.data.worlds.new('W'); scene.world = world
    if world.node_tree is None: world.use_nodes = True
    if HDRI:
        nt = world.node_tree; env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDRI)
        nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0))
    fl = bpy.context.active_object; fl.data.materials.append(material('Bench', '#5a4632', rough=0.6))
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(30)); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 50; cam.data.clip_start = 0.005
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 900, 700
    base_, ext = os.path.splitext(PREVIEW)
    c = IND_POS
    shots_h = [('h_34', (0.35, 0.55, 0.55), (0.12, 0.0, 0.33), 0.0), ('h_face', (IND_POS.x, 0.16, IND_POS.z), (IND_POS.x, 0.0, IND_POS.z), 0.25)]
    shots = shots_h if POSE == 'h' else [('stand_34', (0.42, 0.42, 0.30), (0.09, 0.0, 0.12), 0.0),
             ('stand_front', (0.10, 0.55, 0.16), (0.09, 0.0, 0.13), 0.0),
             ('face_zero', (c.x, 0.16, c.z), (c.x, 0.0, c.z), 0.0),
             ('face_037', (c.x, 0.16, c.z), (c.x, 0.0, c.z), 0.37),
             ('side', (c.x + 0.16, -0.011, c.z - 0.01), (c.x, -0.011, c.z - 0.02), 0.0)]
    for tag, loc, tgt, mm in shots:
        # 미리보기에서 읽음값 mm를 흉내: 바늘 1바퀴 = 1 mm(앞에서 볼 때 시계 방향), 측정축은 mm만큼 들어감
        needle.rotation_euler = (0, -2 * math.pi * mm, 0)   # +Y(앞)에서 볼 때 시계 방향 = −
        counter.rotation_euler = (0, -2 * math.pi * mm / 10, 0)
        spindle.location.z = tip_z + mm * 0.001
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
