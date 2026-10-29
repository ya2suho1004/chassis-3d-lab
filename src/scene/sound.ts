// 실습장 소리(게임 화면): 발소리 · 실습장 소음(낮은 웅웅거림 + 가끔 먼 공구 소리). 녹음 파일 없이 Web Audio로 만든다(저작권 걱정 없음).
// 교실에서 여러 태블릿이 함께 켜지므로 처음에는 꺼 두고, 학생이 상태 막대의 소리 버튼으로 켠다(브라우저도 사용자 동작 뒤에만 소리를 허락).

/** 걷기 한 걸음 길이(m) — 캐릭터 걷기 한 주기 1.47 m의 절반 */
export const STEP_STRIDE = 0.735

/** 걸은 거리 누적값이 prev→next로 늘 때 넘은 걸음 수 */
export function stepsCrossed(prev: number, next: number, stride = STEP_STRIDE): number {
  if (next <= prev) return 0
  return Math.floor(next / stride) - Math.floor(prev / stride)
}

type Ctx = AudioContext

export class LabSound {
  private ctx: Ctx | null = null
  private noise: AudioBuffer | null = null
  private room: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  enabled = false

  /** 켜기·끄기. 켜기는 버튼을 누른 순간(사용자 동작) 불러야 브라우저가 소리를 허락한다 */
  setEnabled(on: boolean): void {
    this.enabled = on
    if (on) this.start()
    else this.stop()
  }

  /** 발소리 한 번(짧은 마찰음 + 낮은 쿵) */
  step(): void {
    const ctx = this.ctx
    if (!this.enabled || !ctx || !this.noise) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 0.9 + Math.random() * 0.25
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 260 + Math.random() * 120
    bp.Q.value = 1.1
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    src.connect(bp).connect(g).connect(ctx.destination)
    src.start(t, Math.random() * 1.5, 0.1)
    const thump = ctx.createOscillator()
    thump.frequency.value = 85
    const tg = ctx.createGain()
    tg.gain.setValueAtTime(0.0001, t)
    tg.gain.exponentialRampToValueAtTime(0.06, t + 0.01)
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
    thump.connect(tg).connect(ctx.destination)
    thump.start(t)
    thump.stop(t + 0.08)
  }

  private start(): void {
    if (typeof window === 'undefined') return
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    if (!this.ctx) {
      this.ctx = new AC()
      // 2초짜리 흰 소음(발소리·웅웅거림 재료)
      const len = this.ctx.sampleRate * 2
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    }
    void this.ctx.resume()
    if (!this.room && this.noise) {
      const ctx = this.ctx
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 180
      const gain = ctx.createGain()
      gain.gain.value = 0.0001
      gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 1.2)
      src.connect(lp).connect(gain).connect(ctx.destination)
      src.start()
      this.room = { src, gain }
    }
    this.scheduleClank()
  }

  private stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (this.room && this.ctx) {
      const { src, gain } = this.room
      gain.gain.cancelScheduledValues(this.ctx.currentTime)
      gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.3)
      src.stop(this.ctx.currentTime + 0.35)
      this.room = null
    }
    const ctx = this.ctx
    if (ctx) setTimeout(() => { if (!this.enabled) void ctx.suspend() }, 400)
  }

  /** 9~20초마다 멀리서 공구 부딪는 소리(작게, 좌우 무작위) */
  private scheduleClank(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      const ctx = this.ctx
      if (!this.enabled || !ctx) return
      const t = ctx.currentTime
      const pan = ctx.createStereoPanner()
      pan.pan.value = Math.random() * 1.6 - 0.8
      pan.connect(ctx.destination)
      for (const f of [1750 + Math.random() * 300, 2650 + Math.random() * 300]) {
        const o = ctx.createOscillator()
        o.frequency.value = f
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.012, t + 0.005)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
        o.connect(g).connect(pan)
        o.start(t)
        o.stop(t + 0.75)
      }
      this.scheduleClank()
    }, 9000 + Math.random() * 11000)
  }
}
