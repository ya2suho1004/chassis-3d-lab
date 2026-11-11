// 계산기 배선(계산기 설계 §2.1·§3) — 기록 창 두 계산 단계와 기본 화면 계산 표, = 는 logCalculation으로 기록
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (p: string) => fs.readFileSync(p, 'utf8')

describe('계산기 배선', () => {
  test('기록 창: 계산·판정과 반경·판정 두 곳에 과제별 계산기', () => {
    const sheet = read('src/screens/RecordSheet.tsx')
    expect(sheet.match(/<CalculatorPanel kind=\{calculatorKindOf\(task\)\} onEvaluate=\{onCalc\} \/>/g)).toHaveLength(2)
  })
  test('과제 화면: = 는 logCalculation으로 기록, 기록 창과 기본 화면 계산 표 두 곳에 계산기', () => {
    const task = read('src/screens/TaskScreen.tsx')
    expect(task).toMatch(/const calcKind = calculatorKindOf\(task\)/)
    expect(task).toMatch(/const logCalc = \(e: CalcEvaluation\) => setRun\(\(r\) => logCalculation\(r, e\)\)/)
    expect(task).toMatch(/<RecordSheet [^\n]*onCalc=\{logCalc\} \/>/)
    expect(task.match(/<CalculatorPanel kind=\{calcKind\} onEvaluate=\{logCalc\} \/>/g)).toHaveLength(2)
  })
})
