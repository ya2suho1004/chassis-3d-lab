// AI 정리 평가용 합성 수행 사실(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-5). 실제 학생 자료가 아니다.
// 앱이 보내는 facts와 같은 모양(항목 정오는 불리언, 횟수·초는 정수). 모두 검사를 통과한 수행이다(정리는 통과한 수행만 부른다).
// 두 과제 × 안내 있음·없음, 오류 없음/판독 오류/계산 오류 여러 번/안전 위반/힌트 많이/검사 여러 번/끝까지 틀린 항목/시간 모름을 고루 넣었다.

const BRAKE = ['left', 'right', 'axleWeight', 'deviation', 'sum', 'vehicleCondition']
const TURN = ['leftAngle', 'rightAngle', 'radius', 'vehicleCondition']
/** 모두 맞음에서 시작해 o의 항목만 [처음, 마지막]으로 바꾼다 */
const items = (ids, o = {}) => ids.map((itemId) => ({ itemId, first: o[itemId] ? o[itemId][0] : true, final: o[itemId] ? o[itemId][1] : true }))
const facts = (ids, o = {}) => ({ items: items(ids, o.items), errorTypes: o.errorTypes ?? {}, safetyViolationTypes: o.safetyViolationTypes ?? {}, hintCount: o.hintCount ?? 0, npcInspectionCount: o.npcInspectionCount ?? 1, durationSeconds: o.durationSeconds === undefined ? 420 : o.durationSeconds })

export const DEBRIEF_CASES = [
  { id: 'D01', title: '제동력 · 오류 없이 한 번에', taskId: 'braking-force', mode: 'guided', facts: facts(BRAKE, { durationSeconds: 312 }) },
  { id: 'D02', title: '제동력 · 판독 하나 틀렸다 고침', taskId: 'braking-force', mode: 'unguided', facts: facts(BRAKE, { items: { right: [false, true] }, errorTypes: { reading: 1 }, npcInspectionCount: 2, durationSeconds: 400 }) },
  { id: 'D03', title: '제동력 · 계산에서 여러 번 막힘, 힌트', taskId: 'braking-force', mode: 'unguided', facts: facts(BRAKE, { items: { deviation: [false, true], sum: [false, true] }, errorTypes: { calc: 4 }, hintCount: 2, npcInspectionCount: 3, durationSeconds: 655 }) },
  { id: 'D04', title: '제동력 · 안전 위반과 작업 순서', taskId: 'braking-force', mode: 'guided', facts: facts(BRAKE, { errorTypes: { order: 2 }, safetyViolationTypes: { 's-ppe': 1, 's-accel': 1 }, durationSeconds: 380 }) },
  { id: 'D05', title: '제동력 · 힌트를 많이 씀(답은 모두 맞음)', taskId: 'braking-force', mode: 'guided', facts: facts(BRAKE, { hintCount: 6, durationSeconds: 540 }) },
  { id: 'D06', title: '제동력 · 판정 틀렸다 고침, 검사 여러 번', taskId: 'braking-force', mode: 'unguided', facts: facts(BRAKE, { items: { vehicleCondition: [false, true] }, errorTypes: { verdict: 2 }, npcInspectionCount: 4, durationSeconds: 720 }) },
  { id: 'D07', title: '제동력 · 끝까지 틀린 계산 항목', taskId: 'braking-force', mode: 'unguided', facts: facts(BRAKE, { items: { deviation: [false, false] }, errorTypes: { calc: 3, format: 1 }, hintCount: 1, npcInspectionCount: 2, durationSeconds: 610 }) },
  { id: 'D08', title: '최소회전반경 · 오류 없이 한 번에', taskId: 'min-turning-radius', mode: 'guided', facts: facts(TURN, { durationSeconds: 245 }) },
  { id: 'D09', title: '최소회전반경 · 조향각 판독 두 개 틀림, 시동 확인 놓침', taskId: 'min-turning-radius', mode: 'unguided', facts: facts(TURN, { items: { leftAngle: [false, true], rightAngle: [false, true] }, errorTypes: { reading: 2 }, safetyViolationTypes: { 's-engine': 1 }, npcInspectionCount: 2, durationSeconds: 470 }) },
  { id: 'D10', title: '최소회전반경 · 계산 끝까지 틀림, 판정 고침, 힌트·검사 많이', taskId: 'min-turning-radius', mode: 'unguided', facts: facts(TURN, { items: { radius: [false, false], vehicleCondition: [false, true] }, errorTypes: { calc: 2, verdict: 1, format: 1 }, hintCount: 4, npcInspectionCount: 3, durationSeconds: 830 }) },
  { id: 'D11', title: '최소회전반경 · 시간 모름, 처음 답 없이 고침', taskId: 'min-turning-radius', mode: 'guided', facts: facts(TURN, { items: { radius: [null, true] }, hintCount: 1, durationSeconds: null }) },
]
