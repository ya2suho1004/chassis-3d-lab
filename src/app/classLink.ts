// 수업 주소(설계 docs/superpowers/specs/2026-11-14-student-number-and-class-link-design.md §3-4).
// 교사가 ① 수업 전에서 저장한 설정을 주소의 # 뒤에 담아 학생 기기(학생마다 한 대)에 링크·QR로 전달한다.
// - # 뒤 값은 서버 요청에 실리지 않는다. 개인 정보는 담지 않는다(세션·과제 사례·차시·도움 방식·차량 진입 방향뿐).
// - 형식: #v=1&s=<세션>&t=<과제 사례>&p=<차시 p|r|o>&m=<도움 방식 g|u>&d=<진입 n|s|x>. v는 이 주소 형식의 판이다.
//   형식을 바꾸면 v를 올린다. 판이 다른 주소는 적용하지 않는다.
// - 읽을 때 parsePreset과 같은 검사를 거친다(모르는 값·잠긴 세션은 버림, 세션이 정한 차시·도움 방식은 주소로 못 바꿈).
// - 전체 주소는 QR 한도(106바이트) 안이어야 한다. 주소 값은 학생이 손으로 고칠 수 있다 — 보안 장치가 아니다(설계 §5).
import type { UsagePhase } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'
import { QR_MAX_BYTES } from '../teacher/qr'
import { parsePreset, type TeacherPreset } from './teacherPreset'

export const CLASS_LINK_FORMAT = '1'
/** 전체 주소 길이 한도(QR 버전 6·M·바이트 방식) */
export const CLASS_LINK_MAX = QR_MAX_BYTES

const PHASE: Record<UsagePhase, string> = { preview: 'p', review: 'r', other: 'o' }
const MODE: Record<'guided' | 'unguided', string> = { guided: 'g', unguided: 'u' }
const DIR: Record<'north' | 'south' | 'none', string> = { north: 'n', south: 's', none: 'x' }
const KEYS = ['v', 's', 't', 'p', 'm', 'd'] as const
const back = <T extends string>(map: Record<T, string>, code: string | undefined): T | undefined =>
  (Object.keys(map) as T[]).find((k) => map[k] === code)

const bytes = (s: string) => new TextEncoder().encode(s).length

/** 설정을 담은 학생용 주소. base의 # 값은 뗀다. 106바이트를 넘으면 null(QR로 만들 수 없음) */
export function classLinkUrl(base: string, p: TeacherPreset): string | null {
  const mode = p.difficultyMode === 'unguided' ? 'unguided' : 'guided'
  const hash = `v=${CLASS_LINK_FORMAT}&s=${encodeURIComponent(p.sessionCode)}&t=${encodeURIComponent(p.caseId)}&p=${PHASE[p.usagePhase]}&m=${MODE[mode]}&d=${DIR[p.vehicleEntryDirection ?? 'none']}`
  const url = `${base.split('#')[0]}#${hash}`
  return bytes(url) <= CLASS_LINK_MAX ? url : null
}

export type ClassLinkRead =
  | { kind: 'none' }
  | { kind: 'ok'; preset: TeacherPreset }
  /** format: 모르는 칸·겹친 칸·깨진 글자, version: 판이 다름, value: 모르는 값·잠긴 세션, length: 106자 넘음 */
  | { kind: 'bad'; reason: 'format' | 'version' | 'value' | 'length' }

/** 주소 전체를 받아 # 뒤 수업 설정을 읽는다(순수 함수) */
export function readClassLink(href: string, knownCaseIds: string[]): ClassLinkRead {
  const at = href.indexOf('#')
  const hash = at < 0 ? '' : href.slice(at + 1)
  if (hash === '') return { kind: 'none' }
  if (bytes(href) > CLASS_LINK_MAX) return { kind: 'bad', reason: 'length' }
  const got: Record<string, string> = {}
  for (const part of hash.split('&')) {
    const eq = part.indexOf('=')
    if (eq < 0) return { kind: 'bad', reason: 'format' }
    const k = part.slice(0, eq)
    let v: string
    try { v = decodeURIComponent(part.slice(eq + 1)) } catch { return { kind: 'bad', reason: 'format' } }
    if (!(KEYS as readonly string[]).includes(k) || k in got) return { kind: 'bad', reason: 'format' }
    got[k] = v
  }
  if (got.v !== CLASS_LINK_FORMAT) return { kind: 'bad', reason: 'version' }
  if (KEYS.some((k) => got[k] === undefined)) return { kind: 'bad', reason: 'format' }
  const usagePhase = back(PHASE, got.p)
  const difficultyMode: DifficultyMode | undefined = back(MODE, got.m)
  const dir = back(DIR, got.d)
  if (!usagePhase || !difficultyMode || !dir) return { kind: 'bad', reason: 'value' }
  const preset = parsePreset(JSON.stringify({ sessionCode: got.s, caseId: got.t, usagePhase, difficultyMode, vehicleEntryDirection: dir === 'none' ? null : dir }), knownCaseIds)
  return preset ? { kind: 'ok', preset } : { kind: 'bad', reason: 'value' }
}

export type ClassLinkTaken = { kind: 'none' } | { kind: 'ok'; preset: TeacherPreset; saved: boolean } | Extract<ClassLinkRead, { kind: 'bad' }>

/**
 * 앱이 열릴 때 한 번: 수업 주소면 설정을 기기에 저장하고 주소의 # 값을 지운다(? 값은 둔다).
 * 읽지 못하면 저장하지 않고(이전 설정 그대로) # 값도 둔다 — 시작 화면이 안내를 보이고, 새로고침해도 안내가 남는다.
 * 저장하지 못하면(브라우저 저장 제한) 이번 화면에서만 쓰고 # 값을 남겨 다시 열 때 또 적용한다.
 */
export function takeClassLink(env: { href: string; save: (p: TeacherPreset) => boolean; replaceState: (url: string) => void }, knownCaseIds: string[]): ClassLinkTaken {
  const r = readClassLink(env.href, knownCaseIds)
  if (r.kind !== 'ok') return r
  const saved = env.save(r.preset)
  if (saved) env.replaceState(env.href.split('#')[0]!)
  return { kind: 'ok', preset: r.preset, saved }
}

/** 화면이 쓸 교사 설정: 기기에 저장하지 못한 수업 주소 설정이 있으면 그것, 아니면 기기에 저장된 설정(load) */
export function screenPreset(link: ClassLinkTaken | undefined, load: () => TeacherPreset | null): TeacherPreset | null {
  return link?.kind === 'ok' && !link.saved ? link.preset : load()
}
