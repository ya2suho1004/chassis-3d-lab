// 실습장 화면 — 3D 장면 + HUD(도감·장비 카드·NPC 대화) + 과제 패널(TaskScreen) 연결
import { useCallback, useMemo, useRef, useState } from 'react'
import rawLayout from '../data/layout/layout.dev-provisional.json'
import type { SessionContext } from '../domain/record'
import { changeDisplayMode, type TaskRun } from '../domain/taskEngine'
import type { ApprovedTask } from '../domain/types'
import type { Repository } from '../records/repository'
import type { DeliveryEnvelope } from '../records/types'
import { LabScene } from '../scene/LabScene'
import { brakeRigState } from '../scene/brakeRig'
import { loadSceneLayout, nearEquipment, vehiclePlacement, type LabelMode, type Pt, type SceneLayout } from '../scene/layoutModel'
import { TaskScreen } from './TaskScreen'
import { LayoutReviewPanel } from './LayoutReviewPanel'
import { LayoutSurveyPanel } from './LayoutSurveyPanel'

const NEAR_RADIUS = 1.3
const NPC_RADIUS = 2.0
const baseLayout = loadSceneLayout(rawLayout)
/** 세션의 차량 진입 방향에 맞춰 시험 차량 자리만 바꾼 배치(U6). 미설정이면 북쪽 가정 + 라벨 표시. */
function layoutFor(dir: 'north' | 'south' | null): SceneLayout {
  const v = vehiclePlacement(baseLayout, dir)
  return { ...baseLayout, equipment: baseLayout.equipment.map((e) => (e.id === 'brake-vehicle-01' ? { ...e, x: v.x, z: v.z, rotation: v.rotation, label: v.assumed ? `${e.label} · 진입 방향 미설정(북쪽 가정)` : e.label } : e)) }
}
const BASIS_LABEL: Record<string, string> = { measured: '실측', 'measured-partial': '부분 실측', sketch: '스케치 비례', assumption: '가정', teacher: '교사 답' }

export function LabScreen({ repo, session, task, run, onReceiveTask, onRunChange, onFinish }: {
  repo: Repository
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
  const [codex, setCodex] = useState<string[]>([])
  const [npcOpen, setNpcOpen] = useState(false)
  const [npcError, setNpcError] = useState<string | null>(null)
  const [lowSpec, setLowSpec] = useState(false)
  /** null = 자동(둘러보기는 전체, 과제 중은 필요한 것만) */
  /** 교사 도구: 배치 눈검토 또는 실측 입력(과제 수령 전에만) */
  const [teacherTool, setTeacherTool] = useState<'review' | 'survey' | null>(null)
  const reviewOpen = teacherTool !== null
  const [reviewActiveId, setReviewActiveId] = useState<string | null>(null)
  const [labelChoice, setLabelChoice] = useState<LabelMode | null>(null)
  const moveRequestRef = useRef<Pt | null>(null)
  const goTo = (p: Pt) => { moveRequestRef.current = p }

  const onMove = useCallback((p: Pt, m: boolean) => { setPos(p); setMoving(m) }, [])
  const nearIds = useMemo(() => layout.equipment.filter((e) => nearEquipment(pos, e, NEAR_RADIUS)).map((e) => e.id), [pos, layout])
  const nearNpc = Math.hypot(pos.x - layout.npc.x, pos.z - layout.npc.z) <= NPC_RADIUS
  const selected = layout.equipment.find((e) => e.id === selectedId) ?? null
  const requiredNow = run?.nextStepId ? (task.steps.find((s) => s.stepId === run.nextStepId)?.equipmentId ?? null) : null
  const displayMode = run?.displayMode ?? 'threeD'
  const labelMode: LabelMode = labelChoice ?? (run ? 'focus' : 'all')
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

  return (
    <main className="screen lab">
      <header className="topbar">
        <div><b>섀시정비 실습실 (개발용 임시 배치)</b> · 코드 {session.anonymousStudentCode} · 도감 {codex.length}/{layout.equipment.length}</div>
        <div className="small">
          <span className="warnchip">실제 배치 아님 · layoutConfirmed=false</span>
          {run && <button className="link" onClick={toggleDisplay}>{displayMode === 'threeD' ? '도식 모드로' : '3D 모드로'}</button>}
          {!run && !reviewOpen && <button className="link" onClick={() => setTeacherTool('review')}>배치 눈검토(교사)</button>}
          {!run && !reviewOpen && <button className="link" onClick={() => setTeacherTool('survey')}>실측 입력(교사)</button>}
          {displayMode === 'threeD' && <button className="link" onClick={() => setLabelChoice(labelMode === 'all' ? 'focus' : 'all')}>{labelMode === 'all' ? '이름표 줄이기' : '이름표 모두 보기'}</button>}
          <label className="inline"><input type="checkbox" checked={lowSpec} onChange={(e) => setLowSpec(e.target.checked)} /> 저사양</label>
        </div>
      </header>

      <div className={`labgrid ${run || reviewOpen ? 'withtask' : ''} ${reviewOpen ? 'reviewing' : ''} ${displayMode === 'diagram' ? 'diagram' : ''}`}>
        {displayMode === 'threeD' && (
          <section className="canvaswrap">
            <LabScene layout={layout} start={layout.studentStart} selectedId={selectedId} highlightIds={requiredNow ? [requiredNow] : []} lowSpec={lowSpec}
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
        </section>
      </div>
      <p className="small">임시 배치 근거: 제동력 구역 일부 실측(2026-10-21), 나머지는 손 스케치 비례·가정. 실측 뒤 교사 재대조 전까지 실제 학교 재현이 아닙니다.</p>
    </main>
  )
}
