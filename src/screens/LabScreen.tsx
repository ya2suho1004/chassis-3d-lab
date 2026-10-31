// 실습장 화면 — 3D 장면 + HUD(도감·장비 카드·NPC 대화) + 과제 패널(TaskScreen) 연결
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import rawLayout from '../data/layout/layout.dev-provisional.json'
import type { SessionContext } from '../domain/record'
import { changeDisplayMode, type TaskRun } from '../domain/taskEngine'
import type { ApprovedTask } from '../domain/types'
import type { Repository } from '../records/repository'
import type { DeliveryEnvelope } from '../records/types'
import { BACKLASH_BENCH_ID, DISC_BENCH_ID, LabScene, type AvatarCue, type BacklashPractice, type DiscPractice } from '../scene/LabScene'
import { backlashTravel, checkBacklash, initialBacklashState, randomBacklashCase, type BacklashState } from '../scene/backlash'
import { checkRunout, randomDiscCase, type DiscControl } from '../scene/DiscRunout'
import { needleAngle } from '../scene/dialGauge'
import { actionForStep, actionTarget, newCue } from '../scene/avatarActions'
import { brakeRigState } from '../scene/brakeRig'
import { loadSceneLayout, nearEquipment, vehiclePlacement, type LabelMode, type Pt, type SceneLayout } from '../scene/layoutModel'
import { TaskScreen, type TaskContext } from './TaskScreen'
import { Joystick, type MoveInput } from '../scene/Joystick'
import { NpcDialog } from './NpcDialog'
import { LabSound } from '../scene/sound'
import { useProgress } from '@react-three/drei'
import { initialQuality, shouldAutoLower } from '../app/quality'
import { DEFAULT_VIEW, NPC_AIM, VIEW_LABEL, VIEW_MODES, type ViewMode } from '../scene/viewMode'
import { LayoutReviewPanel } from './LayoutReviewPanel'
import { LayoutSurveyPanel } from './LayoutSurveyPanel'
import { ChatPanel } from '../chat/ChatPanel'
import type { DifficultyMode } from '../domain/taskEngine'

const NEAR_RADIUS = 1.3
const NPC_RADIUS = 2.0
const baseLayout = loadSceneLayout(rawLayout)
/** 세션의 차량 진입 방향에 맞춰 시험 차량 자리만 바꾼 배치(U6). 미설정이면 북쪽 가정 + 라벨 표시. */
function layoutFor(dir: 'north' | 'south' | null): SceneLayout {
  const v = vehiclePlacement(baseLayout, dir)
  return { ...baseLayout, equipment: baseLayout.equipment.map((e) => (e.id === 'brake-vehicle-01' ? { ...e, x: v.x, z: v.z, rotation: v.rotation, label: v.assumed ? `${e.label} · 진입 방향 미설정(북쪽 가정)` : e.label } : e)) }
}
const BASIS_LABEL: Record<string, string> = { measured: '실측', 'measured-partial': '부분 실측', sketch: '스케치 비례', assumption: '가정', teacher: '교사 답' }

export function LabScreen({ repo, session, task, mode, run, onReceiveTask, onRunChange, onFinish }: {
  repo: Repository
  /** 시작 화면에서 고른 도움 방식(과제 수령 전 챗봇 규칙에도 쓴다) */
  mode: DifficultyMode
  session: SessionContext
  task: ApprovedTask
  run: TaskRun | null
  onReceiveTask: () => Promise<string | null>
  onRunChange: (run: TaskRun) => void
  onFinish: (run: TaskRun, status: 'completed' | 'aborted', envelope: DeliveryEnvelope | null, saveError: string | null) => void
}) {
  const layout = useMemo(() => layoutFor(session.vehicleEntryDirection), [session.vehicleEntryDirection])
  const [pos, setPos] = useState<Pt>(layout.studentStart)
  const [moving, setMoving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** 올려 둔 리프트(보기 전용 — 과제 기록·판정과 무관) */
  const [raisedLifts, setRaisedLifts] = useState<string[]>([])
  const toggleLift = (id: string) => setRaisedLifts((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  const [codex, setCodex] = useState<string[]>([])
  const [npcOpen, setNpcOpen] = useState(false)
  const [npcError, setNpcError] = useState<string | null>(null)
  /** 품질 단계(설계 07 §7-5): 터치 기기(태블릿·폰)는 '낮음'(그림자·환경광 끔, 해상도 1배)으로 시작, 교사·학생이 바꿀 수 있다 */
  // ?q=high|low로 고정할 수 있고(시험·시연), 처음 4초가 느리면 한 번 자동으로 낮춘다(app/quality.ts)
  const [quality0] = useState(() => initialQuality(typeof window !== 'undefined' ? window.location.search : '', typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches))
  const [lowSpec, setLowSpecRaw] = useState(quality0.low)
  const userChoseQuality = useRef(false)
  const setLowSpec = (v: boolean) => { userChoseQuality.current = true; setLowSpecRaw(v) }
  const [qualityNote, setQualityNote] = useState<string | null>(null)
  const onFps = useCallback((fps: number) => {
    if (shouldAutoLower({ low: lowSpecRef.current, locked: quality0.locked, userChose: userChoseQuality.current, fps })) {
      setLowSpecRaw(true)
      setQualityNote(`화면이 느려(${Math.round(fps)} fps) 품질을 낮췄습니다. 메뉴에서 바꿀 수 있습니다.`)
      setTimeout(() => setQualityNote(null), 6000)
    }
  }, [quality0.locked])
  const lowSpecRef = useRef(lowSpec)
  lowSpecRef.current = lowSpec
  /** 처음 불러오기 화면(모델·빛 파일). 한 번 끝나면 다시 띄우지 않는다. 20초가 지나도 안 끝나면 그냥 닫는다 */
  const { active: loadingActive, progress } = useProgress()
  const [loadedOnce, setLoadedOnce] = useState(false)
  useEffect(() => { if (!loadingActive && progress >= 100) { const t = setTimeout(() => setLoadedOnce(true), 400); return () => clearTimeout(t) } }, [loadingActive, progress])
  useEffect(() => { const t = setTimeout(() => setLoadedOnce(true), 20000); return () => clearTimeout(t) }, [])
  /** 첫 조작 안내(이 기기에서 한 번만) */
  const [guideOpen, setGuideOpen] = useState(() => { try { return localStorage.getItem('lab.guide.v1') !== 'seen' } catch { return true } })
  const closeGuide = () => { setGuideOpen(false); try { localStorage.setItem('lab.guide.v1', 'seen') } catch { /* 저장 못 해도 진행 */ } }
  /** null = 자동(둘러보기는 전체, 과제 중은 필요한 것만) */
  /** 교사 도구: 배치 눈검토 또는 실측 입력(과제 수령 전에만) */
  const [teacherTool, setTeacherTool] = useState<'review' | 'survey' | null>(null)
  const reviewOpen = teacherTool !== null
  const [reviewActiveId, setReviewActiveId] = useState<string | null>(null)
  const [labelChoice, setLabelChoice] = useState<LabelMode | null>(null)
  const moveRequestRef = useRef<Pt | null>(null)
  const goTo = (p: Pt) => { moveRequestRef.current = p }
  /** 화면 방식: 게임(3D 꽉 찬 화면 + 겹친 정보, 기본) · 기본(3D 옆에 패널) */
  const [uiStyle, setUiStyle] = useState<'game' | 'classic'>('game')
  const joystickRef = useRef<MoveInput>({ x: 0, y: 0 })
  const [ctx, setCtx] = useState<TaskContext | null>(null)
  const onContext = useCallback((c: TaskContext) => setCtx(c), [])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  /** 멀리서 교관을 눌렀으면 걸어가서 도착하는 순간 대화를 연다 */
  const [talkOnArrive, setTalkOnArrive] = useState(false)
  /** 시점: 내려다보기 · 따라가기(기본, 잠정) · 내 눈으로(1인칭). 안내 있음·없음 조건에 똑같이 제공 */
  const [viewMode, setViewMode] = useState<ViewMode>(DEFAULT_VIEW)
  const nextView = () => setViewMode(VIEW_MODES[(VIEW_MODES.indexOf(viewMode) + 1) % VIEW_MODES.length] ?? 'overview')
  /** 1인칭 가운데 조준점이 가리키는 장비(교관은 NPC_AIM) */
  const [aimId, setAimId] = useState<string | null>(null)
  /** 소리(발소리·실습장 소음). 교실에서 여러 대가 함께 켜지므로 처음엔 끔 */
  const sound = useMemo(() => new LabSound(), [])
  const [soundOn, setSoundOn] = useState(false)
  useEffect(() => () => sound.setEnabled(false), [sound])
  const toggleSound = () => { const on = !soundOn; sound.setEnabled(on); setSoundOn(on) }
  const onStep = useCallback(() => sound.step(), [sound])
  /** 단계를 마치면 학생 몸짓(보호구 쓰기·쪼그려 살펴보기·버튼 누르기) — 연출 전용 */
  const [avatarCue, setAvatarCue] = useState<AvatarCue | null>(null)
  const cuePrev = useRef<{ completed: string[]; off: string[] } | null>(null)
  useEffect(() => {
    if (!run) { cuePrev.current = null; return }
    const now = { completed: run.completedSteps, off: run.offProgress as string[] }
    const step = newCue(cuePrev.current, now)
    cuePrev.current = now
    if (!step) return
    const action = actionForStep(step)
    if (!action) return
    const eqId = actionTarget(step, task.steps.find((st) => st.stepId === step)?.equipmentId ?? null)
    const eq = eqId ? layout.equipment.find((e) => e.id === eqId) : null
    setAvatarCue((c) => ({ action, seq: (c?.seq ?? 0) + 1, target: eq ? { x: eq.x, z: eq.z } : null }))
  }, [run, task, layout])
  const ppe = !!run?.completedSteps.includes('ppe')
  /** 계기 화면 가까이 보기(조작부 근처, 과제 중) */
  const [closeUp, setCloseUp] = useState(false)
  /** 디스크 런아웃 연습(기록 없음, 값은 연습용) — 디스크 작업대 근처에서 연다 */
  const discCtl = useRef<DiscControl>({ spin: 0, angle: 0, travel: 0.5 })
  const [discCase, setDiscCase] = useState(() => randomDiscCase())
  const [discBezel, setDiscBezel] = useState(0)
  const [discOpen, setDiscOpen] = useState(false)
  const [discAnswer, setDiscAnswer] = useState('')
  const [discMsg, setDiscMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const discZero = () => { const deg = ((needleAngle(discCtl.current.travel) * 180) / Math.PI) % 360; setDiscBezel(deg) }
  const discNew = () => { setDiscCase(randomDiscCase()); discCtl.current.angle = 0; setDiscBezel(0); setDiscAnswer(''); setDiscMsg(null) }
  const discCheck = () => {
    const v = Number(discAnswer.replace(',', '.'))
    if (!discAnswer.trim() || !Number.isFinite(v)) return setDiscMsg({ ok: false, text: '숫자로 적어 주세요(예: 0.04).' })
    setDiscMsg(checkRunout(v, discCase)
      ? { ok: true, text: `맞습니다. 이 디스크의 런아웃은 ${discCase.tir.toFixed(2)} mm입니다.` }
      : { ok: false, text: '다시 읽어 보세요. 한 바퀴 돌리는 동안 가장 큰 값 − 가장 작은 값입니다.' })
  }
  /** 차동기어 백래시 연습(기록 없음, 값은 연습용) — 차동기어 작업대 근처에서 연다 */
  const [blCase, setBlCase] = useState(() => randomBacklashCase())
  const blSt = useRef<BacklashState>(initialBacklashState(blCase))
  const blPushFrom = useRef(0)
  const [blBezel, setBlBezel] = useState(0)
  const [blOpen, setBlOpen] = useState(false)
  const [blHeld, setBlHeld] = useState(false)
  const [blAnswer, setBlAnswer] = useState('')
  const [blMsg, setBlMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const blZero = () => { const deg = ((needleAngle(backlashTravel(blSt.current, blCase)) * 180) / Math.PI) % 360; setBlBezel(deg) }
  const blNew = () => { const c = randomBacklashCase(); setBlCase(c); blSt.current = { ...initialBacklashState(c), held: blHeld }; setBlBezel(0); setBlAnswer(''); setBlMsg(null) }
  const blToggleHeld = () => { const h = !blHeld; setBlHeld(h); blSt.current.held = h; setBlMsg(null) }
  const blCheck = () => {
    const v = Number(blAnswer.replace(',', '.'))
    if (!blAnswer.trim() || !Number.isFinite(v)) return setBlMsg({ ok: false, text: '숫자로 적어 주세요(예: 0.12).' })
    setBlMsg(checkBacklash(v, blCase)
      ? { ok: true, text: `맞습니다. 이 기어의 백래시는 ${blCase.bl.toFixed(2)} mm입니다.` }
      : { ok: false, text: '다시 읽어 보세요. 한쪽 끝까지 민 자리와 반대쪽 끝까지 민 자리의 차이입니다.' })
  }
  const blStop = () => {
    const st = blSt.current
    if (!st.push) return
    st.push = 0
    // 피니언을 안 잡고 밀어 기어가 같이 돌았으면 알려 준다
    if (!st.held && Math.abs(st.p - blPushFrom.current) > 1e-6) setBlMsg({ ok: false, text: '피니언까지 같이 돌아 바늘이 멈추지 않았습니다. 이대로는 백래시를 읽을 수 없어요.' })
  }
  const pushHold = (dir: number) => ({
    onPointerDown: (ev: React.PointerEvent) => { (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId); blPushFrom.current = blSt.current.p; blSt.current.push = dir },
    onPointerUp: blStop, onPointerCancel: blStop, onLostPointerCapture: blStop,
  })
  const spinHold = (dir: number) => ({
    onPointerDown: (ev: React.PointerEvent) => { (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId); discCtl.current.spin = dir },
    onPointerUp: () => { discCtl.current.spin = 0 }, onPointerCancel: () => { discCtl.current.spin = 0 }, onLostPointerCapture: () => { discCtl.current.spin = 0 },
  })

  const onMove = useCallback((p: Pt, m: boolean) => { setPos(p); setMoving(m) }, [])
  const nearIds = useMemo(() => layout.equipment.filter((e) => nearEquipment(pos, e, NEAR_RADIUS)).map((e) => e.id), [pos, layout])
  // 두 연습 작업대가 나란해 둘 다 가까우면 더 가까운 쪽 버튼만 보인다
  const practiceNear = useMemo(() => {
    const ids = [DISC_BENCH_ID, BACKLASH_BENCH_ID].filter((id) => nearIds.includes(id))
    const dist = (id: string) => { const e = layout.equipment.find((q) => q.id === id)!; return Math.hypot(pos.x - e.x, pos.z - e.z) }
    return ids.sort((a, b) => dist(a) - dist(b))[0] ?? null
  }, [nearIds, layout, pos])
  const discNear = practiceNear === DISC_BENCH_ID
  const blNear = practiceNear === BACKLASH_BENCH_ID
  const practicing = discOpen || blOpen
  const panelNear = nearIds.some((id) => layout.equipment.find((e) => e.id === id)?.kind === 'panel')
  const nearNpc = Math.hypot(pos.x - layout.npc.x, pos.z - layout.npc.z) <= NPC_RADIUS
  const selected = layout.equipment.find((e) => e.id === selectedId) ?? null
  const requiredNow = run?.nextStepId ? (task.steps.find((s) => s.stepId === run.nextStepId)?.equipmentId ?? null) : null
  const displayMode = run?.displayMode ?? 'threeD'
  /** 이름표: 게임 화면 기본은 '가까운 것만'(먼 작동 장비는 ◆), 기본 화면은 둘러보기 전체·과제 중 필요한 것만 */
  const labelMode: LabelMode = labelChoice ?? (uiStyle === 'game' ? 'near' : run ? 'focus' : 'all')
  const rig = useMemo(() => brakeRigState(run, session.vehicleEntryDirection), [run, session.vehicleEntryDirection])

  const selectEquipment = (id: string | null) => {
    setSelectedId(id)
    if (id && !codex.includes(id)) setCodex([...codex, id])
  }
  const toggleDisplay = () => {
    if (!run) return
    const r = changeDisplayMode(run, displayMode === 'threeD' ? 'diagram' : 'threeD', 'userChoice')
    if (r.outcome === 'confirmed') onRunChange(r.run)
  }
  const npcSpot = { x: layout.npc.x - 1.0, z: layout.npc.z }
  useEffect(() => { if (talkOnArrive && nearNpc && !moving) { setTalkOnArrive(false); setNpcOpen(true) } }, [talkOnArrive, nearNpc, moving])

  const gameUi = uiStyle === 'game' && displayMode === 'threeD' && !reviewOpen
  if (gameUi) {
    const navTargets = layout.equipment.filter((e) => e.interactive && e.accessPoint)
    const talking = npcOpen && nearNpc
    const discPractice: DiscPractice = { ctl: discCtl, disc: discCase, bezelDeg: discBezel, open: discOpen && !talking }
    const backlashPractice: BacklashPractice = { st: blSt, bl: blCase, bezelDeg: blBezel, held: blHeld, open: blOpen && !talking }
    return (
      <main className={`game ${talking ? 'talking' : ''}`}>
        <div className="g-canvas">
          <LabScene layout={layout} start={layout.studentStart} selectedId={selectedId} highlightIds={requiredNow ? [requiredNow] : []} lowSpec={lowSpec} raisedLiftIds={raisedLifts}
            joystickRef={joystickRef} npcTalking={talking} viewMode={viewMode} playerPos={pos} onAim={setAimId}
            glowIds={aimId && aimId !== NPC_AIM ? [...nearIds, aimId] : nearIds} onStep={onStep}
            panelReadout={run ? ctx?.panel ?? null : null} panelCloseUp={closeUp && !talking} onFps={onFps}
            avatarCue={avatarCue} ppe={ppe} discPractice={discPractice} backlashPractice={backlashPractice}
            onSelectEquipment={selectEquipment} onNpcTap={() => { setNpcOpen(true) }} onMove={onMove} moveRequestRef={moveRequestRef} rig={rig} labelMode={labelMode} />
        </div>

        {!talking && (
          <>
            <div className="g-status">
              <div className="g-badge"><b>{session.anonymousStudentCode}</b><span>도감 {codex.length}/{layout.equipment.length}</span>{run && <span>안전 위반 {run.safetyViolationCount}</span>}</div>
              <button className="g-view" onClick={nextView} aria-label={`시점 바꾸기(지금 ${VIEW_LABEL[viewMode]})`}>🎥 {VIEW_LABEL[viewMode]}</button>
              <button className="g-icon" aria-label={soundOn ? '소리 끄기' : '소리 켜기'} aria-pressed={soundOn} onClick={toggleSound}>{soundOn ? '🔊' : '🔇'}</button>
              <button className="g-icon" aria-label="메뉴" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
              {menuOpen && (
                <div className="g-menu" role="menu">
                  <button onClick={() => setLabelChoice(labelMode === 'all' ? 'near' : 'all')}>{labelMode === 'all' ? '이름표 가까운 것만' : '이름표 모두 보기'}</button>
                  <label className="g-check"><input type="checkbox" checked={lowSpec} onChange={(e) => setLowSpec(e.target.checked)} /> 품질 낮음(태블릿)</label>
                  {run && <button onClick={toggleDisplay}>도식 모드로</button>}
                  <button onClick={() => { setUiStyle('classic'); setMenuOpen(false) }}>기본 화면(패널)으로</button>
                  {!run && <button onClick={() => { setUiStyle('classic'); setTeacherTool('review'); setMenuOpen(false) }}>배치 눈검토(교사)</button>}
                  {!run && <button onClick={() => { setUiStyle('classic'); setTeacherTool('survey'); setMenuOpen(false) }}>실측 입력(교사)</button>}
                  <p className="small">실제 배치 아님(개발용 임시 배치). 제동력 구역 일부 실측, 나머지는 손 스케치 비례·가정.</p>
                </div>
              )}
            </div>

            {!practicing && <div className="g-quest">
              <div className="g-quest-title">{run ? task.title : '실습장 둘러보기'}</div>
              {!run && <p>장비를 눌러 도감을 채우고, 교관에게 가서 과제를 받으세요.</p>}
              {run && ctx?.next && <p className="g-next">▶ {ctx.next.num}. {ctx.next.text}</p>}
              {run && ctx && !ctx.guided && <p>작업 순서는 목록에서 직접 고르세요(안내 없음).</p>}
              {run && ctx && <p className="g-progress">{ctx.doneCount}/{ctx.total} 단계 완료</p>}
              <div className="g-quest-btns">
                {run && <button onClick={() => setDrawerOpen(true)}>작업 목록</button>}
                <button onClick={() => goTo(npcSpot)}>교관에게</button>
                {navTargets.map((e) => <button key={e.id} onClick={() => goTo(e.accessPoint!)}>{e.label.replace(/\(.*\)/, '').trim()}</button>)}
              </div>
            </div>}

            {ctx?.shown && (
              <div className={`g-toast feedback ${ctx.shown.kind}`} role="alert">
                <button className="g-x" aria-label="닫기" onClick={ctx.clearShown}>✕</button>
                <b>{ctx.shown.title}</b>
                {ctx.shown.text ? (<ul><li>무엇: {ctx.shown.text.what}</li><li>왜: {ctx.shown.text.why}</li><li>어떻게: {ctx.shown.text.how}</li></ul>) : <p>{ctx.shown.plain}</p>}
              </div>
            )}

            {selected && (
              <div className="g-info">
                <button className="g-x" aria-label="닫기" onClick={() => setSelectedId(null)}>✕</button>
                <b>{selected.label}</b> <span className="small">[{BASIS_LABEL[selected.basis] ?? selected.basis}]</span>
                <p>{selected.info}</p>
                {selected.kind === 'lift' && <p><button onClick={() => toggleLift(selected.id)}>{raisedLifts.includes(selected.id) ? '리프트 내리기' : '리프트 올리기'}</button> <span className="small">보기 전용(기록 없음). 실제로는 올리기 전 주변 확인, 올린 뒤 안전 고리.</span></p>}
              </div>
            )}

            <div className="g-hud" hidden={practicing}>{moving ? '이동 중…' : nearIds.length ? `근처: ${nearIds.map((id) => layout.equipment.find((e) => e.id === id)?.label).join(', ')}` : viewMode === 'first' ? '왼쪽 조이스틱으로 걷기 · 화면을 끌어 둘러보기 · 가운데 점을 장비에 맞추기' : '왼쪽 조이스틱이나 바닥 탭으로 이동 · 끌어서 화면 돌리기'}</div>

            {viewMode === 'first' && <div className={`g-reticle ${aimId ? 'on' : ''}`} aria-hidden />}
            {viewMode === 'first' && aimId && (
              <button className="g-aim" onClick={() => (aimId === NPC_AIM ? setNpcOpen(true) : selectEquipment(aimId))}>
                {aimId === NPC_AIM ? '💬 교관과 대화' : `🔍 ${layout.equipment.find((e) => e.id === aimId)?.label.replace(/\(.*\)/, '').trim() ?? ''} 살펴보기`}
              </button>
            )}

            {!closeUp && !practicing && <Joystick input={joystickRef} />}
            {run && !closeUp && panelNear && <button className="g-gaugebtn" onClick={() => setCloseUp(true)}>📟 계기 보기</button>}
            {!practicing && !closeUp && discNear && <button className="g-gaugebtn" onClick={() => { setDiscOpen(true); setDiscMsg(null) }}>🔍 디스크 런아웃 연습</button>}
            {discOpen && (
              <div className="g-practice" role="dialog" aria-label="디스크 런아웃 연습">
                <div className="g-practice-head"><b>디스크 런아웃 연습</b><span className="small">기록 없음 · 연습용 값(실측 아님)</span><button className="g-x" aria-label="연습 닫기" onClick={() => { discCtl.current.spin = 0; setDiscOpen(false) }}>✕</button></div>
                <p className="small">디스크를 천천히 돌려 바늘이 가장 작게 가는 곳에서 영점을 맞추고, 다시 한 바퀴 돌리며 가장 크게 가는 값(런아웃)을 읽어 적습니다. 1눈금 = 0.01 mm.</p>
                <div className="g-practice-row">
                  <button {...spinHold(1)}>⟳ 누르는 동안 돌리기</button>
                  <button {...spinHold(-1)}>⟲ 반대로</button>
                  <button onClick={discZero}>영점 맞추기</button>
                </div>
                <div className="g-practice-row">
                  <label>런아웃 <input inputMode="decimal" value={discAnswer} onChange={(e) => setDiscAnswer(e.target.value)} placeholder="0.00" aria-label="런아웃(mm)" /> mm</label>
                  <button className="primary" onClick={discCheck}>확인</button>
                  <button onClick={discNew}>새 디스크</button>
                </div>
                {discMsg && <p className={discMsg.ok ? 'ok' : 'bad'}>{discMsg.text}</p>}
              </div>
            )}
            {!practicing && !closeUp && blNear && <button className="g-gaugebtn" onClick={() => { setBlOpen(true); setBlMsg(null) }}>🔍 차동기어 백래시 연습</button>}
            {blOpen && (
              <div className="g-practice" role="dialog" aria-label="차동기어 백래시 연습">
                <div className="g-practice-head"><b>차동기어 백래시 연습</b><span className="small">기록 없음 · 연습용 값(실측 아님)</span><button className="g-x" aria-label="연습 닫기" onClick={() => { blSt.current.push = 0; setBlOpen(false) }}>✕</button></div>
                <p className="small">게이지는 링기어 이빨 면에 직각으로 대 두었습니다. 링기어를 한쪽 끝까지 밀었다가 반대쪽 끝까지 밀어, 바늘이 오간 폭(백래시)을 적습니다. 1눈금 = 0.01 mm.</p>
                <div className="g-practice-row">
                  <button {...pushHold(-1)}>◀ 누르는 동안 밀기</button>
                  <button {...pushHold(1)}>밀기 ▶</button>
                  <button aria-pressed={blHeld} className={blHeld ? 'on' : ''} onClick={blToggleHeld}>{blHeld ? '🔧 피니언 잡음' : '🔧 피니언 잡기'}</button>
                  <button onClick={blZero}>영점 맞추기</button>
                </div>
                <div className="g-practice-row">
                  <label>백래시 <input inputMode="decimal" value={blAnswer} onChange={(e) => setBlAnswer(e.target.value)} placeholder="0.00" aria-label="백래시(mm)" /> mm</label>
                  <button className="primary" onClick={blCheck}>확인</button>
                  <button onClick={blNew}>새 기어</button>
                </div>
                {blMsg && <p className={blMsg.ok ? 'ok' : 'bad'}>{blMsg.text}</p>}
              </div>
            )}
            {closeUp && <button className="g-gaugebtn on" onClick={() => setCloseUp(false)}>✕ 계기 닫기</button>}
            {!practicing && <button className="g-chatbtn" onClick={() => setChatOpen(true)}>💬 AI 교관에게 질문</button>}

            <div className="g-actions">
              {run && ctx?.nextActions.map((a) => <button key={a.key} className={`g-act ${a.cls ?? ''}`} onClick={a.onClick}>{a.label}</button>)}
              {run && <button className="g-act small" onClick={() => ctx?.hint()}>힌트</button>}
            </div>
          </>
        )}

        {!loadedOnce && (
          <div className="g-loading" role="status" aria-live="polite">
            <b>실습장 불러오는 중…</b>
            <div className="g-bar"><span style={{ width: `${Math.round(progress)}%` }} /></div>
            <small>{Math.round(progress)}% · 처음 한 번만 조금 걸립니다</small>
          </div>
        )}
        {loadedOnce && guideOpen && !talking && (
          <div className="g-guide" role="dialog" aria-label="조작 안내">
            <b>조작 안내</b>
            <ul>
              <li>🕹️ 왼쪽 조이스틱(키보드 W·A·S·D) 또는 바닥을 눌러 걷기</li>
              <li>👆 화면을 끌어 둘러보기</li>
              <li>🎥 왼쪽 위 버튼으로 시점 바꾸기(내 눈으로 보면 가운데 점으로 장비를 살펴봄)</li>
              <li>🔧 장비를 누르면 설명, 교관에게 가면 과제</li>
            </ul>
            <button className="primary" onClick={closeGuide}>알겠어요</button>
          </div>
        )}
        {qualityNote && <div className="g-note" role="status">{qualityNote}</div>}

        {/* 과제 패널은 늘 붙여 두고(상태·자동 저장 유지) 서랍으로만 열고 닫는다 */}
        {run && (
          <aside className={`g-drawer ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
            <button className="g-x" aria-label="작업 목록 닫기" onClick={() => setDrawerOpen(false)}>✕</button>
            <TaskScreen repo={repo} session={session} initialRun={run} embedded onRunChange={onRunChange} onContext={onContext}
              proximity={{ nearIds, labelOf: (id) => layout.equipment.find((e) => e.id === id)?.label ?? id }}
              onFinish={onFinish} />
          </aside>
        )}
        <aside className={`g-chat ${chatOpen ? 'open' : ''}`} aria-hidden={!chatOpen}>
          <button className="g-x" aria-label="질문 창 닫기" onClick={() => setChatOpen(false)}>✕</button>
          <ChatPanel sessionCode={session.sessionCode} anonymousStudentCode={session.anonymousStudentCode} recordId={run ? session.recordId : null}
            stepId={run?.nextStepId ?? null} difficultyMode={run?.difficultyMode ?? mode} initialOpen />
        </aside>

        {npcOpen && (
          <NpcDialog near={nearNpc} taskTitle={task.title} running={!!run} error={npcError}
            onReceive={async () => { const err = await onReceiveTask(); setNpcError(err); return err }}
            onGoToNpc={() => { setNpcOpen(false); setTalkOnArrive(true); goTo(npcSpot) }}
            onOpenTasks={() => { setNpcOpen(false); setDrawerOpen(true) }}
            onInspect={() => { setNpcOpen(false); ctx?.inspect(); setDrawerOpen(true) }}
            onClose={() => setNpcOpen(false)} />
        )}
      </main>
    )
  }

  return (
    <main className="screen lab">
      <header className="topbar">
        <div><b>섀시정비 실습실 (개발용 임시 배치)</b> · 코드 {session.anonymousStudentCode} · 도감 {codex.length}/{layout.equipment.length}</div>
        <div className="small">
          <span className="warnchip">실제 배치 아님 · layoutConfirmed=false</span>
          {run && <button className="link" onClick={toggleDisplay}>{displayMode === 'threeD' ? '도식 모드로' : '3D 모드로'}</button>}
          {displayMode === 'threeD' && !reviewOpen && <button className="link" onClick={() => setUiStyle('game')}>게임 화면으로</button>}
          {!run && !reviewOpen && <button className="link" onClick={() => setTeacherTool('review')}>배치 눈검토(교사)</button>}
          {!run && !reviewOpen && <button className="link" onClick={() => setTeacherTool('survey')}>실측 입력(교사)</button>}
          {displayMode === 'threeD' && <button className="link" onClick={() => setLabelChoice(labelMode === 'all' ? 'focus' : 'all')}>{labelMode === 'all' ? '이름표 줄이기' : '이름표 모두 보기'}</button>}
          <label className="inline" title="낮음: 그림자·화면 효과를 끄고 해상도를 낮춰 태블릿에서 부드럽게(모델은 같음)"><input type="checkbox" checked={lowSpec} onChange={(e) => setLowSpec(e.target.checked)} /> 품질 낮음(태블릿)</label>
        </div>
      </header>

      <div className={`labgrid ${run || reviewOpen ? 'withtask' : ''} ${reviewOpen ? 'reviewing' : ''} ${displayMode === 'diagram' ? 'diagram' : ''}`}>
        {displayMode === 'threeD' && (
          <section className="canvaswrap">
            <LabScene layout={layout} start={layout.studentStart} selectedId={selectedId} highlightIds={requiredNow ? [requiredNow] : []} lowSpec={lowSpec} raisedLiftIds={raisedLifts}
              onSelectEquipment={selectEquipment} onNpcTap={() => setNpcOpen(true)} onMove={onMove} moveRequestRef={moveRequestRef} rig={rig} labelMode={labelMode} />
            <div className="quicknav">
              <button onClick={() => goTo({ x: layout.npc.x - 1.0, z: layout.npc.z })}>교관에게 가기</button>
              {layout.equipment.filter((e) => e.interactive && e.accessPoint).map((e) => (
                <button key={e.id} onClick={() => goTo(e.accessPoint!)}>{e.label.replace(/\(.*\)/, '').trim()}로 가기</button>
              ))}
              <button onClick={() => goTo(layout.studentStart)}>시작점으로</button>
            </div>
            <div className="hud">
              <span>바닥을 탭하면 걸어가고, 드래그로 회전, 두 손가락으로 확대</span>
              {moving ? <span>이동 중…</span> : nearIds.length ? <span>근처: {nearIds.map((id) => layout.equipment.find((e) => e.id === id)?.label).join(', ')}</span> : <span>장비를 탭하면 설명이 나옵니다</span>}
              {requiredNow && !nearIds.includes(requiredNow) && <span className="need">다음 단계 장비로 이동: {layout.equipment.find((e) => e.id === requiredNow)?.label}</span>}
            </div>
          </section>
        )}

        <section className="sidepanel">
          {selected && (
            <div className="card infocard">
              <b>{selected.label}</b> <span className="small">[{BASIS_LABEL[selected.basis] ?? selected.basis}]</span>
              <p>{selected.info}</p>
              <p className="small">참고 사진 {selected.photos.join('·') || '없음'} · 도감 {codex.includes(selected.id) ? '등록됨' : ''}</p>
              {selected.interactive && <p className="small">작동 과제 장비. 접근점에 서면 과제 패널의 해당 단계를 수행할 수 있습니다.</p>}
              {selected.kind === 'lift' && (
                <p>
                  <button onClick={() => toggleLift(selected.id)}>{raisedLifts.includes(selected.id) ? '리프트 내리기' : '리프트 올리기'}</button>{' '}
                  <span className="small">보기 전용(과제 기록에 남지 않음). 실제로는 올리기 전 주변을 확인하고, 올린 뒤 안전 고리를 겁니다.</span>
                </p>
              )}
              <button className="link" onClick={() => setSelectedId(null)}>닫기</button>
            </div>
          )}

          {!run && teacherTool === 'review' && (
            <LayoutReviewPanel layout={layout} activeId={reviewActiveId}
              onFocus={(item) => { setReviewActiveId(item.itemId); setSelectedId(item.equipmentId); goTo(item.viewPoint) }}
              onClose={() => { setTeacherTool(null); setReviewActiveId(null) }} />
          )}
          {!run && teacherTool === 'survey' && (
            <LayoutSurveyPanel layout={layout} activeId={reviewActiveId}
              onFocus={(item) => { if (!item.review) return; setReviewActiveId(item.itemId); setSelectedId(item.review.equipmentId); goTo(item.review.viewPoint) }}
              onClose={() => { setTeacherTool(null); setReviewActiveId(null) }} />
          )}

          {!run && !reviewOpen && (
            <div className="card npc">
              <b>NPC 교관</b>
              {npcOpen ? (
                nearNpc ? (
                  <>
                    <p>오늘 작업지시서: 손님 차량 입고, 제동 시 한쪽으로 쏠린다는 호소. 뒤축 제동력을 측정해 편차와 합을 계산하고 차량 상태를 판정하세요. 과제: <b>{task.title}</b></p>
                    <p className="small">과제를 받으면 수행 번호가 발급되고 이 기기에 초안이 저장됩니다.</p>
                    {npcError && <p className="error">{npcError}</p>}
                    <button className="primary" onClick={async () => { const err = await onReceiveTask(); setNpcError(err) }}>과제 수령</button>
                  </>
                ) : (
                  <p>교관에게 더 가까이 가세요(바닥을 탭해 이동). 시작점 근처 주황색 사람입니다.</p>
                )
              ) : (
                <>
                  <p>먼저 실습장을 둘러보고 장비를 탭해 도감을 채우세요. 준비되면 교관에게 가서 과제를 받습니다.</p>
                  <button onClick={() => setNpcOpen(true)}>교관과 대화하기</button>
                </>
              )}
            </div>
          )}

          {run && (
            <TaskScreen repo={repo} session={session} initialRun={run} embedded onRunChange={onRunChange}
              proximity={displayMode === 'threeD' ? { nearIds, labelOf: (id) => layout.equipment.find((e) => e.id === id)?.label ?? id } : null}
              onFinish={onFinish} />
          )}

          {!reviewOpen && (
            <ChatPanel sessionCode={session.sessionCode} anonymousStudentCode={session.anonymousStudentCode} recordId={run ? session.recordId : null}
              stepId={run?.nextStepId ?? null} difficultyMode={run?.difficultyMode ?? mode} />
          )}
        </section>
      </div>
      <p className="small">임시 배치 근거: 제동력 구역 일부 실측(2026-10-21), 나머지는 손 스케치 비례·가정. 실측 뒤 교사 재대조 전까지 실제 학교 재현이 아닙니다.</p>
    </main>
  )
}
