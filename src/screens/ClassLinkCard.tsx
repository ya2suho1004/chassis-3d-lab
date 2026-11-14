// 교사 화면 ① 수업 전 — 학생용 수업 주소·복사 버튼·QR(설계 docs/superpowers/specs/2026-11-14-student-number-and-class-link-design.md §3-4).
// 저장한 설정(이 기기)으로 만든다. QR은 기기 안에서 그리고 외부 서비스로 보내지 않는다.
import { useState } from 'react'
import { CLASS_LINK_MAX, classLinkUrl } from '../app/classLink'
import type { TeacherPreset } from '../app/teacherPreset'
import { qrMatrix, qrPath } from '../teacher/qr'

export function ClassLinkCard({ preset, base }: { preset: TeacherPreset | null; base: string }) {
  const [note, setNote] = useState<string | null>(null)
  if (!preset) return <p className="small">설정을 저장하면 학생 기기에 보낼 수업 주소와 QR이 여기에 나옵니다.</p>
  const url = classLinkUrl(base, preset)
  if (!url) return <p className="error">이 화면의 주소가 길어 수업 주소가 {CLASS_LINK_MAX}자를 넘습니다. QR을 만들 수 없습니다.</p>
  const m = qrMatrix(url)
  const n = m.length + 8
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setNote('주소를 복사했습니다.')
    } catch {
      setNote('복사하지 못했습니다. 위 주소를 길게 눌러 직접 복사하세요.')
    }
  }
  return (
    <section className="class-link" aria-label="학생용 수업 주소">
      <h3>학생용 수업 주소</h3>
      <p className="small">학생 기기에서 이 QR을 찍거나 주소를 열면 저장한 설정이 그 기기에 들어갑니다. 설정을 바꾸면 주소도 바뀌니 다시 보내세요.</p>
      <svg className="class-link-qr" viewBox={`0 0 ${n} ${n}`} role="img" aria-label="수업 주소 QR" shapeRendering="crispEdges">
        <rect width={n} height={n} fill="#fff" />
        <path d={qrPath(m)} fill="#000" />
      </svg>
      <p className="class-link-url"><code>{url}</code></p>
      <div className="row"><button onClick={() => void copy()}>주소 복사</button></div>
      {note && <p className="small" role="status">{note}</p>}
      <p className="small">주소에는 세션·과제·차시·도움 방식·진입 방향만 있고 학번·이름은 없습니다. 주소 값은 손으로 바꿀 수 있어 보안 장치가 아닙니다.</p>
    </section>
  )
}
