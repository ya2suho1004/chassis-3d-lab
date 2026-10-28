# 공용 조작부(올리브 캐비닛 + 노란 ABS TESTER 상자) 3D 모델 생성 스크립트 — Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_abs_panel.py -- <출력.glb> [미리보기.png] [HDRI]
# 치수는 배치 데이터(brake-control-panel-01: 폭 0.70 · 깊이 0.50 · 높이 1.50, 화면 높이 약 1.30)에 맞춘다. 모양은 사진 14·15(올리브 캐비닛,
# 노란 조작 상자, 버튼 7개: ESC·SIDE SLIP·BRAKE·SPEED·AXLE Load·LIFT UpDn·MOTOR)를 따랐다. 서랍·환기구·전원 스위치·바퀴·전원선 모양은 가정이다.
# 글자(ABS TESTER·버튼 이름·명판)는 이 파일에 넣지 않는다. 앱(AbsPanelModel.tsx)이 같은 자리에 글자 그림을 덧붙인다 — 아래 FACE·PLATE 값과 같아야 한다.
# Blender 좌표: X 폭, Y 앞(+Y가 버튼면, glTF에서 -z), Z 위. 노드: AbsPanel(뿌리, 바닥 가운데) > Body.
import bpy, bmesh, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'abs-panel.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

W, D, H = 0.70, 0.50, 1.50
FRONT = D / 2
BASE = 0.07                                   # 바퀴 위 캐비닛 바닥 높이
# 노란 조작 상자와 버튼면(앱 글자 그림과 같은 값)
FACE_W, FACE_H, FACE_Z = 0.63, 0.375, 1.20     # 버튼면 크기와 가운데 높이
BOX_OUT = 0.11                                 # 버튼면이 캐비닛 앞면에서 나온 거리
PLATE_W, PLATE_H, PLATE_Z = 0.574, 0.18, 0.93  # 캐비닛 명판
BUTTON_U = 395 / 512                           # 글자 그림(512×288)의 버튼 가로 자리
BUTTON_V = [(78 + i * 24) / 288 for i in range(7)]
SCREEN = (60 / 512, 360 / 512, 64 / 288, 224 / 288)  # 계기 화면 u0,u1,v0,v1

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
    'Olive': material('Olive', '#5d6146', metal=0.2, rough=0.6, coat=0.2),
    'OliveDark': material('OliveDark', '#474a35', metal=0.2, rough=0.7),
    'Yellow': material('Yellow', '#f2d21b', metal=0.1, rough=0.4, coat=0.3),
    'YellowDark': material('YellowDark', '#c9a90e', rough=0.5),
    'Black': material('Black', '#161616', rough=0.7),
    'Rubber': material('Rubber', '#0f0f0f', rough=0.9),
    'Screen': material('Screen', '#120807', metal=0.2, rough=0.08, emit='#3a0a06', emit_strength=1.0),
    'Bezel': material('Bezel', '#2a2a2a', rough=0.5),
    'Button': material('Button', '#d2d2d2', metal=0.3, rough=0.35),
    'ButtonRed': material('ButtonRed', '#c62828', rough=0.35),
    'ButtonGreen': material('ButtonGreen', '#2e7d32', rough=0.35),
    'Chrome': material('Chrome', '#d6dadf', metal=1.0, rough=0.15),
    'Steel': material('Steel', '#9aa0a6', metal=0.85, rough=0.35),
    'Plate': material('Plate', '#1d1d1d', rough=0.5),
    'Cable': material('Cable', '#1b1b1b', rough=0.6),
    'Plug': material('Plug', '#e8e6e0', rough=0.5),
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

def face_xz(u, v):
    """글자 그림 좌표(u: 왼→오, v: 위→아래, 0~1) → 버튼면 위 x, z. 앞(+Y)에서 보면 오른쪽이 -X다."""
    return -(u - 0.5) * FACE_W, FACE_Z + (0.5 - v) * FACE_H

FY = 1  # 앞 = +Y
# ---------------- 캐비닛 ----------------
box('Olive', (W, D, H - BASE), (0, 0, BASE + (H - BASE) / 2), bevel=0.018, segs=3)
box('Black', (W - 0.04, D - 0.04, 0.035), (0, 0, BASE - 0.0175 + 0.005))          # 받침
for sx in (-1, 1):                                                                # 바퀴 4개
    for sy in (-1, 1):
        cx, cy = sx * (W / 2 - 0.07), sy * (D / 2 - 0.07)
        box('Steel', (0.05, 0.04, 0.01), (cx, cy, BASE - 0.02))
        box('Steel', (0.012, 0.035, 0.03), (cx - 0.018, cy, BASE - 0.035))
        box('Steel', (0.012, 0.035, 0.03), (cx + 0.018, cy, BASE - 0.035))
        cyl('Rubber', 0.025, 0.022, (cx, cy, 0.025), rot=(0, math.pi / 2, 0), verts=16)
# 아래 서랍 2칸(테두리 홈 + 손잡이)
for zc, hh in ((0.29, 0.30), (0.62, 0.30)):
    box('OliveDark', (W - 0.07, 0.006, hh), (0, FY * (FRONT + 0.001), zc))
    box('Olive', (W - 0.09, 0.012, hh - 0.02), (0, FY * (FRONT + 0.004), zc), bevel=0.004)
    box('Chrome', (0.22, 0.02, 0.018), (0, FY * (FRONT + 0.03), zc + hh / 2 - 0.06), bevel=0.006)
    for sx in (-1, 1):
        box('Chrome', (0.016, 0.03, 0.018), (sx * 0.1, FY * (FRONT + 0.017), zc + hh / 2 - 0.06), bevel=0.004)
# 명판 자리(앱이 글자 그림을 덧붙임)
box('Plate', (PLATE_W, 0.008, PLATE_H), (0, FY * (FRONT + 0.004), PLATE_Z), bevel=0.003)
for sx in (-1, 1):
    for sz in (-1, 1):
        cyl('Chrome', 0.006, 0.006, (sx * (PLATE_W / 2 - 0.015), FY * (FRONT + 0.009), PLATE_Z + sz * (PLATE_H / 2 - 0.015)), rot=(math.pi / 2, 0, 0), verts=8)
# 양옆 환기구(가로 홈 8줄)와 오른쪽 옆 주 전원 스위치
for sx in (-1, 1):
    for k in range(8):
        box('Black', (0.004, 0.24, 0.008), (sx * (W / 2 + 0.001), -0.04, 0.30 + k * 0.022))
cyl('Yellow', 0.045, 0.02, (W / 2 + 0.01, 0.10, 0.80), rot=(0, math.pi / 2, 0), verts=24, bevel=0.004)
box('ButtonRed', (0.016, 0.07, 0.02), (W / 2 + 0.026, 0.10, 0.80), rot=(math.radians(35), 0, 0), bevel=0.004)
# 뒤쪽 전원선: 캐비닛 옆 아래에서 나와 바닥을 따라 가다 플러그(뽑혀 놓인 상태)
cyl('Black', 0.02, 0.03, (W / 2 - 0.08, -D / 2 - 0.012, 0.16), rot=(math.pi / 2, 0, 0), verts=12)
pts = [Vector((W / 2 - 0.08, -D / 2 - 0.03, 0.16)), Vector((W / 2 - 0.08, -D / 2 - 0.09, 0.06)), Vector((W / 2 - 0.02, -D / 2 - 0.16, 0.012)),
       Vector((W / 2 + 0.15, -D / 2 - 0.22, 0.012)), Vector((W / 2 + 0.30, -D / 2 - 0.12, 0.012))]
curve = bpy.data.curves.new('cord', 'CURVE'); curve.dimensions = '3D'; curve.bevel_depth = 0.008; curve.bevel_resolution = 2
sp = curve.splines.new('NURBS'); sp.points.add(len(pts) - 1)
for p_, v in zip(sp.points, pts): p_.co = (v.x, v.y, v.z, 1)
sp.use_endpoint_u = True; sp.order_u = 3; sp.resolution_u = 8
co = bpy.data.objects.new('cord', curve); scene.collection.objects.link(co)
bpy.context.view_layer.objects.active = co
for o in bpy.context.view_layer.objects: o.select_set(o == co)
bpy.ops.object.convert(target='MESH'); co = bpy.context.active_object; finish(co, 'Cable')
end = pts[-1]
box('Plug', (0.05, 0.07, 0.03), (end.x + 0.02, end.y + 0.03, 0.017), rot=(0, 0, math.radians(35)), bevel=0.008)
for k in (-1, 1):
    cyl('Steel', 0.0035, 0.025, (end.x + 0.045 + k * 0.007, end.y + 0.07, 0.017), rot=(math.pi / 2, 0, math.radians(35)), verts=8)

# ---------------- 노란 조작 상자(ABS TESTER) ----------------
BOX_D = 0.16
by = FRONT + BOX_OUT - BOX_D / 2
box('Yellow', (FACE_W + 0.03, BOX_D, FACE_H + 0.025), (0, FY * by, FACE_Z), bevel=0.012, segs=3)
box('YellowDark', (FACE_W + 0.05, 0.03, 0.02), (0, FY * (FRONT + 0.012), FACE_Z - FACE_H / 2 - 0.02), bevel=0.004)   # 받침 턱
fy = FRONT + BOX_OUT  # 버튼면 앞 평면
# 계기 화면: 테두리(돌출) + 유리(안쪽)
u0, u1, v0, v1 = SCREEN
(x1, z0), (x0, z1) = face_xz(u0, v1), face_xz(u1, v0)
box('Bezel', (x1 - x0 + 0.02, 0.012, z1 - z0 + 0.02), (0.5 * (x0 + x1), FY * (fy + 0.004), 0.5 * (z0 + z1)), bevel=0.004)
box('Screen', (x1 - x0 - 0.004, 0.006, z1 - z0 - 0.004), (0.5 * (x0 + x1), FY * (fy + 0.009), 0.5 * (z0 + z1)))
# 버튼 7개(둥근 누름 버튼 + 둘레 링). MOTOR = 빨강, ESC = 초록, 나머지 = 회색
for i, v in enumerate(BUTTON_V):
    x, z = face_xz(BUTTON_U, v)
    mat = 'ButtonRed' if i == 6 else 'ButtonGreen' if i == 0 else 'Button'
    cyl('Black', 0.0125, 0.006, (x, FY * (fy + 0.003), z), rot=(math.pi / 2, 0, 0), verts=20)
    cyl(mat, 0.0095, 0.014, (x, FY * (fy + 0.009), z), rot=(math.pi / 2, 0, 0), verts=20, bevel=0.002)
# 버튼면 네 모서리 나사, 상자 윗면 손잡이 홈
for sx in (-1, 1):
    for sz in (-1, 1):
        cyl('Chrome', 0.006, 0.004, (sx * (FACE_W / 2 - 0.01), FY * (fy + 0.002), FACE_Z + sz * (FACE_H / 2 - 0.01)), rot=(math.pi / 2, 0, 0), verts=8)
box('YellowDark', (0.24, 0.05, 0.004), (0, FY * (by + 0.02), FACE_Z + FACE_H / 2 + 0.0125))

# ---------------- 합치기 · 내보내기 ----------------
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
body = bpy.context.active_object; body.name = 'Body'
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
root = bpy.data.objects.new('AbsPanel', None); scene.collection.objects.link(root)
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
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
    fl = bpy.context.active_object; fl.data.materials.append(material('Floor', '#1e7d4b', rough=0.35))
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(150)); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 40
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 1000, 1100
    base_, ext = os.path.splitext(PREVIEW)
    for tag, loc, tgt in (('front', (1.1, 2.6, 1.4), (0, 0, 0.8)), ('face', (0.25, 1.2, 1.25), (0, 0.3, 1.2)),
                          ('side', (2.3, -0.6, 1.0), (0, 0, 0.7)), ('back', (-1.2, -2.3, 1.2), (0, 0, 0.6))):
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
