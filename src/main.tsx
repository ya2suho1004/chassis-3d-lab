import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'

// 개발 서버에서만: 게임 화면 겹침 측정(window.__hudOverlaps(), src/app/hudLayout.ts). 운영 빌드에서는 이 줄이 사라진다
if (import.meta.env.DEV) void import('./app/hudLayout').then((m) => { (window as unknown as Record<string, unknown>).__hudOverlaps = () => m.measureHud(document.querySelector('.game') ?? document, window) })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
