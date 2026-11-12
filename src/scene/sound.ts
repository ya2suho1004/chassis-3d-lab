// 실습장 소리(게임 화면): 누름·장비 움직임·완료 소리, 발소리, 실습장 배경 소음. 녹음 파일 없이 Web Audio로 만든다(저작권 걱정 없음).
// 교실에서 여러 태블릿이 함께 켜지므로 처음에는 꺼 두고, 학생이 상태 막대의 소리 버튼으로 켠다(브라우저도 사용자 동작 뒤에만 소리를 허락).
// 이 파일은 과제 상태를 모른다(아무것도 들여오지 않는다). 무슨 일에 어떤 소리를 낼지는 규칙표(src/app/reactions.ts)가 정한다.
// 소리는 측정값·정답·다음 단계에 따라 달라지지 않는다. 모두 짧고 작으며 도장만 크다(설계 2026-11-12 §4.4).

/** 걷기 한 걸음 길이(m) — 캐릭터 걷기 한 주기 1.47 m의 절반 */
export const STEP_STRIDE = 0.735

/** 걸은 거리 누적값이 prev→next로 늘 때 넘은 걸음 수 */
export function stepsCrossed(prev: number, next: number, stride = STEP_STRIDE): number {
  if (next <= prev) return 0
  return Math.floor(next / stride) - Math.floor(prev / stride)
}

/** 한 번 나는 소리 이름: 규칙표가 부르는 열두 가지와 발소리. liftLong은 lift를 길게 낸 것 */
export const CUE_NAMES = ['tap', 'press', 'lift', 'liftLong', 'vehicle', 'pedal', 'tick', 'stepDone', 'ppe', 'codex', 'stamp', 'celebrate', 'step'] as const
export type CueName = (typeof CUE_NAMES)[number]

/** 같은 소리를 다시 낼 수 있는 가장 짧은 간격(초) — 연달아 눌러도 쌓이지 않게 */
export const MIN_GAP = 0.04

/** 소리를 그릴 곳: 오디오 장치, 나갈 곳, 소음 재료. 화면 밖 장치(OfflineAudioContext)도 같은 모양이라 세기·길이를 잴 수 있다 */
export interface SoundOut { ctx: BaseAudioContext; out: AudioNode; noise: AudioBuffer }

/** 나가는 길: 전체 세기 → 압축기(여러 소리가 겹쳐 한꺼번에 커지는 것을 눌러 준다) → 스피커. 소리는 돌려주는 부품에 꽂는다 */
export function makeOutput(ctx: BaseAudioContext): AudioNode {
  const out = ctx.createGain()
  out.gain.value = 0.9
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.ratio.value = 4
  comp.attack.value = 0.003
  comp.release.value = 0.15
  out.connect(comp).connect(ctx.destination)
  return out
}

/** 2초짜리 흰 소음(마찰음·바람 소리의 재료). 잴 때마다 같은 값이 나오게 정해진 수열로 만든다 */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let s = 12345
  for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1 }
  return buf
}

/** 세기 곡선: a초에 peak까지 올랐다가 d초에 걸쳐 사라진다 */
function env(g: GainNode, t: number, peak: number, a: number, d: number): void {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d)
}

interface Blip { f0: number; f1?: number; type?: OscillatorType; peak: number; a?: number; d: number; lp?: number }
/** 음 하나: 발진기 → (높은 음 깎기) → 세기 곡선 */
function blip(o: SoundOut, t: number, b: Blip): void {
  const c = o.ctx, osc = c.createOscillator(), g = c.createGain(), a = b.a ?? 0.004
  osc.type = b.type ?? 'sine'
  osc.frequency.setValueAtTime(b.f0, t)
  if (b.f1) osc.frequency.exponentialRampToValueAtTime(b.f1, t + a + b.d)
  env(g, t, b.peak, a, b.d)
  if (b.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = b.lp; osc.connect(f).connect(g) } else osc.connect(g)
  g.connect(o.out)
  osc.start(t)
  osc.stop(t + a + b.d + 0.03)
}

interface Burst { f0: number; f1?: number; q?: number; peak: number; a?: number; d: number; pan?: number; at?: number }
/** 소음 한 줌: 소음 → 띠 거르개 → 세기 곡선 → (좌우) */
function burst(o: SoundOut, t: number, b: Burst): void {
  const c = o.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), a = b.a ?? 0.002
  src.buffer = o.noise
  f.type = 'bandpass'
  f.Q.value = b.q ?? 1
  f.frequency.setValueAtTime(b.f0, t)
  if (b.f1) f.frequency.exponentialRampToValueAtTime(b.f1, t + a + b.d)
  env(g, t, b.peak, a, b.d)
  src.connect(f).connect(g)
  if (b.pan !== undefined) { const p = c.createStereoPanner(); p.pan.value = b.pan; g.connect(p).connect(o.out) } else g.connect(o.out)
  src.start(t, (b.at ?? 0.37) % 1.5, a + b.d + 0.05)
}

/** 리프트: 모터 소리가 dur초 이어지고 끝에 '탁' */
function liftCue(o: SoundOut, t: number, dur: number): void {
  const c = o.ctx, lp = c.createBiquadFilter(), g = c.createGain()
  lp.type = 'lowpass'
  lp.frequency.value = 1400
  for (const f of [98, 147, 294]) {
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(f, t)
    osc.frequency.linearRampToValueAtTime(f * 1.08, t + dur)
    osc.connect(lp)
    osc.start(t)
    osc.stop(t + dur + 0.15)
  }
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.04, t + 0.08)
  g.gain.setValueAtTime(0.04, t + dur - 0.1)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05)
  lp.connect(g).connect(o.out)
  blip(o, t, { type: 'triangle', f0: 410, f1: 460, peak: 0.03, a: 0.1, d: dur - 0.1 })
  blip(o, t, { f0: 820, f1: 920, peak: 0.01, a: 0.1, d: dur - 0.1 })
  blip(o, t + dur, { f0: 230, f1: 120, peak: 0.14, d: 0.09 })
  burst(o, t + dur, { f0: 900, q: 0.8, peak: 0.09, d: 0.03 })
}

/** 차량이 굴러 들어오거나 나가는 소리(1.5초): 타이어 소음 + 낮게 떠는 엔진음 */
function vehicleCue(o: SoundOut, t: number): void {
  const c = o.ctx, dur = 1.5
  const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain()
  n.buffer = o.noise
  nf.type = 'bandpass'
  nf.frequency.value = 650
  nf.Q.value = 0.6
  ng.gain.setValueAtTime(0.0001, t)
  ng.gain.exponentialRampToValueAtTime(0.07, t + 0.25)
  ng.gain.setValueAtTime(0.07, t + dur - 0.5)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  n.connect(nf).connect(ng).connect(o.out)
  n.start(t, 0.2, dur + 0.05)
  const lp = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain()
  lp.type = 'lowpass'
  lp.frequency.value = 800
  for (const f of [78, 156, 234, 312]) {
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = f
    osc.connect(lp)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }
  lfo.frequency.value = 13
  lg.gain.value = 0.012
  lfo.connect(lg).connect(g.gain)
  lfo.start(t)
  lfo.stop(t + dur + 0.05)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.03, t + 0.2)
  g.gain.setValueAtTime(0.03, t + dur - 0.4)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  lp.connect(g).connect(o.out)
}

/** 발소리: 짧은 마찰음 + 낮은 쿵. k로 음높이를, at으로 소음 자리를 걸음마다 조금씩 바꾼다 */
function stepCue(o: SoundOut, t: number, k = 1, at = 0.37): void {
  burst(o, t, { f0: 520 * k, q: 1.1, peak: 0.22, a: 0.008, d: 0.08, at })
  burst(o, t, { f0: 1100 * k, q: 1.5, peak: 0.1, d: 0.035, at: at + 0.23 })
  blip(o, t, { f0: 110, peak: 0.04, a: 0.01, d: 0.06 })
}

/** 한 번 나는 소리의 조립법. (그릴 곳, 시작 시각)만 받는다 — 값이나 상황에 따라 달라질 자리가 없다 */
export const CUES: Record<CueName, (o: SoundOut, t: number) => void> = {
  // 누름: "눌렸다"까지만
  tap: (o, t) => { burst(o, t, { f0: 1700, q: 0.9, peak: 0.1, d: 0.03 }); blip(o, t, { f0: 380, f1: 250, peak: 0.1, d: 0.06 }) },
  press: (o, t) => { burst(o, t, { f0: 2100, q: 1.2, peak: 0.2, d: 0.016 }); burst(o, t + 0.06, { f0: 1300, q: 1.2, peak: 0.13, d: 0.022, at: 0.9 }) },
  // 움직이는 장비: 보이는 움직임에 붙는다
  lift: (o, t) => liftCue(o, t, 1.1),
  liftLong: (o, t) => liftCue(o, t, 2.6),
  vehicle: vehicleCue,
  pedal: (o, t) => { blip(o, t, { type: 'triangle', f0: 520, f1: 330, peak: 0.09, d: 0.05 }); blip(o, t, { f0: 270, f1: 170, peak: 0.09, d: 0.07 }); burst(o, t, { f0: 900, q: 1, peak: 0.1, d: 0.03 }) },
  tick: (o, t) => { blip(o, t, { type: 'triangle', f0: 1900, peak: 0.06, d: 0.03 }); blip(o, t + 0.045, { type: 'triangle', f0: 1450, peak: 0.05, d: 0.035 }) },
  // 끝났음을 알리는 소리: 지금도 화면이 알려 주는 그 순간에만
  stepDone: (o, t) => { blip(o, t, { type: 'triangle', f0: 659.26, peak: 0.09, d: 0.11, lp: 2400 }); blip(o, t + 0.085, { type: 'triangle', f0: 880, peak: 0.08, d: 0.16, lp: 2600 }) },
  ppe: (o, t) => { burst(o, t, { f0: 2600, q: 3, peak: 0.08, d: 0.02 }); blip(o, t, { f0: 1180, peak: 0.05, d: 0.09 }); burst(o, t + 0.07, { f0: 1800, q: 2, peak: 0.05, d: 0.02, at: 0.8 }) },
  codex: (o, t) => { burst(o, t, { f0: 3200, f1: 1400, q: 0.8, peak: 0.06, a: 0.01, d: 0.07 }); blip(o, t + 0.05, { f0: 1318.5, peak: 0.045, d: 0.22 }) },
  stamp: (o, t) => {
    blip(o, t, { type: 'triangle', f0: 640, f1: 380, peak: 0.32, a: 0.003, d: 0.1 })
    blip(o, t, { f0: 230, f1: 110, peak: 0.14, a: 0.003, d: 0.14 })
    blip(o, t, { f0: 115, f1: 55, peak: 0.1, a: 0.003, d: 0.18 })
    burst(o, t, { f0: 1100, q: 0.5, peak: 0.45, d: 0.07 })
    burst(o, t + 0.012, { f0: 2600, q: 1, peak: 0.1, d: 0.03, at: 1.1 })
  },
  celebrate: (o, t) => {
    for (const [dt, f] of [[0, 783.99], [0.11, 987.77], [0.22, 1174.66]] as const) blip(o, t + dt, { type: 'triangle', f0: f, peak: 0.07, d: 0.25, lp: 3000 })
    blip(o, t + 0.33, { f0: 783.99, peak: 0.03, d: 0.5 })
    blip(o, t + 0.33, { f0: 1174.66, peak: 0.025, d: 0.5 })
    for (let k = 0; k < 6; k++) burst(o, t + 0.05 + k * 0.1, { f0: 4000, q: 2, peak: 0.02, d: 0.03, pan: (k % 2 ? 1 : -1) * (0.3 + 0.1 * k), at: 0.11 * k })
  },
  step: (o, t) => stepCue(o, t),
}

/** 롤러 회전음: 서서히 올라와 이어진다. 측정값이 무엇이든 늘 같은 소리다. 돌려주는 함수를 부르면 fade초에 걸쳐 잦아든 뒤 끝난다 */
export function startRollers(o: SoundOut, t: number): (at: number, fade?: number) => void {
  const c = o.ctx
  const tones: Array<[OscillatorNode, number]> = []
  const mix = c.createGain(), lp = c.createBiquadFilter(), trem = c.createGain(), g = c.createGain()
  lp.type = 'lowpass'
  lp.frequency.value = 1200
  for (const [type, f, level] of [['sawtooth', 62, 0.3], ['square', 124, 0.25], ['triangle', 248, 1], ['triangle', 372, 0.7]] as const) {
    const osc = c.createOscillator(), og = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(f * 0.45, t)
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.9)
    og.gain.value = level
    osc.connect(og).connect(mix)
    tones.push([osc, f])
  }
  // 고르지 않게 떠는 느낌(초당 9번)
  const lfo = c.createOscillator(), lfoG = c.createGain()
  lfo.frequency.value = 9
  lfoG.gain.value = 0.22
  trem.gain.value = 0.78
  lfo.connect(lfoG).connect(trem.gain)
  const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain()
  n.buffer = o.noise
  n.loop = true
  nf.type = 'bandpass'
  nf.frequency.value = 620
  nf.Q.value = 0.7
  ng.gain.value = 1.1
  n.connect(nf).connect(ng).connect(trem)
  mix.connect(lp).connect(trem).connect(g).connect(o.out)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.7)
  const all: AudioScheduledSourceNode[] = [...tones.map(([osc]) => osc), lfo, n]
  for (const x of all) x.start(t)
  return (at, fade = 0.8) => {
    g.gain.cancelScheduledValues(at)
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + fade)
    for (const [osc, f] of tones) {
      osc.frequency.cancelScheduledValues(at)
      osc.frequency.setValueAtTime(Math.max(osc.frequency.value, 1), at)
      osc.frequency.exponentialRampToValueAtTime(f * 0.4, at + fade)
    }
    for (const x of all) x.stop(at + fade + 0.05)
  }
}

/** 실습장 배경 소음: 낮은 웅웅거림 + 환풍기 바람(작은 스피커에서도 들리는 띠). 돌려주는 함수를 부르면 0.3초에 걸쳐 잦아든다 */
export function startAmbience(o: SoundOut, t: number): (at: number) => void {
  const c = o.ctx, g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(1, t + 1.2)
  g.connect(o.out)
  const layer = (type: BiquadFilterType, f: number, q: number, level: number, offset: number): { src: AudioBufferSourceNode; level: GainNode } => {
    const src = c.createBufferSource(), bf = c.createBiquadFilter(), lg = c.createGain()
    src.buffer = o.noise
    src.loop = true
    bf.type = type
    bf.frequency.value = f
    bf.Q.value = q
    lg.gain.value = level
    src.connect(bf).connect(lg).connect(g)
    src.start(t, offset)
    return { src, level: lg }
  }
  const hum = layer('lowpass', 260, 0.7, 0.05, 0.11)
  const air = layer('bandpass', 650, 0.5, 0.016, 0.73)
  // 바람이 천천히 세졌다 약해진다
  const lfo = c.createOscillator(), lfoG = c.createGain()
  lfo.frequency.value = 0.13
  lfoG.gain.value = 0.006
  lfo.connect(lfoG).connect(air.level.gain)
  lfo.start(t)
  return (at) => {
    g.gain.cancelScheduledValues(at)
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)
    for (const x of [hum.src, air.src, lfo]) x.stop(at + 0.35)
  }
}

/** 멀리서 공구 부딪는 소리 한 번(작게). pan은 좌우(−1~1), r1·r2는 음높이를 흔드는 0~1 값 */
export function clank(o: SoundOut, t: number, pan: number, r1: number, r2: number): void {
  const c = o.ctx, p = c.createStereoPanner()
  p.pan.value = pan
  p.connect(o.out)
  for (const f of [1750 + r1 * 300, 2650 + r2 * 300]) {
    const osc = c.createOscillator(), g = c.createGain()
    osc.frequency.value = f
    env(g, t, 0.012, 0.005, 0.7)
    osc.connect(g).connect(p)
    osc.start(t)
    osc.stop(t + 0.75)
  }
}

/** 브라우저의 오디오 장치(없으면 null) */
function browserAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return AC ? new AC() : null
}

export class LabSound {
  private ctx: AudioContext | null = null
  private o: SoundOut | null = null
  private stopRollers: ((at: number, fade?: number) => void) | null = null
  private stopAmbience: ((at: number) => void) | null = null
  private wantRollers = false
  private wantAmbience = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private last: Partial<Record<CueName, number>> = {}
  enabled = false

  /** create: 오디오 장치를 만드는 함수(시험에서는 가짜 장치를 넣는다) */
  constructor(private readonly create: () => AudioContext | null = browserAudio) {}

  /** 켜기·끄기. 켜기는 버튼을 누른 순간(사용자 동작) 불러야 브라우저가 소리를 허락한다. 켜지면 '딸깍'이 한 번 난다 */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return
    this.enabled = on
    if (on) this.start()
    else this.stop()
  }

  /** 소리 하나를 낸다. delay초 뒤에 시작한다. 꺼져 있으면 아무 일도 없다 */
  play(name: CueName, delay = 0): void {
    this.emit(name, delay, CUES[name])
  }

  /** 발소리 한 번. 걸음마다 음높이를 조금씩 바꾼다 */
  step(): void {
    this.emit('step', 0, (o, t) => stepCue(o, t, 0.92 + Math.random() * 0.16, Math.random() * 1.2))
  }

  /** 롤러가 도는지 알려 준다. 회전음은 '소리 켬 && 도는 중'이라는 상태를 따른다 */
  setRollers(on: boolean): void {
    this.wantRollers = on
    this.sync()
  }

  /** 실습장에 있는지 알려 준다. 배경 소음은 '소리 켬 && 실습장'이라는 상태를 따른다 */
  setAmbience(on: boolean): void {
    this.wantAmbience = on
    this.sync()
  }

  private emit(name: CueName, delay: number, draw: (o: SoundOut, t: number) => void): void {
    const o = this.o
    if (!this.enabled || !o) return
    // 장치가 멈춰 있으면(화면이 뒤로 갔다 온 뒤 등) 깨우기만 하고 이 소리는 버린다 — 모아 두었다 한꺼번에 내지 않는다
    if (o.ctx.state !== 'running') { this.wake(); return }
    const now = o.ctx.currentTime
    const last = this.last[name]
    if (last !== undefined && now - last < MIN_GAP) return
    this.last[name] = now
    draw(o, now + 0.01 + delay)
  }

  private wake(): void {
    const ctx = this.ctx
    if (ctx && this.enabled) void ctx.resume().then(() => this.sync(), () => undefined)
  }

  private start(): void {
    if (!this.ctx) {
      const ctx = this.create()
      if (!ctx) return
      this.ctx = ctx
      this.o = { ctx, out: makeOutput(ctx), noise: makeNoise(ctx) }
    }
    const ctx = this.ctx
    const ready = (): void => {
      if (!this.enabled) return
      this.play('press')
      this.sync()
    }
    if (ctx.state === 'running') ready()
    else void ctx.resume().then(ready, () => undefined)
  }

  private stop(): void {
    this.sync()
    const ctx = this.ctx
    if (ctx) setTimeout(() => { if (!this.enabled) void ctx.suspend() }, 400)
  }

  /** 이어지는 소리를 지금 상태(켬·롤러·실습장)에 맞춘다 */
  private sync(): void {
    const o = this.o
    if (!o) return
    const live = this.enabled && o.ctx.state === 'running'
    const now = o.ctx.currentTime
    if (live && this.wantRollers && !this.stopRollers) this.stopRollers = startRollers(o, now + 0.01)
    else if (this.stopRollers && !(this.enabled && this.wantRollers)) { this.stopRollers(now, this.enabled ? 0.8 : 0.25); this.stopRollers = null }
    if (live && this.wantAmbience && !this.stopAmbience) { this.stopAmbience = startAmbience(o, now + 0.01); this.scheduleClank(true) }
    else if (this.stopAmbience && !(this.enabled && this.wantAmbience)) {
      this.stopAmbience(now)
      this.stopAmbience = null
      if (this.timer) { clearTimeout(this.timer); this.timer = null }
    }
  }

  /** 배경 소음이 깔린 동안 9~20초마다(처음은 4~8초 뒤) 멀리서 공구 부딪는 소리 */
  private scheduleClank(first = false): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      const o = this.o
      if (!this.stopAmbience || !o) return
      if (o.ctx.state === 'running') clank(o, o.ctx.currentTime + 0.01, Math.random() * 1.6 - 0.8, Math.random(), Math.random())
      this.scheduleClank()
    }, first ? 4000 + Math.random() * 4000 : 9000 + Math.random() * 11000)
  }
}
