// 캐릭터 만들기·닉네임(설계 docs/superpowers/specs/2026-11-03-character-creation-design.md)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { AVATAR_KEY, BODIES, DEFAULT_PROFILE, EYES, HAIR_COLORS, HAIR_STYLES, NICK_BACK, NICK_FRONT, SKINS, bodyScale, loadAvatar, nicknameOf, parseAvatarStore, parseProfile, randomNickname, saveAvatar } from '../src/app/avatar'
import { createDemoSession } from '../src/app/session'
import { buildRecordPayload } from '../src/domain/record'
import { createTaskRun } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
})

describe('선택지', () => {
  test('사용자 결정 개수: 체형 2·머리 모양 4·머리색 5·피부색 5·눈 색 4·낱말 12×12', () => {
    expect([BODIES.length, HAIR_STYLES.length, HAIR_COLORS.length, SKINS.length, EYES.length, NICK_FRONT.length, NICK_BACK.length]).toEqual([2, 4, 5, 5, 4, 12, 12])
  })
  test('화면 이름에 성별 낱말이 없다(체형 1·2)', () => {
    expect(BODIES.map((b) => b.label)).toEqual(['체형 1', '체형 2'])
  })
  test('체형 2는 키 1.62 m 비율', () => {
    expect(bodyScale('a')).toBe(1)
    expect(bodyScale('b')).toBeCloseTo(1.62 / 1.72, 6)
  })
})

describe('닉네임', () => {
  test('앞말과 뒷말을 띄어 붙인다', () => {
    expect(nicknameOf({ nickFront: '꼼꼼한', nickBack: '토크렌치' })).toBe('꼼꼼한 토크렌치')
  })
  test('무작위 뽑기는 목록 안의 낱말만 낸다(경계값 포함)', () => {
    expect(randomNickname(() => 0)).toEqual({ nickFront: NICK_FRONT[0], nickBack: NICK_BACK[0] })
    expect(randomNickname(() => 0.999999)).toEqual({ nickFront: NICK_FRONT[11], nickBack: NICK_BACK[11] })
    for (let i = 0; i < 50; i++) {
      const n = randomNickname()
      expect(NICK_FRONT).toContain(n.nickFront)
      expect(NICK_BACK).toContain(n.nickBack)
    }
  })
})

describe('저장(이 기기, 코드별)', () => {
  test('기본값은 그대로 통과한다', () => {
    expect(parseProfile(DEFAULT_PROFILE)).toEqual(DEFAULT_PROFILE)
  })
  test('목록에 없는 값·직접 쓴 닉네임은 받지 않는다', () => {
    expect(parseProfile({ ...DEFAULT_PROFILE, hairColor: '#ff00ff' })).toBeNull()
    expect(parseProfile({ ...DEFAULT_PROFILE, nickFront: '홍길동' })).toBeNull()
    expect(parseProfile({ ...DEFAULT_PROFILE, body: 'c' })).toBeNull()
    expect(parseProfile(null)).toBeNull()
  })
  test('깨진 JSON·배열은 빈 저장소, 잘못된 코드만 빠진다', () => {
    expect(parseAvatarStore('{')).toEqual({})
    expect(parseAvatarStore('[]')).toEqual({})
    expect(parseAvatarStore(JSON.stringify({ 'A-01': DEFAULT_PROFILE, 'A-02': { body: 'x' } }))).toEqual({ 'A-01': DEFAULT_PROFILE })
  })
  test('코드별로 따로 저장·불러오기, 다른 코드는 없음', () => {
    const p = { ...DEFAULT_PROFILE, body: 'b' as const, hairStyle: 'tied' as const }
    expect(saveAvatar('A-01', p)).toBe(true)
    expect(saveAvatar('A-02', DEFAULT_PROFILE)).toBe(true)
    expect(loadAvatar('A-01')).toEqual(p)
    expect(loadAvatar('A-02')).toEqual(DEFAULT_PROFILE)
    expect(loadAvatar('A-03')).toBeNull()
    expect(Object.keys(JSON.parse(store.get(AVATAR_KEY)!))).toEqual(['A-01', 'A-02'])
  })
})

describe('연구 기록과 분리', () => {
  test('기록 payload에 닉네임·외모가 들어가지 않는다', () => {
    saveAvatar('A-01', DEFAULT_PROFILE)
    const session = createDemoSession({ studentCode: 'A-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview' })
    const payload = buildRecordPayload(createTaskRun(lv1 as ApprovedTask, { difficultyMode: 'guided' }), session, { completedAtIso: '2026-11-03T00:00:00Z', completionStatus: 'aborted' })
    const json = JSON.stringify(payload)
    expect(json).not.toContain(nicknameOf(DEFAULT_PROFILE))
    for (const k of ['nickFront', 'nickBack', 'hairStyle', 'hairColor', 'avatar']) expect(json).not.toContain(k)
  })
  test('AI 교관 요청 필드 목록에 닉네임·외모가 없다', () => {
    const src = readFileSync(new URL('../src/chat/chatClient.ts', import.meta.url), 'utf8')
    for (const k of ['nick', 'avatar', 'hairStyle']) expect(src).not.toContain(k)
  })
})
