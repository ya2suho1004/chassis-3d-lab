// AI 정리 평가 도구(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-5) — 합성 수행 요약을 서버 처리 본체(handleDebrief)에 그대로 통과시킨다.
// 가짜 모델만 쓴다 — 네트워크·DB 없음. 실제 호출(--run)은 지휘 세션이 한다.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import type { ModelCall, ModelResult } from '../supabase/functions/_shared/chat/providers'
import { DEBRIEF_MAX_OUTPUT_TOKENS } from '../supabase/functions/_shared/chat/debriefCore'
import { DEBRIEF_PROMPT_VERSION } from '../supabase/functions/_shared/chat/debriefPrompt'
import context from '../supabase/functions/_shared/chat/taskContext.generated.json'
import labels from '../supabase/functions/_shared/chat/debriefContext.generated.json'
// @ts-expect-error — 개발 도구의 .mjs 모듈(타입 선언 없음)
import { DEBRIEF_CASES } from '../scripts/chat-eval/debrief-cases.mjs'
// @ts-expect-error — 개발 도구의 .mjs 모듈(타입 선언 없음)
import { renderDebriefSheet, runDebriefCase } from '../scripts/chat-eval/debrief-run.mjs'
// @ts-expect-error — 개발 도구의 .mjs 모듈(타입 선언 없음)
import { buildDebriefDoc } from '../scripts/chat-eval/build-debrief-doc.mjs'
import { buildDebriefSystemPrompt } from '../supabase/functions/_shared/chat/debriefPrompt'

type Case = { id: string; title: string; taskId: string; mode: string; facts: { items: unknown[]; errorTypes: Record<string, number>; safetyViolationTypes: Record<string, number>; hintCount: number; npcInspectionCount: number; durationSeconds: number | null } }
const cases = DEBRIEF_CASES as Case[]
const GOOD = '{"good": ["판정까지 끝까지 해냈어요."], "improve": [], "hard": []}'
const fake = (over: (c: ModelCall, n: number) => Partial<ModelResult> = () => ({})) => {
  const calls: ModelCall[] = []
  const callModel = async (c: ModelCall): Promise<ModelResult> => { calls.push(c); return { ok: true, status: 200, text: GOOD, finishReason: 'STOP', modelVersion: 'fake-1', ...over(c, calls.length) } }
  return { calls, opts: { callModel, provider: 'fake', model: 'fake-model', apiKey: 'x', context, labels } }
}

describe('합성 수행 요약', () => {
  test('10개 안팎, 두 과제·두 도움 방식, 여러 모양(오류 없음·판독·계산 여러 번·안전 위반·힌트 많이·검사 여러 번·끝까지 틀림·시간 모름)', () => {
    expect(cases.length).toBeGreaterThanOrEqual(9)
    expect(cases.length).toBeLessThanOrEqual(12)
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length)
    expect(new Set(cases.map((c) => `${c.taskId}-${c.mode}`))).toEqual(new Set(['braking-force-guided', 'braking-force-unguided', 'min-turning-radius-guided', 'min-turning-radius-unguided']))
    const has = (f: (c: Case) => boolean) => cases.some(f)
    expect(has((c) => Object.keys(c.facts.errorTypes).length === 0 && Object.keys(c.facts.safetyViolationTypes).length === 0)).toBe(true)
    expect(has((c) => (c.facts.errorTypes.reading ?? 0) > 0)).toBe(true)
    expect(has((c) => (c.facts.errorTypes.calc ?? 0) >= 3)).toBe(true)
    expect(has((c) => Object.keys(c.facts.safetyViolationTypes).length > 0)).toBe(true)
    expect(has((c) => c.facts.hintCount >= 4)).toBe(true)
    expect(has((c) => c.facts.npcInspectionCount >= 3)).toBe(true)
    expect(has((c) => (c.facts.items as Array<{ final: boolean | null }>).some((i) => i.final === false))).toBe(true)
    expect(has((c) => c.facts.durationSeconds === null)).toBe(true)
  })
  test('모두 서버 요청 검사를 통과하고(가짜 모델로 끝까지), 지시문·답 길이 제한은 서버 값', async () => {
    for (const c of cases) {
      const { calls, opts } = fake()
      const r = await runDebriefCase(c, opts)
      expect(r.res, c.id).toMatchObject({ ok: true })
      expect(calls[0]!.maxOutputTokens).toBe(DEBRIEF_MAX_OUTPUT_TOKENS)
      expect(r.summary).toBe(calls[0]!.question)
      expect(r.summary.startsWith('[수행 요약]')).toBe(true)
      expect(r.raw).toBe(GOOD)
    }
  })
})

describe('결과 기록', () => {
  test('검사에서 걸리면 걸린 까닭을 남긴다', async () => {
    const { opts } = fake(() => ({ text: '{"good":["판정이 양호였어요."],"improve":[],"hard":[]}' }))
    const r = await runDebriefCase(cases[0], opts)
    expect(r.res).toMatchObject({ ok: false, code: 'DEBRIEF_INVALID' })
    expect(r.reason).toContain('양호')
    const cut = await runDebriefCase(cases[0], fake(() => ({ text: GOOD, finishReason: 'MAX_TOKENS' })).opts)
    expect(cut.reason).toContain('MAX_TOKENS')
    const err = await runDebriefCase(cases[0], fake(() => ({ ok: false, status: 500, text: undefined })).opts)
    expect(err.reason).toBe('UPSTREAM_ERROR')
  })
  test('판독표: 조건·요약 글·모델 원문·검사 통과·걸린 시간과 빈 판독 칸', async () => {
    const { opts } = fake((_c, n) => (n === 2 ? { text: '그냥 글 | 표 깨기' } : {}))
    const results = []
    for (const c of cases.slice(0, 2)) results.push(await runDebriefCase(c, opts))
    const md = renderDebriefSheet(results, { provider: 'fake', model: 'fake-model', promptVersion: DEBRIEF_PROMPT_VERSION, ranAt: '2026-11-16T00:00:00.000Z' })
    expect(md).toContain(`fake / fake-model / ${DEBRIEF_PROMPT_VERSION}`)
    expect(md).toContain('handleDebrief')
    expect(md).toContain('앱은 12초까지 기다린다')
    expect(md).toContain('연구 자료가 아니')
    expect(md).toContain('검사 통과 1 · 걸림 1')
    expect(md).toContain(results[0].summary)
    expect(md).toContain('그냥 글 | 표 깨기')
    expect(md).toContain('JSON이 아님')
    for (const c of cases.slice(0, 2)) expect(md).toContain(`## ${c.id} ${c.title}`)
    expect(md).toMatch(/\| 사실만 씀 \|  \|/)
  })
  test('도구는 서버 처리 본체만 부르고 직접 통신하거나 DB를 건드리지 않는다', () => {
    const src = fs.readFileSync('scripts/chat-eval/debrief-run.mjs', 'utf8')
    expect(src).toMatch(/handleDebrief/)
    expect(src).not.toMatch(/\bfetch\(|createClient|SUPABASE/)
  })
})

describe('실행 명령', () => {
  const cli = 'scripts/chat-eval/run-debrief.mjs'
  test('--run 없이는 계획만 보여 주고 키를 읽거나 아무것도 부르지 않는다', () => {
    const out = execFileSync('node', [cli, 'gemini'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    expect(out).toContain('[계획]')
    expect(out).toContain('호출하지 않았습니다')
    expect(out).toContain('--run')
    for (const c of cases) expect(out).toContain(c.id)
    const src = fs.readFileSync(cli, 'utf8')
    expect(src.indexOf("import('./env.mjs')")).toBeGreaterThan(src.indexOf("args.includes('--run')"))
  })
  test('연결 코드가 없는 공급자는 부르기 전에 멈춘다', () => {
    const r = spawnSync('node', [cli, 'openai', '--run'], { encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('연결 코드')
  })
})

describe('교사 검토 문서', () => {
  test('docs/06b는 지금 지시문으로 만든 최신 문서다(지시문을 고치면 build-debrief-doc.mjs로 다시 만든다)', () => {
    const doc = fs.readFileSync('docs/06b_AI정리_지시문_초안.md', 'utf8')
    expect(doc).toBe(buildDebriefDoc())
    expect(doc).toContain(DEBRIEF_PROMPT_VERSION)
    for (const t of ['braking-force', 'min-turning-radius'] as const) expect(doc).toContain(buildDebriefSystemPrompt(context, t))
  })
})
