# 실습장 사람(학생 아바타·NPC 교관) 3D 캐릭터 생성 스크립트 — Blender 5.x에서 화면 없이 실행한다.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build_character.py -- <출력.glb> [미리보기.png] [HDRI] [--body=a|b|npc]
#   a(기본) 학생 체형 1, 키 1.45 m                                  → public/assets/models/character.glb
#   b       학생 체형 2: a에서 어깨를 좁히고 뿌리(Character)를 1.62/1.72로 줄임(약 1.37 m) → character-b.glb
#   npc     교관, 키 1.62 m, 3.4등신쯤의 어른 비례(팔·다리를 어른 길이로)       → character-npc.glb
# 겉모습은 머리가 큰 양식화 비례(시안 B, 설계 docs/superpowers/specs/2026-11-13-character-and-motion-design.md §2·§5).
#   큰 머리·큰 눈(하이라이트)·짧은 눈썹·작은 입, 둥글고 큰 손, 앞코가 둥근 작업화, 접힌 깃·지퍼·가슴 주머니·소매/바지 끝단·반사띠가 있는 실습복.
#   특정 인물·작품의 캐릭터를 따라 만들지 않은 일반 캐릭터이고, 상표·학교 표식은 없다.
# 모든 좌표는 맨 위 치수 표(spec)에서 계산한다: 관절 → 옷 경계 높이 → 얼굴·머리카락·보안경 → 신발 → 동작(걷기 보폭·쪼그리기 깊이).
# 노드: Character(뿌리) > Armature(뼈 17개: Hips·Spine·Chest·Neck·Head + 팔·다리 좌우 3개씩) > Body, Hair_Short·Hair_Fringe·Hair_Bob·Hair_Tied, Goggles. 머리 부품·보안경은 앱이 보이기를 정한다.
# 재질: 앱이 이름으로 색을 입히는 Top·Trim·Bottom·Shoes·Skin·Hair·Eye(모델에는 중립 기본색), 보안경 GogglesFrame·GogglesLens,
#   그리고 Detail 1개(정점색: 반사띠·눈 하이라이트·입·볼터치·지퍼·밑창·끈 — 앱은 이 재질 색을 바꾸지 않는다).
#   학생은 Top=주황 몸판·소매, Trim=남색 어깨판·깃·끝단. 교관은 Top=조끼 몸판, Trim=소매·어깨·깃·끝단(남색 작업복 + 조끼).
# 동작 6개(Idle·Walk·Gesture·Crouch·Press·Equip, 24fps, 길이는 예전과 같음). 걷기는 디딘 발이 몸에 대해 일정한 속도로 뒤로 가게 설계했다
#   → 앱의 WALK_CYCLE_DISTANCE는 끝에 찍는 MEASURE의 walk_cycle_m 값이다.
# Blender 좌표: X 오른쪽(캐릭터의 왼쪽 = +X), Y 앞(+Y가 얼굴, glTF에서 -z), Z 위.
import bpy, bmesh, math, os, sys, json
from mathutils import Vector as V, Quaternion, Matrix
from mathutils.bvhtree import BVHTree

argv_all = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
BODY = next((a.split('=', 1)[1] for a in argv_all if a.startswith('--body=')), 'a')
if BODY not in ('a', 'b', 'npc'):
    raise SystemExit('--body는 a·b·npc 중 하나')
argv = [a for a in argv_all if not a.startswith('--')]
OUT = argv[0] if argv else 'character.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
HDRI = argv[2] if len(argv) > 2 else None
FPS = 24
D = math.radians


# =====================================================================================
# 치수 표(미터). 학생 체형 1(a)이 기준이고 b·npc는 바뀌는 값만 덮어쓴다.
# =====================================================================================
def spec(body):
    S = dict(
        height=1.45,                 # 바닥 ~ 머리카락(Hair_Short) 꼭대기
        root_scale=1.0,              # 뿌리 Character의 scale
        student=True,                # 학생(볼터치, 주황 실습복 배치) / 교관(조끼 배치, 굵은 눈썹)
        # 관절(서 있는 자세, 팔은 몸 옆으로 조금 벌림)
        pelvis=(0, 0, 0.531), spine=(0, -0.006, 0.661), chest=(0, -0.012, 0.791), neck=(0, 0, 0.921),
        shoulder=(0.177, -0.012, 0.868), elbow=(0.230, -0.018, 0.709), wrist=(0.254, 0.0, 0.579), hand_len=0.10,
        hip=(0.089, 0, 0.484), knee=(0.094, 0.012, 0.301), ankle=(0.094, -0.012, 0.130),
        # 몸 두께(스킨 모디파이어 반지름 x, y)
        R=dict(pelvis=(0.165, 0.136), spine=(0.153, 0.124), chest=(0.177, 0.136), neck=(0.071, 0.071), neckTop=(0.065, 0.065),
               clav=(0.083, 0.083), shoulder=(0.076, 0.076), uarm=(0.071, 0.071), elbow=(0.065, 0.065), farm=(0.065, 0.065),
               wrist=(0.057, 0.057), hip=(0.104, 0.104), thigh=(0.100, 0.100), knee=(0.089, 0.089), calf=(0.089, 0.089), ankle=(0.076, 0.076)),
        # 머리(타원체 반지름, 앞뒤 위치, 턱 쪽 좁힘). 머리 중심 높이는 키에서 거꾸로 계산한다
        head_r=(0.236, 0.222, 0.227), head_y=0.014, head_taper=0.18,
        # 얼굴(머리 중심 기준. face_scale배 한다)
        face_scale=1.0,
        face=dict(eye_x=0.080, eye_z=-0.035, eye_r=(0.0295, 0.0105, 0.0425), brow_x=0.083, brow_z=0.045, brow_r=(0.029, 0.0083, 0.0085), brow_tilt=0.10,
                  mouth_z=-0.112, mouth_r=(0.022, 0.0071, 0.0066), smile=0.0075, nose_z=-0.077, nose_r=(0.013, 0.0118, 0.0106),
                  ear_z=-0.035, ear_r=(0.026, 0.047, 0.059), blush=(0.139, -0.086, (0.032, 0.0071, 0.0172))),
        hand=dict(palm_d=0.059, palm=(0.047, 0.059, 0.065), thumb_d=0.041, thumb_off=(0.026, 0.040), thumb=(0.021, 0.023, 0.034)),
        # 작업화: 길이·폭·발등 높이·밑창 두께·발 중심(발목에서 앞으로)·목 높이·목 반지름
        boot=dict(len=0.29, wid=0.142, h=0.105, sole=0.026, cy=0.042, shaft=0.15, shaft_r=0.083),
        # 실습복 디테일 크기와 팔·다리를 따라간 위치(0 = 위 관절, 1 = 아래 관절)
        cloth=dict(zip_w=0.0085, pull=(0.012, 0.008, 0.024), band_h=0.031, cuff_h=0.047, phem_h=0.045,
                   armband_t=0.58, cuff_t=0.9, phem_t=0.80, pband_t=0.42, arm_lim=0.089, leg_lim=0.12),
        # 걷기: 디딘 발이 한 번 디딜 동안 몸에 대해 뒤로 가는 거리(stride), 디딤 비율(beta, 0.5 초과 = 두 발 디딤 구간 있음),
        #       발 드는 높이, 발뒤꿈치 닿기·발끝 떼기 각도, 엉덩이 좌우 흔들림, 팔 흔들기
        walk=dict(stride=0.42, beta=0.52, lift=0.042, phi_hs=D(14), phi_to=D(24), heel=0.14, toe=0.22, sway=0.010, arm=D(24), reach=0.975),
        # 쪼그리기: 엉덩이 내리는 거리(다리 길이 비율)·뒤로 빼는 거리, 몸 숙임
        crouch=dict(down=0.50, back=0.03, hips=D(3), spine=D(12), chest=D(5), head=D(14), knee_out=0.55),
    )
    if body == 'b':
        # 체형 2: 어깨·팔을 안으로, 가슴을 조금 좁게(뿌리 scale로 키 1.37 m)
        S['root_scale'] = 1.62 / 1.72
        for k, dx in (('shoulder', -0.020), ('elbow', -0.021), ('wrist', -0.021)):
            x, y, z = S[k]; S[k] = (x + dx, y, z)
        S['R'].update(chest=(0.160, 0.134), clav=(0.074, 0.074), shoulder=(0.070, 0.070), uarm=(0.066, 0.066))
    if body == 'npc':
        # 교관: 키 1.62 m, 머리를 조금 줄이고(3.4등신쯤) 몸통·팔·다리를 어른 길이로
        S.update(height=1.62, student=False,
                 pelvis=(0, 0, 0.665), spine=(0, -0.007, 0.800), chest=(0, -0.014, 0.940), neck=(0, 0, 1.088),
                 shoulder=(0.212, -0.014, 1.030), elbow=(0.262, -0.026, 0.832), wrist=(0.287, 0.0, 0.648), hand_len=0.105,
                 hip=(0.099, 0, 0.616), knee=(0.104, 0.014, 0.376), ankle=(0.104, -0.012, 0.135),
                 head_y=0.012, face_scale=0.97, head_taper=0.2)
        S['head_r'] = tuple(x * 0.97 for x in S['head_r'])
        S['R'] = dict(pelvis=(0.178, 0.142), spine=(0.170, 0.132), chest=(0.198, 0.146), neck=(0.074, 0.074), neckTop=(0.068, 0.068),
                      clav=(0.090, 0.090), shoulder=(0.082, 0.082), uarm=(0.075, 0.075), elbow=(0.067, 0.067), farm=(0.067, 0.067),
                      wrist=(0.058, 0.058), hip=(0.108, 0.108), thigh=(0.103, 0.103), knee=(0.089, 0.089), calf=(0.088, 0.088), ankle=(0.077, 0.077))
        F = S['face']
        F.update(eye_r=(0.0255, 0.0095, 0.034), brow_r=(0.032, 0.0095, 0.0135), brow_z=0.043, brow_tilt=0.05, blush=None, smile=0.006)
        S['hand'] = dict(palm_d=0.062, palm=(0.048, 0.061, 0.068), thumb_d=0.043, thumb_off=(0.027, 0.042), thumb=(0.022, 0.024, 0.036))
        S['boot'] = dict(len=0.30, wid=0.145, h=0.105, sole=0.027, cy=0.044, shaft=0.16, shaft_r=0.084)
        S['cloth'].update(arm_lim=0.095)
        S['walk'].update(stride=0.50, lift=0.046, sway=0.009, arm=D(22))
        S['crouch'].update(down=0.48)
    return S


P = spec(BODY)
STUDENT = P['student']

# ---------------- 머리 모양(머리 반지름 단위) ----------------
# line: 이마 쪽(0)~뒤(π) 방향각별 머리선 높이(머리 중심 기준, 머리 높이 반지름 단위), tips: 뾰족한 머리 끝(방향각, 반폭, 깊이),
# off·scale: 머리 타원체 대비 머리카락 껍질의 위치·크기, tuck: 끝을 안으로 말아 넣는 비율, flare: 아래쪽 퍼짐(시작 높이, 양)
# locks: 머리 위를 따라 흐르는 덩어리 (방향각·높이각 세 점[도], 폭 처음·끝, 두께, 띄움) — 폭·두께는 머리 가로 반지름 단위
HAIR = {
    'Hair_Short': dict(off=(0, -0.04, 0.06), scale=(1.07, 1.075, 1.06), tuck=0.10,
                       line=[(0, 0.44), (0.55, 0.40), (1.05, 0.22), (1.35, 0.10), (1.62, 0.08), (2.1, -0.28), (2.6, -0.52), (math.pi, -0.58)],
                       tips=[(-0.42, 0.30, 0.13), (-0.05, 0.28, 0.10), (0.33, 0.26, 0.09), (1.36, 0.16, 0.20), (-1.36, 0.16, 0.20)],
                       locks=[((10, 82), (-22, 48), (-40, 18), 0.50, 0.12, 0.10, 0.0), ((40, 80), (34, 46), (38, 22), 0.40, 0.08, 0.09, 0.0)]),
    'Hair_Fringe': dict(off=(0, -0.03, 0.06), scale=(1.075, 1.085, 1.06), tuck=0.10,
                        line=[(0, 0.34), (0.6, 0.30), (1.0, 0.20), (1.35, 0.06), (1.62, 0.02), (2.1, -0.32), (2.6, -0.56), (math.pi, -0.62)],
                        tips=[(-0.62, 0.20, 0.10), (-0.32, 0.18, 0.10), (-0.02, 0.18, 0.09), (0.28, 0.18, 0.10), (0.58, 0.20, 0.10),
                              (1.32, 0.15, 0.18), (-1.32, 0.15, 0.18)],
                        locks=[((-30, 80), (-32, 44), (-30, 14), 0.40, 0.14, 0.08, 0.0), ((6, 82), (6, 44), (4, 14), 0.42, 0.14, 0.08, 0.0), ((42, 80), (42, 44), (38, 14), 0.38, 0.14, 0.08, 0.0)]),
    'Hair_Bob': dict(off=(0, -0.05, 0.06), scale=(1.10, 1.10, 1.07), tuck=0.12, flare=(-0.05, 0.10),
                     line=[(0, 0.40), (0.5, 0.34), (0.85, 0.02), (1.15, -0.42), (1.5, -0.58), (2.2, -0.60), (math.pi, -0.62)],
                     tips=[(-0.30, 0.34, 0.12), (0.22, 0.30, 0.08)],
                     locks=[((15, 84), (-28, 48), (-48, 16), 0.52, 0.12, 0.10, 0.0), ((45, 80), (42, 46), (50, 20), 0.40, 0.10, 0.09, 0.0)]),
    'Hair_Tied': dict(off=(0, -0.04, 0.06), scale=(1.065, 1.07, 1.055), tuck=0.10,
                      line=[(0, 0.46), (0.6, 0.40), (1.1, 0.20), (1.4, 0.10), (1.62, 0.07), (2.1, -0.20), (2.6, -0.42), (math.pi, -0.46)],
                      tips=[(1.38, 0.14, 0.14), (-1.38, 0.14, 0.14)],
                      locks=[((-10, 80), (-26, 46), (-40, 24), 0.42, 0.10, 0.08, 0.0), ((14, 80), (28, 46), (42, 24), 0.42, 0.10, 0.08, 0.0)],
                      tail=True),
}

# =====================================================================================
# 재질
# =====================================================================================
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
COL_ATTR = 'Col'


def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def material(name, color, metal=0.0, rough=0.6, vcol=False):
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*lin(color), 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*lin(color), 1)
    if vcol:   # 정점색을 그대로 바탕색으로(glTF COLOR_0)
        n = m.node_tree.nodes.new('ShaderNodeVertexColor'); n.layer_name = COL_ATTR
        m.node_tree.links.new(n.outputs['Color'], p.inputs['Base Color'])
    return m


# 옷 색은 중립 기본색(앱이 학생·교관별로 재질 이름으로 바꾼다)
MAT = {'Skin': material('Skin', '#e2b796', rough=0.55), 'Hair': material('Hair', '#1e1a17', rough=0.62),
       'Top': material('Top', '#2f5fb3', rough=0.8), 'Bottom': material('Bottom', '#2b3a55', rough=0.85),
       'Shoes': material('Shoes', '#1c1c1c', rough=0.5), 'Eye': material('Eye', '#121212', rough=0.2),
       'Trim': material('Trim', '#2b2d64', rough=0.8),
       # 늘린 재질 1개: 정점색으로 여러 작은 부분의 색을 낸다(앱이 색을 바꾸지 않음)
       'Detail': material('Detail', '#ffffff', rough=0.5, vcol=True)}
MAT['GogglesFrame'] = material('GogglesFrame', '#22262b', rough=0.45)
MAT['GogglesLens'] = material('GogglesLens', '#24404e', metal=0.0, rough=0.15)   # 어두운 유리색: 밝은 색이면 알파만큼 더해져 눈이 뿌옇게 보인다
_lp = MAT['GogglesLens'].node_tree.nodes['Principled BSDF']; _lp.inputs['Alpha'].default_value = 0.16
if hasattr(MAT['GogglesLens'], 'surface_render_method'): MAT['GogglesLens'].surface_render_method = 'BLENDED'   # glTF alphaMode BLEND
DETAIL = {'reflect': '#d9dee2', 'shine': '#ffffff', 'mouth': '#8f4a3c', 'blush': '#ee9a88', 'zip': '#3c3f48',
          'sole': '#1d1714', 'lace': '#2a1d15', 'tie': '#3a3f5c'}


# =====================================================================================
# 기본 도형
# =====================================================================================
def link(ob): scene.collection.objects.link(ob); return ob


def to_obj(bm, name, mat, sharp=None, col=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); me.materials.append(MAT[mat])
    for p in me.polygons: p.use_smooth = True
    if sharp: me.set_sharp_from_angle(angle=sharp)
    if col: ob['col'] = col
    return ob


def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear(); ob.data = me


def solidify(ob, t, off=-1):
    s = ob.modifiers.new('sol', 'SOLIDIFY'); s.thickness = t; s.offset = off; apply_mods(ob)
    for p in ob.data.polygons: p.use_smooth = True
    return ob


def ell(c, r, mat, q=None, segs=24, rings=14, deform=None, col=None):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1)
    for v in bm.verts:
        co = V((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2]))
        if deform: co = deform(co)
        if q: co = q @ co
        v.co = co + V(c)
    return to_obj(bm, 'ell', mat, col=col)


def rbox(c, size, bev, mat, segs=3, col=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co = V((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=bev, segments=segs, profile=0.5, affect='EDGES')
    for v in bm.verts: v.co += V(c)
    return to_obj(bm, 'box', mat, sharp=math.radians(50), col=col)


def tube(p, d, rx, ry, h, mat, segs=20, col=None, caps=True):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=True, segments=segs, radius1=1, radius2=1, depth=h)
    q = V((0, 0, 1)).rotation_difference(d)
    for v in bm.verts: v.co = q @ V((v.co.x * rx, v.co.y * ry, v.co.z)) + p
    return to_obj(bm, 'tube', mat, sharp=math.radians(40), col=col)


def loft(path, widths, thicks, normals, mat, n_ring=8, col=None, start_cap=True):
    # 경로를 따라 납작한 타원 단면을 이어 붙인 덩어리(머리카락 다발·묶은 머리). 끝은 한 점으로 모인다
    bm = bmesh.new(); rings = []
    for i, c in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        n = normals[i] - t * normals[i].dot(t); n.normalize()
        b = t.cross(n).normalized()
        if i == len(path) - 1 or widths[i] < 1e-4:
            rings.append([bm.verts.new(c)]); continue
        rings.append([bm.verts.new(c + b * math.cos(2 * math.pi * k / n_ring) * widths[i] / 2 + n * math.sin(2 * math.pi * k / n_ring) * thicks[i] / 2)
                      for k in range(n_ring)])
    for a, b2 in zip(rings, rings[1:]):
        if len(b2) == 1:
            for k in range(n_ring): bm.faces.new((a[k], a[(k + 1) % n_ring], b2[0]))
        else:
            for k in range(n_ring): bm.faces.new((a[k], a[(k + 1) % n_ring], b2[(k + 1) % n_ring], b2[k]))
    if start_cap: bm.faces.new(rings[0][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return to_obj(bm, 'loft', mat, col=col)


def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length, t


def ray(target, x, z, front=True):
    o = V((x, 2.0 if front else -2.0, z)); d = V((0, -1 if front else 1, 0))
    hit, loc, nrm, _ = target.ray_cast(o, d)
    return (loc, nrm) if hit else (V((x, 0, z)), V((0, 1 if front else -1, 0)))


def smooth(x):
    x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)


def group(ob, name, w=1.0, idx=None):
    g = ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
    g.add(list(range(len(ob.data.vertices))) if idx is None else idx, w, 'REPLACE')


def paint(ob):
    m = ob.data
    for a in list(m.color_attributes): m.color_attributes.remove(a)
    at = m.color_attributes.new(COL_ATTR, 'FLOAT_COLOR', 'CORNER')
    c = (lin(ob['col']) + [1.0]) if 'col' in ob else [1.0, 1.0, 1.0, 1.0]
    at.data.foreach_set('color', c * len(m.loops))
    if 'col' in ob: del ob['col']


def paint_faces(ob, faces, hexc):
    at = ob.data.color_attributes[COL_ATTR]; c = lin(hexc) + [1.0]
    for fi in faces:
        for li in ob.data.polygons[fi].loop_indices: at.data[li].color = c


def join(objs, target):
    with bpy.context.temp_override(active_object=target, selected_editable_objects=objs + [target], object=target):
        bpy.ops.object.join()
    return target


# =====================================================================================
# 머리카락 껍질(머리 모양마다 따로 된 물체)
# =====================================================================================


def hair_mesh(name, st):
    off = V(st['off']); sc = st['scale']
    cc = hc + V((off.x * hr.x, off.y * hr.y, off.z * hr.z)); rr = V((hr.x * sc[0], hr.y * sc[1], hr.z * sc[2]))
    f0, fa = st.get('flare', (None, 0.0))

    def line(az):
        a = abs(az); pts = st['line']; z = pts[-1][1]
        for (a0, z0), (a1, z1) in zip(pts, pts[1:]):
            if a0 <= a <= a1: z = z0 + (z1 - z0) * smooth((a - a0) / (a1 - a0)); break
        for (c, w, dep) in st.get('tips', []):
            d = abs(((az - c + math.pi) % (2 * math.pi)) - math.pi)
            z -= dep * max(0.0, 1 - d / w) ** 1.3
        return z

    def flare(p):
        if f0 is None: return p
        h = (p.z - hc.z) / hr.z
        k = 1 + fa * smooth((f0 - h) / 0.6)
        return V((p.x * k, hc.y + (p.y - hc.y) * k, p.z))

    def surf(az, el, lift=0.0):
        p = cc + V((rr.x * math.cos(el) * math.sin(az), rr.y * math.cos(el) * math.cos(az), rr.z * math.sin(el)))
        n = V(((p.x - cc.x) / rr.x ** 2, (p.y - cc.y) / rr.y ** 2, (p.z - cc.z) / rr.z ** 2)).normalized()
        return flare(p) + n * lift, n

    NA, NR = 48, 11
    bm = bmesh.new(); top = bm.verts.new(cc + V((0, 0, rr.z))); grid = []
    for j in range(NA):
        az = 2 * math.pi * j / NA
        if az > math.pi: az -= 2 * math.pi
        hl = line(az)
        ce = max(-0.99, min(0.99, (hc.z + hl * hr.z - cc.z) / rr.z)); th_end = math.acos(ce)
        col = []
        for i in range(1, NR + 1):
            th = th_end * (i / NR) ** 0.9
            col.append(bm.verts.new(flare(cc + V((rr.x * math.sin(th) * math.sin(az), rr.y * math.sin(th) * math.cos(az), rr.z * math.cos(th))))))
        last = col[-1].co
        col.append(bm.verts.new(hc + (last - hc) * (1 - st['tuck']) + V((0, 0, 0.004))))
        grid.append(col)
    for j in range(NA):
        k = (j + 1) % NA
        bm.faces.new((top, grid[k][0], grid[j][0]))
        for i in range(NR):
            bm.faces.new((grid[j][i], grid[k][i], grid[k][i + 1], grid[j][i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obs = [to_obj(bm, name, 'Hair')]
    # 머리 위 덩어리(가르마·앞머리 흐름): 껍질에 반쯤 묻힌 납작한 다발 — 시작은 얇게 솟고 끝은 뾰족하게
    for (p0, p1, p2, w0, w1, th, lift) in st.get('locks', []):
        path, nrm, ws, ts = [], [], [], []
        NL = 9
        for i in range(NL):
            t = i / (NL - 1)
            az = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
            el = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
            thk = th * hr.x * (0.25 + 0.75 * math.sin(math.pi * min(1.0, t / 0.55) / 2)) * (1 - 0.55 * t)
            p, n = surf(D(az), D(el), lift * hr.x + thk * (0.08 - 0.9 * (1 - t) ** 1.6))   # 시작은 껍질 속에 묻혀 있다가 솟는다
            path.append(p); nrm.append(n)
            ws.append(hr.x * (w0 + (w1 - w0) * t) * (0.35 + 0.65 * smooth(t / 0.4)) * (1 - t ** 3) if i < NL - 1 else 0.0); ts.append(thk)
        obs.append(loft(path, ws, ts, nrm, 'Hair', n_ring=8))
    if st.get('tail'):
        # 묶은 머리: 뒤통수에서 아래로 늘어진 다발 + 끈
        pts = [(0, -0.90, 0.30), (0, -1.10, 0.22), (0, -1.22, 0.02), (0, -1.20, -0.24), (0, -1.10, -0.50), (0, -1.02, -0.70)]
        path = [hc + V((x * hr.x, y * hr.y, z * hr.z)) for x, y, z in pts]
        nrm = [V((0, -1, 0.2)).normalized()] * len(path)
        ws = [w * hr.x for w in (0.34, 0.38, 0.36, 0.30, 0.20, 0.0)]
        ts = [w * hr.x for w in (0.30, 0.32, 0.30, 0.24, 0.15, 0.04)]
        obs.append(loft(path, ws, ts, nrm, 'Hair', n_ring=10))
        d = (path[1] - path[0]).normalized()
        obs.append(tube(path[0] + d * 0.035, d, 0.36 * hr.x * 0.55, 0.31 * hr.x * 0.55, 0.022, 'Detail', segs=14, col=DETAIL['tie']))
    for o in obs: paint(o)
    ob = join(obs[1:], obs[0]) if len(obs) > 1 else obs[0]
    ob.name = name
    return ob


# 머리 중심 높이: Hair_Short를 한 번 만들어 꼭대기가 머리 중심에서 얼마나 위인지 재고, 키에서 거꾸로 정한다
hr = V(P['head_r'])
hc = V((0, P['head_y'], 1.0))
_probe = hair_mesh('probe', HAIR['Hair_Short'])
HAIR_TOP_K = (max(v.co.z for v in _probe.data.vertices) - hc.z) / hr.z
_pd = _probe.data; bpy.data.objects.remove(_probe); bpy.data.meshes.remove(_pd)
hc = V((0, P['head_y'], P['height'] - HAIR_TOP_K * hr.z))

# ---------------- 관절(치수 표에서) ----------------
J = {k: tuple(P[k]) for k in ('pelvis', 'spine', 'chest', 'neck')}
J['neckTop'] = (0, 0.004, hc.z - 0.925 * hr.z)                       # 목 위 끝은 머리 아래쪽 안에 묻힌다
for s, sx in (('L', 1), ('R', -1)):
    for k in ('shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'):
        x, y, z = P[k]; J[k + s] = (sx * x, y, z)


def mid(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


for s in ('L', 'R'):
    J['clav' + s] = mid(J['chest'], J['shoulder' + s], 0.55)
    J['uarm' + s] = mid(J['shoulder' + s], J['elbow' + s], 0.35)
    J['farm' + s] = mid(J['elbow' + s], J['wrist' + s], 0.3)
    J['thigh' + s] = mid(J['hip' + s], J['knee' + s], 0.35)
    J['calf' + s] = mid(J['knee' + s], J['ankle' + s], 0.3)
EDGES = [('pelvis', 'spine', 'torso'), ('spine', 'chest', 'torso'), ('chest', 'neck', 'torso'), ('neck', 'neckTop', 'neck')]
for s in ('L', 'R'):
    EDGES += [('chest', 'clav' + s, 'torso'), ('pelvis', 'hip' + s, 'torso')]
    EDGES += [(a, b, 'arm' + s) for a, b in (('clav' + s, 'shoulder' + s), ('shoulder' + s, 'uarm' + s), ('uarm' + s, 'elbow' + s), ('elbow' + s, 'farm' + s), ('farm' + s, 'wrist' + s))]
    EDGES += [(a, b, 'leg' + s) for a, b in (('hip' + s, 'thigh' + s), ('thigh' + s, 'knee' + s), ('knee' + s, 'calf' + s), ('calf' + s, 'ankle' + s))]
RAD = {n: P['R'][n[:-1] if n[-1] in 'LR' and n != 'pelvis' else n] for n in J}


def zj(k): return J[k][2]


# 옷 경계 높이(관절 높이에서 비율로)
TH = dict(
    yoke=zj('chest') + 0.27 * (zj('neck') - zj('chest')),                                   # 어깨판(남색) 아래 끝
    band=(zj('spine') + 0.135 * (zj('chest') - zj('spine')), zj('spine') + 0.36 * (zj('chest') - zj('spine'))),   # 가슴 반사띠
    hem=(zj('pelvis') - 0.09 * (zj('spine') - zj('pelvis')), zj('pelvis') + 0.227 * (zj('spine') - zj('pelvis'))),  # 윗옷 끝단
    collar=zj('neck') + 0.33 * (zj('neckTop') - zj('neck')),                                # 목둘레(이 위 가운데는 피부)
)
TH['skin_x'] = 1.6 * P['R']['neck'][0]
TH['vest_neck'] = 1.25 * P['R']['neck'][0]           # 교관 조끼: 목 둘레 남색 폭
TH['vest_x'] = 0.83 * P['shoulder'][0]              # 교관 조끼: 진동 둘레(이 안쪽 팔 뿌리까지 조끼)
TH['vest_arm_z'] = P['shoulder'][2] - 0.11            # 교관 조끼: 팔 쪽은 이 높이(겨드랑이) 위만 조끼색
_bt = TH['band'][1]
BOOT_TOP = P['boot']['sole'] + P['boot']['shaft']
CL = P['cloth']
CL.update(zip_z=(TH['hem'][0] + 0.005, TH['collar'] - 0.012),
          pocket_z=(_bt + 0.10 * (TH['yoke'] - _bt), _bt + 0.66 * (TH['yoke'] - _bt)),
          flap_z=(_bt + 0.60 * (TH['yoke'] - _bt), _bt + 0.93 * (TH['yoke'] - _bt)),
          pocket_x=(0.23 * P['R']['chest'][0], 0.70 * P['R']['chest'][0]))
_nh = zj('neckTop') - zj('neck'); _nr = P['R']['neck'][0]
COLLAR = dict(r0=1.12 * _nr, r1=1.58 * _nr, z0=zj('neck') + 0.70 * _nh, z1=zj('neck') - 0.20 * _nh, cy=-0.005, gap=30, drop=0.22 * _nh, t=0.0100)

FS = P['face_scale']
FACE = {}
for k, v in P['face'].items():
    if v is None or k == 'brow_tilt': FACE[k] = v
    elif isinstance(v, tuple) and isinstance(v[-1], tuple): FACE[k] = (v[0] * FS, v[1] * FS, tuple(x * FS for x in v[2]))
    elif isinstance(v, tuple): FACE[k] = tuple(x * FS for x in v)
    else: FACE[k] = v * FS

# =====================================================================================
# 몸(관절을 스킨 모디파이어로 이은 뒤 세분화) — 면마다 가장 가까운 뼈 구간으로 옷 재질을 정한다
# =====================================================================================
names = list(J.keys())
me = bpy.data.meshes.new('skel')
me.from_pydata([J[n] for n in names], [(names.index(a), names.index(b)) for a, b, _ in EDGES], [])
body = link(bpy.data.objects.new('Body', me))
sk = body.modifiers.new('skin', 'SKIN'); sk.use_smooth_shade = True; sk.branch_smoothing = 0.7
for i, n in enumerate(names): me.skin_vertices[0].data[i].radius = RAD[n]
me.skin_vertices[0].data[names.index('pelvis')].use_root = True
sub = body.modifiers.new('sub', 'SUBSURF'); sub.levels = 2
apply_mods(body)
bm = bmesh.new(); bm.from_mesh(body.data)
for _ in range(2):   # 스킨 모디파이어가 팔꿈치·무릎 마디에 만드는 작은 주름(점 몰림)을 살짝 편다
    bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
for z in (TH['yoke'], TH['band'][0], TH['band'][1], TH['hem'][0], TH['hem'][1], TH['collar']):
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1))
if not STUDENT:   # 교관 조끼: 목 둘레·진동 둘레 경계도 곧은 선이 되게 세로로 자른다
    fs = [f for f in bm.faces if abs(f.calc_center_median().x) > TH['vest_x'] - 0.05 and abs(f.calc_center_median().z - TH['vest_arm_z']) < 0.05]
    bmesh.ops.bisect_plane(bm, geom=list({v for f in fs for v in f.verts}) + list({e for f in fs for e in f.edges}) + fs, plane_co=(0, 0, TH['vest_arm_z']), plane_no=(0, 0, 1))
    for x in (TH['vest_neck'], -TH['vest_neck'], TH['vest_x'], -TH['vest_x']):
        zmin_ = TH['yoke'] - 0.015 if abs(x) < TH['vest_x'] else TH['vest_arm_z'] - 0.06   # 경계가 실제로 보이는 높이만
        fs = [f for f in bm.faces if f.calc_center_median().z > zmin_ and abs(abs(f.calc_center_median().x) - abs(x)) < 0.035]
        es = list({e for f in fs for e in f.edges}); vs_ = list({v for f in fs for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=vs_ + es + fs, plane_co=(x, 0, 0), plane_no=(1, 0, 0))
bm.to_mesh(body.data); bm.free()
SLOTS = ['Skin', 'Top', 'Trim', 'Bottom', 'Detail']
body.data.materials.clear()
for s_ in SLOTS: body.data.materials.append(MAT[s_])
SEGS = [(V(J[a]), V(J[b]), lab) for a, b, lab in EDGES]
REFLECT_FACES = set()
for f in body.data.polygons:
    c = f.center
    lab = min(SEGS, key=lambda s_: seg_dist(c, s_[0], s_[1])[0])[2].rstrip('LR')
    if lab == 'neck' or (lab == 'torso' and c.z > TH['collar'] and abs(c.x) < TH['skin_x']): m = 'Skin'
    elif lab == 'arm':
        if STUDENT: m = 'Trim' if c.z >= TH['yoke'] else 'Top'
        elif abs(c.x) < TH['vest_x'] and c.z >= TH['hem'][1] and not (c.z >= TH['yoke'] and abs(c.x) < TH['vest_neck']):
            # 교관: 몸통 옆에 붙은 팔 뿌리 면도 조끼 안쪽이면 조끼(반사띠 높이는 반사띠)
            if TH['band'][0] <= c.z < TH['band'][1]: m = 'Detail'; REFLECT_FACES.add(f.index)
            else: m = 'Top'
        else: m = 'Trim'
    elif lab == 'leg': m = 'Bottom'
    elif c.z >= TH['yoke']: m = ('Top' if TH['vest_neck'] < abs(c.x) < TH['vest_x'] else 'Trim') if not STUDENT else 'Trim'
    elif TH['band'][0] <= c.z < TH['band'][1]: m = 'Detail'; REFLECT_FACES.add(f.index)
    elif TH['hem'][0] <= c.z < TH['hem'][1]: m = 'Trim'
    elif c.z < TH['hem'][0]: m = 'Bottom'
    elif not STUDENT and abs(c.x) >= TH['vest_x'] and c.z > TH['vest_arm_z'] - 0.06: m = 'Trim'   # 교관: 겨드랑이 위 조끼 옆선(x 경계) 밖은 작업복
    else: m = 'Top'
    f.material_index = SLOTS.index(m)
    f.use_smooth = True
bpy.context.view_layer.update()
VLABEL = [min(SEGS, key=lambda sg: seg_dist(v.co, sg[0], sg[1])[0])[2] for v in body.data.vertices]

# ---------------- 실습복 디테일(몸 표면에 붙인 판·띠) ----------------
cloth = []


def patch(x0, x1, z0, z1, off, thick, mat, nx=4, nz=4, col=None):
    bm = bmesh.new(); grid = []
    for i in range(nz + 1):
        row = []
        for j in range(nx + 1):
            x = x0 + (x1 - x0) * j / nx; z = z0 + (z1 - z0) * i / nz
            loc, nrm = ray(body, x, z)
            row.append(bm.verts.new(loc + nrm * off))
        grid.append(row)
    for i in range(nz):
        for j in range(nx):
            bm.faces.new([grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]][::-1])
    ob = to_obj(bm, 'patch', mat, col=col)
    return solidify(ob, thick, 1)


def ring(a, b, t, h, mat, pad, lim, grp, col=None, segs=16):
    # 팔·다리·몸통 둘레 띠: 그 높이의 몸 단면을 띠의 두 축(u, v)으로 재서 중심과 폭을 맞춘 타원 띠
    a, b = V(a), V(b); d = (b - a).normalized(); p = a + (b - a) * t
    if abs(d.z) > 0.97: d = V((0, 0, 1 if d.z > 0 else -1))
    q = V((0, 0, 1)).rotation_difference(d); u = q @ V((1, 0, 0)); w_ = q @ V((0, 1, 0))
    us, vs = [], []
    for v in body.data.vertices:
        if VLABEL[v.index] != grp: continue
        w = v.co - p; al = w.dot(d)
        if abs(al) < max(0.012, h / 2 + 0.004):
            rad = w - d * al
            if rad.length < lim: us.append(rad.dot(u)); vs.append(rad.dot(w_))
    cu, cv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
    ru, rv = (max(us) - min(us)) / 2, (max(vs) - min(vs)) / 2
    return tube(p + u * cu + w_ * cv, d, ru + pad, rv + pad, h, mat, segs=segs, col=col)


cloth.append((patch(-CL['zip_w'], CL['zip_w'], CL['zip_z'][0], CL['zip_z'][1], 0.002, 0.004, 'Detail', nx=1, nz=10, col=DETAIL['zip']), {'torso'}))
zt = ray(body, 0, CL['zip_z'][1] - CL['pull'][2] * 1.4)
cloth.append((rbox(zt[0] + V((0, CL['pull'][1] * 0.8, 0)), CL['pull'], CL['pull'][0] * 0.4, 'Detail', 1, col=DETAIL['zip']), {'torso'}))
for sx in (1, -1):
    x0, x1 = sorted((sx * CL['pocket_x'][0], sx * CL['pocket_x'][1]))
    cloth.append((patch(x0, x1, CL['pocket_z'][0], CL['pocket_z'][1], 0.002, 0.006, 'Top'), {'torso'}))
    fx0, fx1 = sorted((sx * (CL['pocket_x'][0] - 0.004), sx * (CL['pocket_x'][1] + 0.004)))
    cloth.append((patch(fx0, fx1, CL['flap_z'][0], CL['flap_z'][1], 0.007, 0.006, 'Trim', nz=2), {'torso'}))
# 윗옷 끝단(입체 띠)
_hm = (TH['hem'][0] + TH['hem'][1]) / 2
cloth.append((ring(J['pelvis'], J['spine'], (_hm - zj('pelvis')) / (zj('spine') - zj('pelvis')), TH['hem'][1] - TH['hem'][0] + 0.008, 'Trim', 0.010, 0.3, 'torso', segs=28), {'torso'}))
for s in ('L', 'R'):
    # 팔·다리 띠는 그 뼈에 통째로 붙인다(팔을 들 때 겨드랑이 쪽 가중치에 끌려 늘어나지 않게)
    if STUDENT: cloth.append((ring(J['shoulder' + s], J['elbow' + s], CL['armband_t'], CL['band_h'], 'Detail', 0.006, CL['arm_lim'], 'arm' + s, col=DETAIL['reflect']), 'UpperArm.' + s))
    cloth.append((ring(J['elbow' + s], J['wrist' + s], CL['cuff_t'], CL['cuff_h'], 'Trim', 0.008, CL['arm_lim'], 'arm' + s), 'LowerArm.' + s))
    _kz, _az = zj('knee' + s), zj('ankle' + s)
    _hz = BOOT_TOP + CL['phem_h'] / 2 - 0.004                          # 바지 끝단은 작업화 목 위에 얹힌다
    _rz = _hz + CL['phem_h'] / 2 + 0.014 + CL['band_h'] / 2              # 반사띠는 그 바로 위
    cloth.append((ring(J['knee' + s], J['ankle' + s], (_kz - _hz) / (_kz - _az), CL['phem_h'], 'Bottom', 0.009, CL['leg_lim'], 'leg' + s), 'LowerLeg.' + s))
    cloth.append((ring(J['knee' + s], J['ankle' + s], (_kz - _rz) / (_kz - _az), CL['band_h'], 'Detail', 0.005, CL['leg_lim'], 'leg' + s, col=DETAIL['reflect']), 'LowerLeg.' + s))
# 접힌 깃: 목둘레에서 바깥·아래로 접힌 띠(앞은 벌어짐)
C = COLLAR
bm = bmesh.new(); vs = []; n = 28
for i in range(n + 1):
    a = math.radians(C['gap']) + (2 * math.pi - 2 * math.radians(C['gap'])) * i / n
    sa, ca = math.sin(a), math.cos(a)
    top = V((C['r0'] * sa, C['cy'] + C['r0'] * 0.95 * ca, C['z0']))
    bot = V((C['r1'] * sa, C['cy'] + C['r1'] * 0.9 * ca, C['z1'] - (C['drop'] if ca > 0.7 else 0) * ca))
    vs.append((bm.verts.new(bot), bm.verts.new(top)))
for i in range(n): bm.faces.new((vs[i][0], vs[i + 1][0], vs[i + 1][1], vs[i][1]))
cloth.append((solidify(to_obj(bm, 'collar', 'Trim'), C['t'], 1), {'torso', 'neck'}))

# =====================================================================================
# 머리·얼굴(Head 뼈에 통째로)
# =====================================================================================
head_parts = []


def chin(co):
    if co.z < 0:
        k = 1 - P['head_taper'] * min(1.0, -co.z / hr.z) ** 1.5
        co = V((co.x * k, co.y * (1 - (1 - k) * 0.4), co.z))
    return co


head = ell(hc, hr, 'Skin', segs=28, rings=18, deform=chin)
head_parts.append(head); bpy.context.view_layer.update()


def feat(x, z, r, mat, tilt=0.0, sink=0.35, deform=None, segs=12, rings=8, col=None):
    loc, nrm = ray(head, x, z)
    q = V((0, 1, 0)).rotation_difference(nrm) @ Quaternion((0, 1, 0), tilt)
    return ell(loc - nrm * r[1] * sink, r, mat, q=q, segs=segs, rings=rings, deform=deform, col=col)


F = FACE
EYE_Z = hc.z + F['eye_z']
for sx in (1, -1):
    head_parts.append(feat(sx * F['eye_x'], EYE_Z, F['eye_r'], 'Eye', sink=0.45, segs=12, rings=8))
    hl = F['eye_r']
    head_parts.append(feat(sx * F['eye_x'] - hl[0] * 0.33, EYE_Z + hl[2] * 0.38, (hl[0] * 0.32, hl[1] * 0.7, hl[0] * 0.32), 'Detail', sink=-0.25, segs=6, rings=5, col=DETAIL['shine']))
    head_parts.append(feat(sx * F['eye_x'] + hl[0] * 0.30, EYE_Z - hl[2] * 0.42, (hl[0] * 0.14, hl[1] * 0.6, hl[0] * 0.14), 'Detail', sink=-0.3, segs=5, rings=4, col=DETAIL['shine']))
    head_parts.append(feat(sx * F['brow_x'], hc.z + F['brow_z'], F['brow_r'], 'Hair', tilt=sx * F['brow_tilt'], segs=8, rings=5))
    if F.get('blush'):
        head_parts.append(feat(sx * F['blush'][0], hc.z + F['blush'][1], F['blush'][2], 'Detail', sink=0.62, segs=8, rings=5, col=DETAIL['blush']))
    head_parts.append(ell((sx * hr.x * 0.955, hc.y - 0.012, hc.z + F['ear_z']), F['ear_r'], 'Skin', segs=10, rings=6))
_mw = F['mouth_r'][0]
head_parts.append(feat(0, hc.z + F['mouth_z'], F['mouth_r'], 'Detail', deform=lambda co: V((co.x, co.y, co.z + F['smile'] * (co.x / _mw) ** 2)), segs=8, rings=5, col=DETAIL['mouth']))
head_parts.append(feat(0, hc.z + F['nose_z'], F['nose_r'], 'Skin', sink=0.5, segs=8, rings=5))

# =====================================================================================
# 손(벙어리장갑 모양 + 엄지, Hand 뼈에 통째로)
# =====================================================================================
hands = {}
Hd = P['hand']
for s, sx in (('L', 1), ('R', -1)):
    w = V(J['wrist' + s]); dn = (w - V(J['elbow' + s])).normalized()
    q = V((0, 0, -1)).rotation_difference(dn)
    hands[s] = [ell(w + dn * Hd['palm_d'], Hd['palm'], 'Skin', q=q, segs=14, rings=9),
                ell(w + dn * Hd['thumb_d'] + V((-sx * Hd['thumb_off'][0] * 0.2, Hd['thumb_off'][1], 0)), Hd['thumb'], 'Skin',
                    q=q @ Quaternion((1, 0, 0), -0.35), segs=8, rings=6)]

# =====================================================================================
# 작업화: 위가 둥근 발 덩어리(앞코 둥글게) + 같은 윤곽을 조금 키운 얇은 밑창 + 발목 목·테 + 끈
# =====================================================================================
BT = P['boot']
boots = {}
SOLE_PTS = {}


def boot_outline(a, W, L):
    # 위에서 본 윤곽(앞 = +y): 앞이 조금 넓은 둥근 사각형
    sa, ca = math.sin(a), math.cos(a); e = 2 / 2.6
    x = W / 2 * math.copysign(abs(sa) ** e, sa) * (1 + 0.06 * ca)
    y = L / 2 * math.copysign(abs(ca) ** e, ca)
    return x, y


for s, sx in (('L', 1), ('R', -1)):
    ax = V(J['ankle' + s]); x0 = ax.x; cy = ax.y + BT['cy']
    L, W, Hh, so = BT['len'], BT['wid'], BT['h'], BT['sole']
    N = 16
    # 발 덩어리(Shoes): 층마다 윤곽을 줄여 둥근 지붕. 앞코는 낮고 둥글게, 뒤꿈치는 목 속으로
    bm = bmesh.new(); levels = 6; rows = []
    for k in range(levels + 1):
        u = k / levels; hz = math.sin(math.pi / 2 * u); sc = math.cos(math.pi / 2 * u) ** 0.55
        row = []
        for i in range(N):
            a = 2 * math.pi * i / N; px, py = boot_outline(a, W * sc, L * sc)
            front = max(0.0, py / (L / 2))
            z = so * 0.5 + Hh * hz * (1 - 0.18 * front)
            row.append(bm.verts.new((x0 + px, cy + py - 0.004 * u, z)))
        rows.append(row)
    for k in range(levels):
        for i in range(N): bm.faces.new((rows[k][i], rows[k][(i + 1) % N], rows[k + 1][(i + 1) % N], rows[k + 1][i]))
    topc = bm.verts.new((x0, cy, so * 0.5 + Hh * 0.95))
    for i in range(N): bm.faces.new((rows[-1][i], rows[-1][(i + 1) % N], topc))
    botc = bm.verts.new((x0, cy, so * 0.5))
    for i in range(N): bm.faces.new((rows[0][(i + 1) % N], rows[0][i], botc))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    upper = to_obj(bm, 'boot', 'Shoes')
    # 밑창(Detail 짙은 색): 같은 윤곽을 3%만 키운 얇은 띠 — 널빤지처럼 튀어나오지 않게
    bm = bmesh.new(); rows = []
    for (z, sc) in ((0.0, 1.0), (so * 0.25, 1.03), (so * 0.85, 1.035), (so, 1.02)):
        rows.append([bm.verts.new((x0 + boot_outline(2 * math.pi * i / N, W * sc, L * sc)[0], cy + boot_outline(2 * math.pi * i / N, W * sc, L * sc)[1], z)) for i in range(N)])
    for k in range(len(rows) - 1):
        for i in range(N): bm.faces.new((rows[k][i], rows[k][(i + 1) % N], rows[k + 1][(i + 1) % N], rows[k + 1][i]))
    bc = bm.verts.new((x0, cy, 0.0))
    for i in range(N): bm.faces.new((rows[0][(i + 1) % N], rows[0][i], bc))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    sole = to_obj(bm, 'sole', 'Detail', col=DETAIL['sole'])
    sy = ax.y - 0.006; sr = BT['shaft_r']
    shaft = tube(V((x0, sy, so + BT['shaft'] / 2)), V((0, 0, 1)), sr, sr * 1.08, BT['shaft'], 'Shoes', segs=16, caps=False)
    collar_b = tube(V((x0, sy, so + BT['shaft'] - 0.009)), V((0, 0, 1)), sr + 0.006, sr * 1.08 + 0.006, 0.022, 'Shoes', segs=16)
    laces = [rbox((x0, sy + sr * 1.08 + 0.002, so + BT['shaft'] * f), (W * 0.36, 0.008, 0.007), 0.003, 'Detail', 1, col=DETAIL['lace'])
             for f in (0.60, 0.78)]
    boots[s] = dict(rigid=[upper, sole], shaft=[shaft, collar_b] + laces, top=so + BT['shaft'], bottom=so)
    SOLE_PTS[s] = [V((x0, cy - L / 2 * 0.85, 0)), V((x0, cy + L / 2 * 0.85, 0)), V((x0 - W * 0.4, cy, 0)), V((x0 + W * 0.4, cy, 0))]
HEEL_Y = {s: SOLE_PTS[s][0].y for s in SOLE_PTS}
TOE_Y = {s: SOLE_PTS[s][1].y for s in SOLE_PTS}

# =====================================================================================
# 뼈대(이름·계층은 예전과 같다)
# =====================================================================================
arm_data = bpy.data.armatures.new('Rig')
arm = link(bpy.data.objects.new('Armature', arm_data))
bpy.context.view_layer.objects.active = arm
for o in bpy.context.view_layer.objects: o.select_set(o == arm)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones


def bone(name, head_, tail, parent=None):
    b = eb.new(name); b.head = V(head_); b.tail = V(tail); b.roll = 0.0
    if parent: b.parent = eb[parent]; b.use_connect = False
    return b


bone('Hips', J['pelvis'], J['spine'])
bone('Spine', J['spine'], J['chest'], 'Hips')
bone('Chest', J['chest'], J['neck'], 'Spine')
bone('Neck', J['neck'], J['neckTop'], 'Chest')
bone('Head', J['neckTop'], (0, hc.y * 0.5, hc.z + hr.z), 'Neck')
for s in ('L', 'R'):
    wv = V(J['wrist' + s]); dn = (wv - V(J['elbow' + s])).normalized()
    bone('UpperArm.' + s, J['shoulder' + s], J['elbow' + s], 'Chest')
    bone('LowerArm.' + s, J['elbow' + s], J['wrist' + s], 'UpperArm.' + s)
    bone('Hand.' + s, J['wrist' + s], wv + dn * P['hand_len'], 'LowerArm.' + s)
    bone('UpperLeg.' + s, J['hip' + s], J['knee' + s], 'Hips')
    bone('LowerLeg.' + s, J['knee' + s], J['ankle' + s], 'UpperLeg.' + s)
    a_ = V(J['ankle' + s])
    bone('Foot.' + s, J['ankle' + s], (a_.x, TOE_Y[s] - 0.03, 0.035), 'LowerLeg.' + s)
bpy.ops.object.mode_set(mode='OBJECT')

# 몸에 자동 가중치(뼈 열 확산)
for o in bpy.context.view_layer.objects: o.select_set(o in (body, arm))
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
BONES = [b.name for b in arm_data.bones]
_vgn = {g.index: g.name for g in body.vertex_groups}
_unw = [v.index for v in body.data.vertices if not any(g.weight > 1e-3 for g in v.groups)]
if _unw:   # 열 확산이 못 닿은 점은 가장 가까운 뼈로
    print('WARN unweighted', len(_unw))
    for vi in _unw:
        co = body.data.vertices[vi].co
        bn = min(arm_data.bones, key=lambda b: seg_dist(co, b.head_local, b.tail_local)[0]).name
        (body.vertex_groups.get(bn) or body.vertex_groups.new(name=bn)).add([vi], 1.0, 'REPLACE')


def transfer_weights(dst, labels):
    # 몸 표면(같은 부위의 면)에서 가장 가까운 면의 가중치를 옮긴다(옷 디테일이 몸과 같이 휘고, 팔 띠가 몸통에 끌려가지 않게)
    src = body.data
    polys = [p for p in src.polygons if all(VLABEL[v] in labels for v in p.vertices)]
    bvh = BVHTree.FromPolygons([v.co for v in src.vertices], [p.vertices[:] for p in polys])
    gname = {g.index: g.name for g in body.vertex_groups}
    for v in dst.data.vertices:
        loc, _, fi, _ = bvh.find_nearest(v.co)
        acc = {}; tot = 0.0
        for vi in polys[fi].vertices:
            w = 1.0 / ((src.vertices[vi].co - loc).length + 1e-4); tot += w
            for g in src.vertices[vi].groups: acc[gname[g.group]] = acc.get(gname[g.group], 0.0) + g.weight * w
        for nm, x in acc.items():
            if x / tot > 1e-3: group(dst, nm, x / tot, [v.index])


for ob, labels in cloth:
    if isinstance(labels, str): group(ob, labels)
    else: transfer_weights(ob, labels)
for ob in head_parts: group(ob, 'Head')
for s in ('L', 'R'):
    for ob in hands[s]: group(ob, 'Hand.' + s)
    for ob in boots[s]['rigid']: group(ob, 'Foot.' + s)
    # 발목 목은 아래는 발, 위는 정강이를 따라 부드럽게 휜다
    for ob in boots[s]['shaft']:
        for v in ob.data.vertices:
            f = smooth((boots[s]['top'] - v.co.z) / (boots[s]['top'] - boots[s]['bottom']) * 1.25 - 0.1)
            group(ob, 'Foot.' + s, f, [v.index]); group(ob, 'LowerLeg.' + s, 1 - f, [v.index])


cloth = [ob for ob, _ in cloth]
parts = cloth + head_parts + [o for s in ('L', 'R') for o in hands[s] + boots[s]['rigid'] + boots[s]['shaft']]
if os.environ.get('CHAR_DEBUG'):
    def _t(obs):
        n = 0
        for o in obs: o.data.calc_loop_triangles(); n += len(o.data.loop_triangles)
        return n
    print('TRIS_PARTS', dict(body=_t([body]), cloth=_t(cloth), head=_t(head_parts[:1]), face=_t(head_parts[1:]),
                             hands=_t(hands['L'] + hands['R']), boots=_t([o for s in 'LR' for o in boots[s]['rigid'] + boots[s]['shaft']])))
for ob in parts + [body]: paint(ob)
paint_faces(body, REFLECT_FACES, DETAIL['reflect'])
body = join(parts, body); body.name = 'Body'

# 머리 모양 4개(따로 된 물체, Head 뼈에 통째로 — 앱이 하나만 보인다)
hair_objs = {}
for nm, st in HAIR.items():
    ob = hair_mesh(nm, st); group(ob, 'Head')
    ob.parent = arm
    am_ = ob.modifiers.new('arm', 'ARMATURE'); am_.object = arm
    hair_objs[nm] = ob

# =====================================================================================
# 보안경(따로 된 물체, Head 뼈에 통째로). 렌즈는 눈 둘레만 덮고 눈썹 아래에서 끝난다
# =====================================================================================
ez = EYE_Z; eh = F['eye_r'][2]
brow_bot = hc.z + F['brow_z'] - F['brow_r'][2]
LENS = (ez - eh - 0.016, min(ez + eh + 0.012, brow_bot - 0.008))     # 렌즈 아래·위(눈썹 아래에서 끝)
NOSE_TOP = hc.z + F['nose_z'] + F['nose_r'][2] + 0.006
_ehr = (ez - hc.z) / hr.z
GX = hr.x * math.sqrt(max(0.1, 1 - _ehr ** 2)) * 1.07; GY = hr.y * 1.13
A_LENS = 1.12


def zlo(a): return LENS[0] + max(0.0, NOSE_TOP - LENS[0]) * math.exp(-(a / 0.12) ** 2)      # 코 위로 파인 아래 선


def zhi(a): return LENS[1] + 0.004 * math.exp(-(a / 0.2) ** 2)


def band(rx, ry, z0, z1, a0, a1, n, mat, t=None):
    # 머리 둘레 띠(앞 = +Y). z0·z1은 높이 또는 방향각의 함수
    f0 = z0 if callable(z0) else (lambda a, z=z0: z); f1 = z1 if callable(z1) else (lambda a, z=z1: z)
    bm = bmesh.new(); vs = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        x, y = rx * math.sin(a), hc.y + ry * math.cos(a)
        vs.append((bm.verts.new((x, y, f0(a))), bm.verts.new((x, y, f1(a)))))
    for i in range(n): bm.faces.new((vs[i][0], vs[i + 1][0], vs[i + 1][1], vs[i][1]))
    ob = to_obj(bm, 'gog', mat)
    return solidify(ob, t, 1) if t else ob


fh = 0.010
gparts = [
    band(GX, GY, zlo, zhi, -A_LENS, A_LENS, 32, 'GogglesLens'),                                                   # 렌즈(얇은 한 장)
    band(GX * 1.01, GY * 1.01, lambda a: zhi(a) - 0.002, lambda a: zhi(a) + fh, -A_LENS, A_LENS, 32, 'GogglesFrame', 0.007),   # 위 테
    band(GX * 1.01, GY * 1.01, lambda a: zlo(a) - fh, lambda a: zlo(a) + 0.002, -A_LENS, A_LENS, 32, 'GogglesFrame', 0.007),   # 아래 테
    band(hr.x * 1.17, hr.y * 1.10, ez - 0.011, ez + 0.011, A_LENS, 2 * math.pi - A_LENS, 24, 'GogglesFrame', 0.005),           # 뒤 끈
]
for sx in (1, -1):   # 옆 테(렌즈 끝을 감싸 끈으로 이어짐)
    a0, a1 = sorted((sx * (A_LENS - 0.05), sx * (A_LENS + 0.07)))
    gparts.append(band(GX * 1.012, GY * 1.012, LENS[0] - fh, LENS[1] + fh, a0, a1, 3, 'GogglesFrame', 0.009))
for o in gparts: paint(o)
gog = join(gparts[1:], gparts[0]); gog.name = 'Goggles'
group(gog, 'Head')
gog.parent = arm
am = gog.modifiers.new('arm', 'ARMATURE'); am.object = arm

# =====================================================================================
# 동작: 뼈 회전 키 + Hips 위치 키. 발은 바닥에 닿게(걷기·쪼그리기는 다리를 역운동학으로 풀어 발을 정한 자리에 둔다)
# =====================================================================================
pb = arm.pose.bones
for b in pb: b.rotation_mode = 'XYZ'
arm.animation_data_create()
BL = {b.name: b.length for b in arm_data.bones}


def upd(): bpy.context.view_layer.update()


def rest_rel(name):
    b = arm_data.bones[name]
    if b.parent: return pb[b.parent.name].matrix @ b.parent.matrix_local.inverted() @ b.matrix_local
    return b.matrix_local.copy()


def aim(name, d):
    # 뼈 방향(아마추어 공간)을 d로 — 최소 회전
    upd()
    R0 = rest_rel(name).to_3x3().normalized()
    q = R0.col[1].rotation_difference(d.normalized())
    basis = R0.inverted() @ (q.to_matrix() @ R0)
    pb[name].rotation_euler = basis.to_euler('XYZ')


def two_bone(up, lo, target, pole):
    upd()
    Sv = pb[up].head.copy(); a, b = BL[up], BL[lo]
    d = target - Sv; Ld = max(1e-4, min(d.length, (a + b) * 0.9995)); u = d.normalized()
    ca = max(-1.0, min(1.0, (a * a + Ld * Ld - b * b) / (2 * a * Ld))); sa = math.sqrt(1 - ca * ca)
    v = pole - u * pole.dot(u); v.normalize()
    E = Sv + u * a * ca + v * a * sa
    aim(up, E - Sv); aim(lo, Sv + u * Ld - E)


def set_hips(dx=0.0, dy=0.0, dz=0.0):
    pb['Hips'].location = arm_data.bones['Hips'].matrix_local.to_3x3().inverted() @ V((dx, dy, dz))


FOOT_R = {s: arm_data.bones['Foot.' + s].matrix_local.to_3x3().normalized() for s in ('L', 'R')}


def orient(name, R_des):
    upd()
    R0 = rest_rel(name).to_3x3().normalized()
    pb[name].rotation_euler = (R0.inverted() @ R_des).to_euler('XYZ')


def foot_pitch(s, phi):
    # 발을 바닥 기준 방향으로(정강이의 비틀림을 따라가지 않게) 앞뒤로만 phi만큼 기울인다
    orient('Foot.' + s, Matrix.Rotation(phi, 3, 'X') @ FOOT_R[s])


def sole_world(s):
    upd()
    M = pb['Foot.' + s].matrix @ arm_data.bones['Foot.' + s].matrix_local.inverted()
    return [M @ p for p in SOLE_PTS[s]]


def hold(t, rise=0.25):
    return min(1.0, t / rise, (1 - t) / rise)


def eulers():
    return {b.name: b.rotation_euler.copy() for b in pb}


def quats():
    return {b.name: b.rotation_euler.to_quaternion() for b in pb}


def set_q(name, q):
    pb[name].rotation_euler = q.to_euler('XYZ')


def blend_q(qa, k, names_):
    for nm in names_: set_q(nm, Quaternion().slerp(qa[nm], k))


def reset_pose():
    for b in pb: b.rotation_euler = (0, 0, 0); b.location = (0, 0, 0)


def clip(name, frames, fn, step=2):
    act = bpy.data.actions.new(name); act.use_fake_user = True
    arm.animation_data.action = act
    for f in range(0, frames + 1, step):
        t = f / frames
        reset_pose()
        fn(t)
        for b in pb:
            b.keyframe_insert('rotation_euler', frame=f)
            if b.name == 'Hips': b.keyframe_insert('location', frame=f)
    return act


LEG_LEN = BL['UpperLeg.L'] + BL['LowerLeg.L']
ARM_NAMES = {s: ['UpperArm.' + s, 'LowerArm.' + s, 'Hand.' + s] for s in ('L', 'R')}
WK = P['walk']; ST, BETA = WK['stride'], WK['beta']


# ---------------- 걷기 ----------------
def foot_plan(p, s):
    # 한 발의 주기(p: 0 = 앞에서 뒤꿈치 닿음) → (발목 목표, 발 기울기). 디딤 구간에는 발이 몸에 대해 일정한 속도로 뒤로 간다
    A0 = V(J['ankle' + s])

    def planted(c, phi):
        piv_y = (HEEL_Y[s] if phi > 0 else TOE_Y[s]) + c
        piv = V((A0.x, piv_y, 0.0))
        return piv + Matrix.Rotation(phi, 3, 'X') @ (A0 + V((0, c, 0)) - piv), phi
    if p < BETA:
        u = p / BETA; c = ST / 2 - ST * u
        if u < WK['heel']: phi = WK['phi_hs'] * (1 - u / WK['heel']) ** 2
        elif u > 1 - WK['toe']: phi = -WK['phi_to'] * ((u - (1 - WK['toe'])) / WK['toe']) ** 2
        else: phi = 0.0
        return planted(c, phi)
    s_ = (p - BETA) / (1 - BETA)
    a0, f0 = planted(-ST / 2, -WK['phi_to']); a1, f1 = planted(ST / 2, WK['phi_hs'])
    m = -ST * (1 - BETA) / BETA
    h00, h10, h01, h11 = 2 * s_ ** 3 - 3 * s_ ** 2 + 1, s_ ** 3 - 2 * s_ ** 2 + s_, -2 * s_ ** 3 + 3 * s_ ** 2, s_ ** 3 - s_ ** 2
    y = h00 * a0.y + h10 * m + h01 * a1.y + h11 * m
    z = a0.z + (a1.z - a0.z) * smooth(s_) + WK['lift'] * math.sin(math.pi * s_) ** 1.3
    return V((A0.x, y, z)), f0 + (f1 - f0) * smooth(s_)


def phases(t): return {'L': t % 1.0, 'R': (t + 0.5) % 1.0}


def sway(t): return WK['sway'] * math.sin(2 * math.pi * t)


# 엉덩이 높이: 두 다리가 닿을 수 있는 높이 이하로, 매끈하게(주기 안 96점에서 계산해 둔다)
_NS = 96; _bound = []
for i in range(_NS):
    t = i / _NS; bnd = 0.0
    for s, p in phases(t).items():
        A, _ = foot_plan(p, s); H = V(J['hip' + s]) + V((sway(t), 0, 0))
        dxy2 = (A.x - H.x) ** 2 + (A.y - H.y) ** 2; r = WK['reach'] * LEG_LEN
        bnd = min(bnd, A.z + math.sqrt(max(0.0, r * r - dxy2)) - H.z)
    _bound.append(bnd)
_sm = []
for i in range(_NS):
    acc = wsum = 0.0
    for k in range(-8, 9):
        w = math.exp(-(k / 4.0) ** 2); acc += _bound[(i + k) % _NS] * w; wsum += w
    _sm.append(acc / wsum)
_shift = max(_sm[i] - _bound[i] for i in range(_NS))
HIPS_DZ = [v - max(0.0, _shift) for v in _sm]


def hips_dz(t):
    x = (t % 1.0) * _NS; i = int(x); f = x - i
    return HIPS_DZ[i % _NS] * (1 - f) + HIPS_DZ[(i + 1) % _NS] * f


def walk(t):
    c2 = math.cos(2 * math.pi * t)
    set_hips(sway(t), 0.0, hips_dz(t))
    pb['Hips'].rotation_euler.y = D(5) * c2          # 앞으로 나간 다리 쪽 골반이 앞으로
    pb['Hips'].rotation_euler.x = -D(3)              # 살짝 앞으로 기울임
    pb['Chest'].rotation_euler.y = -D(8) * c2        # 가슴은 반대로
    pb['Head'].rotation_euler.y = D(3) * c2
    pb['Head'].rotation_euler.x = D(3)
    for s, p in phases(t).items():
        sx = 1 if s == 'L' else -1
        A, phi = foot_plan(p, s)
        two_bone('UpperLeg.' + s, 'LowerLeg.' + s, A, V((sx * 0.08, 1, 0)))
        foot_pitch(s, phi)
    for s in ('L', 'R'):
        sw = math.cos(2 * math.pi * (t - (0.5 if s == 'L' else 0.0)))   # 반대쪽 다리가 앞일 때 팔이 앞
        pb['UpperArm.' + s].rotation_euler.x = WK['arm'] * sw
        pb['UpperArm.' + s].rotation_euler.z = (D(3) if s == 'L' else -D(3))
        pb['LowerArm.' + s].rotation_euler.x = D(14) + D(12) * max(0.0, sw)


# ---------------- 서 있기·손짓 ----------------
def idle(t):
    a = 2 * math.pi * t
    pb['Chest'].rotation_euler.x = D(1.6) * math.sin(a)
    pb['Head'].rotation_euler.y = D(5) * math.sin(a * 0.5 + 0.4)
    pb['Head'].rotation_euler.x = D(1.5) * math.sin(a + 1.0)
    for s in ('L', 'R'):
        pb['UpperArm.' + s].rotation_euler.x = D(2) * math.sin(a + 0.8)
        pb['LowerArm.' + s].rotation_euler.x = D(8)


SH = {s: V(J['shoulder' + s]) for s in ('L', 'R')}
SPAN = BL['UpperArm.L'] + BL['LowerArm.L']


def arm_pose(s, target, pole, hand_dir=None):
    two_bone('UpperArm.' + s, 'LowerArm.' + s, target, pole)
    if hand_dir is not None: aim('Hand.' + s, hand_dir)


# 손짓: 오른손을 가슴 앞 옆으로 올려 손바닥을 보이고 흔든다
reset_pose()
pb['Head'].rotation_euler.y = -D(8)
arm_pose('R', SH['R'] + V((-0.28 * SPAN, 0.66 * SPAN, -0.06 * SPAN)), V((-1, -0.2, -0.7)), V((-0.25, 0.55, 0.8)))
pb['LowerArm.L'].rotation_euler.x = D(8)
Q_GEST = quats()


def gesture(t):
    a = 2 * math.pi * t
    up = math.sin(math.pi * t) ** 0.6
    blend_q(Q_GEST, up, ARM_NAMES['R'] + ['Head'])
    pb['Hand.R'].rotation_euler.rotate(Quaternion((0, 1, 0), D(20) * math.sin(3 * a) * up))
    pb['LowerArm.L'].rotation_euler.x = D(8)
    pb['Chest'].rotation_euler.x = D(1.5) * math.sin(a)
    pb['Chest'].rotation_euler.y = -D(4) * up


# 버튼 누르기: 오른손을 앞으로 뻗어(가슴 높이) 한 번 꾹
def press_pose(push):
    reset_pose()
    pb['Spine'].rotation_euler.x = -D(6); pb['Head'].rotation_euler.x = -D(8)
    upd()
    tgt = SH['R'] + V((0.10 * SPAN, (0.80 + 0.12 * push) * SPAN, -0.18 * SPAN))
    arm_pose('R', tgt, V((-1, -0.3, -0.6)), V((0.05, 1, 0.1)))
    pb['LowerArm.L'].rotation_euler.x = D(8)
    return quats()


Q_PRESS = press_pose(0.0); Q_PUSH = press_pose(1.0)


def press(t):
    k = hold(t, 0.3)
    jab = math.sin(math.pi * min(1.0, max(0.0, (t - 0.35) / 0.3)))
    for nm in ARM_NAMES['R'] + ['Spine', 'Head', 'LowerArm.L']:
        set_q(nm, Quaternion().slerp(Q_PRESS[nm].slerp(Q_PUSH[nm], jab), k))


# 보호구 쓰기: 두 손을 머리 옆(눈 높이 위)으로 올렸다가 보안경을 눈으로 끌어내리는 몸짓
def equip_pose(dz):
    reset_pose()
    pb['Head'].rotation_euler.x = D(3)
    for s, sx in (('L', 1), ('R', -1)):
        upd()
        hx = sx * (hr.x * 1.06 + Hd['palm'][0] * 1.15)
        tgt = V((hx, hc.y + 0.42 * hr.y, ez + dz)) - V((0, 0, Hd['palm_d'] + Hd['palm'][2] * 0.25))
        arm_pose(s, tgt, V((sx * 0.7, 0.6, -0.8)), V((sx * -0.2, 0.3, 1)))
    return quats()


Q_EQ_UP = equip_pose(0.30 * hr.z); Q_EQ_DN = equip_pose(0.02 * hr.z)


def equip(t):
    k = hold(t, 0.3)
    g = smooth((t - 0.3) / 0.35)
    for nm in ARM_NAMES['L'] + ARM_NAMES['R'] + ['Head']:
        set_q(nm, Quaternion().slerp(Q_EQ_UP[nm].slerp(Q_EQ_DN[nm], g), k))


# 쪼그려 살펴보기: 발은 제자리, 엉덩이를 내리고 뒤로, 무릎은 바깥으로, 손은 무릎 앞으로
CR = P['crouch']


def crouch_body(k):
    set_hips(0.0, -CR['back'] * k, -CR['down'] * LEG_LEN * k)
    pb['Hips'].rotation_euler.x = -CR['hips'] * k
    pb['Spine'].rotation_euler.x = -CR['spine'] * k
    pb['Chest'].rotation_euler.x = -CR['chest'] * k
    pb['Head'].rotation_euler.x = -CR['head'] * k
    for s, sx in (('L', 1), ('R', -1)):
        two_bone('UpperLeg.' + s, 'LowerLeg.' + s, V(J['ankle' + s]), V((sx * CR['knee_out'], 1, 0)))
        foot_pitch(s, 0.0)


reset_pose(); crouch_body(1.0); upd()
for s, sx in (('L', 1), ('R', -1)):
    kn = pb['LowerLeg.' + s].head
    arm_pose(s, kn + V((sx * 0.02, 0.06 + Hd['palm'][1], 0.03)), V((sx * 1, -0.3, 0.2)), V((sx * 0.1, 0.6, -1)))
Q_CROUCH = quats()


def crouch(t):
    k = hold(t, 0.22)
    crouch_body(k)
    blend_q(Q_CROUCH, k, ARM_NAMES['L'] + ARM_NAMES['R'])


acts = {'Walk': clip('Walk', FPS, walk, step=1), 'Idle': clip('Idle', FPS * 3, idle), 'Gesture': clip('Gesture', FPS * 2, gesture),
        'Crouch': clip('Crouch', int(FPS * 2.4), crouch), 'Press': clip('Press', int(FPS * 1.4), press), 'Equip': clip('Equip', int(FPS * 1.6), equip)}
arm.animation_data.action = acts['Idle']
reset_pose()

# ---------------- 동작 점검(발·뚫림) ----------------
CHECK = {}
_vg = {g.index: g.name for g in body.vertex_groups}
_dom = []
for v in body.data.vertices:
    gs = [(g.weight, _vg[g.group]) for g in v.groups if g.weight > 0]
    _dom.append(max(gs)[1] if gs else '')
ARMV = [i for i, n in enumerate(_dom) if n.startswith(('LowerArm', 'Hand'))]
LEGV = [i for i, n in enumerate(_dom) if n.startswith('UpperLeg')]


def inside_head(p):
    M = pb['Head'].matrix @ arm_data.bones['Head'].matrix_local.inverted()
    q = M.inverted() @ p - hc
    return (q.x / (hr.x * 0.96)) ** 2 + (q.y / (hr.y * 0.96)) ** 2 + (q.z / (hr.z * 0.96)) ** 2 < 1


def inside_torso(p):
    # 몸통을 가슴·배 두 타원체로 어림
    for bn, a, b, rk in (('Chest', 'chest', 'neck', 'chest'), ('Spine', 'spine', 'chest', 'spine')):
        M = pb[bn].matrix @ arm_data.bones[bn].matrix_local.inverted()
        q = M.inverted() @ p; c = (V(J[a]) + V(J[b])) / 2; h = (zj(b) - zj(a)) / 2 + 0.03
        rx, ry = P['R'][rk]
        if ((q.x - c.x) / (rx * 0.92)) ** 2 + ((q.y - c.y) / (ry * 0.92)) ** 2 + ((q.z - c.z) / h) ** 2 < 1: return True
    return False


for nm, act in acts.items():
    arm.animation_data.action = act
    fr = int(act.frame_range[1]); worst = dict(sole_min=9.0, sole_max_low=-9.0, arm_in_head=0, arm_in_torso=0, leg_in_torso=0)
    for f in range(0, fr + 1, 2):
        scene.frame_set(f); upd()
        lows = [min(p.z for p in sole_world(s)) for s in ('L', 'R')]
        worst['sole_min'] = min(worst['sole_min'], min(lows))
        worst['sole_max_low'] = max(worst['sole_max_low'], min(lows))   # 낮은 발이 바닥에서 뜬 최대 높이
        dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); mm = ev.to_mesh()
        co = [v.co.copy() for v in mm.vertices]; ev.to_mesh_clear()
        worst['arm_in_head'] = max(worst['arm_in_head'], sum(1 for i in ARMV if inside_head(co[i])))
        worst['arm_in_torso'] = max(worst['arm_in_torso'], sum(1 for i in ARMV if inside_torso(co[i])))
        worst['leg_in_torso'] = max(worst['leg_in_torso'], sum(1 for i in LEGV if inside_torso(co[i])))
    CHECK[nm] = {k: round(v, 4) if isinstance(v, float) else v for k, v in worst.items()}

# 걷기 한 주기에 나아가야 하는 거리(발이 미끄러지지 않으려면): 내보낼 키를 재생하며
#   (내보내는 키와 같은 1프레임 간격) 바닥에 닿은(밑창 가장 낮은 점이 4 mm 이하) 발마다 '그 순간 가장 낮은 밑창 점'이 다음 순간까지 몸에 대해 뒤로 간 거리를 재고
#   (두 발이 다 닿았으면 평균) 한 주기 동안 더한다. 같은 간격의 순간 속도 범위도 남긴다(일정할수록 미끄러짐이 없다).
arm.animation_data.action = acts['Walk']
NSUB = 1; WALK_MEAS = 0.0; slip = []; prev = None; airborne = 0
for i in range(FPS * NSUB + 1):
    scene.frame_set(i // NSUB, subframe=(i % NSUB) / NSUB); upd()
    cur = {s: sole_world(s) for s in ('L', 'R')}
    if prev is not None:
        dys = []
        for s in ('L', 'R'):
            if min(p.z for p in prev[s]) > 0.004 or min(p.z for p in cur[s]) > 0.004: continue
            k = min(range(len(prev[s])), key=lambda j: prev[s][j].z)
            dys.append(-(cur[s][k].y - prev[s][k].y))
        if dys:
            v = sum(dys) / len(dys); WALK_MEAS += v; slip.append(v)
            if os.environ.get('CHAR_DEBUG'): print('WALKV', i, round(v * NSUB * FPS, 3), [round(min(p.z for p in cur[s_]), 4) for s_ in ('L', 'R')])
        else: airborne += 1
    prev = cur
WALK_DESIGN = ST / BETA
arm.animation_data.action = acts['Idle']; scene.frame_set(0)

# NLA 트랙에 동작을 올려 두면 내보낼 때 각각 하나의 애니메이션이 된다
for nm, act in acts.items():
    tr = arm.animation_data.nla_tracks.new(); tr.name = nm
    tr.strips.new(nm, 0, act)
arm.animation_data.action = None
reset_pose()

root = link(bpy.data.objects.new('Character', None))
arm.parent = root
root.scale = (P['root_scale'],) * 3
upd()

# ---------------- 점검 · 내보내기 ----------------
for o in [body] + list(hair_objs.values()) + [gog]:
    o.data.calc_loop_triangles()
TRI = {o.name: len(o.data.loop_triangles) for o in [body] + list(hair_objs.values()) + [gog]}
RS = P['root_scale']


def zmax(o): return max((o.matrix_world @ v.co).z for v in o.data.vertices)


def zmin(o): return min((o.matrix_world @ v.co).z for v in o.data.vertices)


bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
                          export_cameras=False, export_lights=False, export_skins=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_def_bones=False, export_frame_range=False,
                          export_draco_mesh_compression_enable=False,
                          export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression',
                          export_vertex_color='MATERIAL', export_all_vertex_colors=False)   # 정점색(COLOR_0)은 Detail 재질에만
top_z = max(zmax(body), zmax(hair_objs['Hair_Short']))
MEAS = dict(body=BODY, tris_body=TRI['Body'], tris_hair={k: TRI[k] for k in HAIR},
            tris_body_short=TRI['Body'] + TRI['Hair_Short'], tris_goggles=TRI['Goggles'], file_bytes=os.path.getsize(OUT),
            height_m=round(top_z - zmin(body), 4), head_height_m=round(top_z - (hc.z - hr.z) * RS, 4),
            heads_tall=round((top_z - zmin(body)) / (top_z - (hc.z - hr.z) * RS), 2), eye_height_m=round(EYE_Z * RS, 4),
            shoulder_width_m=round(2 * (P['shoulder'][0] + P['R']['shoulder'][0]) * RS, 3),
            walk_cycle_m=round(WALK_MEAS * RS, 4), walk_cycle_design_m=round(WALK_DESIGN * RS, 4),
            walk_contact_speed_range=[round(min(slip) * NSUB * FPS * RS, 3), round(max(slip) * NSUB * FPS * RS, 3)], walk_airborne_samples=airborne,
            hips_bob_m=round(max(HIPS_DZ) - min(HIPS_DZ), 4),
            materials=sorted({m.name for o in [body, gog] + list(hair_objs.values()) for m in o.data.materials}),
            check=CHECK)
print('MEASURE ' + json.dumps(MEAS, ensure_ascii=False))
print('EXPORTED', OUT, os.path.getsize(OUT))

# ---------------- 미리보기(서 있기 · 걷기 두 순간 · 손짓 · 쪼그리기 · 누르기 · 보호구) ----------------
if PREVIEW:
    world = bpy.data.worlds.new('W'); scene.world = world
    if world.node_tree is None: world.use_nodes = True
    if HDRI:
        nt = world.node_tree; env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDRI)
        nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
    fl = bpy.context.active_object; fl.data.materials.append(material('Floor', '#1e7d4b', rough=0.35))
    sun = link(bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(45), 0, math.radians(200))
    cam = link(bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))); scene.camera = cam
    cam.data.lens = 50
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 700, 1000
    for tr in arm.animation_data.nla_tracks: tr.mute = True
    for nm in HAIR: hair_objs[nm].hide_render = nm != 'Hair_Short'
    Hh_ = P['height'] * RS; k_ = Hh_ / 1.72
    base_, ext = os.path.splitext(PREVIEW)
    shots = [('idle_front', 'Idle', 0, (1.2, 3.6, 1.2)), ('walk_a', 'Walk', 6, (3.6, 0.6, 1.1)), ('walk_b', 'Walk', 18, (3.6, 0.6, 1.1)),
             ('walk_34', 'Walk', 6, (2.4, 2.8, 1.3)), ('gesture', 'Gesture', 24, (1.6, 3.4, 1.3)), ('gesture_side', 'Gesture', 24, (-3.6, 0.6, 1.2)),
             ('crouch_side', 'Crouch', 28, (-3.6, 0.6, 1.0)), ('crouch_34', 'Crouch', 28, (2.2, 2.8, 1.2)), ('press_side', 'Press', 16, (-3.6, 0.6, 1.2)),
             ('equip_front', 'Equip', 19, (1.0, 3.0, 1.5)), ('goggles_face', 'Idle', 0, (0.35, 0.9, 1.62))]
    for tag, an, fr, loc in shots:
        arm.animation_data.action = acts[an]
        scene.frame_set(fr)
        loc = V(loc) * k_
        cam.location = loc
        d = V((0, 0, EYE_Z * RS if tag == 'goggles_face' else Hh_ * 0.53)) - loc
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{base_}_{tag}{ext}'
        bpy.ops.render.render(write_still=True)
        print('RENDERED', scene.render.filepath)
