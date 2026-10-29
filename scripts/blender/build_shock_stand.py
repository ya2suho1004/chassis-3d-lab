# 쇽업소버(스트럿) 분해 장비 — 스프링 압축기 스탠드(사진 16) 3D 모델 생성 스크립트. Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_shock_stand.py -- <출력.glb> [미리보기.png] [HDRI]
# 모양은 사진 16을 따랐다: 빨간 둥근 받침, 검은 기둥, 기둥 위 회색 고정 덩어리, 나사 축과 빨간 위·아래 팔(코일 스프링을 물고 있음),
# 끼워진 스트럿(검은 댐퍼·코일 스프링·위 마운트), 앞으로 나온 손잡이 2개(주황 공). 치수(받침 지름 약 0.64, 높이 1.47)는 사진 비례 가정(미측정).
# 글자(팔에 새겨진 글씨)는 넣지 않는다.
# Blender 좌표: X 폭, Y 앞(+Y가 손잡이 쪽, glTF에서 -z), Z 위. 노드: ShockStand(뿌리, 바닥 가운데) > Body.
import bpy, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'shock-stand.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

BASE_R, H = 0.32, 1.47                       # 받침 반지름·전체 높이(나사 축 위 너트 끝)
POST_TOP = 1.0                               # 기둥 위끝(고정 덩어리 높이)
STRUT_X = 0.17                               # 스트럿 중심이 기둥에서 떨어진 거리(앞에서 볼 때 왼쪽 = +X)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

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
    'Red': material('Red', '#c8102e', metal=0.3, rough=0.35, coat=0.3),
    'Black': material('Black', '#161616', metal=0.2, rough=0.5),
    'Grey': material('Grey', '#9ea3a8', metal=0.6, rough=0.45),
    'Steel': material('Steel', '#b8bcc0', metal=0.9, rough=0.3),
    'Thread': material('Thread', '#7d8287', metal=0.9, rough=0.4),
    'Spring': material('Spring', '#1b1b1b', metal=0.5, rough=0.4),
    'Rubber': material('Rubber', '#0f0f0f', rough=0.9),
    'Orange': material('Orange', '#ff7a1a', rough=0.35, coat=0.4),
    'Knuckle': material('Knuckle', '#5a5e62', metal=0.5, rough=0.55),
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

def ball(mat, r, loc):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=r, location=loc)
    return finish(bpy.context.active_object, mat)

def curve_mesh(mat, pts, r, kind='POLY', res=2, closed=False):
    curve = bpy.data.curves.new('c', 'CURVE'); curve.dimensions = '3D'; curve.bevel_depth = r; curve.bevel_resolution = res
    sp = curve.splines.new(kind); sp.points.add(len(pts) - 1)
    for p_, v in zip(sp.points, pts): p_.co = (v[0], v[1], v[2], 1)
    sp.use_cyclic_u = closed
    if kind == 'NURBS': sp.use_endpoint_u = True; sp.order_u = min(3, len(pts)); sp.resolution_u = 6
    co = bpy.data.objects.new('c', curve); scene.collection.objects.link(co)
    bpy.context.view_layer.objects.active = co
    for o in bpy.context.view_layer.objects: o.select_set(o == co)
    bpy.ops.object.convert(target='MESH'); return finish(bpy.context.active_object, mat)

def rod(mat, a, b, r, verts=12):
    a, b = Vector(a), Vector(b); d = b - a
    ob = cyl(mat, r, d.length, tuple((a + b) / 2), verts=verts)
    ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = d.to_track_quat('Z', 'Y')
    ob.location = (a + b) / 2
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(o == ob)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return ob

# ---------------- 받침(빨간 둥근 관 + 십자) · 기둥 ----------------
ring = [(BASE_R * math.cos(t), BASE_R * math.sin(t), 0.025) for t in [i * 2 * math.pi / 32 for i in range(32)]]
curve_mesh('Red', ring, 0.022, closed=True, res=2)
for a in (0, math.pi / 2):
    box('Red', (2 * BASE_R, 0.04, 0.03), (0, 0, 0.02), rot=(0, 0, a))
for t in (0.25, 1.82, 3.39, 4.96):
    cyl('Rubber', 0.03, 0.012, (BASE_R * math.cos(t), BASE_R * math.sin(t), 0.006), verts=12)
cyl('Red', 0.07, 0.06, (0, 0, 0.06), verts=20, bevel=0.008)                           # 기둥 밑 소켓
cyl('Black', 0.035, POST_TOP - 0.08, (0, 0, 0.08 + (POST_TOP - 0.08) / 2), verts=18)   # 기둥
cyl('Steel', 0.012, 0.75, (0.0, 0.11, 0.42), verts=10)                                # 받침 앞 보조 봉(사진의 은색 봉)
box('Grey', (0.11, 0.10, 0.12), (0.02, 0, POST_TOP + 0.02), bevel=0.012)              # 고정 덩어리

# ---------------- 스트럿(댐퍼·스프링·마운트) ----------------
sx = STRUT_X
box('Knuckle', (0.07, 0.05, 0.12), (sx, 0, 0.88), bevel=0.01)                         # 아래 브래킷(너클 물림)
for k in (-1, 1): cyl('Steel', 0.009, 0.10, (sx, k * 0.0, 0.86 + k * 0.03), rot=(math.pi / 2, 0, 0), verts=10)
cyl('Black', 0.026, 0.30, (sx, 0, 1.06), verts=20)                                    # 댐퍼 몸통
cyl('Black', 0.07, 0.012, (sx, 0, 1.06), verts=28)                                     # 아래 스프링 받침
coil_z0, coil_z1, turns, cr = 1.07, 1.32, 5.0, 0.075
n = int(turns * 24)
coil = [(sx + cr * math.cos(2 * math.pi * turns * i / n), cr * math.sin(2 * math.pi * turns * i / n), coil_z0 + (coil_z1 - coil_z0) * i / n) for i in range(n + 1)]
curve_mesh('Spring', coil, 0.009, res=1)
cyl('Steel', 0.009, 0.12, (sx, 0, 1.26), verts=12)                                     # 피스톤 봉
cyl('Black', 0.078, 0.012, (sx, 0, 1.335), verts=28)                                   # 위 스프링 받침
bpy.ops.mesh.primitive_cone_add(vertices=28, radius1=0.085, radius2=0.05, depth=0.06, location=(sx, 0, 1.37))
finish(bpy.context.active_object, 'Rubber')                                             # 위 마운트(고무)
cyl('Steel', 0.05, 0.01, (sx, 0, 1.405), verts=24)
for t in (0.4, 2.5, 4.6):
    cyl('Steel', 0.006, 0.05, (sx + 0.055 * math.cos(t), 0.055 * math.sin(t), 1.425), verts=8)   # 마운트 볼트 3개
cyl('Steel', 0.01, 0.04, (sx, 0, 1.43), verts=10)                                       # 가운데 너트

# ---------------- 스프링 압축기(나사 축 + 빨간 위·아래 팔) ----------------
scr_x = -0.05
cyl('Thread', 0.018, 0.42, (scr_x, 0.0, POST_TOP + 0.23), verts=14)                      # 나사 축
for z in [POST_TOP + 0.05 + i * 0.03 for i in range(13)]:                               # 나사산(고리)
    cyl('Steel', 0.021, 0.006, (scr_x, 0.0, z), verts=14)
box('Steel', (0.05, 0.05, 0.04), (scr_x, 0.0, H - 0.02), bevel=0.006)            # 위 너트(육각 대신 각)
# 위 팔: 나사 축 위끝에서 스트럿 쪽으로, 끝이 갈래로 스프링 위쪽을 문다
box('Red', (0.30, 0.07, 0.05), (scr_x + 0.13, 0.03, 1.33), rot=(0, math.radians(-6), 0), bevel=0.012)
box('Red', (0.06, 0.20, 0.04), (sx + 0.06, 0.03, 1.31), bevel=0.01)
for k in (-1, 1): box('Red', (0.03, 0.03, 0.06), (sx + 0.06, 0.03 + k * 0.09, 1.28), bevel=0.006)
# 아래 팔: 고정 덩어리에서 스트럿 쪽, 스프링 아래쪽을 문다
box('Red', (0.26, 0.07, 0.05), (scr_x + 0.12, 0.03, 1.10), bevel=0.012)
box('Red', (0.06, 0.20, 0.04), (sx + 0.06, 0.03, 1.12), bevel=0.01)
for k in (-1, 1): box('Red', (0.03, 0.03, 0.06), (sx + 0.06, 0.03 + k * 0.09, 1.15), bevel=0.006)
box('Grey', (0.10, 0.06, 0.05), (sx - 0.10, 0.05, 1.08), bevel=0.008)                    # 아래 갈고리 판(은색)

# ---------------- 손잡이 2개(앞으로, 주황 공) ----------------
hub = (scr_x, 0.04, POST_TOP + 0.04)
rod('Steel', hub, (scr_x - 0.36, 0.30, POST_TOP + 0.10), 0.011)
ball('Orange', 0.045, (scr_x - 0.36, 0.30, POST_TOP + 0.10))
rod('Steel', hub, (scr_x + 0.08, 0.34, POST_TOP + 0.02), 0.011)
ball('Orange', 0.05, (scr_x + 0.08, 0.34, POST_TOP + 0.02))
box('Grey', (0.08, 0.08, 0.07), hub, bevel=0.01)                                         # 손잡이 허브

# ---------------- 합치기 · 내보내기 ----------------
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
body = bpy.context.active_object; body.name = 'Body'
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
root = bpy.data.objects.new('ShockStand', None); scene.collection.objects.link(root)
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
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    fl = bpy.context.active_object; fl.data.materials.append(material('Floor', '#1e7d4b', rough=0.35))
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(150)); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 40
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 900, 1100
    base_, ext = os.path.splitext(PREVIEW)
    for tag, loc, tgt in (('front', (0.9, 2.4, 1.5), (0.05, 0, 0.9)), ('close', (0.35, 0.95, 1.45), (0.1, 0, 1.2)),
                          ('side', (2.3, -0.3, 1.2), (0.05, 0, 0.8)), ('back', (-1.0, -2.2, 1.4), (0.05, 0, 0.8))):
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
