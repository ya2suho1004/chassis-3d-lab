// tests/helpers/fakeAudio.ts — 소리를 내지 않고 '무엇을 언제 예약했는지'만 적어 두는 가짜 오디오 장치.
// 소리 엔진(src/scene/sound.ts)이 쓰는 Web Audio 기능만 흉내 낸다. 실제 세기·길이는 촬영 도구의 sound 명령이 브라우저에서 잰다.
export class FakeParam {
  value = 0
  events: Array<{ kind: 'set' | 'exp' | 'lin' | 'cancel'; v: number; t: number }> = []
  // 진짜 장치에서 예약한 값은 그 시각이 되어야 value에 나타난다(브라우저에 따라서는 끝내 나타나지 않는다). 그래서 예약은 value를 바꾸지 않는다 — 엔진이 '지금 값'을 읽어 쓰면 시험에서 드러난다
  setValueAtTime(v: number, t: number): this { this.events.push({ kind: 'set', v, t }); return this }
  exponentialRampToValueAtTime(v: number, t: number): this {
    // 진짜 장치도 0 이하로 가는 지수 곡선은 오류를 낸다
    if (!(v > 0)) throw new RangeError('exponentialRampToValueAtTime: 값은 0보다 커야 한다')
    this.events.push({ kind: 'exp', v, t }); return this
  }
  linearRampToValueAtTime(v: number, t: number): this { this.events.push({ kind: 'lin', v, t }); return this }
  cancelScheduledValues(t: number): this { this.events.push({ kind: 'cancel', v: 0, t }); return this }
}

export class FakeNode {
  to: Array<FakeNode | FakeParam> = []
  startedAt: number | null = null
  endsAt: number | null = null
  type = ''
  loop = false
  buffer: unknown = null
  gain = new FakeParam(); frequency = new FakeParam(); Q = new FakeParam(); pan = new FakeParam(); playbackRate = new FakeParam()
  threshold = new FakeParam(); ratio = new FakeParam(); attack = new FakeParam(); release = new FakeParam()
  constructor(readonly kind: string) {}
  connect<T extends FakeNode | FakeParam>(n: T): T { this.to.push(n); return n }
  disconnect(): void { this.to = [] }
  start(t = 0, _offset = 0, duration?: number): void {
    if (this.startedAt !== null) throw new Error('InvalidStateError: 이미 시작한 소리를 다시 시작했다')
    this.startedAt = t
    if (duration !== undefined) this.endsAt = t + duration
  }
  stop(t = 0): void {
    if (this.startedAt === null) throw new Error('InvalidStateError: 시작하지 않은 소리를 멈췄다')
    this.endsAt = t
  }
}

export class FakeAudioContext {
  currentTime = 0
  sampleRate = 44100
  state: 'running' | 'suspended' | 'interrupted' = 'running'
  destination = new FakeNode('destination')
  nodes: FakeNode[] = []
  resumes = 0
  /** 깨우기를 거절하게 한다(브라우저가 누름 밖에서 부른 깨우기를 들어주지 않을 때) */
  failResume = false
  /** 재우기가 조금 뒤에 끝나게 한다. 그동안 state는 running으로 남는다(그런 브라우저가 있다) */
  lateSuspend = false
  private make(kind: string): FakeNode { const n = new FakeNode(kind); this.nodes.push(n); return n }
  createOscillator(): FakeNode { return this.make('osc') }
  createGain(): FakeNode { const n = this.make('gain'); n.gain.value = 1; return n }
  createBiquadFilter(): FakeNode { return this.make('filter') }
  createBufferSource(): FakeNode { return this.make('source') }
  createStereoPanner(): FakeNode { return this.make('panner') }
  createDynamicsCompressor(): FakeNode { return this.make('compressor') }
  createBuffer(_channels: number, length: number, sampleRate: number): { length: number; sampleRate: number; getChannelData: () => Float32Array } {
    const data = new Float32Array(length)
    return { length, sampleRate, getChannelData: () => data }
  }
  /** 진짜 장치처럼 조금 뒤에(다음 순서에) 깨어난다 */
  resume(): Promise<void> {
    this.resumes++
    if (this.failResume) return Promise.reject(new Error('NotAllowedError'))
    return Promise.resolve().then(() => { this.state = 'running' })
  }
  suspend(): Promise<void> {
    if (this.lateSuspend) return Promise.resolve().then(() => { this.state = 'suspended' })
    this.state = 'suspended'
    return Promise.resolve()
  }
  /** 소리를 내는 부품(발진기·소음 재생기) */
  sources(): FakeNode[] { return this.nodes.filter((n) => n.kind === 'osc' || n.kind === 'source') }
}

/** 미뤄 둔 일(깨어나기 등)이 끝나기를 기다린다 */
export async function flush(): Promise<void> { for (let i = 0; i < 6; i++) await Promise.resolve() }

/** 소리가 아니라 다른 부품의 값(세기 등)을 흔드는 데 꽂혀 있는지 */
export function feedsParam(from: FakeNode): boolean {
  const seen = new Set<FakeNode>()
  const walk = (n: FakeNode): boolean => {
    if (seen.has(n)) return false
    seen.add(n)
    return n.to.some((x) => x instanceof FakeParam || walk(x))
  }
  return walk(from)
}

/** from에서 연결을 따라 to에 닿는지 */
export function reaches(from: FakeNode, to: FakeNode): boolean {
  const seen = new Set<FakeNode>()
  const walk = (n: FakeNode): boolean => {
    if (n === to) return true
    if (seen.has(n)) return false
    seen.add(n)
    return n.to.some((x) => x instanceof FakeNode && walk(x))
  }
  return walk(from)
}
