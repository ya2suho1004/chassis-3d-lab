// 캐릭터 만들기·닉네임(설계 docs/superpowers/specs/2026-11-03-character-creation-design.md)
// 화면 표시용이다. 이 기기 localStorage에 익명 코드별로만 두고, 연구 기록·서버·AI 요청에는 넣지 않는다.
// 닉네임은 정해진 낱말 두 개를 붙여 만든다(직접 입력 없음 — 실명·욕설이 들어갈 수 없게).

export type BodyType = 'a' | 'b'
export type HairStyle = 'short' | 'fringe' | 'bob' | 'tied'

export interface AvatarProfile {
  body: BodyType
  hairStyle: HairStyle
  hairColor: string
  skin: string
  eye: string
  nickFront: string
  nickBack: string
}

export interface Choice<T extends string = string> { id: T; label: string }

/** 화면에는 성별 대신 '체형 1·2'로만 보인다. scale은 모델 키 비율(1.62/1.72) */
export const BODIES: Array<Choice<BodyType> & { scale: number }> = [
  { id: 'a', label: '체형 1', scale: 1 },
  { id: 'b', label: '체형 2', scale: 1.62 / 1.72 },
]
/** 모델 안 머리 부품 이름(scripts/blender/build_character.py) */
export const HAIR_STYLES: Array<Choice<HairStyle> & { node: string }> = [
  { id: 'short', label: '짧은 머리', node: 'Hair_Short' },
  { id: 'fringe', label: '앞머리', node: 'Hair_Fringe' },
  { id: 'bob', label: '단발', node: 'Hair_Bob' },
  { id: 'tied', label: '묶은 머리', node: 'Hair_Tied' },
]
export const HAIR_COLORS: Choice[] = [
  { id: '#1e1a17', label: '검정' }, { id: '#3b2a20', label: '흑갈색' }, { id: '#6b4a32', label: '갈색' },
  { id: '#9a7350', label: '밝은 갈색' }, { id: '#7a7d82', label: '회색' },
]
export const SKINS: Choice[] = [
  { id: '#f1d2b8', label: '밝은 톤' }, { id: '#e2b796', label: '보통 톤' }, { id: '#c9966f', label: '황갈 톤' },
  { id: '#9c6a48', label: '갈색 톤' }, { id: '#6a4430', label: '짙은 톤' },
]
export const EYES: Choice[] = [
  { id: '#121212', label: '검정' }, { id: '#4a2e1d', label: '갈색' }, { id: '#5b5a4a', label: '회갈색' }, { id: '#2f4f73', label: '파랑' },
]
export const NICK_FRONT = ['꼼꼼한', '든든한', '재빠른', '침착한', '반짝이는', '씩씩한', '정확한', '성실한', '용감한', '날렵한', '차분한', '번개같은']
export const NICK_BACK = ['토크렌치', '스패너', '드라이버', '다이얼게이지', '버니어캘리퍼스', '타이어', '브레이크', '핸들', '엔진', '리프트', '잭', '정비사']

export const DEFAULT_PROFILE: AvatarProfile = {
  body: 'a', hairStyle: 'short', hairColor: HAIR_COLORS[0]!.id, skin: SKINS[1]!.id, eye: EYES[0]!.id,
  nickFront: NICK_FRONT[0]!, nickBack: NICK_BACK[0]!,
}

export const AVATAR_KEY = 'chassis.avatar.v1'

export function nicknameOf(p: Pick<AvatarProfile, 'nickFront' | 'nickBack'>): string {
  return `${p.nickFront} ${p.nickBack}`
}

/** 앞말·뒷말을 하나씩 무작위로(rand는 시험용으로 바꿀 수 있다) */
export function randomNickname(rand: () => number = Math.random): Pick<AvatarProfile, 'nickFront' | 'nickBack'> {
  const pick = (xs: string[]) => xs[Math.min(xs.length - 1, Math.floor(rand() * xs.length))]!
  return { nickFront: pick(NICK_FRONT), nickBack: pick(NICK_BACK) }
}

const has = (xs: Array<{ id: string }>, v: unknown) => typeof v === 'string' && xs.some((x) => x.id === v)

/** 저장값 하나를 검사한다. 목록에 없는 값이 하나라도 있으면 null(다시 만들게 함) */
export function parseProfile(v: unknown): AvatarProfile | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (!has(BODIES, o.body) || !has(HAIR_STYLES, o.hairStyle) || !has(HAIR_COLORS, o.hairColor) || !has(SKINS, o.skin) || !has(EYES, o.eye)) return null
  if (typeof o.nickFront !== 'string' || !NICK_FRONT.includes(o.nickFront)) return null
  if (typeof o.nickBack !== 'string' || !NICK_BACK.includes(o.nickBack)) return null
  return { body: o.body as BodyType, hairStyle: o.hairStyle as HairStyle, hairColor: o.hairColor as string, skin: o.skin as string, eye: o.eye as string, nickFront: o.nickFront, nickBack: o.nickBack }
}

/** 저장소 전체(코드 → 프로필)를 읽어 쓸 수 있는 것만 남긴다 */
export function parseAvatarStore(raw: string | null): Record<string, AvatarProfile> {
  if (!raw) return {}
  let v: unknown
  try { v = JSON.parse(raw) } catch { return {} }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {}
  const out: Record<string, AvatarProfile> = {}
  for (const [code, p] of Object.entries(v as Record<string, unknown>)) {
    const ok = parseProfile(p)
    if (ok) out[code] = ok
  }
  return out
}

export function loadAvatar(code: string): AvatarProfile | null {
  try { return parseAvatarStore(localStorage.getItem(AVATAR_KEY))[code] ?? null } catch { return null }
}

/** 저장 성공 여부(사파리 개인 정보 보호 모드 등에서는 실패할 수 있음 — 실패해도 이번 수행은 그대로 진행) */
export function saveAvatar(code: string, p: AvatarProfile): boolean {
  try {
    const all = parseAvatarStore(localStorage.getItem(AVATAR_KEY))
    all[code] = p
    localStorage.setItem(AVATAR_KEY, JSON.stringify(all))
    return true
  } catch { return false }
}

export function bodyScale(b: BodyType): number {
  return BODIES.find((x) => x.id === b)?.scale ?? 1
}
