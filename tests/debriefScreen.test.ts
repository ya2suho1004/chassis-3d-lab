// tests/debriefScreen.test.ts — 정리 화면(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 1-2·1-5·1-8)
// 화면 시험 도구(jsdom)가 없어 그리기는 renderToStaticMarkup, 타이머 배선은 소스로 고정한다(지금 방식). 잠금 시간 계산은 tests/debrief.test.ts.
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { DebriefActions, ResultScreen } from '../src/screens/ResultScreen'
import { DEBRIEF_WITHHELD_LINE, debriefFacts } from '../src/app/debrief'
import { createDemoSession, listTasks } from '../src/app/session'
import { createTaskRun, submitResponse } from '../src/domain/taskEngine'
import type { DeliveryEnvelope } from '../src/records/types'

const read = (p: string) => fs.readFileSync(p, 'utf8')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const tasks = listTasks()
const task = tasks.find((t) => t.taskId === 'braking-force')!
const session = createDemoSession({ studentCode: 'D-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', task, difficultyMode: 'guided' })
const env: DeliveryEnvelope = { recordId: session.recordId, localSaveStatus: 'saved', uploadStatus: 'pending', uploadedAt: null, receiptId: null, payloadHash: null, uploadAttemptCount: 0, lastErrorCode: null, nextRetryAt: null }
let n = 0
const doneRun = (mode: 'guided' | 'unguided' = 'guided') => {
  let r = createTaskRun(task, { difficultyMode: mode })
  for (const [k, v] of Object.entries({ left: '240', right: '200', axleWeight: '600', deviation: '6.6', sum: '73.3', vehicleCondition: 'pass' })) r = submitResponse(r, k, v, `s${++n}`).run
  return { ...r, npcInspectionCount: 1 }
}
type Props = Parameters<typeof ResultScreen>[0]
const render = (p: Partial<Props> = {}) => renderToStaticMarkup(createElement(ResultScreen, { session, run: doneRun(), completionStatus: 'completed', envelope: env, saveError: null, onToLab: () => {}, onEnd: () => {}, ...p }))

describe('정리 화면 — 구성', () => {
  test('교관의 정리(세 묶음)와 오늘 쓴 공식과 규정값이 있다', () => {
    const t = text(render())
    expect(t).toContain('교관의 정리')
    expect(t).toContain('잘한 점')
    expect(t).toContain('보완할 점')
    expect(t).toContain('어려웠던 것으로 보이는 점')
    expect(t).toContain('오늘 쓴 공식과 규정값')
    for (const f of debriefFacts(task)) expect(t).toContain(f.text)
    expect(t).toMatch(/걸린 시간 .* 학습 오류 0번 .* 안전 위반 0번 .* 힌트 0번 .* 검사 1번/)
  })
  test('내려받기·교사용 상세·상태 3칸·수업 시점 줄·다음 학생이 없다', () => {
    const h = render()
    const t = text(h)
    for (const gone of ['JSON 내려받기', 'CSV 내려받기', '교사용 상세 기록 보기', '다음 학생', '실습 결과:', '이 기기 저장:', '온라인 접수', '수업 시점', '도움 방식', 'researchEligible']) expect(t).not.toContain(gone)
    expect(h).not.toContain('status3')
    expect(h).not.toContain('<textarea')
    const src = read('src/screens/ResultScreen.tsx')
    expect(src).not.toMatch(/toSummaryCsv|createObjectURL|LESSON_SHORT/)
  })
  test('내 답 표와 정답 숨김 안내는 그대로', () => {
    const t = text(render())
    expect(t).toContain('최초 답')
    expect(t).toContain('최종 답')
    expect(t).toContain('정답 값은 교사 화면에서 확인합니다')
  })
  test('시연·리허설 세션: 기록 한 줄은 "기록을 이 기기에 저장했어요."', () => {
    expect(text(render())).toContain('기록을 이 기기에 저장했어요.')
  })
  test('수업용 세션 줄이 오면 그 줄만', () => {
    const t = text(render({ sendLine: '기록을 선생님께 보냈어요.' }))
    expect(t).toContain('기록을 선생님께 보냈어요.')
    expect(t).not.toContain('기록을 이 기기에 저장했어요.')
  })
  test('기록 없이 하기: 지금 문구 그대로', () => {
    const t = text(render({ noRecord: true, envelope: null }))
    expect(t).toContain('기록 없이 한 수행 — 이 기기에 저장하거나 보내지 않았습니다')
    expect(t).toContain('기록 없이 한 수행이라 결과는 이 화면에만 보입니다. 화면을 나가면 사라집니다.')
    expect(t).not.toContain('기록을 이 기기에 저장했어요.')
    expect(t).not.toContain('처음 화면으로')
  })
})

describe('정리 화면 — 30초 잠금', () => {
  test('처음 그릴 때 두 단추가 잠겨 있고 주 단추에 남은 초가 보인다', () => {
    const h = render()
    expect(h).toMatch(/<button[^>]*class="primary"[^>]*disabled=""[^>]*>실습장으로 이동<span aria-hidden="true"> \(30\)<\/span><\/button>/)
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>마치기<\/button>/)
    expect(text(h)).toContain('30초 동안 정리를 읽은 뒤 넘어갈 수 있어요.')
  })
  test('남은 초가 0이면 두 단추가 눌린다(남은 초 표시 없음)', () => {
    const h = renderToStaticMarkup(createElement(DebriefActions, { secondsLeft: 0, showToLab: true, onToLab: () => {}, onEnd: () => {} }))
    expect(h).not.toContain('disabled')
    expect(h).toContain('>실습장으로 이동</button>')
    expect(h).toContain('>마치기</button>')
    expect(text(h)).not.toContain('30초 동안')
  })
  test('잠긴 동안 남은 초는 화면 낭독기가 읽지 않는다(숨김 + 알림 영역 아님)', () => {
    const h = renderToStaticMarkup(createElement(DebriefActions, { secondsLeft: 27, showToLab: true, onToLab: () => {}, onEnd: () => {} }))
    expect(h).toContain('실습장으로 이동<span aria-hidden="true"> (27)</span>')
    expect(h).not.toMatch(/aria-live|role="status"|role="alert"|role="timer"/)
    expect(h).toMatch(/aria-describedby="debrief-lock-note"/)
  })
  test('화면이 뜰 때 타이머를 한 번 걸고 떠날 때 멈춘다(모든 세션·조건에 같은 30초)', () => {
    const src = read('src/screens/ResultScreen.tsx')
    expect(src).toContain('const [left, setLeft] = useState(DEBRIEF_LOCK_SECONDS)')
    expect(src).toContain('useEffect(() => startLockTimer(Date.now(), setLeft), [])')
    expect(src).toMatch(/<DebriefActions secondsLeft=\{left\}/)
    expect(src).not.toMatch(/DEBRIEF_LOCK_SECONDS\s*[*/+-]|isClassSession|difficultyMode ===/)
  })
})

describe('정리 화면 — 저장 실패', () => {
  test('저장 실패면 "실습장으로 이동"이 없고 다시 저장과 마치기만 있다', () => {
    const t = text(render({ envelope: null, saveError: 'QUOTA', onRetrySave: async () => null }))
    expect(t).toContain('이 기기에 확정 기록을 저장하지 못했습니다 (QUOTA)')
    expect(t).toContain('다시 저장')
    expect(t).toContain('마치기')
    expect(t).not.toContain('실습장으로 이동')
    expect(t).not.toContain('기록을 이 기기에 저장했어요.')
  })
  test('저장 실패에서는 주 단추(마치기)에 남은 초가 보인다', () => {
    expect(render({ envelope: null, saveError: 'QUOTA' })).toMatch(/마치기<span aria-hidden="true"> \(30\)<\/span>/)
  })
})

describe('정리 화면 — 안내 없음 중단(1-5)', () => {
  test('최초 응답이 다 차지 않았으면 공식·규정값 대신 한 줄', () => {
    let r = createTaskRun(task, { difficultyMode: 'unguided' })
    r = submitResponse(r, 'left', '240', 'u1').run
    const t = text(render({ run: r, completionStatus: 'aborted' }))
    expect(t).toContain(DEBRIEF_WITHHELD_LINE)
    for (const f of debriefFacts(task)) expect(t).not.toContain(f.text)
  })
  test('안내 없음이라도 검사 통과면 보인다', () => {
    const t = text(render({ run: doneRun('unguided') }))
    expect(t).not.toContain(DEBRIEF_WITHHELD_LINE)
    for (const f of debriefFacts(task)) expect(t).toContain(f.text)
  })
})

describe('정리 화면 — 값 누출 없음', () => {
  test('정리·공식 구역에는 사례 값·기준값·학생 입력값이 없다(내 답 표 밖)', () => {
    let r = createTaskRun(task, { difficultyMode: 'guided' })
    for (const [k, v] of Object.entries({ left: '241', right: '199', axleWeight: '600', deviation: '7.1', sum: '73.4', vehicleCondition: 'fail' })) r = submitResponse(r, k, v, `x${++n}`).run
    const h = render({ run: { ...r, npcInspectionCount: 2 } })
    const zone = (label: string) => { const i = h.indexOf(`aria-label="${label}"`); return text(h.slice(i, h.indexOf('</section>', i))) }
    for (const z of [zone('교관의 정리'), zone('오늘 쓴 공식과 규정값')]) {
      for (const v of ['240', '200', '600', '6.6', '73.3', '241', '199', '7.1', '73.4', '양호', '불량']) expect(z).not.toContain(v)
    }
  })
})
