# 리프트 위 차량(1세대 아반떼 J2, 1995년형 '구아방' 세단) 3D 모델 생성 스크립트 — Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_avante.py -- <출력.glb> [미리보기.png] [HDRI]
# 치수는 현대자동차 공식 제원(1995 아반떼 J2: 전장 4,420 · 전폭 1,700 · 전고 1,395 · 축거 2,550 mm, 타이어 195/60R14)을 따른다.
# 모양(둥근 차체, 가는 가로 전조등, 가운데 작은 그릴, 가로로 긴 후미등과 가운데 장식판, 문 몰딩, 휠 커버)은 그 시기 준중형 세단의 일반 특징이다.
# 상표·로고·번호 글자는 넣지 않는다. 몸체·차체 생성 방법은 build_test_car.py와 같다(단면을 이어 붙인 뒤 세분화, 바퀴집은 불리언으로 파냄).
# Blender 좌표: X 오른쪽, Y 앞(+Y가 차 앞), Z 위. glTF에서 차 앞은 -z.
# 노드: Avante(뿌리, 바닥 가운데) > Body, Wheel_FL/FR/RL/RR(바퀴 중심). 리프트 위에서 움직이지 않으므로 바퀴는 돌리지 않는다.
import bpy, bmesh, math, os, sys
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'avante.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None

L, HALF_W = 4.42, 0.85
WHEEL_R, WHEEL_X = 0.295, 0.725          # 195/60R14 → 지름 약 0.59, 윤거 약 1.45(가정)
AXLE_F, AXLE_R = 1.33, -1.22             # 앞 오버행 0.88 · 축거 2.55 · 뒤 오버행 0.99

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
    'Paint': material('Paint', '#aeb3b8', metal=0.55, rough=0.32, coat=0.6),   # 은회색(가정)
    'Glass': material('Glass', '#1a2a2e', metal=0.3, rough=0.06),
    'Trim': material('Trim', '#202124', rough=0.6),
    'WellBlack': material('WellBlack', '#0b0b0b', rough=0.95),
    'HeadLight': material('HeadLight', '#eef3f6', metal=0.5, rough=0.08, emit='#6c7880'),
    'TailLight': material('TailLight', '#a8121c', rough=0.22, emit='#3d0005'),
    'TailDark': material('TailDark', '#5a0c12', rough=0.3),
    'Amber': material('Amber', '#e8890c', rough=0.25, emit='#3a1d00'),
    'Plate': material('Plate', '#f3f3f3', rough=0.5),
    'Tire': material('Tire', '#151515', rough=0.9),
    'Rim': material('Rim', '#c3c7cb', metal=0.6, rough=0.35),
    'Steel': material('Steel', '#3a3c3f', metal=0.6, rough=0.5),
    'Disc': material('Disc', '#76787b', metal=0.9, rough=0.5),
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


# 지붕선(뒤 → 앞): 짧고 높은 트렁크 · 누운 뒤 유리 · 둥근 지붕 · 누운 앞 유리 · 낮은 보닛 · 둥근 앞코
ZTOP = pchip([(-2.21, 0.80), (-2.15, 0.93), (-1.95, 0.985), (-1.58, 1.00), (-1.30, 1.17), (-0.95, 1.355), (-0.60, 1.39),
              (0.10, 1.395), (0.42, 1.36), (0.80, 1.14), (1.17, 0.935), (1.55, 0.875), (1.95, 0.81), (2.21, 0.68)])
BELT = pchip([(-2.21, 0.80), (-1.90, 0.93), (-1.40, 0.965), (1.17, 0.915), (2.21, 0.62)])  # 창 아래 허리선
ZLOW = pchip([(-2.21, 0.42), (-2.05, 0.25), (-1.78, 0.19), (1.80, 0.19), (2.06, 0.24), (2.21, 0.35)])  # 차체 바닥

def smooth01(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def zbelt(y): return min(BELT(y), ZTOP(y) - 0.09)
def wbelt(y):  # 허리선 반폭(평면에서 앞뒤 끝을 둥글게)
    w = HALF_W
    if y > 1.70: w -= 0.21 * ((y - 1.70) / 0.51) ** 2
    if y < -1.85: w -= 0.12 * ((-1.85 - y) / 0.36) ** 2
    return w
def wtop(y):  # 지붕 반폭(텀블홈)
    zt, zb, wb = ZTOP(y), zbelt(y), wbelt(y)
    return wb - 0.06 + (0.62 - (wb - 0.06)) * smooth01((zt - zb - 0.10) / 0.30)

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
    n_y = 76
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
        return T if normal.z < -0.7 else P
    if seg in (GH0, GH):
        if y > 1.12 or y < -1.42: return P   # 보닛 어깨 · 굵은 C 기둥과 트렁크
        if seg == GH0: return T              # 창 아래 고무 몰딩
        if 0.96 <= y <= 1.12: return T       # 앞문 거울 자리 검정 삼각
        if -0.06 <= y <= 0.02: return T      # B 기둥(검정)
        if -1.10 <= y <= -1.06: return T     # 뒷문 고정 쪽유리 칸막이
        return G
    if seg == CORNER:
        return P
    if 1.14 < y <= 1.22: return T            # 카울
    if 0.40 < y <= 1.14: return G            # 앞 유리
    if -1.56 < y <= -0.88: return G          # 뒤 유리
    return P

me = shell.data
idx = [classify(p.material_index, p.center.copy(), p.normal.copy()) for p in me.polygons]
me.materials.clear()
for k in SLOT: me.materials.append(M[k])
for p, i in zip(me.polygons, idx): p.material_index = i

# 크기 맞추기(세분화로 줄어든 만큼): 길이 4.42, 반폭 0.85
xs = [v.co.x for v in me.vertices]; ys_ = [v.co.y for v in me.vertices]
sx = HALF_W / max(abs(min(xs)), max(xs)); sy = L / (max(ys_) - min(ys_)); cy = (max(ys_) + min(ys_)) / 2
for v in me.vertices: v.co.x *= sx; v.co.y = (v.co.y - cy) * sy
me.update()

# 바퀴집: 옆에서 원통으로 파낸다(안쪽 면은 검정)
cutters = []
for yy in (AXLE_F, AXLE_R):
    for side in (1, -1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.37, depth=0.46, location=(side * 0.88, yy, WHEEL_R + 0.01), rotation=(0, math.pi / 2, 0))
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

# 앞: 가는 가로 전조등, 가운데 작은 그릴(크롬 테), 범퍼 보호띠·방향지시등·번호판·아래 흡입구
HEAD = [(0.38, 0.572), (0.74, 0.578), (0.80, 0.605), (0.795, 0.660), (0.73, 0.675), (0.38, 0.668), (0.365, 0.62)]
pair('HeadHousing', 'Trim', 'Y', 1, HEAD, max_edge=0.02)
pair('HeadLight', 'HeadLight', 'Y', 1, rect(0.40, 0.535, 0.586, 0.656, 0.012), max_edge=0.015, offset=0.006)
pair('HeadLightHigh', 'HeadLight', 'Y', 1, rect(0.555, 0.77, 0.588, 0.652, 0.012), max_edge=0.015, offset=0.006)
add(decal('GrilleRim', 'Chrome', 'Y', 1, rect(-0.33, 0.33, 0.578, 0.668, 0.04), max_edge=0.02))
add(decal('Grille', 'Trim', 'Y', 1, rect(-0.305, 0.305, 0.590, 0.656, 0.03), max_edge=0.02, offset=0.006))
for zb in (0.607, 0.630):
    add(decal('GrilleBar', 'Chrome', 'Y', 1, rect(-0.29, 0.29, zb, zb + 0.008), max_edge=0.02, offset=0.008))
add(decal('FrontStrip', 'Trim', 'Y', 1, rect(-0.80, 0.80, 0.45, 0.50, 0.02), max_edge=0.04))
pair('FrontTurn', 'Amber', 'Y', 1, rect(0.58, 0.77, 0.515, 0.55, 0.01), max_edge=0.02)
add(decal('FrontPlate', 'Plate', 'Y', 1, rect(-0.17, 0.17, 0.37, 0.54, 0.01), max_edge=0.03, offset=0.009))
add(decal('LowerIntake', 'Trim', 'Y', 1, rect(-0.46, 0.46, 0.29, 0.35, 0.02), max_edge=0.03))
# 뒤: 가로로 긴 후미등(방향지시등·후진등 칸) + 가운데 진한 빨강 장식판, 번호판, 범퍼 보호띠
TAIL = [(0.30, 0.745), (0.76, 0.745), (0.80, 0.765), (0.80, 0.85), (0.76, 0.868), (0.30, 0.868)]
pair('TailLight', 'TailLight', 'Y', -1, TAIL, max_edge=0.02)
pair('TailTurn', 'Amber', 'Y', -1, rect(0.62, 0.73, 0.755, 0.86, 0.008), max_edge=0.015, offset=0.006)
pair('TailReverse', 'HeadLight', 'Y', -1, rect(0.50, 0.58, 0.755, 0.86, 0.008), max_edge=0.015, offset=0.006)
add(decal('TailGarnish', 'TailDark', 'Y', -1, rect(-0.29, 0.29, 0.752, 0.862, 0.01), max_edge=0.02))
add(decal('RearPlate', 'Plate', 'Y', -1, rect(-0.17, 0.17, 0.555, 0.725, 0.01), max_edge=0.03, offset=0.006))
add(decal('RearStrip', 'Trim', 'Y', -1, rect(-0.80, 0.80, 0.46, 0.51, 0.02), max_edge=0.04))
# 옆: 문 보호 몰딩(굵은 검정 띠), 문 틈, 문 아래 틈, 주유구
sides('SideMolding', 'Trim', rect(AXLE_R + 0.42, AXLE_F - 0.40, 0.555, 0.60, 0.02), max_edge=0.05)
SEAM = 0.007
rear_door = [(-1.10, 0.955), (-1.10, 0.76)] + [(AXLE_R + 0.44 * math.cos(math.radians(a)), WHEEL_R + 0.44 * math.sin(math.radians(a))) for a in range(75, -10, -12)]
for path in ([(1.02, 0.31), (1.02, 0.92)], [(-0.02, 0.29), (-0.02, 0.95)], [(AXLE_R + 0.44, 0.29), (1.02, 0.29)]):
    sides('DoorSeam', 'Trim', strip(path, SEAM), max_edge=0.03, offset=0.003)
for a, b in zip(rear_door, rear_door[1:]):
    sides('DoorSeam', 'Trim', strip([a, b], SEAM), max_edge=0.03, offset=0.003)
fuel = rect(-1.78, -1.64, 0.80, 0.90, 0.015, 3)
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

# 문 손잡이(검정, 각 문 앞쪽)
for s in (1, -1):
    for y, z in ((0.70, 0.86), (-0.32, 0.87)):
        p = surface_x(y, z, s)
        box('Handle', 'Trim', (0.02, 0.13, 0.03), (p.x + s * 0.008, y, z), bevel=0.006)
# 옆 거울(검정, 앞문 앞 모서리)
for s in (1, -1):
    my, mz = 1.03, 0.97
    p = surface_x(my, mz, s)
    box('MirrorArm', 'Trim', (0.07, 0.07, 0.04), (p.x + s * 0.025, my, mz), bevel=0.008)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=1, location=(p.x + s * 0.10, my - 0.01, mz + 0.04))
    mh = bpy.context.active_object; mh.name = 'MirrorHousing'; mh.scale = (0.085, 0.05, 0.06)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mh.data.materials.append(M['Trim']); mh.data.shade_smooth(); parts.append(mh)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=1, depth=0.004, location=(p.x + s * 0.10, my - 0.01 - 0.047, mz + 0.04), rotation=(math.pi / 2, 0, 0))
    mg = bpy.context.active_object; mg.name = 'MirrorGlass'; mg.scale = (0.07, 0.048, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mg.data.materials.append(M['Chrome']); parts.append(mg)
# 와이퍼(카울), 안테나(오른쪽 뒤 펜더 막대), 트렁크 열쇠 구멍 자리 작은 장식
wz = ZTOP(1.18) + 0.012
box('WiperL', 'Trim', (0.58, 0.014, 0.012), (-0.27, 1.18, wz), rot=(0, 0, math.radians(4)))
box('WiperR', 'Trim', (0.52, 0.014, 0.012), (0.30, 1.18, wz), rot=(0, 0, math.radians(-3)))
pa = surface_x(-1.90, 0.95, 1)
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.004, depth=0.75, location=(pa.x - 0.04, -1.98, 0.95 + 0.37), rotation=(math.radians(-12), 0, 0))
an = bpy.context.active_object; an.name = 'Antenna'; an.data.materials.append(M['Chrome']); parts.append(an)

# 앞 캘리퍼(회색, 차체에 붙인다) — 뒤는 드럼 브레이크라 캘리퍼 없음
for s in (1, -1):
    box('Caliper', 'Disc', (0.045, 0.10, 0.11), (s * (WHEEL_X - 0.005), AXLE_F - 0.09, WHEEL_R + 0.10), rot=(math.radians(-40), 0, 0), bevel=0.01)

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

_S = WHEEL_R / 0.300
TIRE = [(a, r * _S) for a, r in [(-0.086, 0.206), (-0.097, 0.232), (-0.102, 0.262), (-0.097, 0.285), (-0.086, 0.297),
        (-0.075, 0.300), (-0.047, 0.300), (-0.045, 0.291), (-0.035, 0.291), (-0.033, 0.300), (-0.006, 0.300),
        (0.006, 0.300), (0.033, 0.300), (0.035, 0.291), (0.045, 0.291), (0.047, 0.300), (0.075, 0.300),
        (0.086, 0.297), (0.097, 0.285), (0.102, 0.262), (0.097, 0.232), (0.086, 0.206), (0.0, 0.200)]]
def tread(s, a, r):
    if r < 0.299 * _S: return r
    q = s % 4
    if abs(a) > 0.046 and q in (0, 1): return r - 0.006
    if abs(a) < 0.034 and q == 2: return r - 0.004
    return r

# 14인치 철제 휠(어두운 회색) + 은색 플라스틱 휠 커버(구멍 8개)
STEEL = [(-0.08, 0.180), (0.05, 0.180), (0.05, 0.172), (-0.08, 0.172)]
COVER = [(0.040, 0.186), (0.060, 0.184), (0.072, 0.170), (0.080, 0.130), (0.084, 0.070), (0.086, 0.030), (0.087, 0.012), (0.050, 0.012), (0.050, 0.178)]

def cover_slots():
    bm = bmesh.new()
    for i in range(8):
        ang = 2 * math.pi * (i + 0.5) / 8
        c, s_ = math.cos(ang), math.sin(ang)
        def P(a, r, w): return bm.verts.new((a, r * c - w * s_, r * s_ + w * c))
        r0, r1, w = 0.098, 0.150, 0.016
        v = [P(0.0845, r0, -w * 0.7), P(0.0845, r0, w * 0.7), P(0.0815, r1, w), P(0.0815, r1, -w)]
        bm.faces.new(v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m = bpy.data.meshes.new('Slots'); bm.to_mesh(m); bm.free()
    for p in m.polygons:
        if p.normal.x < 0: p.flip()
    ob = bpy.data.objects.new('Slots', m); scene.collection.objects.link(ob); m.materials.append(M['Steel'])
    return ob

def cyl(name, mat, r, depth, a, verts=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=(a, 0, 0), rotation=(0, math.pi / 2, 0))
    ob = bpy.context.active_object; ob.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.data.materials.append(M[mat]); ob.data.shade_smooth(); ob.data.set_sharp_from_angle(angle=math.radians(40))
    return ob

def build_wheel(name):
    objs = [lathe(name + '_tire', TIRE, 64, 'Tire', tread), lathe(name + '_steel', STEEL, 36, 'Steel'),
            lathe(name + '_cover', COVER, 48, 'Rim'), cover_slots(), cyl(name + '_cap', 'Rim', 0.035, 0.008, 0.088, 24),
            cyl(name + '_disc', 'Disc', 0.13, 0.02, -0.012, 32)]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    w = bpy.context.active_object; w.name = name + '_mesh'
    return w

root = bpy.data.objects.new('Avante', None); scene.collection.objects.link(root)
body.parent = root
for label, x, y in (('FL', -WHEEL_X, AXLE_F), ('FR', WHEEL_X, AXLE_F), ('RL', -WHEEL_X, AXLE_R), ('RR', WHEEL_X, AXLE_R)):
    e = bpy.data.objects.new('Wheel_' + label, None); scene.collection.objects.link(e)
    e.location = (x, y, WHEEL_R); e.parent = root
    w = build_wheel('Wheel_' + label)
    if x < 0:
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
    for tag, loc in (('front', (5.4, 6.2, 2.0)), ('rear', (-5.0, -6.0, 2.1)), ('side', (8.8, 0.0, 1.1)), ('nose', (0.0, 8.0, 1.0))):
        cam.location = loc
        d = Vector((0, 0, 0.65)) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)

