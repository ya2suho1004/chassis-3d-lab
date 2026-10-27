// 3D 배치 실측 입력(교사) — 실제 실습장에서 잰 크기·거리를 항목마다 적어 3D 임시 배치를 실측값으로 바꾸기 위한 자료를 모은다.
// 기준은 실제로 막힌 두 벽: 북쪽 벽과 동쪽 벽(교사 확인 2026-10-27, 건물 외벽). 서·남쪽은 트여 있어 기준으로 쓰지 않는다.
// 결과는 이 기기 초안(localStorage)과 내려받기 JSON으로만 남고 전송하지 않는다. 받은 값의 반영·layoutConfirmed 결정은 별도.
import { footprintOf, type SceneLayout } from '../scene/layoutModel'
import { buildReviewItems, kstDate, type ReviewItem } from './layoutReview'

export type SurveyField = 'northWallLength' | 'eastWallLength' | 'ceilingHeight' | 'sizeEW' | 'sizeNS' | 'height' | 'northGap' | 'eastGap'

export const FIELD_LABEL: Record<SurveyField, string> = {
  northWallLength: '북쪽 벽 길이 (동쪽 벽 ~ 서쪽 트인 끝)',
  eastWallLength: '동쪽 벽 길이 (북쪽 벽 ~ 남쪽 트인 끝)',
  ceilingHeight: '천장 높이',
  sizeEW: '가로 (동서 방향 길이)',
  sizeNS: '세로 (남북 방향 길이)',
  height: '높이',
  northGap: '북쪽 벽 → 북쪽 끝(면)',
  eastGap: '동쪽 벽 → 동쪽 끝(면)',
}
/** 0이 올 수 있는 칸(벽에 붙어 있음) */
const GAP_FIELDS: SurveyField[] = ['northGap', 'eastGap']

export interface SurveyItem {
  itemId: string
  label: string
  /** 1 실습장 전체 → 2 기둥 → 3 리프트 → 4 그 밖의 장비 → 5 이미 실측한 제동력 구역(확인용) */
  priority: 1 | 2 | 3 | 4 | 5
  fields: SurveyField[]
  /** 지금 3D 임시 배치의 값(m). 모르면 null */
  current: Partial<Record<SurveyField, number | null>>
  basis: string
  review: ReviewItem | null
}

export const PRIORITY_LABEL: Record<SurveyItem['priority'], string> = {
  1: '① 실습장 전체',
  2: '② 기둥',
  3: '③ 리프트',
  4: '④ 그 밖의 장비',
  5: '⑤ 제동력 구역(이미 일부 실측 — 확인용)',
}

const BRAKE_ZONE = ['brake-tester-01', 'brake-control-panel-01', 'brake-record-desk-01', 'toe-gauge-zone-01']
/** 과제마다 자리가 바뀌는 시험 차량은 재지 않는다 */
const SKIP = ['brake-vehicle-01']
const r2 = (n: number) => Math.round(n * 100) / 100

export function buildSurveyItems(layout: SceneLayout): SurveyItem[] {
  const review = new Map(buildReviewItems(layout).map((i) => [i.itemId, i]))
  const m = layout.mainZone
  const room: SurveyItem = {
    itemId: 'room', label: '실습장 전체', priority: 1, fields: ['northWallLength', 'eastWallLength', 'ceilingHeight'], basis: m.basis,
    current: { northWallLength: r2(m.xMax - m.xMin), eastWallLength: r2(m.zMax - m.zMin), ceilingHeight: null },
    review: review.get('wall-north') ?? null,
  }
  const pillars: SurveyItem[] = layout.pillars.map((p, i) => ({
    itemId: p.id, label: `기둥 ${i + 1}`, priority: 2, fields: ['sizeEW', 'sizeNS', 'northGap', 'eastGap'], basis: p.basis,
    current: { sizeEW: p.size, sizeNS: p.size, northGap: r2(p.z - p.size / 2 - m.zMin), eastGap: r2(m.xMax - (p.x + p.size / 2)) },
    review: review.get(p.id) ?? null,
  }))
  const equipment: SurveyItem[] = layout.equipment.filter((e) => !SKIP.includes(e.id)).map((e) => {
    const f = footprintOf(e)
    const priority: SurveyItem['priority'] = BRAKE_ZONE.includes(e.id) ? 5 : e.kind === 'lift' ? 3 : 4
    return {
      itemId: e.id, label: e.label, priority, fields: ['sizeEW', 'sizeNS', 'height', 'northGap', 'eastGap'], basis: e.basis,
      current: { sizeEW: r2(f.xMax - f.xMin), sizeNS: r2(f.zMax - f.zMin), height: e.h, northGap: r2(f.zMin - m.zMin), eastGap: r2(m.xMax - f.xMax) },
      review: review.get(e.id) ?? null,
    }
  })
  return [room, ...pillars, ...equipment].sort((a, b) => a.priority - b.priority)
}

export type Parsed = { ok: true; value: number | null } | { ok: false; reason: string }

/** 길이 입력(m). 빈칸은 null, 쉼표 소수점 허용, 크기는 0보다 커야 하고 벽까지 거리는 0(붙어 있음) 허용, 60 m 초과는 오타로 본다 */
export function parseLength(raw: string, field: SurveyField): Parsed {
  const s = raw.trim().replace(',', '.')
  if (s === '') return { ok: true, value: null }
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, reason: '숫자만(m, 예: 2.35)' }
  const v = Number(s)
  if (v > 60) return { ok: false, reason: '60 m보다 큽니다(cm로 적었나요?)' }
  if (v === 0 && !GAP_FIELDS.includes(field)) return { ok: false, reason: '0보다 커야 합니다' }
  return { ok: true, value: v }
}

export interface SurveyDraft {
  values: Record<string, Partial<Record<SurveyField, string>>>
  notes: Record<string, string>
  tool: string
  generalNotes: string
}
export const emptySurveyDraft = (): SurveyDraft => ({ values: {}, notes: {}, tool: '', generalNotes: '' })

/** 칸 하나라도 올바른 숫자가 있으면 ‘잰 항목’ */
export function surveyProgress(items: SurveyItem[], draft: SurveyDraft): { measuredItems: number; totalItems: number; invalidFields: number } {
  let measured = 0
  let invalid = 0
  for (const i of items) {
    let any = false
    for (const f of i.fields) {
      const p = parseLength(draft.values[i.itemId]?.[f] ?? '', f)
      if (!p.ok) invalid++
      else if (p.value !== null) any = true
    }
    if (any) measured++
  }
  return { measuredItems: measured, totalItems: items.length, invalidFields: invalid }
}

export function buildSurveyResult(layout: SceneLayout, items: SurveyItem[], draft: SurveyDraft, opts: { appVersion: string; now: Date }) {
  const clean = (s: string | undefined) => (s === undefined || s.trim() === '' ? null : s.trim())
  return {
    surveyId: 'layout-survey-3-in-app',
    surveyDateKST: kstDate(opts.now),
    exportedAt: opts.now.toISOString(),
    scope: '실습장 크기와 장비·기둥의 크기·위치 실측(3차). 기준: 북쪽 벽 안쪽 면, 동쪽 벽 안쪽 면',
    units: 'm',
    layoutId: layout.layoutId,
    appVersion: opts.appVersion,
    layoutConfirmed: false,
    tool: clean(draft.tool),
    progress: surveyProgress(items, draft),
    items: items.map((i) => {
      const measured: Partial<Record<SurveyField, number | null>> = {}
      const invalid: Array<{ field: SurveyField; raw: string }> = []
      for (const f of i.fields) {
        const raw = draft.values[i.itemId]?.[f] ?? ''
        const p = parseLength(raw, f)
        measured[f] = p.ok ? p.value : null
        if (!p.ok) invalid.push({ field: f, raw })
      }
      return { itemId: i.itemId, label: i.label, priority: i.priority, basisBefore: i.basis, measured, current: i.current, invalid, note: clean(draft.notes[i.itemId]) }
    }),
    notes: clean(draft.generalNotes),
  }
}
