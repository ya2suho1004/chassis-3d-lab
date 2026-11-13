// 연구용 내려받기 묶음(B1, 2026-11-09) — 이미 모은 기록을 풀어 쓴다. 새로 모으는 자료 없음. 원본은 고치지 않는다(05 §11).
// 재생성 순서: 정본 읽기 → 구조 검사 → 해시 대조 → 중복·충돌·손상 분리 → 요약·항목·사건 표. 분리한 줄은 조용히 빼지 않고 problems.csv와 건수에 남긴다.
// 대표 수행을 고르지 않는다(B2 결정 전). AI 대화는 넣지 않는다(자유 문장 처리 규칙을 정하기 전).
import { payloadHash } from '../delivery/jcs'
import type { RecordPayload } from '../domain/record'
import { csvCell, SUMMARY_CSV_HEADER, serverRowEnvelope, toSummaryCsv } from './csv'
import type { DeliveryEnvelope } from './types'

export const RESEARCH_BUNDLE_VERSION = '1.0.0'

export interface BundleRow { recordId: string; payloadJson: string; envelope: DeliveryEnvelope; expectedHash: string | null }
export type ProblemCode = 'JSON_BROKEN' | 'STRUCTURE_INVALID' | 'RECORD_ID_MISMATCH' | 'HASH_MISMATCH' | 'DUPLICATE_RECORD_ID'
export interface BundleInput { source: 'device' | 'server'; scope: string; generatedAtIso: string; rows: BundleRow[] }
export interface BundleCounts { received: number; usable: number; problem: number; hashChecked: number; answerRows: number; eventRows: number; calculatorRows: number }
export interface ResearchBundle { files: Array<{ name: string; text: string }>; counts: BundleCounts }

export function deviceRows(records: Array<{ payload: RecordPayload; envelope: DeliveryEnvelope }>): BundleRow[] {
  return records.map((r) => ({ recordId: r.payload.recordId, payloadJson: JSON.stringify(r.payload), envelope: r.envelope, expectedHash: r.envelope.payloadHash }))
}

export function serverRows(rows: Array<{ record_id: string; receipt_id: string; accepted_at: string; payload_hash: string; payload_json: string }>): BundleRow[] {
  return rows.map((r) => ({ recordId: r.record_id, payloadJson: r.payload_json, envelope: serverRowEnvelope(r), expectedHash: r.payload_hash }))
}

const RUN_COLUMNS: Array<[string, (p: RecordPayload) => unknown]> = [
  ['recordId', (p) => p.recordId], ['anonymousStudentCode', (p) => p.anonymousStudentCode], ['classConditionCode', (p) => p.classConditionCode], ['sessionCode', (p) => p.sessionCode],
  ['taskId', (p) => p.taskId], ['difficultyMode', (p) => p.difficultyMode], ['usagePhase', (p) => p.usagePhase], ['attemptRole', (p) => p.attemptRole],
  ['retryOfRecordId', (p) => p.retryOfRecordId], ['retryCount', (p) => p.retryCount], ['runPurpose', (p) => p.runPurpose], ['researchEligible', (p) => p.researchEligible],
  ['completionStatus', (p) => p.completionStatus], ['schemaVersion', (p) => p.schemaVersion],
]
const ANSWER_FIELDS = ['itemKind', 'itemId', 'unit', 'presentedValue', 'computedReferenceValue', 'firstInput', 'firstAnswer', 'firstCorrect', 'firstStatus', 'finalInput', 'finalAnswer', 'finalCorrect', 'finalStatus'] as const
const EVENT_FIELDS = ['eventId', 'sequence', 'elapsedMs', 'type', 'stepId', 'actionId', 'reasonCode', 'itemId', 'feedbackKey', 'feedbackKind', 'fromDisplayMode', 'toDisplayMode'] as const
export const ANSWERS_CSV_HEADER = [...RUN_COLUMNS.map(([k]) => k), ...ANSWER_FIELDS]
export const EVENTS_CSV_HEADER = [...RUN_COLUMNS.map(([k]) => k), ...EVENT_FIELDS]
const CALCULATOR_FIELDS = ['sequence', 'elapsedMs', 'stepId', 'kind', 'expression', 'result', 'error'] as const
export const CALCULATOR_CSV_HEADER = [...RUN_COLUMNS.map(([k]) => k), ...CALCULATOR_FIELDS]
const PROBLEMS_CSV_HEADER = ['recordId', 'problem', 'detail']

/** 응답 상태: 값이 없으면 미응답, 값은 있는데 채점 안 됐으면 미채점 */
function status(value: string | null, correct: boolean | null): 'unanswered' | 'ungraded' | 'correct' | 'incorrect' {
  if (value === null) return 'unanswered'
  if (correct === null) return 'ungraded'
  return correct ? 'correct' : 'incorrect'
}

function answerRows(p: RecordPayload): Array<Record<(typeof ANSWER_FIELDS)[number], unknown>> {
  return [
    ...p.measurementInputs.map((i) => ({ itemKind: 'measurement', itemId: i.itemId, unit: i.unit, presentedValue: i.presentedValue, computedReferenceValue: null, firstInput: i.firstInput, firstAnswer: null, firstCorrect: i.firstCorrect, firstStatus: status(i.firstInput, i.firstCorrect), finalInput: i.finalInput, finalAnswer: null, finalCorrect: i.finalCorrect, finalStatus: status(i.finalInput, i.finalCorrect) })),
    ...p.calculationAnswers.map((i) => ({ itemKind: 'calculation', itemId: i.itemId, unit: i.unit, presentedValue: null, computedReferenceValue: i.computedReferenceValue, firstInput: i.firstInput, firstAnswer: null, firstCorrect: i.firstCorrect, firstStatus: status(i.firstInput, i.firstCorrect), finalInput: i.finalInput, finalAnswer: null, finalCorrect: i.finalCorrect, finalStatus: status(i.finalInput, i.finalCorrect) })),
    ...p.judgmentAnswers.map((i) => ({ itemKind: 'judgment', itemId: i.itemId, unit: null, presentedValue: null, computedReferenceValue: null, firstInput: null, firstAnswer: i.firstAnswer, firstCorrect: i.firstCorrect, firstStatus: status(i.firstAnswer, i.firstCorrect), finalInput: null, finalAnswer: i.finalAnswer, finalCorrect: i.finalCorrect, finalStatus: status(i.finalAnswer, i.finalCorrect) })),
  ]
}

const isObj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)
function structureOk(p: any): boolean {
  return isObj(p) && typeof p.recordId === 'string' && isObj(p.versions) && isObj(p.timing) && isObj(p.errorTypes) && isObj(p.safetyViolationTypes)
    && [p.measurementInputs, p.calculationAnswers, p.judgmentAnswers, p.stepEvents, p.experiencedDisplayModes].every(Array.isArray)
    && (p.calculatorLog === undefined || (Array.isArray(p.calculatorLog) && p.calculatorLog.every(isObj)))
}

const csv = (header: readonly string[], rows: unknown[][]) => '﻿' + [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n'

export async function buildResearchBundle(input: BundleInput): Promise<ResearchBundle> {
  const seen = new Map<string, number>()
  for (const r of input.rows) seen.set(r.recordId, (seen.get(r.recordId) ?? 0) + 1)
  const problems: unknown[][] = []
  const usable: Array<{ payload: RecordPayload; envelope: DeliveryEnvelope }> = []
  let hashChecked = 0
  for (const row of input.rows) {
    const flag = (code: ProblemCode, detail: string) => problems.push([row.recordId, code, detail])
    if ((seen.get(row.recordId) ?? 0) > 1) { flag('DUPLICATE_RECORD_ID', '같은 수행 번호가 여러 줄 — 원본을 비교해 판단'); continue }
    let parsed: unknown
    try { parsed = JSON.parse(row.payloadJson) } catch { flag('JSON_BROKEN', '원본 글을 읽을 수 없음'); continue }
    if (!structureOk(parsed)) { flag('STRUCTURE_INVALID', '필수 칸이 없거나 형식이 다름'); continue }
    const payload = parsed as RecordPayload
    if (payload.recordId !== row.recordId) { flag('RECORD_ID_MISMATCH', `원본 안의 번호 ${payload.recordId}`); continue }
    if (row.expectedHash) {
      const actual = await payloadHash(payload).catch(() => null)
      if (actual !== row.expectedHash) { flag('HASH_MISMATCH', '원본 내용과 접수 해시가 다름'); continue }
      hashChecked++
    }
    usable.push({ payload, envelope: row.envelope })
  }
  const answers = usable.flatMap(({ payload: p }) => answerRows(p).map((a) => [...RUN_COLUMNS.map(([, f]) => f(p)), ...ANSWER_FIELDS.map((k) => a[k])]))
  const events = usable.flatMap(({ payload: p }) => p.stepEvents.map((e) => [...RUN_COLUMNS.map(([, f]) => f(p)), ...EVENT_FIELDS.map((k) => e[k])]))
  const calcs = usable.flatMap(({ payload: p }) => (p.calculatorLog ?? []).map((c) => [...RUN_COLUMNS.map(([, f]) => f(p)), ...CALCULATOR_FIELDS.map((k) => c[k] ?? null)]))
  const counts: BundleCounts = { received: input.rows.length, usable: usable.length, problem: problems.length, hashChecked, answerRows: answers.length, eventRows: events.length, calculatorRows: calcs.length }
  const jsonl = input.rows.map((r) => JSON.stringify({ source: input.source, recordId: r.recordId, receiptId: r.envelope.receiptId, acceptedAt: r.envelope.uploadedAt, uploadStatus: r.envelope.uploadStatus, payloadHash: r.expectedHash, payloadJson: r.payloadJson })).join('\n')
  return {
    counts,
    files: [
      { name: 'README.txt', text: '﻿' + readme(input, counts, usable.map((u) => u.payload)) },
      { name: 'records.jsonl', text: jsonl ? `${jsonl}\n` : '' },
      { name: 'summary.csv', text: toSummaryCsv(usable) },
      { name: 'answers.csv', text: csv(ANSWERS_CSV_HEADER, answers) },
      { name: 'events.csv', text: csv(EVENTS_CSV_HEADER, events) },
      { name: 'calculator.csv', text: csv(CALCULATOR_CSV_HEADER, calcs) },
      { name: 'problems.csv', text: csv(PROBLEMS_CSV_HEADER, problems) },
    ],
  }
}

function tally(payloads: RecordPayload[], f: (p: RecordPayload) => string): string {
  const m = new Map<string, number>()
  for (const p of payloads) m.set(f(p), (m.get(f(p)) ?? 0) + 1)
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k} ${n}`).join(', ') || '없음'
}

function readme(input: BundleInput, c: BundleCounts, payloads: RecordPayload[]): string {
  const summaryNotes: Record<string, string> = {
    recordId: '수행 번호. 모든 표를 잇는 열쇠', schemaVersion: '기록 형식 판', anonymousStudentCode: '가명 코드(대응표와 이어질 수 있어 완전 익명이 아니다)', classConditionCode: '조건 코드', sessionCode: '수업 세션', sessionSnapshotId: '수업 설정 스냅샷 번호',
    taskId: '과제(braking-force 제동력, min-turning-radius 최소회전반경)', difficultyMode: '도움 방식(guided 안내 있음, unguided 안내 없음, timedAssessment 시간제한)', attemptRole: '수행 역할(practice 연습, primary 본 수행, remediation 보완)', runPurpose: 'demo 시연·시험, research 연구', usagePhase: '차시(preview 1~2차시 연습, review 5차시 정리, other 그 밖)',
    researchEligible: '과제·기준·배치·연구사용 승인이 모두 있고 research이며 완료·NPC 통과일 때만 true. 기관 승인·동의를 대신하지 않는다', completionStatus: 'completed 완료, aborted 중단', retryOfRecordId: '다시 한 수행이면 앞 수행 번호', retryCount: '다시 한 횟수',
    displayMode: '처음 화면 방식(threeD, diagram)', experiencedDisplayModes: '겪은 화면 방식(|로 구분)', startedAt: '시작 시각(UTC, 기기 시계)', completedAt: '확정 시각(UTC, 기기 시계)', durationSeconds: '마지막 사건까지 경과 초. completedAt−startedAt이 아니다',
    pauseCount: '멈춤 횟수', resumeCount: '이어 하기 횟수', timeQuality: '시간 품질(continuous 연속, resumed 이어 함, uncertain 불확실)',
    taskDefinitionVersion: '과제 정의 판', rulesetVersion: '판정 기준 판', measurementSetVersion: '측정값 묶음 판', layoutVersion: '배치 판', judgeEngineVersion: '판정 엔진 판. 계산 채점 규칙 변경(2026-11-10)은 이 판이 아니라 clientAppVersion으로 가른다(읽는 규칙 참고)', sessionConfigVersion: '세션 설정 판', researchProtocolVersion: '연구 절차 판', feedbackPolicyVersion: '피드백 정책 판',
    errorCount: '비안전 학습 오류 수', errorTypes: '오류 종류:횟수', safetyViolationCount: '안전 위반 수', safetyViolationTypes: '안전 위반 종류:횟수', hintCount: '학생이 요청한 힌트 수. 자동 피드백은 세지 않는다(사건 표의 feedbackShown)',
    vehicleVerdict: '기준으로 계산한 실제 차량 판정(pass/fail). 학생 답이 아니다', judgmentCorrect: '판정 항목의 최초 답이 모두 정답이면 true', firstCorrectCount: '최초 답 정답 항목 수', finalCorrectCount: '최종 답 정답 항목 수', requiredCount: '응답 항목 수', unansweredFirstCount: '최초 답이 채점되지 않은 항목 수',
    npcInspectionResult: '마지막 NPC 검사(passed, needsCorrection, notCompleted)', npcInspectionCount: 'NPC 검사 횟수', eventCount: '사건 수', clientAppVersion: '앱 판(기본 판+빌드 커밋). 0.3.1-demo부터 계산 답을 다시 절사하지 않고 채점, 0.3.2-demo부터 계산기, 0.3.3-demo부터 실습장 조명·바닥 겉모습이 달라짐(채점·기록은 같음), 0.3.4-demo부터 안내 있음에만 목적지 표식이 생기고, 두 도움 방식 모두 조작 반응·소리(처음엔 꺼짐, 켰는지는 기록에 없음)가 늘어남(채점·기록은 같음), 0.3.5-demo부터 캐릭터 겉모습(머리가 큰 비례, 학생 키 1.45 m)과 걷기(출발·멈춤에 약 0.2초의 가속·감속, 눌러 가는 경로가 곧아짐)가 달라짐(최고 속도 1.6 m/s와 채점·기록은 같음, 이동 한 번의 소요 시간이 약 0.2초 늘 수 있음). 이어 하기로 이어진 수행은 처음 시작한 판이 남는다',
    localSaveStatus: '기기 저장 상태', uploadStatus: '전송 상태. 학습 성과와 무관', uploadedAt: '서버 접수 시각', receiptId: '접수번호. 내용 접수 확인일 뿐 신원·정답·적격의 증명이 아니다', payloadHash: '원본 해시(JCS+SHA-256)',
  }
  return [
    '섀시 가상 실습장 연구용 내려받기 묶음 설명서', '',
    '[주의 — 연구자 전용]',
    '- 여러 학생의 가명 코드가 들어 있다. 일반 다운로드 폴더에 두지 말고, 가명 코드 대응표와 따로 보관한다.',
    '- 바깥에 공유하기 전에 가명 코드 처리 규칙을 먼저 정한다. 이 묶음은 공유본이 아니다.',
    '- 참여 철회가 있으면 이 파일과 복사본도 처리 대상이다.', '',
    '[이 묶음]',
    `- 묶음 규칙 판: ${RESEARCH_BUNDLE_VERSION}`,
    `- 만든 시각(UTC): ${input.generatedAtIso}`,
    `- 출처: ${input.source === 'server' ? `서버 접수 기록 — 세션 ${input.scope}` : `이 기기 저장 기록 — ${input.scope}(전송 전 기록 포함, 다른 기기 기록은 없음)`}`, '',
    '[건수 대조]',
    `- 받은 줄 ${c.received} = 표에 넣은 기록 ${c.usable} + 문제가 있어 표에서 분리한 줄 ${c.problem}`,
    `- 항목 행 ${c.answerRows} (answers.csv) / 사건 행 ${c.eventRows} (events.csv) / 계산 행 ${c.calculatorRows} (calculator.csv)`,
    `- 해시를 대조한 기록 ${c.hashChecked}건. 전송 전 기기 기록은 해시가 없어 대조하지 않는다.`,
    `- 과제: ${tally(payloads, (p) => p.taskId)}`,
    `- 도움 방식: ${tally(payloads, (p) => p.difficultyMode)}`,
    `- 수행 목적: ${tally(payloads, (p) => p.runPurpose)}`,
    `- 완료 여부: ${tally(payloads, (p) => p.completionStatus)}`,
    `- researchEligible: ${tally(payloads, (p) => String(p.researchEligible))}`, '',
    '[읽는 규칙]',
    '- 대표 수행을 고르지 않았다. 다시 한 수행과 중단 기록도 모두 들어 있다. 어느 수행을 분석할지는 연구 규칙으로 정한다(마지막·최고 수행을 자동으로 쓰지 않는다).',
    '- 빈 칸은 값이 없다는 뜻(null)이다. 0이나 오답이 아니다.',
    '- 계산 답(편차·합·최소회전반경) 채점 규칙은 앱 판(clientAppVersion) 0.3.1-demo부터 바뀌었다: 학생 값을 다시 절사하지 않고 기준값과 그대로 비교한다(예: 기준 6.6에 6.69는 오답). 그보다 앞선 판(0.2.x-demo, 0.3.0-demo 배포판)은 학생 값을 절사한 뒤 비교했다(6.69도 정답). judgeEngineVersion은 둘 다 0.1.0이라 이 열로는 가를 수 없다. 이어 하기로 이어진 수행은 처음 시작한 판이 남아 한 수행 안에 두 규칙이 섞일 수 있다. 계산 정오는 firstInput·finalInput으로 다시 채점할 수 있지만 errorCount, errorTypes의 calc, answerSubmitted의 INCORRECT, feedbackShown, NPC 검사 결과는 다시 만들 수 없다.',
    '- 같은 0.3.1-demo부터 정지·상승·차량 빼기(off 단계 하위 행동)의 순서 오류 피드백은 feedbackShown의 feedbackKind가 safety가 아니라 explanatory로 기록된다(안전 오류는 그대로 safety).',
    '- 작은따옴표로 시작하는 칸은 스프레드시트 수식 실행을 막으려고 붙인 것이다. = + - @ 로 시작하는 값에 붙는다. 원래 값은 records.jsonl에 있다.',
    '- AI 대화는 들어 있지 않다. 대화 기록은 교사 화면의 대화 기록 CSV로 따로 받는다.',
    '- 시각은 UTC다. 한국 시각은 9시간을 더한다.', '',
    '[records.jsonl — 원본]',
    '한 줄에 한 건. payloadJson 칸이 고치지 않은 원본 글이다. 문제가 있어 분리한 줄도 여기에는 모두 남는다.',
    '칸: source(device/server), recordId, receiptId, acceptedAt, uploadStatus, payloadHash, payloadJson', '',
    '[summary.csv — 수행 요약, 수행 1건에 1행]',
    ...SUMMARY_CSV_HEADER.map((k) => `- ${k}: ${summaryNotes[k] ?? ''}`), '',
    '[answers.csv — 항목별 최초·최종 답, 항목 1개에 1행]',
    `앞 열은 수행 정보로 summary.csv와 같다: ${RUN_COLUMNS.map(([k]) => k).join(', ')}`,
    '- itemKind: measurement 판독, calculation 계산, judgment 판정',
    '- itemId: 항목 이름', '- unit: 단위',
    '- presentedValue: 판독 항목에 제시된 값', '- computedReferenceValue: 계산 항목의 기준값(승인 정밀도 적용)',
    '- firstInput / finalInput: 판독·계산의 최초 답·최종 답(학생이 쓴 글자 그대로)', '- firstAnswer / finalAnswer: 판정의 최초 답·최종 답(pass/fail)',
    '- firstCorrect / finalCorrect: true 정답, false 오답, 빈 칸 채점 안 됨',
    '- firstStatus / finalStatus: correct 정답, incorrect 오답, unanswered 미응답, ungraded 값은 있으나 채점 안 됨', '',
    '[events.csv — 사건, 사건 1개에 1행]',
    `앞 열은 수행 정보로 summary.csv와 같다. recordId와 eventId로 한 사건을 가리키고, 순서는 sequence를 따른다.`,
    '- eventId: 사건 번호', '- sequence: 순서', '- elapsedMs: 시작부터 경과 밀리초(멈춤 시간 제외)',
    '- type: taskStarted 시작, stepCompleted 단계 완료, actionBlocked 조작 차단, answerSubmitted 답 제출, hintRequested 힌트 요청, feedbackShown 피드백 표시, npcInspected NPC 검사, paused 멈춤, resumed 이어 하기, displayModeChanged 화면 방식 변경, taskFinalized 확정',
    '- stepId: 단계', '- actionId: 한 조작 묶음. 같은 조작에서 나온 다른 사건을 합치지 않는다', '- reasonCode: 이유 코드', '- itemId: 응답 항목',
    '- feedbackKey / feedbackKind: 표시한 피드백과 종류(safety, explanatory, hint, guidance)', '- fromDisplayMode / toDisplayMode: 화면 방식 전환 전후', '',
    '[calculator.csv — 계산기 기록, = 를 누른 1번에 1행]',
    '앞 열은 수행 정보로 summary.csv와 같다. 기록 판 1.3.0부터 있고, 그 전 기록은 행이 없다. 계산기가 있었는지는 schemaVersion(1.3.0)으로 가른다 — 이어 하기로 이어진 수행은 clientAppVersion이 이전 판일 수 있다. 채점·오류 수와 무관하다.',
    '- sequence: 계산기 기록 순서(1부터)', '- elapsedMs: 시작부터 경과 밀리초(사건과 같은 시계)',
    '- stepId: 과제별 고정값(calc 제동력, record 최소회전반경). 계산기를 쓴 화면·단계는 담지 않는다(기본 화면·작업 목록 계산 표의 계산기는 어느 단계에서나 쓸 수 있다)',
    '- kind: basic 일반 계산기(누른 차례대로 바로 계산 — 곱셈·나눗셈을 먼저 하지 않음), scientific 공학용(식 입력, 곱셈·나눗셈 먼저, sin은 도 단위)',
    '- expression: = 를 누를 때까지 누른 식. + - * / 와 sin( ) 로 적는다(화면에는 × ÷ −). 숫자 하나하나와 지우기는 남기지 않는다. = 뒤에 이어 계산한 식은 직전 결과(10자리 반올림 값)로 시작하고, 공학용 식에는 = 때 자동으로 닫은 괄호가 들어 있다. - 나 + 로 시작하면 수식 막기 작은따옴표가 붙는다',
    '- result: 계산기 화면에 보인 결과(10자리 유효숫자, 소수 첫째 자리로 자르지 않음). 지수 표기(예: 1e-7)일 수 있고, 음수면 수식 막기 작은따옴표가 붙는다',
    '- error: 결과 대신 오류 — divideByZero 0으로 나눔·값 없음, syntax 식 오류. 일반 계산기는 = 전 중간 단계에서 0으로 나누면 오류만 보이고 남기지 않는다',
    '- 한 수행에 60줄까지 남긴다. 넘거나 기록 크기 예산(31 KiB)을 넘으면 뒤의 줄을 덜고 records.jsonl의 calculatorLogTruncated가 true다.', '',
    '[problems.csv — 표에서 분리한 줄]',
    '- recordId: 수행 번호(줄에 적힌 값)', '- problem: JSON_BROKEN 글이 깨짐, STRUCTURE_INVALID 구조가 다름, RECORD_ID_MISMATCH 번호가 다름, HASH_MISMATCH 해시가 다름, DUPLICATE_RECORD_ID 번호가 겹침', '- detail: 설명',
    '분리한 줄을 자료에서 뺄지는 연구자가 원본을 보고 정한다.', '',
  ].join('\r\n')
}
