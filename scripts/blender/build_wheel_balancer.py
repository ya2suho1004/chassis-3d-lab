# 휠 밸런서(파란 몸체 + 베이지 조작부 + 오른쪽 축에 끼운 바퀴) 3D 모델 생성 스크립트 — Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_wheel_balancer.py -- <출력.glb> [미리보기.png] [HDRI]
# 치수는 배치 데이터(wheel-balancer-01: 폭 1.40 · 깊이 1.40 · 높이 1.20, 스케치 비례)에 맞춘다. 모양은 사진 37·43(파란 몸체, 위에 베이지
# 조작부: 빨간 숫자 표시 2개·버튼·웨이트 칸 6개, 몸체 오른쪽 옆으로 나온 축에 바퀴를 끼움, 덮개 없음)을 따랐다. 몸체 크기·축 높이·거리 측정 막대는 가정이다.
# 상표·글자는 넣지 않는다. Blender 좌표: X 폭(앞에서 보아 오른쪽 +X = 바퀴 쪽), Y 뒤(앞면이 -Y, glTF에서 +z — 북쪽 벽에 붙여 두면 실습장 안쪽을 본다), Z 위.
# 노드: WheelBalancer(뿌리, 바닥 가운데) > Body, Wheel(축에 끼운 바퀴, 축 = 지역 X, 돌리기 연출용).
import bpy, bmesh, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'wheel-balancer.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

W, D, H = 1.4, 1.4, 1.2
FY = -1                                        # 앞 = -Y
BODY_X0, BODY_X1 = -0.66, 0.08                 # 몸체 좌우(바퀴는 +X 쪽)
BODY_D, BODY_H = 0.62, 0.80
SHAFT_Z = 0.86                                 # 축 높이
WHEEL_X = 0.40                                 # 바퀴 가운데(축 방향)
TIRE_R, TIRE_W = 0.31, 0.20                    # 타이어 바깥 반지름·폭

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

def material(name, color, metal=0.0, rough=0.5, coat=0.0, emit=None, emit_strength=1.0):
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*lin(color), 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if coat: p.inputs['Coat Weight'].default_value = coat
    if emit:
        p.inputs['Emission Color'].default_value = (*lin(emit), 1)
        p.inputs['Emission Strength'].default_value = emit_strength
    m.diffuse_color = (*lin(color), 1)
    return m

M = {
    'Blue': material('Blue', '#1f4fae', metal=0.25, rough=0.45, coat=0.3),
    'BlueDark': material('BlueDark', '#173c84', metal=0.2, rough=0.6),
    'Beige': material('Beige', '#d9d5c2', rough=0.55, coat=0.1),
    'BeigeDark': material('BeigeDark', '#a9a593', rough=0.7),
    'Panel': material('Panel', '#3a3d40', rough=0.5),
    'Digit': material('Digit', '#2a0505', rough=0.15, emit='#ff2a1a', emit_strength=2.0),
    'BtnOrange': material('BtnOrange', '#f07a2a', rough=0.4),
    'BtnGrey': material('BtnGrey', '#c9c9c4', rough=0.4),
    'Black': material('Black', '#151515', rough=0.7),
    'Rubber': material('Rubber', '#121212', rough=0.85),
    'Chrome': material('Chrome', '#d6dadf', metal=1.0, rough=0.15),
    'Steel': material('Steel', '#8d9399', metal=0.85, rough=0.35),
    'Alloy': material('Alloy', '#b9bec4', metal=0.9, rough=0.25),
    'Lead': material('Lead', '#9da2a6', metal=0.7, rough=0.45),
}

parts, wheel_parts = [], []

def finish(ob, mat, sharp=40, into=None):
    if mat: ob.data.materials.append(M[mat])
    ob.data.shade_smooth(); ob.data.set_sharp_from_angle(angle=math.radians(sharp))
    (parts if into is None else into).append(ob); return ob

def apply_mod(ob, mod):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(o == ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)

def bevel(ob, w, segs=2):
    bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = w; bv.segments = segs; bv.limit_method = 'ANGLE'
    apply_mod(ob, bv)

def box(mat, size, loc, rot=(0, 0, 0), bev=0.0, segs=2, into=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bev: bevel(ob, bev, segs)
    return finish(ob, mat, into=into)

def cyl(mat, r, depth, loc, rot=(0, 0, 0), verts=24, bev=0.0, into=None, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bev: bevel(ob, bev)
    return finish(ob, mat, into=into)

def prism_yz(mat, profile, x0, x1, bev=0.0):
    """옆에서 본 단면(y, z 점 목록, 반시계)을 X 방향으로 x0~x1만큼 밀어낸 기둥"""
    me = bpy.data.meshes.new('prism'); bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in profile]
    b = [bm.verts.new((x1, y, z)) for y, z in profile]
    n = len(profile)
    bm.faces.new(list(reversed(a))); bm.faces.new(b)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('prism', me); scene.collection.objects.link(ob)
    if bev: bevel(ob, bev, 3)
    return finish(ob, mat)

def tire(center, axis, into):
    """타이어(둥근 고무) + 휠(5스포크 알루미늄). axis: 'X' 또는 'Z'(바퀴 축 방향)"""
    minor = 0.075
    major = TIRE_R - minor
    rot = (0, math.pi / 2, 0) if axis == 'X' else (0, 0, 0)
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48, minor_segments=14, location=(0, 0, 0))
    t = bpy.context.active_object
    t.scale = (1, 1, TIRE_W / (2 * minor))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    t.rotation_euler = rot; t.location = center
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
    finish(t, 'Rubber', sharp=80, into=into)
    # 트레드 홈 3줄(조금 어두운 고리)
    for k in (-1, 0, 1):
        off = k * TIRE_W * 0.22
        bpy.ops.mesh.primitive_torus_add(major_radius=TIRE_R - 0.003, minor_radius=0.006, major_segments=48, minor_segments=6, location=(0, 0, 0))
        g = bpy.context.active_object
        g.rotation_euler = rot
        g.location = (center[0] + (off if axis == 'X' else 0), center[1], center[2] + (off if axis == 'Z' else 0))
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
        finish(g, 'Black', sharp=80, into=into)
    # 휠: 림(바깥 고리) + 판 + 스포크 5개 + 허브
    rim_r = TIRE_R - 0.12
    def along(d):  # 축 방향 오프셋 → 위치
        return (center[0] + d, center[1], center[2]) if axis == 'X' else (center[0], center[1], center[2] + d)
    cyl_rot = (0, math.pi / 2, 0) if axis == 'X' else (0, 0, 0)
    cyl('Alloy', rim_r, TIRE_W * 0.9, along(0), rot=cyl_rot, verts=40, into=into)
    cyl('Steel', rim_r - 0.015, TIRE_W * 0.92, along(0), rot=cyl_rot, verts=40, into=into)
    face = TIRE_W * 0.46
    cyl('Alloy', 0.05, 0.04, along(face), rot=cyl_rot, verts=20, bev=0.006, into=into)
    for k in range(5):
        a = 2 * math.pi * k / 5
        if axis == 'X':
            box('Alloy', (0.03, 0.035, rim_r - 0.04), (center[0] + face - 0.005, center[1] + math.sin(a) * (rim_r / 2 + 0.02), center[2] + math.cos(a) * (rim_r / 2 + 0.02)), rot=(-a, 0, 0), bev=0.008, into=into)
        else:
            box('Alloy', (0.035, rim_r - 0.04, 0.03), (center[0] + math.sin(a) * (rim_r / 2 + 0.02), center[1] + math.cos(a) * (rim_r / 2 + 0.02), center[2] + face - 0.005), rot=(0, 0, -a), bev=0.008, into=into)

# ---------------- 몸체 ----------------
bx = 0.5 * (BODY_X0 + BODY_X1); bw = BODY_X1 - BODY_X0
box('Black', (bw + 0.04, BODY_D + 0.04, 0.05), (bx, 0, 0.025), bev=0.01)                       # 바닥 받침
box('Blue', (bw, BODY_D, BODY_H - 0.05), (bx, 0, 0.05 + (BODY_H - 0.05) / 2), bev=0.025, segs=3)
box('BlueDark', (bw - 0.12, 0.01, 0.34), (bx, FY * (BODY_D / 2 + 0.002), 0.40), bev=0.004)      # 앞판 홈
box('Blue', (bw - 0.15, 0.014, 0.31), (bx, FY * (BODY_D / 2 + 0.005), 0.40), bev=0.004)
# 웨이트 걸이 핀(몸체 왼쪽 옆, 사진 37에서 몸체 옆에 웨이트를 걸어 둠)
for k in range(4):
    cyl('Steel', 0.008, 0.05, (BODY_X0 - 0.02, -0.15 + k * 0.1, 0.62), rot=(0, math.pi / 2, 0), verts=8)
# ---------------- 조작부(베이지, 앞이 낮은 경사면) ----------------
CY0, CY1 = FY * (BODY_D / 2 + 0.03), -FY * (BODY_D / 2 + 0.01)       # 앞(-Y)·뒤
ZB, ZF, ZK = BODY_H - 0.02, BODY_H + 0.15, BODY_H + 0.36             # 아래, 앞 위, 뒤 위
prism_yz('Beige', [(CY0, ZB), (CY1, ZB), (CY1, ZK), (CY0, ZF)], BODY_X0 - 0.02, BODY_X1 + 0.03, bev=0.02)
box('BeigeDark', (bw + 0.06, BODY_D + 0.05, 0.03), (bx, 0.5 * (CY0 + CY1), ZB + 0.01), bev=0.006)   # 아래 테두리
# 경사면 위 좌표: t=0(앞 위) → t=1(뒤 위)
SLOPE = math.atan2(ZK - ZF, CY1 - CY0)
def on_slope(x, t, lift=0.0):
    y = CY0 + (CY1 - CY0) * t; z = ZF + (ZK - ZF) * t
    return (x, y - math.sin(SLOPE) * lift, z + math.cos(SLOPE) * lift)
# 뒤쪽 표시판: 어두운 판 + 빨간 숫자 표시 2개 + 버튼(주황·회색)
px = bx + 0.02
box('Panel', (bw - 0.12, 0.20, 0.012), on_slope(px, 0.80, 0.004), rot=(SLOPE, 0, 0), bev=0.004)
for sx in (-0.11, 0.07):
    box('Digit', (0.12, 0.045, 0.01), on_slope(px + sx, 0.88, 0.011), rot=(SLOPE, 0, 0), bev=0.002)
for i in range(7):
    for j in range(2):
        mat = 'BtnOrange' if (i in (0, 6) or (i == 3 and j == 0)) else 'BtnGrey'
        cyl(mat, 0.011, 0.012, on_slope(px - 0.22 + i * 0.07, 0.70 - j * 0.07, 0.011), rot=(SLOPE, 0, 0), verts=12, bev=0.002)
# 앞쪽 웨이트 칸 6개(움푹한 칸 = 어두운 바닥 + 둘레 턱) 안에 납 웨이트
for i in range(3):
    for j in range(2):
        cx = px - 0.19 + i * 0.19; t = 0.14 + j * 0.25
        box('BeigeDark', (0.16, 0.13, 0.008), on_slope(cx, t, 0.002), rot=(SLOPE, 0, 0))
        for sgn in (-1, 1):
            box('Beige', (0.17, 0.012, 0.02), on_slope(cx, t + sgn * 0.105, 0.008), rot=(SLOPE, 0, 0))
            box('Beige', (0.012, 0.13, 0.02), (cx + sgn * 0.085, *on_slope(cx, t, 0.008)[1:]), rot=(SLOPE, 0, 0))
        for k in range(3):
            box('Lead', (0.03, 0.014, 0.012), on_slope(cx - 0.04 + k * 0.04, t + (k - 1) * 0.03, 0.012), rot=(SLOPE, 0, math.radians(20 * (k - 1))), bev=0.002)
# ---------------- 축과 바퀴 ----------------
cyl('Black', 0.07, 0.04, (BODY_X1 + 0.02, 0.0, SHAFT_Z), rot=(0, math.pi / 2, 0), verts=24, bev=0.005)     # 축 받침
cyl('Steel', 0.022, WHEEL_X - BODY_X1 + 0.16, (0.5 * (BODY_X1 + WHEEL_X + 0.16), 0.0, SHAFT_Z), rot=(0, math.pi / 2, 0), verts=16)
# 거리 측정 막대(몸체 오른쪽 아래, 가정)
cyl('Steel', 0.012, 0.16, (BODY_X1 + 0.08, FY * 0.12, 0.62), rot=(0, math.pi / 2, 0), verts=10)
box('Black', (0.04, 0.03, 0.05), (BODY_X1 + 0.17, FY * 0.12, 0.62), bev=0.005)
tire((WHEEL_X, 0.0, SHAFT_Z), 'X', wheel_parts)
cyl('Steel', 0.06, 0.07, (WHEEL_X + TIRE_W * 0.5 + 0.03, 0.0, SHAFT_Z), rot=(0, math.pi / 2, 0), verts=20, r2=0.03, into=wheel_parts)  # 원뿔
cyl('Black', 0.045, 0.04, (WHEEL_X + TIRE_W * 0.5 + 0.08, 0.0, SHAFT_Z), rot=(0, math.pi / 2, 0), verts=16, bev=0.006, into=wheel_parts)  # 빠른 너트
for s in (-1, 1):
    box('Black', (0.02, 0.10, 0.02), (WHEEL_X + TIRE_W * 0.5 + 0.09, s * 0.06, SHAFT_Z), bev=0.006, into=wheel_parts)

# ---------------- 합치기 · 내보내기 ----------------
def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object; ob.name = name
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return ob

body = join(parts, 'Body')
wheel = join(wheel_parts, 'Wheel')
# 바퀴 노드는 축 가운데를 원점으로(앱에서 지역 X로 돌림)
wheel.data.transform(__import__('mathutils').Matrix.Translation((-WHEEL_X, 0, -SHAFT_Z)))
wheel.location = (WHEEL_X, 0, SHAFT_Z)
root = bpy.data.objects.new('WheelBalancer', None); scene.collection.objects.link(root)
body.parent = root; wheel.parent = root

bpy.context.view_layer.update()
tris = 0
for ob in (body, wheel):
    ob.data.calc_loop_triangles(); tris += len(ob.data.loop_triangles)
bb = [ob.matrix_world @ Vector(c) for ob in (body, wheel) for c in ob.bound_box]
print('TRIS', tris)
print('BBOX x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (min(v.x for v in bb), max(v.x for v in bb), min(v.y for v in bb), max(v.y for v in bb), min(v.z for v in bb), max(v.z for v in bb)))
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=False,
                          export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression')
print('EXPORTED', OUT, os.path.getsize(OUT))

if PREVIEW:
    world = bpy.data.worlds.new('W'); scene.world = world
    if world.node_tree is None: world.use_nodes = True
    nt = world.node_tree
    if HDRI:
        env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDRI)
        nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
    fl = bpy.context.active_object; fl.data.materials.append(material('Floor', '#1e7d4b', rough=0.35))
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(-30)); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 40
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 1000, 900
    base_, ext = os.path.splitext(PREVIEW)
    for tag, loc, tgt in (('front', (1.2, -3.0, 1.6), (0, 0, 0.6)), ('top', (0.3, -1.4, 2.1), (-0.25, 0, 0.95)),
                          ('side', (2.8, -0.8, 1.2), (0, 0, 0.6)), ('back', (-1.6, 2.6, 1.5), (0, 0, 0.6))):
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
