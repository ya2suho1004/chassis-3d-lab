# 디스크 런아웃 연습 고정대: 작업대용 바이스 + 물린 조향 너클(빨강) + 허브·브레이크 디스크(도는 부분) — Blender 5.x 화면 없이 실행.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_disc_fixture.py -- <출력.glb> [미리보기.png] [HDRI]
# 사진 11·29(바이스에 물린 너클·허브에 디스크, 옆에서 다이얼 게이지)의 일반적인 모양이다. 실측 아님, 상표·글자 없음.
# 노드: DiscFixture(뿌리 = 작업대 윗면, 바이스 가운데) > Vise, Knuckle, Rotor(허브+디스크, 원점 = 허브 축, 지역 X축으로 돈다),
#       MeasurePoint(디스크 바깥 면, 가장자리 안쪽 10 mm, 축 위쪽) — 다이얼 게이지 접촉점을 여기에 맞춘다.
# Blender 좌표: Z 위, 허브 축 = X(디스크 바깥 면이 −X를 본다).
import bpy, bmesh, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'disc-fixture.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------- 치수(앱 DISC_FIXTURE와 같아야 한다) ----------------
AXIS_Z = 0.30          # 허브 축 높이(작업대 윗면 기준)
DISC_R = 0.14          # 디스크 바깥 반지름(지름 280 mm 급)
DISC_IN = 0.085        # 마찰면 안쪽 반지름
DISC_T = 0.022         # 디스크 두께(벤틸레이티드)
DISC_X = -0.075        # 디스크 두께 가운데 x
MEASURE_IN = 0.010     # 측정 위치: 바깥 가장자리 안쪽 10 mm

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

def material(name, color, metal=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*lin(color), 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*lin(color), 1)
    return m

M = {
    'ViseBlue': material('ViseBlue', '#1f3f8a', rough=0.45),
    'ViseJaw': material('ViseJaw', '#6d7378', metal=0.8, rough=0.45),
    'Steel': material('Steel', '#a9aeb3', metal=1.0, rough=0.3),
    'KnuckleRed': material('KnuckleRed', '#9b1c1c', rough=0.55),
    'DiscFace': material('DiscFace', '#9a9da0', metal=0.85, rough=0.32),
    'DiscIron': material('DiscIron', '#5d5f61', metal=0.6, rough=0.6),
    'HubRust': material('HubRust', '#6b4a38', metal=0.3, rough=0.75),
    'Stud': material('Stud', '#c9cdd1', metal=1.0, rough=0.25),
    'Black': material('Black', '#1a1a1a', rough=0.6),
}

def finish(ob, mat):
    ob.data.materials.clear(); ob.data.materials.append(M[mat])
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def cyl(mat, r, depth, loc, axis='Z', verts=32, bevel=0.0):
    rot = {'Z': (0, 0, 0), 'Y': (math.pi / 2, 0, 0), 'X': (0, math.pi / 2, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    if bevel:
        bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 2
        bpy.ops.object.modifier_apply(modifier='bv')
    return finish(ob, mat)

def box(mat, size, loc, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object; ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 2
        bpy.ops.object.modifier_apply(modifier='bv')
    return finish(ob, mat)

def ring_x(mat, r_out, r_in, x0, x1, segs=96):
    # 축이 X인 고리(디스크 마찰판)
    bm = bmesh.new(); rings = []
    for x in (x0, x1):
        for r in (r_out, r_in):
            rings.append([bm.verts.new((x, r * math.cos(2 * math.pi * i / segs), AXIS_Z + r * math.sin(2 * math.pi * i / segs))) for i in range(segs)])
    o0, i0, o1, i1 = rings
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((o0[i], o0[j], o1[j], o1[i])); bm.faces.new((i0[j], i0[i], i1[i], i1[j]))
        bm.faces.new((o1[i], o1[j], i1[j], i1[i])); bm.faces.new((o0[j], o0[i], i0[i], i0[j]))
    me = bpy.data.meshes.new('ring'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('ring', me); scene.collection.objects.link(ob)
    finish(ob, mat)
    # 마찰면·둘레는 평평하게(부드러운 음영이면 타이어처럼 둥글게 보인다): 둘레만 부드럽게
    for p in ob.data.polygons: p.use_smooth = abs(p.normal.x) < 0.5
    return ob

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object; ob.name = name
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return ob

# ---------------- 바이스(작업대 고정, 턱은 Y 방향으로 문다) ----------------
vise = join([
    box('ViseBlue', (0.20, 0.13, 0.03), (0.02, 0, 0.015), bevel=0.004),            # 받침
    box('ViseBlue', (0.16, 0.07, 0.07), (0.02, 0, 0.065), bevel=0.006),            # 몸통
    box('ViseBlue', (0.05, 0.16, 0.06), (0.02, -0.07, 0.11), bevel=0.005),         # 고정 턱 몸
    box('ViseBlue', (0.05, 0.12, 0.06), (0.02, 0.085, 0.11), bevel=0.005),         # 움직 턱 몸
    box('ViseJaw', (0.012, 0.13, 0.04), (0.02, -0.015, 0.155)),                    # 고정 턱 판
    box('ViseJaw', (0.012, 0.13, 0.04), (0.02, 0.045, 0.155)),                     # 움직 턱 판
    cyl('Steel', 0.009, 0.16, (0.02, 0.19, 0.075), axis='Y', verts=20),            # 나사봉
    cyl('Steel', 0.006, 0.20, (0.02, 0.27, 0.075), axis='X', verts=16),            # 손잡이
    cyl('Black', 0.011, 0.02, (0.12, 0.27, 0.075), axis='X', verts=16),
    cyl('Black', 0.011, 0.02, (-0.08, 0.27, 0.075), axis='X', verts=16),
], 'Vise')
# 턱이 Y로 마주 보도록 판 방향을 돌린다: 위에서 정한 판은 X 두께 → 턱 면은 X를 본다. 너클은 X 두께로 물린다.

# ---------------- 조향 너클(빨강): 아래 팔이 턱에 물리고, 위에 허브 베어링 하우징 ----------------
knuckle = join([
    box('KnuckleRed', (0.035, 0.045, 0.09), (0.02, 0.015, 0.16), bevel=0.006),     # 턱에 물린 아래 팔
    box('KnuckleRed', (0.045, 0.06, 0.10), (0.01, 0.015, 0.235), bevel=0.01),      # 몸통
    cyl('KnuckleRed', 0.058, 0.05, (-0.005, 0.0, AXIS_Z), axis='X', verts=40, bevel=0.006),   # 베어링 하우징
    box('KnuckleRed', (0.03, 0.03, 0.10), (0.0, -0.06, AXIS_Z + 0.06), bevel=0.006),          # 캘리퍼 붙는 귀(위)
    box('KnuckleRed', (0.03, 0.03, 0.10), (0.0, 0.06, AXIS_Z + 0.06), bevel=0.006),
    box('KnuckleRed', (0.03, 0.12, 0.03), (0.0, 0.0, AXIS_Z + 0.115), bevel=0.006),
], 'Knuckle')

# ---------------- 허브 + 디스크(도는 부분, 원점 = 축) ----------------
dx0, dx1 = DISC_X - DISC_T / 2, DISC_X + DISC_T / 2
plate = 0.007
vanes = []
for i in range(36):   # 두 판 사이 냉각 날개
    a = 2 * math.pi * i / 36
    rm = 0.5 * (DISC_R + DISC_IN)
    v = box('DiscIron', (DISC_T - 2 * plate, 0.006, DISC_R - DISC_IN - 0.006), (DISC_X, rm * math.cos(a), AXIS_Z + rm * math.sin(a)))
    v.rotation_euler = (a - math.pi / 2, 0, 0)
    bpy.context.view_layer.objects.active = v
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    vanes.append(v)
studs = []
for i in range(4):
    a = 2 * math.pi * i / 4 + math.pi / 4
    y, z = 0.05 * math.cos(a), AXIS_Z + 0.05 * math.sin(a)
    studs.append(cyl('Stud', 0.0065, 0.05, (DISC_X - 0.045, y, z), axis='X', verts=16))
rotor = join([
    ring_x('DiscFace', DISC_R, DISC_IN, dx0, dx0 + plate),                 # 바깥 마찰판(측정 면)
    ring_x('DiscFace', DISC_R, DISC_IN, dx1 - plate, dx1),                 # 안쪽 마찰판
    cyl('HubRust', DISC_IN, 0.006, (DISC_X - 0.002, 0, AXIS_Z), axis='X', verts=64),      # 디스크 모자 옆면 이음
    cyl('HubRust', 0.075, 0.032, (DISC_X - 0.022, 0, AXIS_Z), axis='X', verts=64, bevel=0.003),   # 모자(허브 장착면)
    cyl('Black', 0.03, 0.034, (DISC_X - 0.022, 0, AXIS_Z), axis='X', verts=32),            # 가운데 구멍(어둡게)
    cyl('HubRust', 0.062, 0.03, (DISC_X + 0.035, 0, AXIS_Z), axis='X', verts=48, bevel=0.003),    # 허브 플랜지
    cyl('Steel', 0.022, 0.03, (DISC_X - 0.045, 0, AXIS_Z), axis='X', verts=24),            # 허브 너트
] + vanes + studs, 'Rotor')
# 원점을 허브 축으로(앱이 지역 X축으로 돌린다)
off = Vector((0, 0, AXIS_Z)) - rotor.matrix_world.translation
rotor.data.transform(__import__('mathutils').Matrix.Translation(-off))
rotor.location = (0, 0, AXIS_Z)

measure = bpy.data.objects.new('MeasurePoint', None); scene.collection.objects.link(measure)
measure.location = (dx0, 0, AXIS_Z + DISC_R - MEASURE_IN)

root = bpy.data.objects.new('DiscFixture', None); scene.collection.objects.link(root)
bpy.context.view_layer.update()
for o in (vise, knuckle, rotor, measure):
    w = o.matrix_world.copy(); o.parent = root; o.matrix_world = w

tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
print('TRIS', tris)
bpy.context.view_layer.update()
print('MEASURE %.4f %.4f %.4f' % tuple(measure.matrix_world.translation))
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_cameras=False, export_lights=False, export_animations=False,
                          export_draco_mesh_compression_enable=False,
                          export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression')
print('EXPORTED', OUT, os.path.getsize(OUT))

if PREVIEW:
    world = bpy.data.worlds.new('W'); scene.world = world
    if world.node_tree is None: world.use_nodes = True
    if HDRI:
        nt = world.node_tree; env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDRI)
        nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0))
    fl = bpy.context.active_object; fl.data.materials.append(material('Bench', '#5a4632', rough=0.6))
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(-60)); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 40
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 900, 700
    base_, ext = os.path.splitext(PREVIEW)
    for tag, loc, tgt in [('front34', (-0.75, -0.55, 0.55), (-0.03, 0, 0.22)), ('side', (-0.05, -0.9, 0.3), (-0.03, 0, 0.22)), ('outboard', (-0.8, 0.05, 0.32), (0, 0, 0.28))]:
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
