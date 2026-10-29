# 타이어 탈착기(파란 몸체 + 회전판 위 눕힌 바퀴 + 뒤 기둥·팔·탈착 헤드 + 오른쪽 비드 브레이커) 3D 모델 생성 스크립트 — Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_tire_changer.py -- <출력.glb> [미리보기.png] [HDRI]
# 바닥 크기는 배치 데이터(tire-changer-01: 폭 1.40 · 깊이 1.70, 스케치 비례)에 맞춘다. 높이는 배치값(1.20)보다 높다 — 사진 37에서 뒤 기둥이
# 사람 키 가까이 올라가므로 1.85로 했다(가정, 미측정). 모양은 사진 37(파란 몸체, 회색 회전판과 고정 집게, 눕힌 타이어, 파란 뒤 기둥·가로 팔·
# 육각 막대 끝 탈착 헤드, 오른쪽 아래 비드 브레이커 팔과 날, 앞 아래 발판)을 따랐다. 세부 치수는 가정이다. 상표·글자는 넣지 않는다.
# Blender 좌표: X 폭(앞에서 보아 오른쪽 +X = 비드 브레이커 쪽), Y 뒤(앞면이 -Y, glTF에서 +z — 북쪽 벽에 붙여 두면 실습장 안쪽을 본다), Z 위.
# 노드: TireChanger(뿌리, 바닥 가운데) > Body, Turntable(회전판 + 바퀴, 축 = 지역 Y(glTF), 돌리기 연출용).
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'tire-changer.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

W, D, H = 1.4, 1.7, 1.85
FY = -1                                        # 앞 = -Y
CAB_X0, CAB_X1 = -0.48, 0.20                   # 몸체 좌우(비드 브레이커는 +X 쪽)
CAB_Y0, CAB_Y1 = -0.46, 0.38                   # 몸체 앞뒤
CAB_H = 0.78
TT_X, TT_Y = -0.14, -0.06                      # 회전판 가운데
TT_R = 0.30
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
    'Grey': material('Grey', '#a3a8ad', metal=0.6, rough=0.4),
    'Red': material('Red', '#d32f2f', rough=0.3, emit='#ff3030', emit_strength=0.6),
    'Hex': material('Hex', '#2b2e31', metal=0.7, rough=0.35),
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
cx = 0.5 * (CAB_X0 + CAB_X1); cw = CAB_X1 - CAB_X0
cy = 0.5 * (CAB_Y0 + CAB_Y1); cd = CAB_Y1 - CAB_Y0
box('Black', (cw + 0.04, cd + 0.04, 0.05), (cx, cy, 0.025), bev=0.01)
box('Blue', (cw, cd, CAB_H - 0.05), (cx, cy, 0.05 + (CAB_H - 0.05) / 2), bev=0.02, segs=3)
box('Grey', (cw + 0.03, cd + 0.03, 0.03), (cx, cy, CAB_H - 0.01), bev=0.008)                         # 윗판
# 앞면: 오목한 판 2개, 빨간 표시등, 노란 경고 표지(글자 없음)
box('BlueDark', (cw - 0.10, 0.01, 0.30), (cx, CAB_Y0 - 0.002, 0.52), bev=0.004)
box('Blue', (cw - 0.13, 0.014, 0.27), (cx, CAB_Y0 - 0.005, 0.52), bev=0.004)
box('BlueDark', (cw - 0.10, 0.01, 0.16), (cx, CAB_Y0 - 0.002, 0.20), bev=0.004)
cyl('Red', 0.016, 0.02, (cx + 0.10, CAB_Y0 - 0.01, 0.58), rot=(math.pi / 2, 0, 0), verts=12)
bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.035, radius2=0.035, depth=0.004, location=(cx + 0.22, CAB_Y0 - 0.008, 0.62), rotation=(math.pi / 2, 0, 0))
ob = bpy.context.active_object; bpy.ops.object.transform_apply(location=False, rotation=True, scale=True); finish(ob, 'BtnOrange')
# 발판 3개(앞 아래로 나옴)
for k in range(3):
    px = cx - 0.16 + k * 0.16
    box('Steel', (0.11, 0.18, 0.025), (px, CAB_Y0 - 0.09, 0.075), rot=(math.radians(-8), 0, 0), bev=0.006)
    for r in range(3):
        box('Black', (0.10, 0.012, 0.006), (px, CAB_Y0 - 0.04 - r * 0.05, 0.092 - r * 0.007))
    box('Hex', (0.05, 0.05, 0.05), (px, CAB_Y0 - 0.005, 0.07))
# ---------------- 뒤 기둥 · 가로 팔 · 탈착 헤드 ----------------
COL_X, COL_Y = TT_X, CAB_Y1 + 0.08
box('BlueDark', (0.26, 0.20, 0.06), (COL_X, COL_Y - 0.02, CAB_H + 0.02), bev=0.008)                   # 기둥 받침
box('Blue', (0.20, 0.18, 1.62 - CAB_H), (COL_X, COL_Y, CAB_H + (1.62 - CAB_H) / 2), bev=0.015, segs=3)
cyl('Black', 0.05, 0.22, (COL_X + 0.15, COL_Y + 0.02, 1.15), verts=16, bev=0.004)                     # 공기 실린더(옆)
cyl('Chrome', 0.014, 0.25, (COL_X + 0.15, COL_Y + 0.02, 1.38), verts=10)
ARM_Z = 1.66
box('Blue', (0.17, COL_Y - TT_Y + 0.16, 0.14), (COL_X, 0.5 * (COL_Y + TT_Y) + 0.02, ARM_Z), bev=0.012)  # 가로 팔
box('BlueDark', (0.22, 0.20, 0.24), (COL_X + 0.0, TT_Y - 0.04, ARM_Z - 0.02), bev=0.015)              # 헤드 뭉치
cyl('Black', 0.025, 0.12, (COL_X - 0.15, TT_Y - 0.04, ARM_Z - 0.02), rot=(0, math.pi / 2, 0), verts=12)  # 잠금 손잡이
cyl('Black', 0.035, 0.03, (COL_X - 0.22, TT_Y - 0.04, ARM_Z - 0.02), rot=(0, math.pi / 2, 0), verts=12, bev=0.006)
# 육각 막대: 헤드에서 아래로, 끝에 탈착 헤드(바퀴 림 가장자리에 걸림)
BAR_X = TT_X + 0.17
TOP_TIRE = CAB_H + 0.06 + TIRE_W
cyl('Hex', 0.025, ARM_Z - TOP_TIRE - 0.02, (BAR_X, TT_Y, 0.5 * (ARM_Z + TOP_TIRE + 0.02)), verts=6)
box('Steel', (0.05, 0.08, 0.10), (BAR_X, TT_Y, TOP_TIRE + 0.03), bev=0.012)
box('Black', (0.06, 0.05, 0.03), (BAR_X + 0.02, TT_Y, TOP_TIRE - 0.005), bev=0.008)
# 오른쪽 위 공기 조절 상자 + 압력계
box('BlueDark', (0.10, 0.10, 0.12), (CAB_X1 + 0.03, CAB_Y1 - 0.08, CAB_H + 0.05), bev=0.01)
cyl('Black', 0.04, 0.025, (CAB_X1 + 0.09, CAB_Y1 - 0.08, CAB_H + 0.06), rot=(0, math.pi / 2, 0), verts=20)
cyl('Beige', 0.032, 0.01, (CAB_X1 + 0.104, CAB_Y1 - 0.08, CAB_H + 0.06), rot=(0, math.pi / 2, 0), verts=20)
# ---------------- 비드 브레이커(오른쪽) ----------------
box('Rubber', (0.03, 0.40, 0.30), (CAB_X1 + 0.015, cy - 0.06, 0.40), bev=0.01)                       # 몸체 옆 고무 받침
PIV = (CAB_X1 + 0.06, CAB_Y1 - 0.06, 0.62)
cyl('Steel', 0.04, 0.10, PIV, rot=(0, math.pi / 2, 0), verts=16)
BLADE = (CAB_X1 + 0.20, cy - 0.10, 0.38)       # 날은 몸체 옆 고무 받침을 마주 본다
mid = Vector((CAB_X1 + 0.17, 0.5 * (PIV[1] + BLADE[1]), 0.58))
for a_, b_ in ((Vector(PIV), mid), (mid, Vector(BLADE))):
    d_ = b_ - a_
    bpy.ops.mesh.primitive_cube_add(size=1, location=(a_ + b_) / 2)
    ob = bpy.context.active_object; ob.scale = (0.06, d_.length + 0.04, 0.06)
    ob.rotation_euler = d_.to_track_quat('Y', 'Z').to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bevel(ob, 0.01); finish(ob, 'Steel')
box('Black', (0.03, 0.22, 0.16), (BLADE[0] - 0.02, BLADE[1], BLADE[2] - 0.04), bev=0.008)            # 날
box('Steel', (0.12, 0.05, 0.05), (BLADE[0] + 0.02, BLADE[1] + 0.05, BLADE[2] + 0.06), bev=0.008)     # 손잡이 뭉치
cyl('Black', 0.022, 0.16, (BLADE[0] + 0.09, BLADE[1] + 0.05, BLADE[2] + 0.06), rot=(0, math.pi / 2, 0), verts=12)
# 비드 브레이커 공기 실린더(몸체 옆 → 팔 가운데를 미는 막대)
cyl('Grey', 0.045, 0.10, (CAB_X1 + 0.05, mid.y, 0.50), rot=(0, math.pi / 2, 0), verts=16, bev=0.004)
cyl('Chrome', 0.014, 0.10, (CAB_X1 + 0.13, mid.y, 0.50), rot=(0, math.pi / 2, 0), verts=10)
# ---------------- 회전판 + 바퀴(돌리기 연출용 노드) ----------------
TT_Z = CAB_H + 0.02
cyl('Grey', TT_R, 0.04, (TT_X, TT_Y, TT_Z + 0.02), verts=48, bev=0.006, into=wheel_parts)
cyl('Steel', 0.07, 0.03, (TT_X, TT_Y, TT_Z + 0.055), verts=24, into=wheel_parts)
for k in range(4):
    a = math.pi / 4 + k * math.pi / 2
    box('Steel', (0.05, 0.11, 0.05), (TT_X + math.cos(a) * 0.20, TT_Y + math.sin(a) * 0.20, TT_Z + 0.065), rot=(0, 0, a + math.pi / 2), bev=0.008, into=wheel_parts)
    box('Black', (0.03, 0.12, 0.012), (TT_X + math.cos(a) * 0.20, TT_Y + math.sin(a) * 0.20, TT_Z + 0.045), rot=(0, 0, a + math.pi / 2), into=wheel_parts)
tire((TT_X, TT_Y, TT_Z + 0.06 + TIRE_W / 2), 'Z', wheel_parts)

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
wheel = join(wheel_parts, 'Turntable')
# 회전판 노드는 회전 중심(바닥 높이 TT_Z)을 원점으로(앱에서 지역 Y로 돌림)
wheel.data.transform(Matrix.Translation((-TT_X, -TT_Y, -TT_Z)))
wheel.location = (TT_X, TT_Y, TT_Z)
root = bpy.data.objects.new('TireChanger', None); scene.collection.objects.link(root)
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
    scene.render.resolution_x, scene.render.resolution_y = 1000, 1000
    base_, ext = os.path.splitext(PREVIEW)
    for tag, loc, tgt in (('front', (1.6, -3.6, 2.0), (0, 0, 0.85)), ('top', (0.6, -1.6, 2.5), (-0.1, 0, 0.95)),
                          ('side', (3.2, -0.6, 1.4), (0, 0, 0.85)), ('back', (-1.8, 3.0, 1.9), (0, 0, 0.85))):
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
