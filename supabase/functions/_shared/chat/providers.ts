// 모델 교체 지점(하나) — 서버 chat 함수가 쓴다. CHAT_PROVIDER·CHAT_MODEL 설정값으로 고른다(설계 07 §4-4).
// gemini: 개발·시연(성인 한정, 합성 데이터). anthropic: 학생 적용 후보(호출 형식은 공식 Messages API, 실제 키 시험 전).
export interface ChatTurn { q: string; a: string }
export interface ModelCall { provider: string; model: string; apiKey: string; system: string; history: ChatTurn[]; question: string; maxOutputTokens: number }
export interface ModelResult { ok: boolean; status: number; text?: string; finishReason?: string | null; modelVersion?: string | null; retryAfterMs?: number | null; error?: string }

const retryAfterMs = (h: string | null): number | null => {
  if (!h) return null
  const s = Number(h)
  return Number.isFinite(s) ? Math.round(s * 1000) : null
}

export async function callModel(c: ModelCall, fetchImpl: typeof fetch = fetch): Promise<ModelResult> {
  if (c.provider === 'gemini') {
    const contents = [...c.history.flatMap((t) => [{ role: 'user', parts: [{ text: t.q }] }, { role: 'model', parts: [{ text: t.a }] }]), { role: 'user', parts: [{ text: c.question }] }]
    const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': c.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: c.system }] },
        contents,
        generationConfig: { maxOutputTokens: c.maxOutputTokens, temperature: 0.3 },
        // 2.5 이상 모델은 안전 필터 기본값이 꺼짐 → 학생용이므로 명시적으로 켠다
        safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map((category) => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' })),
      }),
    })
    const body: any = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, status: r.status, error: `HTTP ${r.status}`, retryAfterMs: retryAfterMs(r.headers.get('retry-after')) }
    const cand = body.candidates?.[0]
    return { ok: true, status: r.status, text: (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim(), finishReason: cand?.finishReason ?? null, modelVersion: body.modelVersion ?? null }
  }
  if (c.provider === 'anthropic') {
    const messages = [...c.history.flatMap((t) => [{ role: 'user', content: t.q }, { role: 'assistant', content: t.a }]), { role: 'user', content: c.question }]
    const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: c.model, max_tokens: c.maxOutputTokens, system: c.system, messages }),
    })
    const body: any = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, status: r.status, error: `HTTP ${r.status}`, retryAfterMs: retryAfterMs(r.headers.get('retry-after')) }
    return { ok: true, status: r.status, text: (body.content ?? []).map((b: any) => b.text ?? '').join('').trim(), finishReason: body.stop_reason ?? null, modelVersion: body.model ?? null }
  }
  return { ok: false, status: 0, error: 'UNKNOWN_PROVIDER' }
}
