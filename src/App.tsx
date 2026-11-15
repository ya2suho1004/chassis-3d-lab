import type { RecordPayload } from './domain/record'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionContext } from './domain/record'
import { createTaskRun, rehydrateRun, serializeRun, type DifficultyMode, type TaskRun } from './domain/taskEngine'
import type { ApprovedTask } from './domain/types'
import { openRepository, type Draft, type Repository } from './records/repository'
import { openMemoryRepository } from './records/memoryRepository'
import type { DeliveryEnvelope } from './records/types'
import { StartScreen } from './screens/StartScreen'
import { ResultScreen } from './screens/ResultScreen'
import { ResumeScreen } from './screens/ResumeScreen'
import { LabScreen } from './screens/LabScreen'
import { listTasks } from './app/session'
import { retryFreeze } from './app/saveRecovery'
import { AvatarScreen } from './screens/AvatarScreen'
import { IntroScreen } from './screens/IntroScreen'
import { introPlan, loadIntroPrefs, preloadPlan } from './app/intro'
import { initialQuality } from './app/quality'
import { useGLTF } from '@react-three/drei'
import { DEFAULT_PROFILE, loadAvatar, nicknameOf, randomNickname, saveAvatar, type AvatarProfile } from './app/avatar'
import { assetUrl } from './app/assetUrl'
import { LabSound } from './scene/sound'
import { screenPreset, type ClassLinkTaken } from './app/classLink'
import { caseKey, knownCaseIds, loadPreset } from './app/teacherPreset'
import { resumeTodayLine } from './app/todayTask'
import { isClassSession } from './app/sessions'
import { getSubmitEndpoint } from './delivery/config'
import { classSendLine, createAutoSender, type AutoSender } from './delivery/autoSend'

const TASKS = listTasks()
/** 이 기기에 저장된 교사 설정(시작 화면과 같은 사례 목록으로 읽음) */
const loadDevicePreset = () => loadPreset(knownCaseIds(TASKS))
/** 수업용 세션 기록을 마치면 바로 보낼 수 있는 빌드인가(전송 주소가 있을 때만, 설계 2026-11-15-class-records §3-3) */
const autoSendOn = !!getSubmitEndpoint()

type Screen =
  | { name: 'loading' }
  | { name: 'storageError'; message: string }
  // startFresh: 시작 화면에서 코드로 찾은 초안(D4) — '새 수행 시작'은 초안을 지우지 않고(다른 학생 것일 수 있음) 그 자리에서 새로 시작한다
  | { name: 'resume'; draft: Draft; startFresh?: () => Promise<void> }
  | { name: 'start' }
  // noRecord: 비기록 모드(설계 2026-11-02) — runRepo는 메모리 저장소이고 AI 교관·기록 표시를 끈다
  // avatar: 캐릭터 만들기(설계 2026-11-03) — 그 코드의 캐릭터가 이 기기에 없을 때만(비기록은 매번)
  | { name: 'avatar'; session: SessionContext; task: ApprovedTask; mode: DifficultyMode; noRecord: boolean; runRepo: Repository; initial: AvatarProfile }
  | { name: 'lab'; session: SessionContext; task: ApprovedTask; mode: DifficultyMode; run: TaskRun | null; noRecord: boolean; runRepo: Repository; profile: AvatarProfile }
  // sending: 수업용 세션 기록을 자동으로 보내는 중(설계 2026-11-15-class-records §3-3) — 결과 화면 전송 상태 한 줄에 쓴다
  | { name: 'result'; session: SessionContext; run: TaskRun; completionStatus: 'completed' | 'aborted'; envelope: DeliveryEnvelope | null; saveError: string | null; noRecord: boolean; profile: AvatarProfile; frozenPayload: RecordPayload | null; sending: boolean }

/** classLink: 앱이 열릴 때 읽은 수업 주소(main.tsx, 설계 2026-11-14 §3-4) — 시작 화면이 안내에 쓴다 */
export function App({ classLink }: { classLink?: ClassLinkTaken } = {}) {
  const [repo, setRepo] = useState<Repository | null>(null)
  const [screen, setScreen] = useState<Screen>({ name: 'loading' })
  // 자동 전송(설계 2026-11-15-class-records §3-3): 수업용 세션 기록만, 앱을 열 때·인터넷이 다시 연결될 때·기록을 확정할 때 보낸다
  const screenRef = useRef(screen)
  screenRef.current = screen
  const senderRef = useRef<AutoSender | null>(null)
  const repoRef = useRef<Repository | null>(null)
  const sendNow = useCallback(async () => {
    const r = repoRef.current
    const sender = senderRef.current
    if (!r || !sender) return
    await sender.run()
    // 결과 화면에 있으면 그 기록의 전송 상태를 이 기기 저장본으로 새로 읽는다
    const cur = screenRef.current
    if (cur.name !== 'result' || cur.noRecord) return
    let env: DeliveryEnvelope | null = null
    try {
      const stored = await r.loadRecord(cur.session.recordId)
      env = stored?.envelope ?? null
    } catch { /* 읽지 못하면 화면의 상태를 그대로 둔다 */ }
    setScreen((s) => (s.name === 'result' && s.session.recordId === cur.session.recordId ? { ...s, envelope: env ?? s.envelope, sending: false } : s))
  }, [])
  useEffect(() => {
    const onOnline = () => { void sendNow() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [sendNow])
  // 인트로(설계 2026-11-03): 저장소는 뒤에서 열고, 인트로가 끝나면 원래 첫 화면을 보인다
  const [intro] = useState(() => introPlan(loadIntroPrefs(), typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches))
  const [introDone, setIntroDone] = useState(intro === 'none')
  // 소리(설계 2026-11-12 §4.7): 엔진과 켬 상태는 실습 화면에서 결과 화면까지 이어지고, 그 밖의 화면에서는 꺼진다. 기기에 저장하지 않는다
  const [sound] = useState(() => new LabSound())
  const [soundOn, setSoundOn] = useState(false)
  // 화면의 켬 표시는 엔진을 따른다: 오디오 장치를 못 만들면 켜지지 않는다
  const changeSound = useCallback((on: boolean) => { sound.setEnabled(on); setSoundOn(sound.enabled) }, [sound])
  const inRun = screen.name === 'lab' || screen.name === 'result'
  useEffect(() => { if (!inRun) changeSound(false) }, [inRun, changeSound])
  // 화면이 가려지면(다른 앱·탭으로 가거나 화면이 꺼지면) 소리를 끈다. 돌아와도 꺼진 채로 둔다 — 뒤로 보낸 태블릿이 교실에서 소리를 내지 않게(설계 2026-11-12 §4.7)
  useEffect(() => {
    const onHide = () => { if (document.hidden) changeSound(false) }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [changeSound])
  // 실습장 3D 모델을 처음부터 미리 받아 둔다(인트로·코드 입력·캐릭터 만들기 동안). 실습장의 useGLTF가 같은 캐시를 쓴다
  // 품질 높음이면 화면 효과 코드도 함께(실습장과 같은 품질 판정 — app/quality.ts). 반사광은 실습장 자체로 만들어 받을 파일이 없다
  useEffect(() => {
    const q = initialQuality(window.location.search, !!window.matchMedia?.('(pointer: coarse)').matches)
    const plan = preloadPlan(q.low)
    for (const m of plan.models) useGLTF.preload(assetUrl(m), false, true)
    if (plan.effects) void import('./scene/Effects').catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await openRepository()
        if (cancelled) return
        senderRef.current = createAutoSender(r, () => { const url = getSubmitEndpoint(); return url ? { fetch: (u, i) => fetch(u, i), endpointUrl: url, now: () => new Date() } : null })
        repoRef.current = r
        setRepo(r)
        const cur = r.getCurrentRecordId()
        const draft = cur ? await r.loadDraft(cur) : null
        setScreen(draft ? { name: 'resume', draft } : { name: 'start' })
        // 앱을 열 때: 지난번에 못 보낸 수업용 기록을 다시 보낸다
        void sendNow()
      } catch (e) {
        setScreen({ name: 'storageError', message: (e as Error).message })
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (!introDone && intro !== 'none') return <IntroScreen plan={intro} onDone={() => setIntroDone(true)} />
  if (screen.name === 'loading') return <main className="screen"><p>저장소를 여는 중…</p></main>
  if (screen.name === 'storageError') return <main className="screen"><p className="error">이 기기의 저장소(IndexedDB)를 열 수 없습니다: {screen.message}</p><p className="small">시크릿 모드이거나 브라우저가 저장을 막고 있을 수 있습니다. 일반 창(시크릿 모드가 아닌 창)이나 다른 기기에서 다시 열어 보세요. 그래도 안 되면 선생님께 알려 주세요.</p></main>

  // 끝내지 않은 수행이 있으면 시작 화면을 건너뛰므로, 새 수업 주소의 오늘 과제와 다르면 사실만 알리고 주소를 못 읽었으면 안내한다(설계 2026-11-14 §7)
  if (screen.name === 'resume') {
    return (
      <ResumeScreen
        draft={screen.draft}
        keepDraft={!!screen.startFresh}
        todayLine={resumeTodayLine({ sessionCode: screen.draft.session.sessionCode, caseId: caseKey(screen.draft.snapshot.task), usagePhase: screen.draft.session.usagePhase, difficultyMode: screen.draft.snapshot.difficultyMode }, screenPreset(classLink, loadDevicePreset), TASKS)}
        linkFailed={classLink?.kind === 'bad'}
        onResume={() => {
          repo?.setCurrentRecordId(screen.draft.recordId)
          const run = rehydrateRun(screen.draft.snapshot)
          const task = listTasks().find((t) => t.measurement.caseId === run.task.measurement.caseId) ?? run.task
          const code = screen.draft.session.anonymousStudentCode
          setScreen({ name: 'lab', session: screen.draft.session, task, mode: run.difficultyMode, run, noRecord: false, runRepo: repo!, profile: loadAvatar(code) ?? DEFAULT_PROFILE })
        }}
        onDiscard={async () => {
          if (screen.startFresh) {
            // 초안은 그대로 둔다. 시작하지 못하면 시작 화면으로 돌아가 다시 고르게 한다
            try { await screen.startFresh() } catch { setScreen({ name: 'start' }) }
            return
          }
          await repo?.deleteDraft(screen.draft.recordId)
          repo?.clearCurrent()
          setScreen({ name: 'start' })
        }}
      />
    )
  }

  // 시작 화면에서는 세션만 만든다. 수행 번호(recordId)와 초안은 NPC에게 과제를 받을 때 발급·저장한다(설계 02 §3 S4).
  // 비기록이면 이 수행만 쓰는 메모리 저장소를 새로 만든다(실제 저장소·포인터는 건드리지 않음)
  if (screen.name === 'start') return <StartScreen repo={repo!} classLink={classLink} autoSend={autoSendOn} onFoundDraft={(draft, startFresh) => setScreen({ name: 'resume', draft, startFresh })} onStart={async (session, task, mode, noRecord = false) => {
    const runRepo = noRecord ? openMemoryRepository() : repo!
    const saved = noRecord ? null : loadAvatar(session.anonymousStudentCode)
    setScreen(saved
      ? { name: 'lab', session, task, mode, run: null, noRecord, runRepo, profile: saved }
      : { name: 'avatar', session, task, mode, noRecord, runRepo, initial: { ...DEFAULT_PROFILE, ...randomNickname() } })
    return null
  }} />

  if (screen.name === 'avatar') {
    const { session, task, mode, noRecord, runRepo } = screen
    return <AvatarScreen initial={screen.initial} saveNote={noRecord ? '기록 없이 하기라서 캐릭터도 저장하지 않습니다.' : `이 기기에 코드 ${session.anonymousStudentCode}의 캐릭터로 저장되고, 연구 기록·서버에는 보내지 않습니다.`}
      onDone={(profile) => { if (!noRecord) saveAvatar(session.anonymousStudentCode, profile); setScreen({ name: 'lab', session, task, mode, run: null, noRecord, runRepo, profile }) }} />
  }

  if (screen.name === 'lab') {
    const { session, task, mode, noRecord, runRepo, profile } = screen
    return (
      <LabScreen
        sound={sound} soundOn={soundOn} onSoundChange={changeSound}
        repo={runRepo}
        noRecord={noRecord}
        profile={profile}
        onProfileChange={(p) => { if (!noRecord) saveAvatar(session.anonymousStudentCode, p); setScreen((s) => (s.name === 'lab' ? { ...s, profile: p } : s)) }}
        session={session}
        task={task}
        mode={mode}
        run={screen.run}
        onReceiveTask={async () => {
          const run = createTaskRun(task, { difficultyMode: mode, displayMode: 'threeD' })
          const r = await runRepo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: new Date().toISOString() })
          if (r.status === 'failed') return `이 기기에 초안을 저장하지 못했습니다 (${r.errorCode}). 저장 공간·시크릿 모드를 확인한 뒤 다시 시도하세요.`
          runRepo.setCurrentRecordId(session.recordId)
          setScreen({ ...screen, run })
          return null
        }}
        onRunChange={(run) => setScreen((s) => (s.name === 'lab' ? { ...s, run } : s))}
        onFinish={(run, completionStatus, envelope, saveError, frozenPayload = null) => {
          setScreen({ name: 'result', session, run, completionStatus, envelope, saveError, noRecord, profile, frozenPayload, sending: !noRecord && !!envelope && autoSendOn && isClassSession(session.sessionCode) })
          // 기록을 확정하면 보낸다(이 기록과, 전에 못 보낸 수업용 기록). 기록 없이 하기와 저장 실패는 보낼 것이 없다
          if (!noRecord && envelope) void sendNow()
        }}
      />
    )
  }

  return (
    <ResultScreen sound={sound} session={screen.session} run={screen.run} completionStatus={screen.completionStatus} envelope={screen.envelope} saveError={screen.saveError} frozenPayload={screen.frozenPayload} noRecord={screen.noRecord} nickname={nicknameOf(screen.profile)}
      sendLine={!screen.noRecord && autoSendOn && isClassSession(screen.session.sessionCode) ? classSendLine(screen.envelope, screen.sending) : null}
      onRetrySave={!screen.noRecord && screen.saveError && screen.frozenPayload ? async () => {
        // D4: 처음 만든 원본 그대로 다시 확정 저장(수행 번호·완료 시각 유지)
        const r = await retryFreeze(repo!, screen.frozenPayload!)
        if (!r.ok) return r.errorCode
        setScreen((s) => (s.name === 'result' ? { ...s, envelope: r.envelope, saveError: null, frozenPayload: r.payload, sending: autoSendOn && isClassSession(s.session.sessionCode) } : s))
        // 다시 저장해 확정되면 보낸다(수업용 세션 기록만 간다)
        void sendNow()
        return null
      } : undefined}
      onNextStudent={() => { if (!screen.noRecord) repo?.clearCurrent(); setScreen({ name: 'start' }) }} />
  )
}
