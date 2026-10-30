# 차동기어 백래시 연습 고정대: 캐리어 받침대 + 차동기어 캐리어(링기어·피니언·차동 케이스) — Blender 5.x 화면 없이 실행.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_diff_carrier.py -- <출력.glb> [미리보기.png] [HDRI]
# 사진 29·30(작업대 위 차동기어 캐리어, 링기어에 다이얼 게이지)의 일반적인 모양이다. 실측 아님, 상표·글자 없음.
# 노드: DiffCarrier(뿌리 = 작업대 윗면) > Stand, Housing, RingGear(링기어 + 차동 케이스, 원점 = 링기어 축, 지역 X축으로 돈다),
#       Pinion(구동 피니언 + 컴패니언 플랜지, 원점 = 피니언 축, 지역 Y축으로 돈다),
#       MeasurePoint(맨 위 이빨의 −Y쪽 이면, 바깥 끝 3 mm 안쪽) — 다이얼 게이지 접촉점을 여기에 맞춘다,
#       FlangePoint(컴패니언 플랜지 가운데) — 앱이 '피니언 잡기' 공구를 여기에 그린다.
# Blender 좌표: Z 위, 링기어 축 = X(이빨이 −X를 본다), 피니언 축 = Y(+Y쪽이 컴패니언 플랜지). 길이 m.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'diff-carrier.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------- 치수(앱 BACKLASH_RIG와 같아야 한다) ----------------
R_O = 0.105            # 링기어 바깥 반지름(지름 210 mm 급)
R_IN = 0.060           # 링기어 안쪽 반지름(차동 케이스에 끼는 구멍)
RING_HALF = 0.011      # 링기어 몸통 두께의 절반(x)
TEETH = 41
TOOTH_H = 0.013        # 이빨 높이(−X로 나온 길이)
TOOTH_L = 0.026        # 이빨 길이(반지름 방향)
TOOTH_W = (0.0078, 0.0060)   # 이빨 폭(바깥 끝, 안쪽 끝)
CONTACT_IN = 0.003     # 측정 위치: 이빨 바깥 끝에서 3 mm 안쪽
AXIS_Z = 0.433 - R_O   # 링기어 축 높이 → 측정 위치 높이 0.43 m(dial-gauge-b.glb 측정축 높이와 같다)
PIN_X, PIN_Z = -0.052, AXIS_Z - 0.018   # 피니언 축(하이포이드처럼 조금 아래)
PIN_Y0 = 0.090         # 피니언 머리(이빨) 가운데 y
FLANGE_Y = 0.125       # 캐리어 플랜지 면 y
COMP_Y = 0.285         # 컴패니언 플랜지 y

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
    'StandBlue': material('StandBlue', '#1f3f8a', rough=0.45),
    'Cast': material('Cast', '#4b5156', metal=0.35, rough=0.7),
    'GearSteel': material('GearSteel', '#b8bcc0', metal=1.0, rough=0.28),
    'GearFace': material('GearFace', '#8f9499', metal=0.9, rough=0.4),
    'CaseIron': material('CaseIron', '#6e7378', metal=0.6, rough=0.55),
    'Steel': material('Steel', '#a9aeb3', metal=1.0, rough=0.3),
    'Bolt': material('Bolt', '#2f3336', metal=0.8, rough=0.4),
    'Black': material('Black', '#1a1a1a', rough=0.6),
}

def finish(ob, mat, smooth=True):
    ob.data.materials.clear(); ob.data.materials.append(M[mat])
    for p in ob.data.polygons: p.use_smooth = smooth
    return ob

def cyl(mat, r, depth, loc, axis='Z', verts=32, bevel=0.0, r2=None):
    rot = {'Z': (0, 0, 0), 'Y': (-math.pi / 2, 0, 0), 'X': (0, math.pi / 2, 0)}[axis]
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
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

def mesh_from(name, verts, faces, mat, smooth=False):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    return finish(ob, mat, smooth)

def ring_x(mat, r_out, r_in, x0, x1, segs=96):
    # 축이 X인 고리(링기어 몸통): 옆면은 평평, 둘레만 부드럽게
    vs, fs = [], []
    for x in (x0, x1):
        for r in (r_out, r_in):
            vs += [(x, r * math.cos(2 * math.pi * i / segs), AXIS_Z + r * math.sin(2 * math.pi * i / segs)) for i in range(segs)]
    o0, i0, o1, i1 = (k * segs for k in range(4))
    for i in range(segs):
        j = (i + 1) % segs
        fs += [(o0 + i, o0 + j, o1 + j, o1 + i), (i0 + j, i0 + i, i1 + i, i1 + j), (o1 + i, o1 + j, i1 + j, i1 + i), (o0 + j, o0 + i, i0 + i, i0 + j)]
    ob = mesh_from('ring', vs, fs, mat)
    for p in ob.data.polygons: p.use_smooth = abs(p.normal.x) < 0.5
    return ob

def tooth(phi):
    # 링기어 이빨 하나(−X 면에 붙은 쐐기, 바깥이 넓다). phi = YZ 평면에서 +Y부터 잰 각도
    c, s = math.cos(phi), math.sin(phi)
    def at(r, t, x):  # 반지름 r, 접선 방향 t, x
        return (x, r * c - t * s, AXIS_Z + r * s + t * c)
    x0, x1 = -RING_HALF + 0.001, -RING_HALF - TOOTH_H
    ri, ro = R_O - TOOTH_L, R_O
    wo, wi = TOOTH_W[0] / 2, TOOTH_W[1] / 2
    top = 0.65   # 이 끝(−X쪽)은 조금 좁다
    vs = [at(ri, -wi, x0), at(ri, wi, x0), at(ro, wo, x0), at(ro, -wo, x0),
          at(ri, -wi * top, x1), at(ri, wi * top, x1), at(ro, wo * top, x1), at(ro, -wo * top, x1)]
    fs = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return mesh_from('tooth', vs, fs, 'GearSteel')

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object; ob.name = name
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return ob

def set_origin(ob, point):
    off = Vector(point) - ob.matrix_world.translation
    ob.data.transform(Matrix.Translation(-off))
    ob.location = Vector(point)

# ---------------- 링기어 + 차동 케이스(도는 부분) ----------------
teeth = [tooth(math.pi / 2 + 2 * math.pi * k / TEETH) for k in range(TEETH)]   # k=0 이빨이 맨 위
bolts = []
for k in range(10):
    a = 2 * math.pi * (k + 0.5) / 10
    bolts.append(cyl('Bolt', 0.0075, 0.008, (RING_HALF + 0.004, 0.078 * math.cos(a), AXIS_Z + 0.078 * math.sin(a)), axis='X', verts=6))
ring = join([
    ring_x('GearFace', R_O - 0.002, R_IN, -RING_HALF, RING_HALF),
    ring_x('GearSteel', R_O - TOOTH_L + 0.002, R_IN + 0.004, -RING_HALF - 0.004, -RING_HALF + 0.001),   # 이뿌리 턱
    cyl('CaseIron', 0.072, 0.012, (RING_HALF + 0.006, 0, AXIS_Z), axis='X', verts=48, bevel=0.002),     # 케이스 플랜지(링기어 뒤)
    cyl('CaseIron', 0.050, 0.10, (RING_HALF + 0.055, 0, AXIS_Z), axis='X', verts=40, bevel=0.004),      # 차동 케이스 몸(뒤)
    cyl('CaseIron', 0.040, 0.05, (-0.025, 0, AXIS_Z), axis='X', verts=48, r2=R_IN - 0.001),             # 케이스 앞쪽(링기어 구멍 안)
    cyl('Steel', 0.028, 0.05, (-0.075, 0, AXIS_Z), axis='X', verts=32),                                   # 앞 베어링 목
    cyl('Steel', 0.028, 0.03, (RING_HALF + 0.12, 0, AXIS_Z), axis='X', verts=32),                         # 뒤 베어링 목
    cyl('Black', 0.012, 0.035, (-0.087, 0, AXIS_Z), axis='X', verts=20),                                  # 차축 스플라인 구멍(어둡게)
] + teeth + bolts, 'RingGear')
set_origin(ring, (0, 0, AXIS_Z))

# ---------------- 구동 피니언 + 컴패니언 플랜지(도는 부분) ----------------
pin_teeth = []
for k in range(10):
    a = 2 * math.pi * k / 10
    t = box('GearSteel', (0.008, 0.034, 0.010), (PIN_X + 0.024 * math.cos(a), PIN_Y0, PIN_Z + 0.024 * math.sin(a)))
    t.rotation_euler = (0, -a, 0)   # 상자 x(두께)를 반지름 방향으로
    bpy.context.view_layer.objects.active = t
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    pin_teeth.append(t)
comp_bolts = []
for k in range(4):
    a = 2 * math.pi * k / 4 + math.pi / 4
    comp_bolts.append(cyl('Bolt', 0.0055, 0.016, (PIN_X + 0.034 * math.cos(a), COMP_Y + 0.006, PIN_Z + 0.034 * math.sin(a)), axis='Y', verts=6))
pinion = join([
    cyl('GearSteel', 0.020, 0.036, (PIN_X, PIN_Y0, PIN_Z), axis='Y', verts=32, r2=0.026),      # 피니언 머리
    cyl('Steel', 0.015, COMP_Y - PIN_Y0, (PIN_X, (PIN_Y0 + COMP_Y) / 2, PIN_Z), axis='Y', verts=24),   # 피니언 축
    cyl('CaseIron', 0.046, 0.012, (PIN_X, COMP_Y, PIN_Z), axis='Y', verts=40, bevel=0.002),   # 컴패니언 플랜지
    cyl('CaseIron', 0.024, 0.03, (PIN_X, COMP_Y - 0.02, PIN_Z), axis='Y', verts=28),            # 플랜지 목
    cyl('Steel', 0.013, 0.014, (PIN_X, COMP_Y + 0.012, PIN_Z), axis='Y', verts=6),              # 피니언 너트
] + pin_teeth + comp_bolts, 'Pinion')
set_origin(pinion, (PIN_X, 0, PIN_Z))

# ---------------- 캐리어 하우징(고정) ----------------
cap_x = (-0.097, RING_HALF + 0.12)
housing_parts = [
    cyl('Cast', 0.062, COMP_Y - 0.04 - FLANGE_Y, (PIN_X, (FLANGE_Y + COMP_Y - 0.04) / 2, PIN_Z), axis='Y', verts=40, r2=0.040),   # 피니언 목(원뿔)
    box('Cast', (0.30, 0.016, 0.24), (0.0, FLANGE_Y + 0.008, AXIS_Z - 0.01), bevel=0.012),     # 캐리어 플랜지(판)
    box('Cast', (0.13, 0.05, 0.10), (PIN_X + 0.01, FLANGE_Y + 0.035, PIN_Z - 0.02), bevel=0.01),   # 플랜지 뒤 보강
]
for x in cap_x:   # 차동 케이스를 받치는 다리 + 베어링 캡
    housing_parts += [
        box('Cast', (0.026, FLANGE_Y + 0.004, 0.05), (x, FLANGE_Y / 2, AXIS_Z - 0.03), bevel=0.006),
        cyl('Cast', 0.042, 0.03, (x, 0, AXIS_Z), axis='X', verts=32, bevel=0.003),
        box('Cast', (0.03, 0.03, 0.07), (x, 0.0, AXIS_Z + 0.03), bevel=0.006),
        cyl('Bolt', 0.006, 0.012, (x, -0.018, AXIS_Z + 0.068), verts=6),
        cyl('Bolt', 0.006, 0.012, (x, 0.018, AXIS_Z + 0.068), verts=6),
    ]
for k in range(10):   # 플랜지 둘레 볼트(앞면)
    a = 2 * math.pi * k / 10
    housing_parts.append(cyl('Bolt', 0.006, 0.01, (0.125 * math.cos(a), FLANGE_Y - 0.004, AXIS_Z - 0.01 + 0.10 * math.sin(a)), axis='Y', verts=6))
housing = join(housing_parts, 'Housing')

# ---------------- 받침대(작업대 고정) ----------------
stand = join([
    box('StandBlue', (0.36, 0.24, 0.014), (0.0, FLANGE_Y + 0.06, 0.007), bevel=0.003),        # 바닥판
    box('StandBlue', (0.05, 0.05, AXIS_Z - 0.13), (-0.06, FLANGE_Y + 0.06, (AXIS_Z - 0.13) / 2 + 0.014), bevel=0.004),   # 기둥
    box('StandBlue', (0.05, 0.05, AXIS_Z - 0.13), (0.06, FLANGE_Y + 0.06, (AXIS_Z - 0.13) / 2 + 0.014), bevel=0.004),
    box('StandBlue', (0.24, 0.07, 0.016), (0.0, FLANGE_Y + 0.045, AXIS_Z - 0.115), bevel=0.003),   # 위 받침(플랜지 아래)
    box('StandBlue', (0.24, 0.012, 0.09), (0.0, FLANGE_Y + 0.02, AXIS_Z - 0.16), bevel=0.003),     # 플랜지를 무는 판
], 'Stand')

measure = bpy.data.objects.new('MeasurePoint', None); scene.collection.objects.link(measure)
r_c = R_O - CONTACT_IN
w_c = TOOTH_W[1] + (TOOTH_W[0] - TOOTH_W[1]) * (r_c - (R_O - TOOTH_L)) / TOOTH_L
measure.location = (-RING_HALF - TOOTH_H / 2, -w_c / 2 * (1 + 0.65) / 2, AXIS_Z + r_c)   # 이면 가운데 높이(이 끝 쪽 좁아짐 평균)
flange_pt = bpy.data.objects.new('FlangePoint', None); scene.collection.objects.link(flange_pt)
flange_pt.location = (PIN_X, COMP_Y, PIN_Z)

root = bpy.data.objects.new('DiffCarrier', None); scene.collection.objects.link(root)
bpy.context.view_layer.update()
for o in (stand, housing, ring, pinion, measure, flange_pt):
    w = o.matrix_world.copy(); o.parent = root; o.matrix_world = w

tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
print('TRIS', tris)
bpy.context.view_layer.update()
print('MEASURE %.4f %.4f %.4f' % tuple(measure.matrix_world.translation))
print('FLANGE %.4f %.4f %.4f' % tuple(flange_pt.matrix_world.translation))
print('AXIS_Z %.4f R_C %.4f' % (AXIS_Z, r_c))
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
    for tag, loc, tgt in [('front34', (-0.75, -0.55, 0.6), (0.0, 0.05, 0.3)), ('teeth', (-0.55, 0.0, 0.42), (0.0, 0.0, 0.33)), ('top', (-0.25, -0.3, 0.75), (0.0, 0.0, 0.40))]:
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
