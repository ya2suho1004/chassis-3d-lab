// 계산기 화면(계산기 설계 §2) — 처음엔 닫힌 버튼, 일반·공학용 버튼 배치, 결과 줄 읽기
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { CalculatorPad, CalculatorPanel } from '../src/screens/Calculator'

const pad = (kind: 'basic' | 'scientific') => renderToStaticMarkup(createElement(CalculatorPad, { kind, onEvaluate: () => {} }))

describe('계산기 화면', () => {
  test('처음엔 닫힌 계산기 버튼만 보인다', () => {
    const h = renderToStaticMarkup(createElement(CalculatorPanel, { kind: 'basic', onEvaluate: () => {} }))
    expect(h).toContain('aria-expanded="false"')
    expect(h).toContain('>계산기</button>')
    expect(h).not.toContain('calc-keys')
  })
  test('일반 계산기: 숫자·÷×−+·AC·⌫·=, 괄호·sin·DEG는 없다', () => {
    const h = pad('basic')
    expect(h).toContain('class="calc basic"')
    for (const label of ['÷', '×', '−', '+', 'AC', '⌫', '=', '.', '0', '9']) expect(h).toContain(`>${label}</button>`)
    expect(h).not.toContain('>sin</button>')
    expect(h).not.toContain('>(</button>')
    expect(h).not.toContain('DEG')
    expect(h).toContain('aria-label="나누기"')
    expect(h).toContain('aria-live="polite"')
  })
  test('공학용 계산기: DEG 표시, sin·괄호', () => {
    const h = pad('scientific')
    expect(h).toContain('class="calc scientific"')
    expect(h).toContain('DEG')
    for (const label of ['sin', '(', ')', '÷', '×', '=']) expect(h).toContain(`>${label}</button>`)
    expect(h).toContain('aria-label="사인"')
  })
})
