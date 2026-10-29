# 변속기 시뮬레이터(가솔린 엔진 A/T 제어 교육 장비, 사진 10) 3D 모델 생성 스크립트 — Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_transmission_simulator.py -- <출력.glb> [미리보기.png] [HDRI]
# 모양은 사진 10을 따랐다: 바퀴 달린 민트색 철제 수레, 앞쪽 비스듬한 조작판(계기판·작은 계기 3개·스위치 판·키·가속 손잡이·소켓·진단 단자),
# 뒤쪽에 엔진과 자동변속기, 맨 뒤 위에 둥근 계기 7개 판, 오른쪽 옆 변속 레버. 치수(몸체 1.80×1.40, 높이 1.65)는 사진 비례 가정(미측정).
# 글자·상표(장비 이름·회사 이름·계기 눈금)는 넣지 않는다.
# Blender 좌표: X 폭, Y 앞(+Y가 조작판, glTF에서 -z), Z 위. 노드: TransmissionSimulator(뿌리, 바닥 가운데) > Body.
import bpy, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'transmission-simulator.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

W, D, H = 1.8, 1.4, 1.65                      # 몸체 폭·깊이·전체 높이(뒤 계기판 위끝)
CART_Z = 0.80                                 # 수레 윗면(조작판 아래끝) 높이
PANEL_TOP = 1.24                              # 조작판 위끝 높이
CASTER = 0.12                                 # 바퀴 높이(수레 바닥)

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
    'Mint': material('Mint', '#8fd0b6', metal=0.15, rough=0.5, coat=0.2),
    'MintDark': material('MintDark', '#6fae95', metal=0.15, rough=0.6),
    'Face': material('Face', '#c9ccc9', metal=0.4, rough=0.45),
    'FaceLight': material('FaceLight', '#e8ebe6', rough=0.5),
    'Black': material('Black', '#151515', rough=0.6),
    'Glass': material('Glass', '#0b0d10', metal=0.3, rough=0.08),
    'Dial': material('Dial', '#f3f3ef', rough=0.4),
    'Needle': material('Needle', '#d32f2f', rough=0.4),
    'Red': material('Red', '#c62828', rough=0.35),
    'Blue': material('Blue', '#1e5bb8', rough=0.35),
    'Chrome': material('Chrome', '#d6dadf', metal=1.0, rough=0.15),
    'Steel': material('Steel', '#9aa0a6', metal=0.85, rough=0.35),
    'CastAlu': material('CastAlu', '#b9bdbd', metal=0.7, rough=0.45),
    'EngineBlack': material('EngineBlack', '#2a2c2e', metal=0.3, rough=0.5),
    'Hose': material('Hose', '#3a3d40', rough=0.8),
    'Rubber': material('Rubber', '#0f0f0f', rough=0.9),
    'Wire1': material('Wire1', '#d84315', rough=0.6),
    'Wire2': material('Wire2', '#1565c0', rough=0.6),
    'Wire3': material('Wire3', '#f9a825', rough=0.6),
    'Brass': material('Brass', '#b8964a', metal=0.9, rough=0.35),
}

parts = []

def finish(ob, mat, sharp=40):
    if mat: ob.data.materials.append(M[mat])
    ob.data.shade_smooth(); ob.data.set_sharp_from_angle(angle=math.radians(sharp))
    parts.append(ob); return ob

def apply_mod(ob, mod):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(o == ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)

def box(mat, size, loc, rot=(0, 0, 0), bevel=0.0, segs=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = segs
        apply_mod(ob, bv)
    return finish(ob, mat)

def cyl(mat, r, depth, loc, rot=(0, 0, 0), verts=24, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = 2
        apply_mod(ob, bv)
    return finish(ob, mat)

def tube(mat, pts, r, res=6):
    curve = bpy.data.curves.new('c', 'CURVE'); curve.dimensions = '3D'; curve.bevel_depth = r; curve.bevel_resolution = 1
    sp = curve.splines.new('NURBS'); sp.points.add(len(pts) - 1)
    for p_, v in zip(sp.points, pts): p_.co = (v[0], v[1], v[2], 1)
    sp.use_endpoint_u = True; sp.order_u = min(3, len(pts)); sp.resolution_u = res
    co = bpy.data.objects.new('c', curve); scene.collection.objects.link(co)
    bpy.context.view_layer.objects.active = co
    for o in bpy.context.view_layer.objects: o.select_set(o == co)
    bpy.ops.object.convert(target='MESH'); return finish(bpy.context.active_object, mat)

FRONT = D / 2
T = 0.035  # 각관 굵기
# ---------------- 수레(철제 틀 + 판) ----------------
for sx in (-1, 1):
    for sy in (-1, 1):
        box('Mint', (T, T, CART_Z - CASTER), (sx * (W / 2 - T / 2), sy * (D / 2 - T / 2), CASTER + (CART_Z - CASTER) / 2))
        # 바퀴(브래킷 + 고무 바퀴)
        cx, cy = sx * (W / 2 - 0.08), sy * (D / 2 - 0.08)
        box('Steel', (0.07, 0.06, 0.012), (cx, cy, CASTER - 0.006))
        for k in (-1, 1): box('Steel', (0.01, 0.05, 0.06), (cx + k * 0.022, cy, CASTER - 0.04))
        cyl('Rubber', 0.045, 0.03, (cx, cy, 0.045), rot=(0, math.pi / 2, 0), verts=16)
for z in (CASTER + 0.02, 0.42, CART_Z - T / 2):
    for sy in (-1, 1): box('Mint', (W, T, T), (0, sy * (D / 2 - T / 2), z))
    for sx in (-1, 1): box('Mint', (T, D, T), (sx * (W / 2 - T / 2), 0, z))
box('MintDark', (W - 0.04, D - 0.04, 0.02), (0, 0, CASTER + 0.03))           # 바닥판
box('MintDark', (W - 0.04, D - 0.04, 0.02), (0, 0, 0.42))                    # 가운데 선반
box('MintDark', (W - 0.04, D - 0.30, 0.02), (0, -0.13, CART_Z - 0.01))       # 윗판(엔진 받침, 조작판 뒤)
# 옆판(양쪽)·뒤판 아래 칸
for sx in (-1, 1): box('Mint', (0.012, D - 0.06, 0.28), (sx * (W / 2 - 0.004), 0, 0.27))
box('Mint', (W - 0.06, 0.012, 0.28), (0, -D / 2 + 0.004, 0.27))
# 앞 아래 칸: 왼쪽(앞에서 볼 때) 문(살짝 열림) · 오른쪽 닫힌 판, 위 칸은 트여 배선이 보인다
door_w = W * 0.42
hinge_x = W / 2 - 0.03                                        # 앞에서 볼 때 왼쪽 = +X
door = box('Mint', (door_w, 0.015, 0.36), (hinge_x - door_w / 2, FRONT - 0.005, 0.27), bevel=0.004)
box('Mint', (W * 0.5, 0.015, 0.36), (-(W / 2 - 0.03) + W * 0.25, FRONT - 0.005, 0.27), bevel=0.004)
box('Chrome', (0.015, 0.025, 0.08), (hinge_x - door_w + 0.04, FRONT + 0.01, 0.30), bevel=0.004)
# 위 칸 배선 다발(색 전선)
for i, (mat, dz) in enumerate((('Wire1', 0.0), ('Wire2', 0.03), ('Wire3', 0.06), ('Black', 0.09))):
    tube(mat, [(W / 2 - 0.15, 0.25, 0.47 + dz), (0.2, 0.32 - i * 0.03, 0.55 + dz), (-0.3, 0.2, 0.5 + dz), (-W / 2 + 0.2, 0.3, 0.6 + dz * 0.5)], 0.008)
box('Black', (0.5, 0.25, 0.18), (-0.35, 0.1, 0.52), bevel=0.01)              # 제어기 상자

# ---------------- 앞 조작판(비스듬히, 위가 뒤로 기움) ----------------
TILT = math.radians(28)
pan_h = (PANEL_TOP - CART_Z) / math.cos(TILT)
pan_w = W - 0.06
pc_y = FRONT - 0.04 - (PANEL_TOP - CART_Z) * math.tan(TILT) / 2
pc_z = (CART_Z + PANEL_TOP) / 2
box('Mint', (W, 0.08, pan_h + 0.06), (0, pc_y - 0.02, pc_z), rot=(TILT, 0, 0), bevel=0.01)   # 틀
# 조작판 위 점(u: 앞에서 볼 때 왼→오 0~1, v: 아래→위 0~1)을 월드 좌표로
nrm = Vector((0, math.cos(TILT), math.sin(TILT)))                     # 판 앞쪽 법선
up = Vector((0, -math.sin(TILT), math.cos(TILT)))                     # 판 위쪽
center = Vector((0, pc_y - 0.02, pc_z)) + nrm * 0.041
def at(u, v, out=0.0):
    return center + Vector((-(u - 0.5) * pan_w, 0, 0)) + up * ((v - 0.5) * pan_h) + nrm * out
def onpanel(fn, mat, size_or_r, u, v, out, **kw):
    loc = at(u, v, out)
    if fn == 'box': return box(mat, size_or_r, tuple(loc), rot=(TILT, 0, 0), **kw)
    return cyl(mat, size_or_r[0], size_or_r[1], tuple(loc), rot=(TILT - math.pi / 2, 0, 0), **kw)
onpanel('box', 'Face', (pan_w - 0.05, 0.006, pan_h - 0.05), 0.5, 0.5, 0.003)          # 회색 면판
# 왼쪽 스위치 판(빨강·파랑 단자 격자)
onpanel('box', 'FaceLight', (0.30, 0.008, pan_h - 0.12), 0.13, 0.5, 0.007, bevel=0.003)
for r in range(7):
    for c in range(6):
        onpanel('cyl', 'Red' if r < 4 else 'Blue', (0.008, 0.012), 0.065 + c * 0.026, 0.82 - r * 0.1, 0.012, verts=10)
# 가운데 위: 계기판(검은 둥근 판 + 큰 계기 2개)
onpanel('box', 'Black', (0.48, 0.02, 0.13), 0.47, 0.68, 0.011, bevel=0.02, segs=3)
for u in (0.40, 0.54):
    onpanel('cyl', 'Glass', (0.048, 0.008), u, 0.68, 0.022, verts=28)
    onpanel('box', 'Needle', (0.035, 0.003, 0.004), u + 0.01, 0.69, 0.027)
# 가운데 아래: 작은 계기 3개(진공·전압·연료압)
for u in (0.36, 0.47, 0.58):
    onpanel('cyl', 'Chrome', (0.036, 0.012), u, 0.24, 0.009, verts=24)
    onpanel('cyl', 'Dial', (0.029, 0.006), u, 0.24, 0.016, verts=24)
    onpanel('box', 'Black', (0.022, 0.002, 0.003), u, 0.25, 0.02)
# 오른쪽: 키·가속 손잡이·소켓·진단 단자(네 칸)
for (u, v) in ((0.76, 0.70), (0.89, 0.70), (0.76, 0.28), (0.89, 0.28)):
    onpanel('box', 'FaceLight', (0.13, 0.006, 0.12), u, v, 0.008, bevel=0.003)
onpanel('cyl', 'Black', (0.016, 0.02), 0.76, 0.72, 0.016, verts=16)
onpanel('box', 'Blue', (0.012, 0.03, 0.035), 0.76, 0.74, 0.03)                       # 꽂힌 열쇠
onpanel('cyl', 'Brass', (0.022, 0.05), 0.89, 0.72, 0.03, verts=20, bevel=0.004)      # 가속 손잡이
onpanel('cyl', 'Black', (0.02, 0.025), 0.76, 0.30, 0.015, verts=16)                  # 전원 소켓
onpanel('box', 'Black', (0.05, 0.02, 0.03), 0.89, 0.30, 0.014, bevel=0.003)          # 진단 단자

# ---------------- 엔진 · 자동변속기(수레 위 뒤쪽) ----------------
ey = -0.12
box('CastAlu', (0.62, 0.42, 0.30), (0.05, ey, CART_Z + 0.17), bevel=0.02)                 # 블록
box('CastAlu', (0.56, 0.30, 0.10), (0.05, ey, CART_Z + 0.37), bevel=0.02)                 # 헤드
for i in range(4):                                                                     # 흡기 다기관
    tube('CastAlu', [(-0.17 + i * 0.13, ey + 0.15, CART_Z + 0.38), (-0.17 + i * 0.13, ey + 0.28, CART_Z + 0.42), (-0.15 + i * 0.1, ey + 0.30, CART_Z + 0.30)], 0.025)
cyl('CastAlu', 0.06, 0.62, (0.05, ey + 0.30, CART_Z + 0.30), rot=(0, math.pi / 2, 0), verts=16)
box('EngineBlack', (0.24, 0.20, 0.14), (0.34, ey + 0.26, CART_Z + 0.40), bevel=0.02)      # 공기 정화기
tube('Hose', [(0.34, ey + 0.16, CART_Z + 0.42), (0.40, ey + 0.05, CART_Z + 0.50), (0.38, ey - 0.08, CART_Z + 0.45)], 0.035)
box('EngineBlack', (0.08, 0.36, 0.36), (-0.30, ey, CART_Z + 0.22), bevel=0.01)            # 플라이휠 덮개
# 자동변속기(앞에서 볼 때 오른쪽 = -X): 원뿔 하우징 + 케이스
bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.20, radius2=0.14, depth=0.22, location=(-0.45, ey, CART_Z + 0.22), rotation=(0, -math.pi / 2, 0))
ob = bpy.context.active_object; bpy.ops.object.transform_apply(location=False, rotation=True, scale=True); finish(ob, 'CastAlu')
box('CastAlu', (0.30, 0.26, 0.26), (-0.70, ey, CART_Z + 0.18), bevel=0.03)
cyl('CastAlu', 0.05, 0.12, (-0.88, ey, CART_Z + 0.16), rot=(0, math.pi / 2, 0), verts=16)
box('Steel', (0.40, 0.04, 0.04), (-0.55, ey, CART_Z + 0.03))                              # 받침
for x in (-0.25, 0.30): box('Steel', (0.05, 0.40, 0.05), (x, ey, CART_Z + 0.025))
# 배기관(아래로)
tube('Steel', [(0.30, ey - 0.20, CART_Z + 0.20), (0.40, ey - 0.40, CART_Z + 0.10), (0.55, ey - 0.55, CART_Z + 0.04)], 0.025)

# ---------------- 뒤 위: 둥근 계기 7개 판 ----------------
gb_y = -D / 2 + 0.06
for sx in (-1, 1): box('Mint', (T, T, H - CART_Z), (sx * 0.62, gb_y, CART_Z + (H - CART_Z) / 2))
box('Mint', (1.34, 0.05, 0.20), (0, gb_y, H - 0.10), bevel=0.008)
box('FaceLight', (1.26, 0.006, 0.15), (0, gb_y + 0.028, H - 0.10))
for i in range(7):
    x = -0.54 + i * 0.18
    cyl('Chrome', 0.045, 0.02, (x, gb_y + 0.035, H - 0.105), rot=(math.pi / 2, 0, 0), verts=24)
    cyl('Dial', 0.037, 0.006, (x, gb_y + 0.046, H - 0.105), rot=(math.pi / 2, 0, 0), verts=24)
    box('Black', (0.028, 0.002, 0.003), (x + 0.008, gb_y + 0.05, H - 0.10), rot=(0, math.radians(30 * (i % 3) - 30), 0))
# 계기 관(뒤판 → 엔진)
for i in (-2, 0, 2):
    tube('Black', [(i * 0.18, gb_y + 0.02, H - 0.2), (i * 0.15, gb_y + 0.15, CART_Z + 0.5), (i * 0.08, ey - 0.1, CART_Z + 0.42)], 0.005)

# ---------------- 오른쪽 옆: 변속 레버(앞에서 볼 때 오른쪽 = -X) ----------------
lx = -W / 2 - 0.10
box('Mint', (0.22, 0.30, 0.03), (lx + 0.02, 0.25, CART_Z - 0.02))                         # 받침 판
box('FaceLight', (0.14, 0.24, 0.12), (lx, 0.25, CART_Z + 0.05), bevel=0.01)              # 레버 상자
box('Chrome', (0.10, 0.20, 0.012), (lx, 0.25, CART_Z + 0.115), bevel=0.004)              # 위판(P·R·N·D 홈 자리)
box('Black', (0.012, 0.15, 0.004), (lx, 0.25, CART_Z + 0.122))
cyl('Chrome', 0.012, 0.20, (lx, 0.28, CART_Z + 0.22), verts=12)
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.035, location=(lx, 0.28, CART_Z + 0.34))
ob = bpy.context.active_object; ob.scale = (1, 1, 1.6); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); finish(ob, 'Black')

# ---------------- 합치기 · 내보내기 ----------------
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
body = bpy.context.active_object; body.name = 'Body'
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
root = bpy.data.objects.new('TransmissionSimulator', None); scene.collection.objects.link(root)
body.parent = root

bpy.context.view_layer.update()
body.data.calc_loop_triangles()
bb = [body.matrix_world @ Vector(c) for c in body.bound_box]
print('TRIS', len(body.data.loop_triangles))
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
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
    fl = bpy.context.active_object; fl.data.materials.append(material('Floor', '#1e7d4b', rough=0.35))
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(150)); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 35
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 1100, 900
    base_, ext = os.path.splitext(PREVIEW)
    for tag, loc, tgt in (('front', (1.4, 3.2, 1.9), (0, 0, 0.8)), ('panel', (0.0, 1.7, 1.45), (0, 0.4, 1.0)),
                          ('side', (-3.2, 0.6, 1.5), (0, 0, 0.8)), ('back', (1.8, -3.0, 1.9), (0, 0, 0.9))):
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
