// tests/sound.test.ts — 합성 소리 엔진(설계 2026-11-12 §4.4): 소리 목록, 예약 시각과 길이, 켜기·끄기, 이어지는 소리
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REACTION_CUES } from '../src/app/reactions'
import { CUE_NAMES, CUES, LabSound, makeNoise, makeOutput, MIN_GAP, startAmbience, startRollers, type CueName, type SoundOut } from '../src/scene/sound'
import { FakeAudioContext, FakeNode, feedsParam, flush, reaches } from './helpers/fakeAudio'

const rig = () => {
  const ctx = new FakeAudioContext()
  const base = ctx as unknown as BaseAudioContext
  const out = makeOutput(base)
  const o: SoundOut = { ctx: base, out, noise: makeNoise(base) }
  return { ctx, o, out: out as unknown as FakeNode }
}

describe('소리 목록', () => {
  it('규칙표가 부르는 열두 가지에 발소리를 더한 것과 같다', () => {
    expect([...CUE_NAMES]).toEqual([...REACTION_CUES, 'step'])
    expect(Object.keys(CUES).sort()).toEqual([...CUE_NAMES].sort())
  })
  it('엔진은 아무것도 들여오지 않는다(과제 상태를 모른다)', () => {
    expect(readFileSync('src/scene/sound.ts', 'utf8')).not.toMatch(/\bimport\b|\bfrom\s+['"]|\brequire\(/)
  })
})

describe('나가는 길', () => {
  it('전체 세기 → 압축기 → 스피커 한 줄이다', () => {
    const { ctx, out } = rig()
    expect(out.kind).toBe('gain')
    expect(out.gain.value).toBe(0.9)
    const comp = out.to[0] as FakeNode
    expect(comp.kind).toBe('compressor')
    expect([comp.threshold.value, comp.ratio.value]).toEqual([-16, 4])
    expect(comp.to).toEqual([ctx.destination])
  })
  it('소음 재료는 2초이고 잴 때마다 같은 값이다(무작위가 아니다)', () => {
    const a = makeNoise(new FakeAudioContext() as unknown as BaseAudioContext).getChannelData(0)
    const b = makeNoise(new FakeAudioContext() as unknown as BaseAudioContext).getChannelData(0)
    expect(a.length).toBe(88200)
    expect(Array.from(a.slice(0, 64))).toEqual(Array.from(b.slice(0, 64)))
    expect(Math.max(...a.slice(0, 2000))).toBeGreaterThan(0.5)
    expect(Math.min(...a.slice(0, 2000))).toBeLessThan(-0.5)
  })
})

/** 예약한 끝 시각의 한도(초). 들리는 길이(−50 dB 기준)는 이보다 짧고, 브라우저에서 따로 잰다 */
const END_LIMIT: Record<CueName, number> = {
  tap: 0.15, press: 0.15, pedal: 0.15, tick: 0.15, ppe: 0.15, step: 0.15,
  stepDone: 0.35, codex: 0.35, stamp: 0.25, celebrate: 0.95,
  lift: 1.35, liftLong: 2.85, vehicle: 1.7,
}

describe('한 번 나는 소리 — 예약', () => {
  for (const name of CUE_NAMES) it(name, () => {
    const { ctx, o, out } = rig()
    const before = ctx.nodes.length
    CUES[name](o, 10)
    const made = ctx.nodes.slice(before)
    const src = made.filter((n) => n.kind === 'osc' || n.kind === 'source')
    expect(src.length).toBeGreaterThan(0)
    for (const s of src) {
      expect(s.startedAt, '시작 시각').not.toBeNull()
      expect(s.startedAt!).toBeGreaterThanOrEqual(10)
      expect(s.endsAt, '끝 시각(끝없이 울리면 안 된다)').not.toBeNull()
      expect(s.endsAt!).toBeLessThanOrEqual(10 + END_LIMIT[name] + 1e-9)
      expect(reaches(s, out) || feedsParam(s), '전체 세기를 거쳐 나가거나, 다른 부품의 값을 흔든다').toBe(true)
    }
    // 압축기를 건너뛰어 스피커에 바로 꽂는 부품이 없다
    for (const n of made) expect(n.to.includes(ctx.destination)).toBe(false)
    // 층 하나의 세기는 0.5를 넘지 않는다
    for (const n of made.filter((x) => x.kind === 'gain')) for (const e of n.gain.events) expect(e.v).toBeLessThanOrEqual(0.5)
  })
  it('긴 리프트 소리는 짧은 것과 같은 조립이고 길이만 다르다', () => {
    const a = rig(), b = rig()
    const na = a.ctx.nodes.length, nb = b.ctx.nodes.length
    CUES.lift(a.o, 0); CUES.liftLong(b.o, 0)
    expect(b.ctx.nodes.slice(nb).map((n) => n.kind)).toEqual(a.ctx.nodes.slice(na).map((n) => n.kind))
    const end = (c: FakeAudioContext, from: number) => Math.max(...c.nodes.slice(from).map((n) => n.endsAt ?? 0))
    expect(end(a.ctx, na)).toBeCloseTo(1.1 + 0.15, 6)
    expect(end(b.ctx, nb)).toBeCloseTo(2.6 + 0.15, 6)
  })
})

describe('이어지는 소리', () => {
  it('롤러 회전음: 시작하면 끝 시각 없이 이어지고, 멈추면 0.8초에 걸쳐 잦아든 뒤 끝난다', () => {
    const { ctx, o, out } = rig()
    const before = ctx.nodes.length
    const stop = startRollers(o, 1)
    const src = ctx.nodes.slice(before).filter((n) => n.kind === 'osc' || n.kind === 'source')
    expect(src.length).toBe(6)
    for (const s of src) { expect(s.startedAt).toBe(1); expect(s.endsAt).toBeNull() }
    expect(src.filter((s) => reaches(s, out)).length).toBe(5) // 음 넷 + 소음
    expect(src.filter((s) => !reaches(s, out) && feedsParam(s)).length).toBe(1) // 떨림을 주는 발진기는 세기 값에 꽂힌다
    stop(5)
    for (const s of src) expect(s.endsAt).toBeCloseTo(5.85, 6)
  })
  it('롤러 회전음을 빨리 멈출 수도 있다(소리를 끌 때)', () => {
    const { ctx, o } = rig()
    const before = ctx.nodes.length
    startRollers(o, 0)(2, 0.25)
    for (const s of ctx.nodes.slice(before).filter((n) => n.kind === 'osc' || n.kind === 'source')) expect(s.endsAt).toBeCloseTo(2.3, 6)
  })
  it('배경 소음: 소음 두 줄이 이어지고, 멈추면 0.3초에 걸쳐 잦아든다', () => {
    const { ctx, o, out } = rig()
    const before = ctx.nodes.length
    const stop = startAmbience(o, 0)
    const made = ctx.nodes.slice(before)
    const loops = made.filter((n) => n.kind === 'source')
    expect(loops.length).toBe(2)
    for (const s of loops) { expect(s.loop).toBe(true); expect(s.endsAt).toBeNull(); expect(reaches(s, out)).toBe(true) }
    stop(3)
    for (const s of made.filter((n) => n.kind === 'osc' || n.kind === 'source')) expect(s.endsAt).toBeCloseTo(3.35, 6)
  })
})

describe('LabSound — 켜기·끄기', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  const make = () => {
    const ctx = new FakeAudioContext()
    let made = 0
    const sound = new LabSound(() => { made++; return ctx as unknown as AudioContext })
    return { ctx, sound, made: () => made }
  }
  const started = (ctx: FakeAudioContext) => ctx.sources().length

  it('처음에는 꺼져 있고, 켜기 전에는 오디오 장치를 만들지 않는다', () => {
    const { sound, made } = make()
    expect(sound.enabled).toBe(false)
    sound.play('tap'); sound.step(); sound.setRollers(true); sound.setAmbience(true)
    expect(made()).toBe(0)
  })
  it('브라우저가 아니면(장치를 못 만들면) 켜도 아무 일도 없다', () => {
    const sound = new LabSound(() => null)
    sound.setEnabled(true)
    expect(() => { sound.play('tap'); sound.setRollers(true); sound.setEnabled(false) }).not.toThrow()
  })
  it("켜면 장치를 한 번 만들고 '딸깍'을 한 번 낸다(켜졌다는 확인)", () => {
    const { ctx, sound, made } = make()
    sound.setEnabled(true)
    expect(made()).toBe(1)
    expect(started(ctx)).toBe(2) // press = 소음 두 줌
    sound.setEnabled(false); sound.setEnabled(true)
    expect(made()).toBe(1)
  })
  it('장치가 아직 멈춰 있으면 깨운 뒤에 확인음을 낸다', async () => {
    const { ctx, sound } = make()
    ctx.state = 'suspended'
    sound.setEnabled(true)
    expect(started(ctx)).toBe(0)
    await flush()
    expect(ctx.resumes).toBe(1)
    expect(started(ctx)).toBe(2)
  })
  it('끄면 소리를 내지 않고, 0.4초 뒤 장치를 재운다', () => {
    const { ctx, sound } = make()
    sound.setEnabled(true)
    const n = started(ctx)
    sound.setEnabled(false)
    sound.play('tap')
    expect(started(ctx)).toBe(n)
    expect(ctx.state).toBe('running')
    vi.advanceTimersByTime(450)
    expect(ctx.state).toBe('suspended')
  })
  it('끄자마자 다시 켜면 재우지 않는다', () => {
    const { ctx, sound } = make()
    sound.setEnabled(true); sound.setEnabled(false); sound.setEnabled(true)
    vi.advanceTimersByTime(450)
    expect(ctx.state).toBe('running')
  })
})

describe('LabSound — 한 번 나는 소리', () => {
  const on = () => {
    const ctx = new FakeAudioContext()
    const sound = new LabSound(() => ctx as unknown as AudioContext)
    sound.setEnabled(true)
    ctx.currentTime = 1
    return { ctx, sound }
  }
  it('지금 시각에서 0.01초 뒤에, 늦춤이 있으면 그만큼 더 뒤에 시작한다', () => {
    const { ctx, sound } = on()
    const n = ctx.sources().length
    sound.play('tap')
    sound.play('stepDone', 0.12)
    const s = ctx.sources().slice(n)
    expect(s.filter((x) => Math.abs(x.startedAt! - 1.01) < 1e-9).length).toBe(2) // tap = 소음 한 줌 + 음 하나
    expect(Math.min(...s.slice(2).map((x) => x.startedAt!))).toBeCloseTo(1.13, 6)
  })
  it(`같은 소리는 ${MIN_GAP}초 안에 다시 내지 않는다(연달아 눌러도 쌓이지 않는다). 다른 소리는 낸다`, () => {
    const { ctx, sound } = on()
    const n = ctx.sources().length
    sound.play('tap'); sound.play('tap')
    expect(ctx.sources().length - n).toBe(2)
    sound.play('press')
    expect(ctx.sources().length - n).toBe(4)
    ctx.currentTime = 1 + MIN_GAP + 0.001
    sound.play('tap')
    expect(ctx.sources().length - n).toBe(6)
  })
  it('발소리는 걸음마다 조금씩 다르다(같은 조립, 다른 음높이)', () => {
    const { ctx, sound } = on()
    const rnd = vi.spyOn(Math, 'random')
    const freqOf = () => { const f = ctx.nodes.filter((x) => x.kind === 'filter'); return f[f.length - 2]!.frequency.events[0]!.v }
    rnd.mockReturnValue(0); sound.step(); const low = freqOf()
    ctx.currentTime = 2
    rnd.mockReturnValue(0.999); sound.step(); const high = freqOf()
    rnd.mockRestore()
    expect(low).toBeCloseTo(520 * 0.92, 3)
    expect(high).toBeGreaterThan(low)
  })
  it('장치가 멈춰 있을 때 온 요청은 버리고 장치만 깨운다(모아 두었다 한꺼번에 내지 않는다)', async () => {
    const { ctx, sound } = on()
    ctx.state = 'suspended'
    const n = ctx.sources().length, r = ctx.resumes
    sound.play('tap'); sound.play('press'); sound.step()
    expect(ctx.sources().length).toBe(n)
    expect(ctx.resumes).toBeGreaterThan(r)
    await flush()
    expect(ctx.state).toBe('running')
    expect(ctx.sources().length).toBe(n)
    sound.play('tap')
    expect(ctx.sources().length).toBe(n + 2)
  })
})

describe('LabSound — 이어지는 소리는 상태에 묶인다', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  const make = () => {
    const ctx = new FakeAudioContext()
    const sound = new LabSound(() => ctx as unknown as AudioContext)
    return { ctx, sound }
  }
  const live = (ctx: FakeAudioContext) => ctx.sources().filter((s) => s.startedAt !== null && s.endsAt === null).length

  it('롤러가 도는 중에 소리를 켜면 회전음이 시작된다', () => {
    const { ctx, sound } = make()
    sound.setRollers(true)
    expect(live(ctx)).toBe(0)
    sound.setEnabled(true)
    expect(live(ctx)).toBe(6)
  })
  it('롤러가 멈추면 회전음이 끝나고, 같은 값을 다시 넣어도 겹쳐 시작하지 않는다', () => {
    const { ctx, sound } = make()
    sound.setEnabled(true)
    sound.setRollers(true); sound.setRollers(true)
    expect(live(ctx)).toBe(6)
    sound.setRollers(false)
    expect(live(ctx)).toBe(0)
  })
  it('소리를 끄면 이어지는 소리가 모두 끝나고, 다시 켜면 그때 상태대로 돌아온다', () => {
    const { ctx, sound } = make()
    sound.setEnabled(true)
    sound.setRollers(true); sound.setAmbience(true)
    expect(live(ctx)).toBe(6 + 3) // 회전음 6 + 배경 소음 2줄과 느린 떨림 1
    sound.setEnabled(false)
    expect(live(ctx)).toBe(0)
    sound.setRollers(false)
    sound.setEnabled(true)
    expect(live(ctx)).toBe(3)
  })
  it('배경 소음이 깔린 동안에만 먼 공구 소리가 가끔 난다. 장치가 멈춰 있으면 건너뛴다', () => {
    const { ctx, sound } = make()
    sound.setEnabled(true); sound.setAmbience(true)
    const n = ctx.sources().length
    vi.advanceTimersByTime(8100)
    expect(ctx.sources().length).toBe(n + 2) // 공구 소리 = 음 둘
    ctx.state = 'suspended'
    vi.advanceTimersByTime(20100)
    expect(ctx.sources().length).toBe(n + 2)
    ctx.state = 'running'
    sound.setAmbience(false)
    vi.advanceTimersByTime(60000)
    expect(ctx.sources().length).toBe(n + 2)
  })
})
