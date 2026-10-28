# 시험 차량(흰색 경형 해치백) 3D 모델 생성 스크립트 — Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_test_car.py -- <출력.glb> [미리보기.png] [HDRI]
# 치수는 배치 데이터(brake-vehicle-01: 폭 1.6 · 길이 3.6 · 높이 1.5)와 장면 코드(바퀴 반지름 0.3, 축간 2.4, 바퀴 중심 x=±0.7)에 맞춘다.
# 이 치수는 국산 경차(길이 약 3.6 m, 축간 2.4 m) 비례와 같아, 실습장 사진(27·28)의 흰색 경형 해치백 모양을 따랐다.
# 상표·로고·번호 글자는 넣지 않는다. 실측값이 바뀌면 아래 숫자만 바꿔 다시 만든다.
# Blender 좌표: X 오른쪽, Y 앞(+Y가 차 앞), Z 위. glTF 내보내기에서 Y-up으로 바뀌어 차 앞은 -z가 된다(앱의 코드 차량과 같음).
# 노드: TestCar(뿌리, 바닥 가운데) > Body(돌지 않는 부분 전부), Wheel_FL/FR/RL/RR(바퀴 중심, 지역 X축으로 돈다).
import bpy, bmesh, math, os, sys
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'test-car.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

L, HALF_W = 3.6, 0.80
WHEEL_R, WHEEL_X, AXLE_Y = 0.30, 0.70, 1.20

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------- 재질 ----------------
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

def material(name, color, metal=0.0, rough=0.5, coat=0.0, coat_rough=0.05, emit=None, emit_strength=1.0):
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*lin(color), 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = coat_rough
    if emit:
        p.inputs['Emission Color'].default_value = (*lin(emit), 1)
        p.inputs['Emission Strength'].default_value = emit_strength
    m.diffuse_color = (*lin(color), 1)
    return m

M = {
    'Paint': material('Paint', '#ebe9e4', metal=0.05, rough=0.28, coat=1.0),
    'Glass': material('Glass', '#10161b', metal=0.3, rough=0.06),
    'Trim': material('Trim', '#1c1d1f', rough=0.55),
    'WellBlack': material('WellBlack', '#0b0b0b', rough=0.95),
    'HeadLight': material('HeadLight', '#dde3e7', metal=0.7, rough=0.12, emit='#2c3238'),
    'TailLight': material('TailLight', '#a8121c', rough=0.22, emit='#3d0005'),
    'Plate': material('Plate', '#f3f3f3', rough=0.5),
    'Tire': material('Tire', '#151515', rough=0.9),
    'Rim': material('Rim', '#b7bcc1', metal=0.9, rough=0.28),
    'Disc': material('Disc', '#76787b', metal=0.9, rough=0.5),
    'Caliper': material('Caliper', '#b71c1c', rough=0.45),
    'Chrome': material('Chrome', '#d3d7db', metal=1.0, rough=0.12),
}

# ---------------- 옆모습·단면 곡선 ----------------
def pchip(keys):
    xs = [k[0] for k in keys]; ys = [k[1] for k in keys]; n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n; m[0] = d[0]; m[-1] = d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0: m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    def f(x):
        if x <= xs[0]: return ys[0]
        if x >= xs[-1]: return ys[-1]
        i = max(j for j in range(n - 1) if xs[j] <= x)
        t = (x - xs[i]) / h[i]; t2 = t * t; t3 = t2 * t
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1]
    return f

# 지붕선(뒤 → 앞): 거의 선 뒤 해치 · 지붕 · 많이 누운 앞 유리 · 짧은 보닛 · 앞코
ZTOP = pchip([(-1.80, 1.00), (-1.74, 1.18), (-1.58, 1.40), (-1.40, 1.465), (-0.60, 1.485), (0.10, 1.45), (0.55, 1.17), (0.98, 0.925), (1.30, 0.855), (1.62, 0.775), (1.80, 0.66)])
BELT = pchip([(-1.80, 0.93), (-1.50, 1.02), (0.98, 0.93), (1.80, 0.66)])  # 창 아래 허리선(뒤로 갈수록 올라감)
ZLOW = pchip([(-1.80, 0.36), (-1.62, 0.21), (-1.40, 0.17), (1.45, 0.17), (1.66, 0.22), (1.80, 0.30)])  # 차체 바닥

def smooth01(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def zbelt(y): return min(BELT(y), ZTOP(y) - 0.09)
def wbelt(y):  # 허리선 반폭(평면에서 앞뒤 끝을 둥글게)
    w = HALF_W
    if y > 1.35: w -= 0.20 * ((y - 1.35) / 0.45) ** 2
    if y < -1.45: w -= 0.10 * ((-1.45 - y) / 0.35) ** 2
    return w
def wtop(y):  # 지붕 반폭(텀블홈)
    zt, zb, wb = ZTOP(y), zbelt(y), wbelt(y)
    return wb - 0.07 + (0.635 - (wb - 0.07)) * smooth01((zt - zb - 0.10) / 0.30)

LOWER, GH0, GH, CORNER, ROOF = 0, 1, 2, 3, 4  # 단면 구간(창·지붕 재질 나눌 때 씀). GH0 = 창 바로 아래 몰딩 띠
GH_T = [0.0, 0.07, 0.30, 0.55, 0.80, 0.93]

def half_section(y):
    zl, zt, zb, wb, wt = ZLOW(y), ZTOP(y), zbelt(y), wbelt(y), wtop(y)
    rb, rr = 0.09, 0.07
    crown = 0.015 * smooth01((zt - zb - 0.15) / 0.2)
    pts = []
    for i in range(3): pts.append(((wb - rb) * i / 3, zl, LOWER))
    for i in range(4):
        a = -math.pi / 2 + (math.pi / 2) * i / 4
        pts.append((wb - 0.03 - rb + rb * math.cos(a), zl + rb + rb * math.sin(a), LOWER))
    for i in range(5):  # 옆면: 가운데가 부풀고 아래가 안으로 들어간다
        t = i / 5
        pts.append((wb + 0.02 * math.sin(math.pi * t) - 0.03 * (1 - t) ** 3, zl + rb + (zb - zl - rb) * t, LOWER))
    for k, t in enumerate(GH_T):
        pts.append((wb - 0.01 + (wt - wb + 0.01) * t, zb + (zt - rr - zb) * t, GH0 if k == 0 else GH))
    p0, c, p2 = Vector((wt, zt - rr)), Vector((wt - 0.012, zt)), Vector((wt - rr, zt))
    for i in range(3):
        t = i / 3; q = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * c + t * t * p2
        pts.append((q.x, q.y, CORNER))
    for i in range(5):
        t = i / 4
        pts.append(((wt - rr) * (1 - t), zt + crown * math.sin(math.pi / 2 * t), ROOF))
    return pts  # 26점: 아래 가운데 → 오른쪽 옆 → 지붕 가운데

def full_loop(y):
    h = half_section(y)
    right = [(x, z, seg, i) for i, (x, z, seg) in enumerate(h)]
    left = [(-x, z, seg, i) for i, (x, z, seg) in enumerate(h)][1:-1][::-1]
    return right + left

# ---------------- 차체 껍데기 ----------------
def build_shell():
    n_y = 60
    ys = [-L / 2 + L * i / n_y for i in range(n_y + 1)]
    bm = bmesh.new()
    rings = []
    for y in ys:
        rings.append([(bm.verts.new((x, y, z)), seg, idx) for x, z, seg, idx in full_loop(y)])
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            k = (j + 1) % n
            f = bm.faces.new((a[j][0], a[k][0], b[k][0], b[j][0]))
            f.material_index = a[j][1] if a[j][2] <= a[k][2] else a[k][1]
    # 앞뒤 끝: 안쪽으로 줄어드는 고리 3개 + 가운데 부채꼴(살짝 볼록)
    for ring, sign in ((rings[0], -1), (rings[-1], 1)):
        cz = sum(v.co.z for v, _, _ in ring) / n; y0 = ring[0][0].co.y
        prev = [v for v, _, _ in ring]
        for s in (0.75, 0.5, 0.25):
            cur = [bm.verts.new((v.co.x * s, y0 + sign * 0.02 * (1 - s * s), cz + (v.co.z - cz) * s)) for v, _, _ in ring]
            for j in range(n):
                k = (j + 1) % n
                bm.faces.new((prev[j], prev[k], cur[k], cur[j])).material_index = LOWER
            prev = cur
        c = bm.verts.new((0.0, y0 + sign * 0.02, cz))
        for j in range(n):
            bm.faces.new((prev[j], prev[(j + 1) % n], c)).material_index = LOWER
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('BodyShell'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('BodyShell', me); scene.collection.objects.link(ob)
    for _ in range(5): me.materials.append(None)
    return ob

def apply_mod(ob, mod):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(o == ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)

shell = build_shell()
sub = shell.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
apply_mod(shell, sub)

# 구간 + 위치로 최종 재질 정하기
SLOT = ['Paint', 'Glass', 'Trim', 'WellBlack']
P, G, T = 0, 1, 2
def classify(seg, c, normal):
    x, y, z = c
    if seg == LOWER:
        return T if normal.z < -0.7 else P  # 바닥 아래는 검게
    if seg in (GH0, GH):
        if y > 0.82 or y < -1.54: return P   # 거울 아래 삼각 부분·보닛 어깨 · C 기둥
        if seg == GH0: return T              # 창 아래 고무 몰딩
        if -0.50 <= y <= -0.42: return T     # B 기둥(검정)
        if -1.34 <= y <= -1.30: return T     # 뒷문 유리와 쪽유리 사이 칸막이
        return G                             # 앞·뒷문 유리, 뒤 쪽유리
    if seg == CORNER:
        return P
    # ROOF
    if 0.96 < y <= 1.04: return T            # 앞 유리 아래 카울
    if 0.12 < y <= 0.96: return G            # 앞 유리
    if -1.72 < y <= -1.44: return G          # 뒤 해치 유리
    return P

me = shell.data
idx = [classify(p.material_index, p.center.copy(), p.normal.copy()) for p in me.polygons]
me.materials.clear()
for k in SLOT: me.materials.append(M[k])
for p, i in zip(me.polygons, idx): p.material_index = i

# 크기 맞추기(세분화로 줄어든 만큼): 길이 3.6, 반폭 0.80
xs = [v.co.x for v in me.vertices]; ys_ = [v.co.y for v in me.vertices]
sx = HALF_W / max(abs(min(xs)), max(xs)); sy = L / (max(ys_) - min(ys_)); cy = (max(ys_) + min(ys_)) / 2
for v in me.vertices: v.co.x *= sx; v.co.y = (v.co.y - cy) * sy
me.update()

# 바퀴집: 옆에서 원통으로 파낸다(안쪽 면은 검정)
cutters = []
for yy in (AXLE_Y, -AXLE_Y):
    for side in (1, -1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.375, depth=0.44, location=(side * 0.82, yy, WHEEL_R + 0.01), rotation=(0, math.pi / 2, 0))
        cu = bpy.context.active_object; cu.data.materials.append(M['WellBlack']); cutters.append(cu)
bpy.ops.object.select_all(action='DESELECT')
for cu in cutters: cu.select_set(True)
bpy.context.view_layer.objects.active = cutters[0]
bpy.ops.object.join()
cutter = bpy.context.active_object
bo = shell.modifiers.new('arches', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = cutter
bo.solver = 'EXACT'; bo.material_mode = 'TRANSFER'
apply_mod(shell, bo)
bpy.data.objects.remove(cutter, do_unlink=True)
shell.data.shade_smooth()

# ---------------- 차체 표면에 붙이는 조각(등화·그릴·번호판·문 틈·몰딩) ----------------
# 윤곽선 다각형을 잘게 나눈 뒤 차체에 투영한다(테두리가 계단처럼 깨지지 않음).
def inside_poly(u, v, poly):
    c = False
    for (u1, v1), (u2, v2) in zip(poly, poly[1:] + poly[:1]):
        if (v1 > v) != (v2 > v) and u < (u2 - u1) * (v - v1) / (v2 - v1) + u1: c = not c
    return c

def tri_polygon(outline, step):
    """윤곽선을 step 간격으로 다시 찍고, 안쪽 격자점을 더해 제약 들로네 삼각분할(윤곽은 정확히 유지)."""
    ring = []
    for a, b in zip(outline, outline[1:] + outline[:1]):
        n = max(1, math.ceil(math.dist(a, b) / step))
        ring += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n)]
    us = [p[0] for p in outline]; vs_ = [p[1] for p in outline]
    inner = []
    u = min(us) + step
    while u < max(us):
        v = min(vs_) + step
        while v < max(vs_):
            if inside_poly(u, v, outline) and min(math.dist((u, v), r) for r in ring) > step * 0.6: inner.append((u, v))
            v += step
        u += step
    pts = ring + inner
    out = delaunay_2d_cdt([Vector(p) for p in pts], [], [list(range(len(ring)))], 1, 1e-7)
    return [tuple(c) for c in out[0]], out[2]

def decal(name, mat, plane, sign, outline, max_edge=0.03, offset=0.004):
    """plane 'Y': (u,v)=(x,z), 앞(+1)·뒤(-1)에서 투영. plane 'X': (u,v)=(y,z), 오른쪽(+1)·왼쪽(-1)에서 투영."""
    far = 3.0 * sign
    coords, faces = tri_polygon(outline, max_edge)
    bm = bmesh.new()
    vs = [bm.verts.new((u, far, v) if plane == 'Y' else (far, u, v)) for u, v in coords]
    for f in faces:
        try: bm.faces.new([vs[i] for i in f])
        except ValueError: pass
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    ob = bpy.data.objects.new(name, m); scene.collection.objects.link(ob); m.materials.append(M[mat])
    sw = ob.modifiers.new('wrap', 'SHRINKWRAP'); sw.target = shell; sw.wrap_method = 'PROJECT'
    sw.use_project_x = plane == 'X'; sw.use_project_y = plane == 'Y'
    sw.use_negative_direction = sign > 0; sw.use_positive_direction = sign < 0
    sw.offset = offset
    apply_mod(ob, sw)
    bm = bmesh.new(); bm.from_mesh(m); bm.normal_update()
    want = Vector((0, sign, 0)) if plane == 'Y' else Vector((sign, 0, 0))
    if sum(f.normal.dot(want) for f in bm.faces) < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(m); bm.free(); m.shade_smooth()
    return ob

def rect(u0, u1, v0, v1, r=0.0, n=4):
    if r <= 0: return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    pts = []
    for cu, cv, a0 in ((u1 - r, v0 + r, -90), (u1 - r, v1 - r, 0), (u0 + r, v1 - r, 90), (u0 + r, v0 + r, 180)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n); pts.append((cu + r * math.cos(a), cv + r * math.sin(a)))
    return pts
def circle(cu, cv, r, n=20): return [(cu + r * math.cos(2 * math.pi * i / n), cv + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
def mirror_u(pts): return [(-u, v) for u, v in pts][::-1]
def strip(path, w):
    """꺾은선을 폭 w 띠 다각형으로."""
    left, right = [], []
    for i, (u, v) in enumerate(path):
        a = path[max(0, i - 1)]; b = path[min(len(path) - 1, i + 1)]
        du, dv = b[0] - a[0], b[1] - a[1]; ln = math.hypot(du, dv) or 1
        nu, nv = -dv / ln * w / 2, du / ln * w / 2
        left.append((u + nu, v + nv)); right.append((u - nu, v - nv))
    return left + right[::-1]

parts = []
def add(o):
    if o: parts.append(o)
def pair(name, mat, plane, sign, outline_r, **kw):  # 좌우 대칭 한 쌍(앞뒤 면)
    add(decal(name + '_R', mat, plane, sign, outline_r, **kw)); add(decal(name + '_L', mat, plane, sign, mirror_u(outline_r), **kw))
def sides(name, mat, outline, **kw):  # 양쪽 옆면
    for s in (1, -1): add(decal(f'{name}_{"R" if s > 0 else "L"}', mat, 'X', s, outline, **kw))

# 앞: 옆으로 쓸려 올라가는 전조등, 가운데 작은 그릴, 아래 공기 흡입구, 번호판, 안개등
HEAD = [(0.30, 0.585), (0.50, 0.595), (0.66, 0.625), (0.745, 0.665), (0.765, 0.70), (0.73, 0.725), (0.60, 0.70), (0.42, 0.665), (0.31, 0.64), (0.29, 0.61)]
pair('HeadLight', 'HeadLight', 'Y', 1, HEAD, max_edge=0.02)
pair('HeadLightInner', 'Trim', 'Y', 1, [(0.36, 0.605), (0.47, 0.612), (0.47, 0.645), (0.36, 0.635)], max_edge=0.02, offset=0.006)
add(decal('UpperGrille', 'Trim', 'Y', 1, [(-0.26, 0.585), (0.26, 0.585), (0.28, 0.62), (0.25, 0.645), (-0.25, 0.645), (-0.28, 0.62)], max_edge=0.02))
INTAKE = [(-0.30, 0.34), (0.30, 0.34), (0.36, 0.36), (0.42, 0.50), (0.40, 0.53), (-0.40, 0.53), (-0.42, 0.50), (-0.36, 0.36)]
add(decal('LowerIntake', 'Trim', 'Y', 1, INTAKE, max_edge=0.03))
add(decal('FrontPlate', 'Plate', 'Y', 1, rect(-0.26, 0.26, 0.405, 0.515, 0.01), max_edge=0.03, offset=0.009))
pair('FogSurround', 'Trim', 'Y', 1, circle(0.57, 0.42, 0.06), max_edge=0.02)
pair('FogLamp', 'HeadLight', 'Y', 1, circle(0.57, 0.42, 0.04), max_edge=0.015, offset=0.007)
# 뒤: 모서리에 세로로 선 후미등, 가운데 장식띠, 번호판, 범퍼 띠, 반사기
TAIL = [(0.53, 0.80), (0.74, 0.80), (0.765, 0.86), (0.75, 1.03), (0.62, 1.04), (0.55, 0.97), (0.525, 0.88)]
pair('TailLight', 'TailLight', 'Y', -1, TAIL, max_edge=0.02)
add(decal('RearGarnish', 'Trim', 'Y', -1, rect(-0.42, 0.42, 0.845, 0.895, 0.015), max_edge=0.03))
add(decal('RearPlate', 'Plate', 'Y', -1, rect(-0.26, 0.26, 0.52, 0.63, 0.01), max_edge=0.03, offset=0.006))
add(decal('RearBumperBand', 'Trim', 'Y', -1, rect(-0.66, 0.66, 0.38, 0.43, 0.02), max_edge=0.04))
pair('Reflector', 'TailLight', 'Y', -1, rect(0.56, 0.68, 0.455, 0.48, 0.008), max_edge=0.02, offset=0.006)
# 옆: 아래 몰딩, 문 틈(앞문 앞·가운데·뒷문 뒤에서 바퀴집 따라 내려감), 문 아래 틈
sides('SideSkirt', 'Trim', rect(-0.80, 0.80, 0.19, 0.27, 0.02), max_edge=0.05)
SEAM = 0.007
rear_door = [(-1.30, 0.975), (-1.30, 0.78)] + [(-1.2 + 0.44 * math.cos(math.radians(a)), 0.3 + 0.44 * math.sin(math.radians(a))) for a in range(103, -10, -12)]
for path in ([(0.80, 0.28), (0.80, 0.92)], [(-0.44, 0.28), (-0.44, 0.985)], [(-0.80, 0.285), (0.80, 0.285)]):
    sides('DoorSeam', 'Trim', strip(path, SEAM), max_edge=0.03, offset=0.003)
for a, b in zip(rear_door, rear_door[1:]):
    sides('DoorSeam', 'Trim', strip([a, b], SEAM), max_edge=0.03, offset=0.003)
# 주유구(오른쪽 뒤): 둥근 사각 테두리 틈
fuel = rect(-1.62, -1.49, 0.80, 0.90, 0.02, 3)
for a, b in zip(fuel, fuel[1:] + fuel[:1]):
    add(decal('FuelDoor', 'Trim', 'X', 1, strip([a, b], 0.005), max_edge=0.02, offset=0.003))

def surface_x(y, z, side):
    ok, loc, nrm, _ = shell.ray_cast(Vector((side * 2.0, y, z)), Vector((-side, 0, 0)))
    return loc if ok else Vector((side * HALF_W, y, z))

def box(name, mat, size, loc, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.name = name; ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = 3
        apply_mod(ob, bv)
    ob.data.materials.append(M[mat]); ob.data.shade_smooth(); ob.data.set_sharp_from_angle(angle=math.radians(50))
    parts.append(ob); return ob

# 문 손잡이(각 문 뒤쪽)
for s in (1, -1):
    for y, z in ((-0.22, 0.885), (-1.10, 0.905)):
        p = surface_x(y, z, s)
        box('Handle', 'Paint', (0.022, 0.15, 0.032), (p.x + s * 0.010, y, z), bevel=0.008)
# 옆 거울(앞문 앞 모서리)
for s in (1, -1):
    my, mz = 0.88, 0.975
    p = surface_x(my, mz, s)
    box('MirrorArm', 'Trim', (0.08, 0.06, 0.035), (p.x + s * 0.03, my, mz), bevel=0.008)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1, location=(p.x + s * 0.12, my - 0.01, mz + 0.03))
    mh = bpy.context.active_object; mh.name = 'MirrorHousing'; mh.scale = (0.10, 0.055, 0.065)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mh.data.materials.append(M['Paint']); mh.data.shade_smooth(); parts.append(mh)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1, depth=0.004, location=(p.x + s * 0.12, my - 0.01 - 0.052, mz + 0.03), rotation=(math.pi / 2, 0, 0))
    mg = bpy.context.active_object; mg.name = 'MirrorGlass'; mg.scale = (0.085, 0.055, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mg.data.materials.append(M['Chrome']); parts.append(mg)
# 와이퍼(앞 유리 아래), 뒤 와이퍼, 안테나, 지붕 끝 스포일러
wz = ZTOP(0.985) + 0.012
box('WiperL', 'Trim', (0.56, 0.014, 0.012), (-0.25, 0.985, wz), rot=(0, 0, math.radians(4)))
box('WiperR', 'Trim', (0.50, 0.014, 0.012), (0.30, 0.985, wz), rot=(0, 0, math.radians(-3)))
box('RearWiper', 'Trim', (0.32, 0.012, 0.012), (0.0, -1.69, ZTOP(-1.69) - 0.005), rot=(math.radians(-60), 0, math.radians(8)))
box('Antenna', 'Trim', (0.035, 0.13, 0.05), (0.0, -1.22, ZTOP(-1.22) + 0.02), rot=(math.radians(-12), 0, 0), bevel=0.012)
box('Spoiler', 'Paint', (1.06, 0.15, 0.035), (0.0, -1.50, ZTOP(-1.50) - 0.004), rot=(math.radians(14), 0, 0), bevel=0.014)

# 캘리퍼(돌지 않음 → 차체에 붙인다)
for yy in (AXLE_Y, -AXLE_Y):
    for s in (1, -1):
        box('Caliper', 'Caliper', (0.045, 0.10, 0.12), (s * (WHEEL_X - 0.005), yy - 0.09, WHEEL_R + 0.10), rot=(math.radians(-40), 0, 0), bevel=0.01)

import collections
_cnt=collections.Counter()
for o in parts+[shell]:
    o.data.calc_loop_triangles(); _cnt[o.name.split('.')[0].split('_')[0]]+=len(o.data.loop_triangles)
print('PARTS', _cnt.most_common(12))
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
shell.select_set(True); bpy.context.view_layer.objects.active = shell
bpy.ops.object.join()
body = bpy.context.active_object; body.name = 'Body'

# ---------------- 바퀴 ----------------
def lathe(name, profile, segs, mat, radial_fn=None):
    """profile: [(a, r)] 닫힌 단면(a=축 방향 X, r=반지름). X축으로 돌린다."""
    bm = bmesh.new(); rings = []
    for s in range(segs):
        ang = 2 * math.pi * s / segs
        rings.append([bm.verts.new((a, (radial_fn(s, a, r) if radial_fn else r) * math.cos(ang), (radial_fn(s, a, r) if radial_fn else r) * math.sin(ang))) for a, r in profile])
    n = len(profile)
    for s in range(segs):
        A, B = rings[s], rings[(s + 1) % segs]
        for k in range(n):
            bm.faces.new((A[k], A[(k + 1) % n], B[(k + 1) % n], B[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    ob = bpy.data.objects.new(name, m); scene.collection.objects.link(ob); m.materials.append(M[mat])
    m.shade_smooth(); m.set_sharp_from_angle(angle=math.radians(35))
    return ob

TIRE = [(-0.086, 0.206), (-0.097, 0.232), (-0.102, 0.262), (-0.097, 0.285), (-0.086, 0.297),
        (-0.075, 0.300), (-0.047, 0.300), (-0.045, 0.291), (-0.035, 0.291), (-0.033, 0.300), (-0.006, 0.300),
        (0.006, 0.300), (0.033, 0.300), (0.035, 0.291), (0.045, 0.291), (0.047, 0.300), (0.075, 0.300),
        (0.086, 0.297), (0.097, 0.285), (0.102, 0.262), (0.097, 0.232), (0.086, 0.206), (0.0, 0.200)]
def tread(s, a, r):
    if r < 0.299: return r
    q = s % 4
    if abs(a) > 0.046 and q in (0, 1): return r - 0.006   # 바깥 블록 홈
    if abs(a) < 0.034 and q == 2: return r - 0.004        # 가운데 엇갈린 홈
    return r

RIM = [(-0.086, 0.208), (0.068, 0.208), (0.077, 0.201), (0.074, 0.188), (0.060, 0.185), (-0.080, 0.185), (-0.086, 0.195)]

def spoke_mesh():
    bm = bmesh.new()
    for i in range(5):
        for off in (-0.11, 0.11):
            ang = 2 * math.pi * i / 5 + off
            c, s_ = math.cos(ang), math.sin(ang)
            def P(a, r, w): return bm.verts.new((a, r * c - w * s_, r * s_ + w * c))
            r0, r1 = 0.05, 0.188
            v = [P(0.050, r0, -0.012), P(0.050, r0, 0.012), P(0.064, r1, 0.009), P(0.064, r1, -0.009),
                 P(0.072, r0, -0.012), P(0.072, r0, 0.012), P(0.074, r1, 0.009), P(0.074, r1, -0.009)]
            for f in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
                bm.faces.new([v[j] for j in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m = bpy.data.meshes.new('Spokes'); bm.to_mesh(m); bm.free()
    ob = bpy.data.objects.new('Spokes', m); scene.collection.objects.link(ob); m.materials.append(M['Rim'])
    bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = 0.003; bv.segments = 2
    apply_mod(ob, bv); m.shade_smooth(); m.set_sharp_from_angle(angle=math.radians(40))
    return ob

def cyl(name, mat, r, depth, a, verts=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=(a, 0, 0), rotation=(0, math.pi / 2, 0))
    ob = bpy.context.active_object; ob.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.data.materials.append(M[mat]); ob.data.shade_smooth(); ob.data.set_sharp_from_angle(angle=math.radians(40))
    return ob

def build_wheel(name):
    objs = [lathe(name + '_tire', TIRE, 72, 'Tire', tread), lathe(name + '_rim', RIM, 40, 'Rim'), spoke_mesh(),
            cyl(name + '_hub', 'Rim', 0.062, 0.04, 0.052), cyl(name + '_cap', 'Trim', 0.032, 0.01, 0.075),
            cyl(name + '_disc', 'Disc', 0.158, 0.022, -0.012, 36), cyl(name + '_hat', 'Disc', 0.075, 0.05, 0.02, 24)]
    for i in range(5):
        ang = 2 * math.pi * (i + 0.5) / 5
        n_ = cyl(name + f'_nut{i}', 'Chrome', 0.0095, 0.012, 0.078, 8)
        for v in n_.data.vertices: v.co.y += 0.042 * math.cos(ang); v.co.z += 0.042 * math.sin(ang)
        objs.append(n_)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    w = bpy.context.active_object; w.name = name + '_mesh'
    return w

root = bpy.data.objects.new('TestCar', None); scene.collection.objects.link(root)
body.parent = root
for label, x, y in (('FL', -WHEEL_X, AXLE_Y), ('FR', WHEEL_X, AXLE_Y), ('RL', -WHEEL_X, -AXLE_Y), ('RR', WHEEL_X, -AXLE_Y)):
    e = bpy.data.objects.new('Wheel_' + label, None); scene.collection.objects.link(e)
    e.location = (x, y, WHEEL_R); e.parent = root
    w = build_wheel('Wheel_' + label)
    if x < 0:  # 왼쪽 바퀴: 휠 면이 바깥(-X)을 보게 거울 반전(회전축 방향은 그대로)
        bm = bmesh.new(); bm.from_mesh(w.data)
        for v in bm.verts: v.co.x = -v.co.x
        bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(w.data); bm.free()
    w.parent = e; w.location = (0, 0, 0)

# ---------------- 점검 · 내보내기 ----------------
bpy.context.view_layer.update()
tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
bb = [body.matrix_world @ Vector(c) for c in body.bound_box]
print('TRIS', tris)
print('BODY_BBOX x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (min(v.x for v in bb), max(v.x for v in bb), min(v.y for v in bb), max(v.y for v in bb), min(v.z for v in bb), max(v.z for v in bb)))

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
    cam.data.lens = 50
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 1400, 800
    base, ext = os.path.splitext(PREVIEW)
    for tag, loc in (('front', (4.6, 5.2, 2.0)), ('rear', (-4.4, -5.0, 2.1)), ('side', (7.5, 0.0, 1.1)), ('nose', (0.0, 7.0, 1.0))):
        cam.location = loc
        d = Vector((0, 0, 0.65)) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
