// 모델 교체 지점(하나). 서버 함수도 같은 모양(provider, model, system, userText → text, meta)을 따른다.
// 검증 상태: gemini = 실제 호출 시험 대상(개발·시연, 성인 한정). anthropic·openai = 학생 적용 전 교체용, 아직 호출 미검증.
export const DEFAULTS = {
  gemini: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
  openai: process.env.OPENAI_MODEL || 'gpt-6-luna',
}

export async function callModel({ provider, model = DEFAULTS[provider], system, userText, maxOutputTokens = 1024 }) {
  const t0 = performance.now()
  const res = await ADAPTERS[provider]({ model, system, userText, maxOutputTokens })
  return { ...res, provider, model, latencyMs: Math.round(performance.now() - t0) }
}

const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k}가 없습니다. chassis-3d-lab/.env.local에 적어 주세요.`); return v }

const ADAPTERS = {
  async gemini({ model, system, userText, maxOutputTokens }) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': need('GEMINI_API_KEY') },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { maxOutputTokens, temperature: 0.3 },
        // 2.5 이상 모델의 기본 안전 필터는 꺼짐 → 학생용이므로 명시적으로 켠다.
        safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
          .map((category) => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' })),
      }),
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, status: r.status, error: body?.error?.message ?? `HTTP ${r.status}`, retryAfter: r.headers.get('retry-after') }
    const c = body.candidates?.[0]
    return {
      ok: true, status: r.status,
      text: (c?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim(),
      finishReason: c?.finishReason ?? null,
      modelVersion: body.modelVersion ?? null,
      usage: body.usageMetadata ?? null,
    }
  },
  async anthropic({ model, system, userText, maxOutputTokens }) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': need('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxOutputTokens, system, messages: [{ role: 'user', content: userText }] }),
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, status: r.status, error: body?.error?.message ?? `HTTP ${r.status}`, retryAfter: r.headers.get('retry-after') }
    return { ok: true, status: r.status, text: (body.content ?? []).map((b) => b.text ?? '').join('').trim(), finishReason: body.stop_reason ?? null, modelVersion: body.model ?? null, usage: body.usage ?? null }
  },
  async openai() {
    throw new Error('OpenAI 어댑터는 모델 확정 후 공식 API 형식을 확인해 작성한다(미구현).')
  },
}

export async function listGeminiModels() {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': need('GEMINI_API_KEY') } })
  const body = await r.json()
  if (!r.ok) throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
  return (body.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m) => m.name.replace('models/', ''))
}
