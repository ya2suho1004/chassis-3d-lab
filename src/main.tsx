import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { takeClassLink } from './app/classLink'
import { listTasks } from './app/session'
import { knownCaseIds, savePreset } from './app/teacherPreset'
import './styles.css'

// 개발 서버에서만: 게임 화면 겹침 측정(window.__hudOverlaps(), src/app/hudLayout.ts). 운영 빌드에서는 이 줄이 사라진다
if (import.meta.env.DEV) void import('./app/hudLayout').then((m) => { (window as unknown as Record<string, unknown>).__hudOverlaps = () => m.measureHud(document.querySelector('.game') ?? document, window) })

// 수업 주소(설계 2026-11-14-student-number-and-class-link §3-4): 앱이 열릴 때 한 번, # 뒤 수업 설정을 기기에 저장하고 # 값을 지운다.
// 그리기 전에 하므로 시작 화면·교사 화면이 처음부터 저장된 설정을 읽는다. 읽지 못한 주소는 # 값을 두고 시작 화면이 안내한다
const classLink = takeClassLink({ href: window.location.href, save: savePreset, replaceState: (url) => { try { window.history.replaceState(window.history.state, '', url) } catch { /* 주소를 못 바꿔도 설정은 저장됨 */ } } }, knownCaseIds(listTasks()))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App classLink={classLink} />
  </React.StrictMode>,
)
