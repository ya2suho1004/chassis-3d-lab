# 가위형 리프트(파란색, 발판 2개 + 경사로) 3D 모델 생성 스크립트 — Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_scissor_lift.py -- <출력.glb> [미리보기.png] [HDRI]
# 치수는 배치 데이터(lift-zone-01/a·b·c: 바닥판 2.20 × 4.00, 내려간 발판 높이 0.40)에 맞춘다. 모양은 사진 3(파란 발판·경사로)을 따랐고,
# 가위 다리·받침 구조는 일반적인 가위형 리프트를 참고한 가정이다. 상표·글자는 넣지 않는다.
# 앱(src/scene/models/ScissorLiftModel.tsx)이 높이에 맞춰 노드를 움직인다. 아래 상수는 그 파일의 SCISSOR 값과 같아야 한다.
# Blender 좌표: X 동서(장면 x), Y 남북(장면 -z), Z 위. 남쪽(장면 +z) 끝에 고정 핀이 있고 북쪽 끝이 미끄러진다.
# 노드(좌 L·우 R마다): Runway_*(발판 윗면 가운데, 앱이 높이 y를 바꾼다), ArmBase_*(바닥 고정 핀, 앱이 rotation.x = φ),
#   ArmTop_*(발판 밑 고정 핀, 앱이 y = 발판 높이 − DECK, rotation.x = −φ). φ = asin((발판 높이 − DECK − PIN_Z) / ARM).
import bpy, bmesh, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'scissor-lift.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

W, D = 2.20, 4.00
REST_TOP = 0.40          # 내려간 발판 윗면 높이(배치 데이터 h)
RUN_W, RUN_L = 0.62, 3.00
RUN_X = W / 2 - RUN_W / 2  # 발판 중심 x(±)
DECK = 0.12              # 발판 윗면 ~ 위 핀 높이 차
PIN_Z = 0.10             # 바닥 고정 핀 높이
PIN_Y = -0.90            # 고정 핀의 Blender y(= 장면 z +0.90)
ARM = 1.90               # 가위 다리 길이(핀~끝)
RAMP_L = (D - RUN_L) / 2

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
    'Blue': material('Blue', '#1f4fbf', metal=0.2, rough=0.42, coat=0.3),
    'BlueDark': material('BlueDark', '#173a8c', metal=0.3, rough=0.55),
    'Tread': material('Tread', '#2a5cd0', metal=0.35, rough=0.5),
    'Steel': material('Steel', '#9aa0a6', metal=0.85, rough=0.38),
    'Chrome': material('Chrome', '#d6dadf', metal=1.0, rough=0.12),
    'Cast': material('Cast', '#2e3134', metal=0.6, rough=0.55),
    'Yellow': material('Yellow', '#f2c200', rough=0.5),
    'Black': material('Black', '#151515', rough=0.7),
}

def finish(ob, mat, sharp=40):
    if mat: ob.data.materials.append(M[mat])
    ob.data.shade_smooth(); ob.data.set_sharp_from_angle(angle=math.radians(sharp))
    return ob

def apply_mod(ob, mod):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(o == ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)

def box(out, mat, size, loc, rot=(0, 0, 0), bevel=0.0, segs=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = segs
        apply_mod(ob, bv)
    out.append(finish(ob, mat)); return ob

def cyl_x(out, mat, r, length, loc, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=length, location=loc, rotation=(0, math.pi / 2, 0))
    ob = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    out.append(finish(ob, mat)); return ob

def cyl_y(out, mat, r, length, loc, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=length, location=loc, rotation=(math.pi / 2, 0, 0))
    ob = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    out.append(finish(ob, mat)); return ob

def wedge(out, mat, x0, x1, y_hi, y_lo, h):
    """경사로: y_hi 쪽 높이 h, y_lo 쪽 높이 0."""
    v = [(x0, y_hi, 0), (x1, y_hi, 0), (x1, y_lo, 0), (x0, y_lo, 0), (x0, y_hi, h), (x1, y_hi, h)]
    f = [(0, 3, 2, 1), (0, 1, 5, 4), (3, 0, 4), (1, 2, 5), (4, 5, 2, 3)]
    me = bpy.data.meshes.new('ramp'); me.from_pydata(v, [], f)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('ramp', me); scene.collection.objects.link(ob)
    out.append(finish(ob, mat, sharp=30)); return ob

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object; ob.name = name
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)  # 기준점 = 원점(핀·발판 윗면)
    return ob

def node(name, loc, parent):
    e = bpy.data.objects.new(name, None); scene.collection.objects.link(e)
    e.location = loc; e.parent = parent
    return e

root = bpy.data.objects.new('ScissorLift', None); scene.collection.objects.link(root)

# ---------------- 바닥 고정부(받침 틀·경사로·핀 받침) ----------------
base = []
for sx in (-1, 1):
    cx = sx * RUN_X
    # 받침 틀: 양쪽 레일 + 앞뒤 가로대(가위 다리 바깥쪽)
    for e in (-1, 1):
        box(base, 'BlueDark', (0.05, 2.3, 0.08), (cx + e * 0.27, -0.05, 0.04), bevel=0.006)
    for y in (PIN_Y - 0.2, 1.1):
        box(base, 'BlueDark', (0.59, 0.08, 0.06), (cx, y, 0.03), bevel=0.006)
    # 고정 핀 받침(바닥 쪽)
    for e in (-1, 1):
        box(base, 'Blue', (0.03, 0.14, 0.16), (cx + e * 0.245, PIN_Y, 0.08), bevel=0.005)
    cyl_x(base, 'Chrome', 0.022, 0.56, (cx, PIN_Y, PIN_Z))
    # 미끄럼 홈(북쪽) — 다리 끝 바퀴가 구르는 자리
    for e in (-1, 1):
        box(base, 'Cast', (0.04, 1.6, 0.012), (cx + e * 0.14, 0.25, 0.086))
    # 앞뒤 경사로(발판 끝에서 바닥까지, 고정)
    for sy in (-1, 1):
        y_hi, y_lo = sy * RUN_L / 2, sy * (RUN_L / 2 + RAMP_L)
        wedge(base, 'Blue', cx - RUN_W / 2 + 0.02, cx + RUN_W / 2 - 0.02, y_hi, y_lo, REST_TOP - 0.01)
        for k in range(7):  # 미끄럼 방지 가로대
            t = (k + 0.5) / 7
            yy = y_hi + (y_lo - y_hi) * t
            zz = (REST_TOP - 0.01) * (1 - t)
            ang = math.atan2(REST_TOP - 0.01, RAMP_L) * (-sy)
            box(base, 'Tread', (RUN_W - 0.08, 0.025, 0.012), (cx, yy, zz + 0.004), rot=(ang, 0, 0))
        # 경사로 끝 노란 띠
        box(base, 'Yellow', (RUN_W - 0.04, 0.04, 0.004), (cx, y_lo - sy * 0.0, 0.004))
# 유압 호스 상자(가운데 남쪽, 바닥) + 두 받침을 잇는 호스
box(base, 'BlueDark', (0.36, 0.22, 0.12), (0, PIN_Y - 0.25, 0.06), bevel=0.01)
for sx in (-1, 1):
    cyl_x(base, 'Black', 0.012, RUN_X - 0.45, (sx * (0.18 + (RUN_X - 0.45) / 2), PIN_Y - 0.25, 0.03), verts=8)
base_ob = join(base, 'Base'); base_ob.parent = root

# ---------------- 발판(위아래로 움직임) ----------------
def build_runway(name):
    o = []
    box(o, 'Blue', (RUN_W, RUN_L, 0.035), (0, 0, -0.0175), bevel=0.006)
    for e in (-1, 1):  # 옆 보(채널)
        box(o, 'BlueDark', (0.05, RUN_L - 0.04, DECK - 0.03), (e * (RUN_W / 2 - 0.03), 0, -0.035 - (DECK - 0.03) / 2 + 0.005), bevel=0.005)
    # 윗면 미끄럼 방지 돌기(엇갈린 짧은 막대)
    nx, ny = 7, int((RUN_L - 0.16) / 0.075)
    for i in range(nx):
        for j in range(ny):
            x = -RUN_W / 2 + 0.07 + i * (RUN_W - 0.14) / (nx - 1) + (0.02 if j % 2 else -0.02)
            y = -(RUN_L - 0.16) / 2 + j * 0.075
            box(o, 'Tread', (0.045, 0.012, 0.004), (x, y, 0.002), rot=(0, 0, math.radians(30 if (i + j) % 2 else -30)))
    # 양끝 바퀴 멈춤 턱 + 노란 경고 띠(바깥 옆)
    for sy in (-1, 1):
        box(o, 'Yellow', (RUN_W, 0.03, 0.03), (0, sy * (RUN_L / 2 - 0.015), 0.012), bevel=0.004)
    for e in (-1, 1):
        box(o, 'Yellow', (0.003, RUN_L - 0.2, 0.03), (e * (RUN_W / 2 + 0.0015), 0, -0.035))
    # 밑면 고정 핀 받침(남쪽)과 미끄럼 홈(북쪽)
    for e in (-1, 1):
        box(o, 'Blue', (0.03, 0.14, 0.08), (e * 0.175, PIN_Y, -DECK + 0.02), bevel=0.004)
        box(o, 'Cast', (0.04, 1.6, 0.012), (e * 0.21, 0.25, -DECK + 0.006))
    cyl_x(o, 'Chrome', 0.022, 0.40, (0, PIN_Y, -DECK))
    return join(o, name + '_mesh')

# ---------------- 가위 다리 ----------------
def arm_plates(o, xs, mat, down=False):
    """다리 한 짝: x 위치마다 판 1장, +Y 방향으로 ARM 길이. down이면 위 핀에서 아래로 내려오는 짝."""
    for x in xs:
        box(o, mat, (0.03, ARM + 0.08, 0.10), (x, ARM / 2, 0), bevel=0.012, segs=3)
    span = abs(xs[0] - xs[-1]) + 0.04
    cyl_x(o, 'Steel', 0.03, span, (0, 0, 0))          # 핀 쪽 가로관
    cyl_x(o, 'Steel', 0.03, span, (0, ARM, 0))        # 끝 쪽 가로관
    for x in xs:                                      # 끝 바퀴(홈 위를 구름)
        cyl_x(o, 'Black', 0.035, 0.03, (x + (0.025 if x > 0 else -0.025) * (-1 if down else 1), ARM, 0), verts=16)

def build_arm_base(name):
    o = []
    arm_plates(o, [-0.21, 0.21], 'Blue')
    cyl_x(o, 'Chrome', 0.026, 0.50, (0, ARM / 2, 0))  # 가운데 교차 핀
    # 유압 실린더(다리 가로관 사이, 다리와 함께 기운다)
    cyl_y(o, 'BlueDark', 0.05, 0.95, (0, 0.62, -0.02), verts=20)
    cyl_y(o, 'Chrome', 0.022, 0.5, (0, 1.32, -0.02), verts=12)
    box(o, 'Steel', (0.44, 0.06, 0.04), (0, 0.14, -0.02))
    return join(o, name + '_mesh')

def build_arm_top(name):
    o = []
    arm_plates(o, [-0.14, 0.14], 'Blue', down=True)
    box(o, 'Steel', (0.3, 0.05, 0.04), (0, 0.5, 0.0))  # 보강대
    box(o, 'Steel', (0.3, 0.05, 0.04), (0, 1.4, 0.0))
    return join(o, name + '_mesh')

for side, sx in (('L', -1), ('R', 1)):
    cx = sx * RUN_X
    rw = node(f'Runway_{side}', (cx, 0, REST_TOP), root); m = build_runway(f'Runway_{side}'); m.parent = rw; m.location = (0, 0, 0)
    ab = node(f'ArmBase_{side}', (cx, PIN_Y, PIN_Z), root); m = build_arm_base(f'ArmBase_{side}'); m.parent = ab; m.location = (0, 0, 0)
    at = node(f'ArmTop_{side}', (cx, PIN_Y, REST_TOP - DECK), root); m = build_arm_top(f'ArmTop_{side}'); m.parent = at; m.location = (0, 0, 0)

def pose(top):
    phi = math.asin(max(0.0, min(0.99, (top - DECK - PIN_Z) / ARM)))
    for side in ('L', 'R'):
        bpy.data.objects[f'Runway_{side}'].location.z = top
        bpy.data.objects[f'ArmBase_{side}'].rotation_euler.x = phi
        a = bpy.data.objects[f'ArmTop_{side}']; a.location.z = top - DECK; a.rotation_euler.x = -phi
    return phi

# ---------------- 점검 · 내보내기(다리는 수평 0°로 내보내고 앱이 높이에 맞춰 돌린다) ----------------
bpy.context.view_layer.update()
tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
print('TRIS', tris)
print('REST_PHI_DEG %.2f' % math.degrees(math.asin((REST_TOP - DECK - PIN_Z) / ARM)))

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
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(30)); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 35
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 1400, 800
    base_, ext = os.path.splitext(PREVIEW)
    for tag, top, loc, tgt in (('rest', REST_TOP, (4.2, -4.6, 2.6), (0, 0, 0.2)), ('raised', 1.60, (4.6, -4.0, 1.6), (0, 0, 0.8)),
                               ('raised_side', 1.60, (5.5, 0.3, 0.9), (0, 0, 0.8)), ('mid', 1.0, (-3.6, 4.2, 1.5), (0, 0, 0.6))):
        phi = pose(top)
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath, 'phi %.1f' % math.degrees(phi))
