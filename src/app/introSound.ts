// 인트로 소리(설계 2026-11-03): 셔터가 말려 올라가는 드르륵 소리 + 엔진 부릉. 녹음 파일 없이 Web Audio로 합성한다.
// 화면을 누른 순간(사용자 동작)에만 부른다. 소리를 낼 수 없는 기기에서는 조용히 넘어간다.

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!C) return null
      ctx = new C()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

/** 철판 셔터가 말려 올라가는 소리(잡음을 초당 약 26번 끊어 덜컹거림 + 금속 울림), 길이 dur초 */
export function playShutter(dur = 2.2): void {
  const c = audio()
  if (!c) return
  try {
    const t = c.currentTime
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, dur)
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.9
    const gate = c.createGain(); gate.gain.value = 0
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(22, t); lfo.frequency.linearRampToValueAtTime(30, t + dur)
    const lfoGain = c.createGain(); lfoGain.gain.value = 0.5
    lfo.connect(lfoGain); lfoGain.connect(gate.gain)
    const out = c.createGain()
    out.gain.setValueAtTime(0.0001, t)
    out.gain.exponentialRampToValueAtTime(0.35, t + 0.15)
    out.gain.setValueAtTime(0.35, t + dur - 0.35)
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp); bp.connect(gate); gate.connect(out); out.connect(c.destination)
    src.start(t); lfo.start(t); src.stop(t + dur); lfo.stop(t + dur)
    // 끝에 셔터가 멈추는 쿵
    const thump = c.createOscillator(); thump.type = 'sine'; thump.frequency.setValueAtTime(110, t + dur - 0.1); thump.frequency.exponentialRampToValueAtTime(45, t + dur + 0.25)
    const tg = c.createGain(); tg.gain.setValueAtTime(0.0001, t + dur - 0.1); tg.gain.exponentialRampToValueAtTime(0.5, t + dur - 0.05); tg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3)
    thump.connect(tg); tg.connect(c.destination); thump.start(t + dur - 0.1); thump.stop(t + dur + 0.35)
  } catch { /* 소리 없이 진행 */ }
}

/** 엔진 시동·부릉(톱니파 낮은 소리가 한 번 올라갔다 내려옴), delay초 뒤 */
export function playEngine(delay = 0): void {
  const c = audio()
  if (!c) return
  try {
    const t = c.currentTime + delay
    const osc = c.createOscillator(); osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(48, t)
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.45)
    osc.frequency.exponentialRampToValueAtTime(62, t + 1.4)
    const sub = c.createOscillator(); sub.type = 'square'; sub.frequency.setValueAtTime(24, t); sub.frequency.exponentialRampToValueAtTime(75, t + 0.45); sub.frequency.exponentialRampToValueAtTime(31, t + 1.4)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1400, t + 0.45); lp.frequency.linearRampToValueAtTime(600, t + 1.4)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.08)
    g.gain.setValueAtTime(0.22, t + 1.0)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
    const sg = c.createGain(); sg.gain.value = 0.5
    osc.connect(lp); sub.connect(sg); sg.connect(lp); lp.connect(g); g.connect(c.destination)
    osc.start(t); sub.start(t); osc.stop(t + 1.65); sub.stop(t + 1.65)
  } catch { /* 소리 없이 진행 */ }
}
