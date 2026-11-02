// 인트로(로고·셔터)·로딩 화면(설계 docs/superpowers/specs/2026-11-03-intro-loading-design.md)
// 화면 설정만 이 기기 localStorage에 둔다. 연구 기록과 무관하다.

export interface IntroPrefs {
  /** 이 기기에서 인트로를 한 번 이상 본 적 있음(다음부터 로고 생략) */
  seen: boolean
  /** 교사가 이 기기에서 시작 영상을 끔 */
  off: boolean
}
export type IntroPlan = 'none' | 'short' | 'full'

export const INTRO_KEY = 'chassis.intro.v1'
export const DEFAULT_INTRO_PREFS: IntroPrefs = { seen: false, off: false }

/** 끔·움직임 줄이기 → 없음, 처음 → 로고부터, 본 적 있음 → 타이틀부터 */
export function introPlan(p: IntroPrefs, reducedMotion: boolean): IntroPlan {
  if (p.off || reducedMotion) return 'none'
  return p.seen ? 'short' : 'full'
}

export function parseIntroPrefs(raw: string | null): IntroPrefs {
  if (!raw) return { ...DEFAULT_INTRO_PREFS }
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    return { seen: v?.seen === true, off: v?.off === true }
  } catch {
    return { ...DEFAULT_INTRO_PREFS }
  }
}

export function loadIntroPrefs(): IntroPrefs {
  try { return parseIntroPrefs(localStorage.getItem(INTRO_KEY)) } catch { return { ...DEFAULT_INTRO_PREFS } }
}

export function saveIntroPrefs(p: IntroPrefs): boolean {
  try { localStorage.setItem(INTRO_KEY, JSON.stringify(p)); return true } catch { return false }
}

/** 인트로가 도는 동안 미리 받아 둘 3D 모델(실습장 진입 때 캐시를 쓴다). public/assets/models의 glb 전부 */
export const PRELOAD_MODELS = [
  'abs-panel', 'avante', 'brake-tester', 'character', 'character-b', 'dial-gauge', 'dial-gauge-b', 'dial-gauge-h', 'diff-carrier',
  'disc-fixture', 'k3', 'pride', 'scissor-lift', 'shock-stand', 'test-car', 'tire-changer', 'transmission-simulator', 'wheel-balancer',
].map((n) => `${n}.glb`)

/** 로딩 화면 팁. 일반 팁은 어느 모드에서나 보인다(작업 순서·장비 조작을 알려 주지 않음) */
const GENERAL_TIPS = [
  '실제 장비는 반드시 선생님 확인을 받은 뒤에 만집니다.',
  '장비를 눌러 도감을 채우면 실습장 배치를 익힐 수 있어요.',
  '작업지시서를 꼼꼼히 읽으면 무엇을 측정할지 알 수 있습니다.',
  '측정값은 눈금을 정면에서 읽어야 오차가 줄어요.',
  '화면을 끌면 시점을 돌릴 수 있고, 🎥 버튼으로 시점을 바꿀 수 있어요.',
]
/** 안내 있음에서만 보이는 순서·안전 팁(과제 단계 문구에서 가져옴) */
const GUIDED_TIPS = [
  '실습 시작 전에 보호구(안전화·보안경) 착용부터 확인합니다.',
  '회전반경 측정판에서는 시동이 꺼져 있는지 확인한 뒤 핸들을 돌립니다.',
  '최소회전반경은 바깥쪽 바퀴의 조향각으로 계산합니다.',
  '제동력을 잴 때는 가속 페달을 밟지 않고, 브레이크 페달을 서서히 끝까지 밟습니다.',
  '리프트를 내리기 전에는 주변을 먼저 확인합니다.',
]
const AI_TIPS = ['AI 교관의 답이 틀릴 수도 있어요. 실제 장비 앞에서는 선생님 지시를 따릅니다.']

export function tipsFor(o: { guided: boolean; aiAvailable: boolean }): string[] {
  return [...(o.guided ? GUIDED_TIPS : []), ...GENERAL_TIPS, ...(o.aiAvailable ? AI_TIPS : [])]
}
