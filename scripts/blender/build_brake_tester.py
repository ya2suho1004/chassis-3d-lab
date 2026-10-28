# 제동력 시험기(롤러식) 3D 모델 생성 스크립트 — Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_brake_tester.py -- <출력.glb> [미리보기.png] [HDRI]
# 치수는 배치 데이터(brake-tester-01: 동서 3.0 · 남북 1.2)와 장면 코드(LabScene.tsx BrakeRig: 롤러 반지름 0.1 · 길이 0.6,
# 바퀴 중심 x=±0.7, 앞뒤 롤러 간격 ±0.28, 롤러 축 높이 ROLLER_Y, 리프트 판 0.55×0.22×0.03)에 맞춘다.
# 모양은 실습장 사진 27·28(빨간 틀·양끝 빨간 덮개 상자·롤러 구덩이)을 따랐다. 상표·글자는 넣지 않는다.
# 둘레 줄무늬 철판은 장면 코드가 그대로 그린다(이 파일에는 없다).
# Blender 좌표: X 동서(장면 x와 같음), Y 남북(장면 -z), Z 위. glTF 내보내기에서 Y-up으로 바뀐다. 남북 대칭이라 방향 차이는 없다.
# 노드: BrakeTester(뿌리, 바닥 가운데) > Base(움직이지 않는 부분), Roller_LN/LS/RN/RS(롤러 중심, 지역 X축으로 돈다),
#       Lift_L/Lift_R(리프트 판 가운데, 앱이 높이 y만 바꾼다. 내려간 높이 = -0.02).
import bpy, bmesh, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'brake-tester.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

W, D = 3.0, 1.2
WHEEL_X, WHEEL_R = 0.70, 0.30
ROLLER_R, ROLLER_LEN, ROLLER_DZ = 0.10, 0.60, 0.28
ROLLER_Z = WHEEL_R - math.sqrt((WHEEL_R + ROLLER_R) ** 2 - ROLLER_DZ ** 2)  # 장면 코드 ROLLER_Y와 같은 식
LIFT_REST = -0.02
PIT_W, PIT_D = 0.72, D * 0.9         # 바퀴 자리 구덩이(동서 × 남북)
COVER_W = max(0.3, W / 2 - WHEEL_X - 0.35)  # 양끝 덮개 상자 폭(장면 코드와 같은 식)
COVER_H = 0.18

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------- 재질 ----------------
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

def material(name, color, metal=0.0, rough=0.5, coat=0.0):
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*lin(color), 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if coat: p.inputs['Coat Weight'].default_value = coat
    m.diffuse_color = (*lin(color), 1)
    return m

M = {
    'RedPaint': material('RedPaint', '#c8201e', metal=0.15, rough=0.45, coat=0.3),
    'RedWorn': material('RedWorn', '#9e2420', metal=0.35, rough=0.6),
    'Pit': material('Pit', '#121212', rough=1.0),
    'PitWall': material('PitWall', '#2a2a2a', rough=0.95),
    'Roller': material('Roller', '#3b3d40', metal=0.75, rough=0.62),
    'RollerRib': material('RollerRib', '#8c9095', metal=0.9, rough=0.35),
    'Cast': material('Cast', '#2e3134', metal=0.6, rough=0.55),
    'Steel': material('Steel', '#9aa0a6', metal=0.85, rough=0.38),
    'Bolt': material('Bolt', '#c9cdd1', metal=1.0, rough=0.25),
    'Yellow': material('Yellow', '#f2c200', rough=0.5),
    'Black': material('Black', '#151515', rough=0.6),
    'Vent': material('Vent', '#0d0d0d', rough=0.9),
    'Label': material('Label', '#e9e9e4', rough=0.4),
}

parts = []  # Base에 합칠 것

def finish(ob, mat, sharp=40):
    if mat: ob.data.materials.append(M[mat])
    ob.data.shade_smooth(); ob.data.set_sharp_from_angle(angle=math.radians(sharp))
    return ob

def apply_mod(ob, mod):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(o == ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)

def box(name, mat, size, loc, rot=(0, 0, 0), bevel=0.0, segs=2, keep=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.name = name; ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = segs
        apply_mod(ob, bv)
    finish(ob, mat)
    if keep: parts.append(ob)
    return ob

def cyl(name, mat, r, depth, loc, rot=(0, 0, 0), verts=24, keep=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    finish(ob, mat)
    if keep: parts.append(ob)
    return ob

def poly(name, mat, pts, z):
    """바닥과 평행한 볼록 다각형 한 장(위를 향함)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, y, z) for x, y in pts], [], [list(range(len(pts)))])
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    finish(ob, mat); parts.append(ob); return ob

def bolt(x, y, z, r=0.009):
    cyl('bolt', 'Bolt', r, 0.006, (x, y, z + 0.003), verts=6)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object; ob.name = name
    return ob

def lathe(name, profile, segs, mat, radial_fn=None):
    """profile: [(a, r)] 닫힌 단면(a=축 방향 X, r=반지름). X축으로 돌린다."""
    bm = bmesh.new(); rings = []
    for s in range(segs):
        ang = 2 * math.pi * s / segs
        ring = []
        for a, r in profile:
            rr = radial_fn(s, a, r) if radial_fn else r
            ring.append(bm.verts.new((a, rr * math.cos(ang), rr * math.sin(ang))))
        rings.append(ring)
    n = len(profile)
    for s in range(segs):
        A, B = rings[s], rings[(s + 1) % segs]
        for k in range(n):
            bm.faces.new((A[k], A[(k + 1) % n], B[(k + 1) % n], B[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    return finish(ob, mat, sharp=30)

# ---------------- 바퀴 자리 구덩이(좌·우) ----------------
for sx in (-1, 1):
    cx = sx * WHEEL_X
    # 구덩이 바닥(장면 바닥 아래는 보이지 않으므로 바닥 높이의 검은 면으로 깊이를 표현)
    box('pit', 'Pit', (PIT_W, PIT_D, 0.004), (cx, 0, 0.004))
    # 구덩이 안쪽 벽이 보이는 듯한 가장자리 그늘 띠
    for sy in (-1, 1):
        box('pitlip', 'PitWall', (PIT_W - 0.02, 0.03, 0.002), (cx, sy * (PIT_D / 2 - 0.025), 0.0068))
    # 빨간 앵글 틀(바닥과 거의 같은 높이, 테두리만 살짝 올라옴)
    t, h = 0.045, 0.018
    for sy in (-1, 1):
        box('frame_ns', 'RedPaint', (PIT_W + 2 * t, t, h), (cx, sy * (PIT_D / 2 + t / 2), h / 2), bevel=0.004)
    for side in (-1, 1):
        box('frame_ew', 'RedPaint', (t, PIT_D, h), (cx + side * (PIT_W / 2 + t / 2), 0, h / 2), bevel=0.004)
    # 틀 모서리 볼트
    for bx in (-1, 1):
        for by in (-1, 1):
            bolt(cx + bx * (PIT_W / 2 + t / 2), by * (PIT_D / 2 + t / 2), h, r=0.008)
    # 롤러 축받이(롤러 양끝, 축 높이) — 위 절반만 바닥 위로 보인다
    for ry in (-ROLLER_DZ, ROLLER_DZ):
        for e in (-1, 1):
            bx = cx + e * (ROLLER_LEN / 2 + 0.028)
            box('bearing', 'Cast', (0.04, 0.12, 0.11), (bx, ry, ROLLER_Z - 0.01), bevel=0.008)
            cyl('bearing_cap', 'Steel', 0.03, 0.012, (bx + e * 0.025, ry, ROLLER_Z), rot=(0, math.pi / 2, 0), verts=16)
            for k in (-1, 1): bolt(bx, ry + k * 0.042, ROLLER_Z + 0.045, r=0.006)

# ---------------- 가운데 덮개판(두 구덩이 사이): 빨간 미끄럼 방지 철판 ----------------
inner = WHEEL_X - PIT_W / 2 - 0.045  # 틀 안쪽 끝
CW = 2 * inner - 0.01
box('centerplate', 'RedPaint', (CW, PIT_D + 0.09, 0.012), (0, 0, 0.006), bevel=0.003)
# 무늬: 서로 엇갈린 짧은 돌기(줄무늬 철판)
nx, ny = int(CW / 0.06), int((PIT_D + 0.06) / 0.06)
for i in range(nx):
    for j in range(ny):
        x = -CW / 2 + 0.03 + i * 0.06 + (0.015 if j % 2 else 0)
        y = -(PIT_D + 0.06) / 2 + 0.03 + j * 0.06
        if abs(x) > CW / 2 - 0.02: continue
        ang = math.radians(45 if (i + j) % 2 else -45)
        box('tread', 'RedWorn', (0.026, 0.007, 0.003), (x, y, 0.0135), rot=(0, 0, ang))
for bx in (-1, 1):
    for by in (-1, 0, 1):
        bolt(bx * (CW / 2 - 0.03), by * (PIT_D / 2), 0.012, r=0.007)

# ---------------- 양끝 덮개 상자(모터·감지기 상자) ----------------
for sx in (-1, 1):
    cx = sx * (W / 2 - COVER_W / 2)
    box('cover', 'RedPaint', (COVER_W, D, COVER_H), (cx, 0, COVER_H / 2), bevel=0.02, segs=3)
    # 윗면 뚜껑 이음선 2줄과 뚜껑 볼트
    for y in (-D / 6, D / 6):
        box('lidseam', 'Vent', (COVER_W - 0.03, 0.006, 0.002), (cx, y, COVER_H + 0.0005))
    for y in (-D / 2 + 0.06, -D / 6 + 0.03, -D / 6 - 0.03, D / 6 - 0.03, D / 6 + 0.03, D / 2 - 0.06):
        for xx in (-1, 1):
            bolt(cx + xx * (COVER_W / 2 - 0.04), y, COVER_H)
    # 구덩이 쪽 윗모서리 노랑·검정 경고 띠
    ex = cx - sx * (COVER_W / 2 - 0.035)
    box('hazard', 'Yellow', (0.05, D - 0.06, 0.002), (ex, 0, COVER_H + 0.001))
    n = 14
    for k in range(n):
        y0 = -(D - 0.06) / 2 + (k + 0.25) * (D - 0.06) / n
        y1 = y0 + 0.5 * (D - 0.06) / n
        sk = 0.025
        poly('hazard_k', 'Black', [(ex - 0.025, y0 - sk), (ex + 0.025, y0 + sk), (ex + 0.025, y1 + sk), (ex - 0.025, y1 - sk)], COVER_H + 0.0025)
    # 구덩이 쪽 옆면에도 같은 경고 띠(세로 면)
    fx = cx - sx * (COVER_W / 2 + 0.0015)
    box('hazard_side', 'Yellow', (0.002, D - 0.1, 0.05), (fx, 0, COVER_H - 0.045))
    for k in range(16):
        y = -(D - 0.1) / 2 + (k + 0.5) * (D - 0.1) / 16
        box('hazard_side_k', 'Black', (0.002, 0.022, 0.06), (fx - sx * 0.001, y, COVER_H - 0.045), rot=(math.radians(35), 0, 0))
    # 바깥 끝면 환기구(가로 슬릿 6줄) + 아랫단 걸레받이
    ox = cx + sx * (COVER_W / 2 + 0.001)
    box('ventframe', 'RedWorn', (0.004, 0.42, 0.11), (ox, 0, 0.09))
    for k in range(6):
        z = 0.045 + k * 0.017
        box('vent', 'Vent', (0.006, 0.38, 0.008), (ox + sx * 0.001, 0, z))
    box('kick', 'Black', (COVER_W + 0.004, D + 0.004, 0.025), (cx, 0, 0.0125))
    # 윗면 빈 표지판(글자 없음)
    box('label', 'Label', (0.12, 0.08, 0.002), (cx + sx * 0.04, -D / 3, COVER_H + 0.001))
    # 전선관(조작부 쪽: 동쪽 상자 남쪽 면에서 바닥으로)
    if sx > 0:
        cyl('gland', 'Black', 0.022, 0.03, (cx + 0.08, D / 2 + 0.012, 0.11), rot=(math.pi / 2, 0, 0), verts=16)
        cyl('conduit_v', 'Black', 0.016, 0.1, (cx + 0.08, D / 2 + 0.03, 0.06), verts=12)
        cyl('conduit_h', 'Black', 0.016, 0.22, (cx + 0.08, D / 2 + 0.03 + 0.11, 0.016), rot=(math.pi / 2, 0, 0), verts=12)

# ---------------- 롤러(따로 도는 노드) ----------------
RIBS = 24
def roller_radius(s, a, r):
    # 표면 돌기: 일정 간격으로 축 방향 용접 리브(마찰면)
    return r + (0.0045 if (r >= ROLLER_R - 1e-6 and s % 3 == 0) else 0.0)

ROLLER_PROFILE = [(-ROLLER_LEN / 2, 0.022), (-ROLLER_LEN / 2, ROLLER_R - 0.012), (-ROLLER_LEN / 2 + 0.012, ROLLER_R),
                  (ROLLER_LEN / 2 - 0.012, ROLLER_R), (ROLLER_LEN / 2, ROLLER_R - 0.012), (ROLLER_LEN / 2, 0.022)]

def build_roller(name):
    shell = lathe(name + '_shell', ROLLER_PROFILE, RIBS * 3, 'Roller', roller_radius)
    # 리브 부분에 밝은 금속 재질 지정(마모된 돌기)
    shell.data.materials.append(M['RollerRib'])
    for f in shell.data.polygons:
        c = f.center
        if abs(c.x) < ROLLER_LEN / 2 - 0.013 and math.hypot(c.y, c.z) > ROLLER_R + 0.002:
            f.material_index = 1
    shaft = cyl(name + '_shaft', 'Steel', 0.022, ROLLER_LEN + 0.11, (0, 0, 0), rot=(0, math.pi / 2, 0), verts=16, keep=False)
    # 양끝 원판(축 고정 판, 6각 볼트 4개) — 회전이 눈에 보이게
    extra = []
    for e in (-1, 1):
        extra.append(cyl(name + '_hub', 'Cast', 0.05, 0.008, (e * (ROLLER_LEN / 2 + 0.004), 0, 0), rot=(0, math.pi / 2, 0), verts=20, keep=False))
        for k in range(4):
            ang = math.pi / 4 + k * math.pi / 2
            extra.append(cyl(name + '_hb', 'Bolt', 0.007, 0.006, (e * (ROLLER_LEN / 2 + 0.01), 0.033 * math.cos(ang), 0.033 * math.sin(ang)), rot=(0, math.pi / 2, 0), verts=6, keep=False))
    return join([shell, shaft] + extra, name + '_mesh')

# ---------------- 리프트 판(따로 오르내리는 노드) ----------------
def build_lift(name):
    objs = [box(name + '_plate', 'Steel', (0.55, 0.22, 0.03), (0, 0, 0), bevel=0.005, keep=False)]
    for k in range(9):  # 윗면 미끄럼 방지 홈
        objs.append(box(name + '_rib', 'Cast', (0.5, 0.008, 0.003), (0, -0.088 + k * 0.022, 0.0155), keep=False))
    # 아래 받침(올라가면 보이는 유압 기둥과 가이드)
    objs.append(cyl(name + '_ram', 'Bolt', 0.03, 0.26, (0, 0, -0.145), verts=16, keep=False))
    for e in (-1, 1):
        objs.append(box(name + '_guide', 'Cast', (0.03, 0.03, 0.24), (e * 0.2, 0, -0.135), keep=False))
    objs.append(box(name + '_beam', 'Cast', (0.5, 0.06, 0.03), (0, 0, -0.03), keep=False))
    return join(objs, name + '_mesh')

# ---------------- 조립 ----------------
root = bpy.data.objects.new('BrakeTester', None); scene.collection.objects.link(root)
base = join(parts, 'Base'); base.parent = root

for side, sx in (('L', -1), ('R', 1)):
    for tag, ry in (('N', -ROLLER_DZ), ('S', ROLLER_DZ)):  # Blender -Y = 장면 +z(남), 이름은 장면 기준 북(-z)/남(+z)
        e = bpy.data.objects.new(f'Roller_{side}{tag}', None); scene.collection.objects.link(e)
        e.location = (sx * WHEEL_X, -ry, ROLLER_Z); e.parent = root
        r = build_roller(f'Roller_{side}{tag}'); r.parent = e; r.location = (0, 0, 0)
    e = bpy.data.objects.new(f'Lift_{side}', None); scene.collection.objects.link(e)
    e.location = (sx * WHEEL_X, 0, LIFT_REST); e.parent = root
    lm = build_lift(f'Lift_{side}'); lm.parent = e; lm.location = (0, 0, 0)

# ---------------- 점검 · 내보내기 ----------------
bpy.context.view_layer.update()
tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
bb = [base.matrix_world @ Vector(c) for c in base.bound_box]
print('TRIS', tris)
print('BASE_BBOX x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (min(v.x for v in bb), max(v.x for v in bb), min(v.y for v in bb), max(v.y for v in bb), min(v.z for v in bb), max(v.z for v in bb)))
print('ROLLER_Z %.4f' % ROLLER_Z)

bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=False,
                          export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression')
print('EXPORTED', OUT, os.path.getsize(OUT))

# ---------------- 미리보기 렌더(선택) ----------------
if PREVIEW:
    world = bpy.data.worlds.new('W'); scene.world = world
    if world.node_tree is None: world.use_nodes = True
    nt = world.node_tree
    if HDRI:
        env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDRI)
        nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    fl = bpy.context.active_object; fl.data.materials.append(material('Floor', '#1e7d4b', rough=0.35))
    # 앱처럼 둘레 철판 자리 표시(어두운 빨강)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0.002))
    sp = bpy.context.active_object; sp.scale = (W + 0.6, D + 0.6, 1); sp.data.materials.append(material('Surround', '#7a2a24', metal=0.4, rough=0.6))
    # 들린 상태도 보이게 왼쪽 리프트만 올린다(미리보기 전용)
    bpy.data.objects['Lift_L'].location.z = 0.13
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(30)); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 40
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 1400, 800
    base_, ext = os.path.splitext(PREVIEW)
    for tag, loc, tgt in (('overview', (2.6, -3.0, 2.2), (0, 0, 0.05)), ('close', (1.55, -1.0, 0.75), (0.7, 0, 0.0)),
                          ('end', (2.8, 0.9, 0.7), (1.2, 0, 0.1)), ('top', (0.0, -0.01, 4.2), (0, 0, 0))):
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
