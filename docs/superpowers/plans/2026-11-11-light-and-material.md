# 빛과 재질 다듬기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실습장 3D 화면의 조명·그림자·바닥·벽·색 보정을 다시 짜서, 태블릿(품질 낮음)과 PC(품질 높음)가 같은 인상으로 입체감 있게 보이게 한다. 채점·기록·문구·배치·모델은 바꾸지 않는다.

**Architecture:**
- **값과 계산:** 빛·재질 값은 `src/scene/look/lookConfig.ts` 한 곳에 두고, 품질별 구성(`lookFor`)·주된 빛 방향·그림자 범위 맞춤을 순수 함수로 둔다.
- **색 보정:** `toneCurve.ts`의 '부드러운 꺾임' 곡선을 품질 낮음은 렌더러 사용자 정의 색 보정으로, 품질 높음은 화면 효과 맨 끝에서 같은 식으로 건다.
- **빛:** 주된 빛 하나(`KeyLight`) + 낮춘 반구광 + 실습장 껍데기를 한 번 그려 만든 반사광(`WorkshopEnv`). 정비소 사진(HDRI)은 쓰지 않는다.
- **그림자:** 품질 높음은 실시간 그림자, 품질 낮음은 주된 빛 그림자와 닿는 그늘을 한 번 구워 바닥 판 한 장에 깐다(`FloorShadowBake`). 높음도 같은 부품으로 닿는 그늘만 굽는다.
- **재질:** 광택 에폭시 바닥(`floorMaterial.ts`, 상자 투영 반사), 벽 세로 그늘·바깥 바닥 밝기 그림(`lookTextures.ts`, 점마다 계산), 조명판 묶음 그리기.

**Tech Stack:** React 18 + TypeScript(strict, noUncheckedIndexedAccess), three 0.170, @react-three/fiber 8, drei 9, postprocessing 6(품질 높음 묶음에만), Vitest(node — 순수 함수·소스 글 검사), 헤드리스 크롬 촬영 도구(의존 패키지 없음).

**설계 문서:** `docs/superpowers/specs/2026-11-11-light-and-material-design.md`(MOON 승인 2026-11-11 "계획 세워", 계획 중 §4.4·§4.6·§6·§10 보완). 아래 "§n"은 이 문서의 절이다.

---

## 작업 규칙

- **작업 폴더:** `/Users/jamingchu/claude code/chassis-3d-lab-cozy`(git worktree, 브랜치 `cozy-stage1`). 모든 명령은 이 폴더에서 한다.
- **금지:** push·배포·main 합치기는 하지 않는다. `cozy-stage1`은 절대 push하지 않는다.
- **git:**
  - `git add`는 파일을 하나씩 적는다.
  - `tsconfig.tsbuildinfo`는 커밋하지 않는다.
  - 맨 `git stash`는 쓰지 않는다.
- **기타 금지:**
  - 새 패키지를 설치하지 않는다.
  - 브라우저·개발 서버를 열지 않는다(Task 0·Task 11은 컨트롤러가 한다).
  - `.env*` 파일을 읽지 않는다.
- **건드리지 않는 것:** 채점·판정·기록(`src/domain/`, `src/delivery/`, `src/records/` — Task 9에서 연구용 묶음 설명서의 글 한 곳만 예외), 학생에게 보이는 문구, 배치 자료, 모델 파일, `styles.css`.
- **명령**
  - 시험 하나: `npm test -- tests/파일.test.ts`
  - 전체: `npm test`
  - 형 검사: `node_modules/.bin/tsc -p tsconfig.json --noEmit`
  - 멈추면 앞에 `perl -e 'alarm 300; exec @ARGV'`를 붙인다.
- **커밋 메시지:** 끝에 `-m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"`를 붙인다.
- **코드는 글자 그대로:** 이 계획의 코드는 저장소 복사본(커밋 e1d36c2의 `src`)에 그대로 넣어 돌려 본 것이다(시험 1012개 통과, 형 검사 통과, 두 품질 화면 확인. 과제를 하나씩 차례로 넣은 중간 상태도 돌려 봤다). 값·이름·셰이더 글을 고치지 말고 그대로 옮긴다. 막히면 고치지 말고 멈춰서 알린다.
- **"바꿀 곳 → 바꾼 글"의 뜻:** '바꿀 곳'의 글은 파일에 **한 번만** 나온다(두 번이라고 적힌 곳 제외). 그 글을 '바꾼 글'로 통째로 바꾼다. 줄의 나머지 부분이 보이지 않으면 그 부분은 그대로 둔다.

## 미리 재 둔 값(헤드리스 크롬, 이 맥 — 태블릿 값이 아님)

한 화면의 그리기 호출 수. '새 판'은 이 계획의 코드를 복사본에서 돌린 값이다.

| 구도 | 지금 낮음 | 새 판 낮음 | 지금 높음 | 새 판 높음 |
|---|---|---|---|---|
| hero(입구) | 560 | 541 | 1,043 | 1,060 |
| top(위에서) | 602 | 561 | 1,085 | 1,080 |
| tester | 265 | 266 | 748 | 785 |
| carclose | 239 | 241 | 722 | 760 |
| lifttop | 515 | 505 | 998 | 1,024 |
| turncar | 315 | 312 | 798 | 831 |
| lifts | 524 | 504 | 1,007 | 1,023 |
| graze | 523 | 509 | 1,006 | 1,028 |
| north | 99 | 100 | 582 | 619 |
| bench | 116 | 118 | 599 | 637 |

- 한도(§6): 품질 낮음은 **지금 값 + 2 이하**(늘 그려지는 조명판·빛 판 묶음 2개 몫), 품질 높음은 **+8% 이내**.
- 구운 그림자 통계(개발 서버): 품질 낮음 평균 0.1355·최대 0.792, 품질 높음(닿는 그늘만) 평균 0.0433·최대 0.384.
- 묶음 크기: 주 묶음 1,605,698바이트(지금 1,600,421), 화면 효과 묶음 320,222바이트(지금 313,498).
- 계측부 색: 계기 화면 숫자의 가장 밝은 점 — 낮음 (255, 74, 58)로 지금과 같음, 높음 (248, 76, 62)(지금 (247, 90, 63), 원본 (255, 74, 58)).

## 파일 구조

| 파일 | 일 | Task |
|---|---|---|
| `scripts/lookdev/lookdev.mjs`, `scripts/lookdev/README.md` (새로) | 고정 구도 촬영·계측부 가까이 보기·품질 바꾸기 검사·비교 그림·색 재기 | 0 |
| `.gitignore` | `scripts/lookdev/out/` | 0 |
| `src/scene/look/toneCurve.ts` (새로) | 꺾임 곡선: 상수, JS 함수, GLSL 글, 렌더러에 끼우기 | 1 |
| `src/scene/look/lookConfig.ts` (새로) | 값 표, 품질별 구성, 주된 빛 방향, 그림자 범위 맞춤, 실습장 범위 | 2 |
| `src/scene/look/lookTextures.ts` (새로) | 바닥 색·광택, 벽 그늘, 바깥 바닥 밝기, 둥근 빛 그림(점마다 계산) | 3 |
| `src/scene/look/floorMaterial.ts` (새로) | 광택 바닥 재질(상자 투영 반사) | 4 |
| `src/app/quality.ts` | `antialiasRequested`(주소 `?aa=1`) | 5 |
| `src/scene/look/ToneSetup.tsx`, `KeyLight.tsx`, `WorkshopEnv.tsx`, `FloorShadowBake.tsx` (새로) | 장면 부품 | 6 |
| `src/scene/Effects.tsx` | 화면 효과(구석 그늘·빛 번짐·꺾임 곡선·계단 줄이기·가장자리) | 7 |
| `src/scene/Surroundings.tsx`, `src/scene/models/models.tsx` | 벽·바깥 바닥·천장 재질, 조명판 묶음 | 7 |
| `src/scene/LabScene.tsx`, `src/screens/LabScreen.tsx`, `src/screens/AvatarScreen.tsx` | 끼워 넣기 | 7 |
| `src/app/intro.ts`, `src/App.tsx`, `src/app/assetUrl.ts`, `scripts/build-asset-versions.mjs`, `src/data/assetVersions.json`, `public/assets/hdri/autoshop_01_1k.hdr`(지움), `docs/design/docs/08_ASSET_AND_COPYRIGHT.md` | 정비소 사진 걷어내기 | 8 |
| `src/app/buildInfo.ts`, `src/records/researchBundle.ts`(설명서 글 한 곳) | 앱 판 `0.3.3-demo` | 9 |
| `tests/toneCurve.test.ts`, `lookConfig.test.ts`, `lookTextures.test.ts`, `floorMaterial.test.ts`, `lookWiring.test.ts` (새로), `tests/quality.test.ts`, `intro.test.ts`, `assetVersions.test.ts`, `buildInfo.test.ts`, `researchBundle.test.ts` | 시험 | 1~9 |

WebGL이 있어야 도는 부품(Task 6의 네 파일, `Effects.tsx`)은 node 시험으로 돌릴 수 없다. 계산은 Task 1~4의 단위 시험이, 끼움은 Task 7의 소스 글 검사가, 결과는 Task 11의 화면 확인이 맡는다.

---

### Task 0: 촬영 도구를 넣고 '지금' 화면을 찍어 둔다 (컨트롤러)

겉모습을 바꾸기 **전에** 해야 한다. 개발 서버가 필요해서 컨트롤러가 직접 한다.

**Files:**
- Create: `scripts/lookdev/lookdev.mjs`
- Create: `scripts/lookdev/README.md`
- Modify: `.gitignore`

- [ ] **Step 1: 도구 파일 만들기** — `scripts/lookdev/lookdev.mjs`

```js
// 화면 촬영 도구(설계 docs/superpowers/specs/2026-11-11-light-and-material-design.md §7.2): 실습장을 늘 같은 구도로 찍어 겉모습이 바뀐 앞뒤를 견준다.
// 의존 패키지 없음: 시스템 크롬을 헤드리스로 띄우고 CDP(노드 내장 WebSocket, Node 22 이상)로 조작한다.
// 안전: GET이 아닌 요청은 문서 안(fetch·XHR·sendBeacon)과 네트워크 층에서 모두 막는다 — 기록 전송·AI 질문 0건. 임시 프로필만 쓴다.
// 고정 구도·굽기 통계는 개발 서버에서만 된다(Vite가 내주는 모듈 주소와 개발용 값에 기댄다). 사용법은 README.md.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const W = 1280, H = 800
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 고정 구도(x = 동, y = 위, z = 남, 단위 m). 배치가 바뀌면 여기를 고친다 */
export const CAMS = {
  hero: { pos: [-1.2, 2.3, 9.0], target: [8.5, 0.8, 5.5], fov: 50 },
  top: { pos: [-3.5, 11.5, 19], target: [9.5, 0, 6.5], fov: 50 },
  tester: { pos: [14.3, 1.8, 12.3], target: [16.4, 0.8, 8.4], fov: 50 },
  carclose: { pos: [14.6, 1.5, 9.9], target: [16.0, 0.9, 7.4], fov: 50 },
  lifttop: { pos: [8, 9.5, 17], target: [8, 0, 9.2], fov: 45 },
  turncar: { pos: [1.2, 1.5, 7.6], target: [4.4, 0.6, 4.4], fov: 50 },
  lifts: { pos: [0.5, 2.0, 14.5], target: [8, 0.6, 10.2], fov: 50 },
  graze: { pos: [-0.5, 0.7, 8.6], target: [10, 0.5, 6.0], fov: 45 },
  north: { pos: [7.5, 1.7, 6.0], target: [6.5, 1.0, 1.2], fov: 55 },
  bench: { pos: [15.6, 1.5, 2.6], target: [17.65, 0.95, 1.9], fov: 45 },
}

// ---------- 문서가 뜨기 전에 넣는 글 ----------
const WRITE_BLOCK = `(() => { if (window.__writeBlock) return; const nf = window.fetch; window.__blocked = [];
  window.fetch = function (input, init) { const m = String((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase(); if (m !== 'GET') { window.__blocked.push(m); return Promise.reject(new TypeError('blocked by lookdev: ' + m)) } return nf.apply(this, arguments) };
  try { Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: () => { window.__blocked.push('BEACON'); return false } }) } catch (e) {}
  const open = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (method) { if (String(method).toUpperCase() !== 'GET') { window.__blocked.push(String(method)); throw new Error('blocked by lookdev: ' + method) } return open.apply(this, arguments) };
  window.__writeBlock = true })();`
const PRESETS = `(() => { try { localStorage.setItem('chassis.intro.v1', JSON.stringify({ seen: true, off: true })); localStorage.setItem('lab.guide.v1', 'seen') } catch (e) {} })();`
/** 한 화면의 WebGL 그리기 호출·삼각형 수 */
const GL_STATS = `(() => { if (window.__glStats) return; const st = { frames: 0, last: { calls: 0, tris: 0 }, hist: [] }; window.__glStats = st; let fc = 0, ft = 0;
  const wrap = (p) => { if (!p) return; const de = p.drawElements, da = p.drawArrays, dei = p.drawElementsInstanced, dai = p.drawArraysInstanced;
    p.drawElements = function (mode, count) { fc++; if (mode === 4) ft += count / 3; return de.apply(this, arguments) };
    p.drawArrays = function (mode, first, count) { fc++; if (mode === 4) ft += count / 3; return da.apply(this, arguments) };
    if (dei) p.drawElementsInstanced = function (mode, count, type, off, n) { fc++; if (mode === 4) ft += (count / 3) * n; return dei.apply(this, arguments) };
    if (dai) p.drawArraysInstanced = function (mode, first, count, n) { fc++; if (mode === 4) ft += (count / 3) * n; return dai.apply(this, arguments) } };
  wrap(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype); wrap(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  const tick = () => { st.frames++; st.last = { calls: fc, tris: Math.round(ft) }; st.hist.push(fc); if (st.hist.length > 120) st.hist.shift(); fc = 0; ft = 0; requestAnimationFrame(tick) }; requestAnimationFrame(tick) })();`
/** 개발 빌드의 리액트 상태에서 학생 위치를 읽는다(걷기가 끝났는지 보려고) */
const HELPERS = `(() => { window.__fiber = (name) => { const c = document.getElementById('root'); const k = c && Object.keys(c).find((x) => x.startsWith('__reactContainer$')); if (!k) return null; const st = [c[k].stateNode.current]; while (st.length) { const f = st.pop(); if (f.type && f.type.name === name) return f; if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child) } return null };
  window.__labPos = () => { const f = window.__fiber('LabScreen'); if (!f) return null; const out = []; let h = f.memoizedState; while (h) { out.push(h.memoizedState); h = h.next } return out[1] && typeof out[1].x === 'number' ? { x: out[1].x, z: out[1].z, moving: out[2] } : null } })();`
/** 개발 서버가 내준 react-three-fiber 모듈에서 장면 상태(카메라·조작기)를 얻는다 */
const R3F = `const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /react-three_fiber\\.js/.test(n)); if (!url) throw new Error('개발 서버가 아닙니다(고정 구도는 개발 서버에서만)'); const m = await import(url); const st = m._roots.get(document.querySelector('canvas')).store.getState();`

// ---------- 크롬 ----------
async function launch(outDir) {
  const prof = join(outDir, `.profile-${process.pid}`)
  rmSync(prof, { recursive: true, force: true }); mkdirSync(prof, { recursive: true })
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' })
  let port
  for (let i = 0; i < 150 && !port; i++) { await sleep(100); if (existsSync(join(prof, 'DevToolsActivePort'))) port = readFileSync(join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0] }
  if (!port) { chrome.kill('SIGKILL'); throw new Error('크롬이 뜨지 않았습니다') }
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  let id = 0
  const pending = new Map()
  const log = { console: [], exceptions: [], nonGet: [] }
  const raw = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  /** 응답이 오지 않는 호출에 매달리지 않는다 */
  const send = (method, params = {}) => Promise.race([raw(method, params), new Promise((_, rej) => setTimeout(() => rej(new Error(`CDP 시간 초과: ${method}`)), method === 'Page.captureScreenshot' ? 30000 : 20000))])
  ws.addEventListener('message', (msg) => {
    const d = JSON.parse(msg.data)
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return }
    const p = d.params
    if (d.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) log.console.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 300)}`)
    else if (d.method === 'Runtime.exceptionThrown') log.exceptions.push((p.exceptionDetails.exception?.description ?? p.exceptionDetails.text ?? '').slice(0, 400))
    else if (d.method === 'Fetch.requestPaused') {
      if (p.request.method !== 'GET') { log.nonGet.push(`${p.request.method} ${p.request.url.slice(0, 100)}`); raw('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }) } else raw('Fetch.continueRequest', { requestId: p.requestId })
    } else if (d.method === 'Page.javascriptDialogOpening') raw('Page.handleJavaScriptDialog', { accept: false })
  })
  const close = async () => { try { ws.close() } catch {} try { chrome.kill('SIGTERM') } catch {} await sleep(500); try { chrome.kill('SIGKILL') } catch {} rmSync(prof, { recursive: true, force: true }) }
  setTimeout(() => { console.error('10분 넘게 걸려 멈춥니다'); close().finally(() => process.exit(3)) }, 10 * 60 * 1000).unref()
  for (const m of ['Page.enable', 'Runtime.enable', 'Network.enable']) await send(m)
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  for (const source of [WRITE_BLOCK, PRESETS, GL_STATS, HELPERS]) await send('Page.addScriptToEvaluateOnNewDocument', { source })
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text); return r.result?.result?.value }
  const waitFor = async (expression, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await ev(expression).catch(() => false)) return; await sleep(150) } throw new Error('기다리다 시간 초과: ' + expression.slice(0, 120)) }
  /** 글자가 들어 있는 요소를 누른다(숨겨 둔 화면 위 단추도 누를 수 있게 DOM click) */
  const click = (selector, text) => ev(`(() => { const x = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((e) => ${text === undefined ? 'true' : `e.textContent.includes(${JSON.stringify(text)})`}); if (!x) return false; x.click(); return true })()`)
  const mouse = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }) }
  const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.result.data, 'base64')) }
  return { send, ev, waitFor, click, mouse, shot, log, close }
}

// ---------- 앱 흐름 ----------
/** 시작 화면 → 캐릭터 → 실습장(게임 화면). 기록은 이 임시 프로필 안에만 남고, 전송은 막혀 있다 */
async function enterLab(b, base, quality, task = 'brake') {
  await b.send('Page.navigate', { url: `${base}${base.includes('?') ? '&' : '?'}q=${quality}` })
  await b.waitFor(`!!document.querySelector('main.start')`)
  if (!(await b.ev(`window.__writeBlock === true`))) throw new Error('쓰기 막기가 걸리지 않았습니다')
  await b.ev(`(() => { const i = document.querySelector('input[aria-label="익명 코드"]'); i.focus(); return true })()`)
  await b.send('Input.insertText', { text: 'A-01' })
  await b.click('.start-pick label.radio', task === 'brake' ? '제동력 측정 및 판독 — 사례 1' : '최소회전반경 측정 및 판정 — 사례 1')
  await b.click('.start-pick label.radio', '안내 있음')
  await b.click('button.primary', '과제 수령하러 가기')
  await b.waitFor(`/이대로 시작/.test(document.body.innerText) || !!document.querySelector('main.game')`)
  await b.click('button.primary', '이대로 시작')
  await b.waitFor(`!!document.querySelector('main.game') && !document.querySelector('.g-loading')`, 60000)
  await b.click('.g-guide button.primary', '알겠어요')
  await sleep(6000) // 바닥 그림자 굽기와 자동 품질 재기가 끝나도록
}
const hud = (b, on) => b.ev(`(() => { let s = document.getElementById('__ld_hide'); if (${on}) { if (s) s.remove(); return true } if (!s) { s = document.createElement('style'); s.id = '__ld_hide'; s.textContent = 'main.game > *:not(.g-canvas){visibility:hidden!important} .label3d{display:none!important}'; document.head.appendChild(s) } return true })()`)
const setCam = (b, c) => b.ev(`(async () => { ${R3F} const k = st.controls; k.minDistance = 0.05; k.maxDistance = 300; k.minPolarAngle = 0; k.maxPolarAngle = Math.PI; st.camera.position.set(${c.pos.join(',')}); k.target.set(${c.target.join(',')}); st.camera.fov = ${c.fov}; st.camera.updateProjectionMatrix(); k.update(); return true })()`)
const drawStats = (b) => b.ev(`new Promise((res) => { const st = window.__glStats, f0 = st.frames, t0 = performance.now(); setTimeout(() => { const h = st.hist.slice(-60); res({ fps: +(((st.frames - f0) * 1000) / (performance.now() - t0)).toFixed(1), calls: Math.round(h.reduce((a, c) => a + c, 0) / Math.max(1, h.length)), tris: st.last.tris }) }, 1200) })`)
const report = (b) => ({ console: b.log.console.slice(0, 10), exceptions: b.log.exceptions.slice(0, 5), blockedWrites: b.log.nonGet })

async function cams(base, outDir, name, quality, which) {
  const b = await launch(outDir)
  const out = { name, quality, base, cams: {} }
  try {
    await enterLab(b, base, quality)
    await hud(b, false)
    for (const [cam, c] of Object.entries(CAMS)) {
      if (which !== 'all' && !which.split(',').includes(cam)) continue
      await setCam(b, c); await sleep(700)
      out.cams[cam] = await drawStats(b)
      await b.shot(join(outDir, `${name}-${quality}-${cam}.png`))
    }
    out.bakes = await b.ev(`window.__lookdev ? window.__lookdev.bakes : null`)
    out.blockedInPage = await b.ev(`window.__blocked.length`)
  } catch (e) { out.error = String(e?.stack ?? e).slice(0, 800) } finally { Object.assign(out, report(b)); await b.close() }
  writeFileSync(join(outDir, `${name}-${quality}-cams.json`), JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out))
}

/** 바닥의 한 점을 눌러 걸어가게 하고 도착을 기다린다 */
async function walkTo(b, x, z) {
  await setCam(b, { pos: [x - 1.6, 8.5, z + 2.2], target: [x, 0, z], fov: 50 }); await sleep(500)
  const p = await b.ev(`(async () => { ${R3F} st.camera.updateMatrixWorld(); const v = st.camera.position.clone().set(${x}, 0, ${z}).project(st.camera); const r = st.gl.domElement.getBoundingClientRect(); return { x: Math.round(r.left + (v.x * 0.5 + 0.5) * r.width), y: Math.round(r.top + (-v.y * 0.5 + 0.5) * r.height) } })()`)
  await b.mouse(p.x, p.y)
  await b.waitFor(`(() => { const p = window.__labPos(); return !!p && !p.moving && Math.hypot(p.x - ${x}, p.z - ${z}) < 0.35 })()`, 60000)
  await sleep(600)
}
/** 기본 화면에서 과제를 받고(3D 교관을 누르지 않아도 되게) 게임 화면으로 돌아온다 */
async function receiveTask(b) {
  await b.click('button[aria-label="메뉴"]'); await sleep(300)
  await b.click('.g-menu button', '기본 화면(패널)으로'); await b.waitFor(`!!document.querySelector('main.lab')`)
  await b.click('button', '교관과 대화하기'); await b.waitFor(`Array.from(document.querySelectorAll('button')).some((x) => x.textContent.trim() === '과제 수령')`)
  await b.click('button.primary', '과제 수령'); await b.waitFor(`/NPC 검사 받기/.test(document.body.innerText)`)
  await b.click('button.link', '게임 화면으로'); await b.waitFor(`!!document.querySelector('main.game')`)
  for (let i = 0; i < 6 && (await b.ev(`!!document.querySelector('.g-dialog')`)); i++) { if (!(await b.click('.g-dialog .g-choices button', '닫기'))) await b.click('.g-dialog .g-bubble'); await sleep(300) }
  await b.waitFor(`!document.querySelector('.g-loading')`, 60000); await sleep(4000)
}
const walkButton = async (b, label, x, z) => { await b.click('.g-quest-btns button', label); await b.waitFor(`(() => { const p = window.__labPos(); return !!p && !p.moving && Math.hypot(p.x - ${x}, p.z - ${z}) < 0.35 })()`, 90000); await sleep(700) }

/** 계측부 가까이 보기: disc(다이얼 게이지 두 종) · panel(계기 화면) · turn(측정판 좌·우) */
async function inst(base, outDir, name, quality, flow) {
  const b = await launch(outDir)
  const out = { name, quality, flow, shots: [] }
  const snap = async (tag) => { await hud(b, false); await sleep(400); const f = `${name}-${quality}-inst-${tag}.png`; await b.shot(join(outDir, f)); out.shots.push(f); await hud(b, true) }
  try {
    await enterLab(b, base, quality, flow === 'turn' ? 'turning' : 'brake')
    if (flow === 'disc') {
      await walkTo(b, 16.6, 1.6); await b.click('.g-gaugebtn', '디스크 런아웃 연습'); await sleep(2500); await snap('disc')
      await b.click('.g-practice button[aria-label="연습 닫기"]'); await sleep(1500)
      await walkTo(b, 16.6, 2.75); await b.click('.g-gaugebtn', '차동기어 백래시 연습'); await sleep(2500); await snap('backlash')
    } else if (flow === 'panel') {
      await receiveTask(b); await walkButton(b, '공용 조작부', 16.9, 9.45)
      await b.click('.g-gaugebtn', '계기 보기'); await sleep(2500); await snap('panel')
    } else {
      await receiveTask(b); await walkButton(b, '최소회전반경 측정 차량', 2.6, 5.85)
      await b.click('.g-gaugebtn', '측정판 보기'); await sleep(2500); await snap('tt-left')
      await b.click('.g-ttbar button', '우측 바퀴'); await sleep(2000); await snap('tt-right')
    }
  } catch (e) { out.error = String(e?.stack ?? e).slice(0, 800) } finally { Object.assign(out, report(b)); await b.close() }
  console.log(JSON.stringify(out))
}

/** 품질을 두 번 바꾸고(메뉴의 '품질 낮음' 칸) 기본 화면에 다녀온다 — 부품이 붙고 떨어질 때 오류가 없는지, 그때마다 다시 굽는지 본다 */
async function toggle(base, outDir, name, quality) {
  const b = await launch(outDir)
  const out = { name, quality, steps: [] }
  const bakes = async () => ((await b.ev(`window.__lookdev ? window.__lookdev.bakes : null`)) ?? []).length
  const setLow = async (v) => {
    await b.ev(`(() => { if (!document.querySelector('.g-menu')) document.querySelector('button[aria-label="메뉴"]').click(); return true })()`); await sleep(300)
    await b.ev(`(() => { const c = document.querySelector('.g-menu .g-check input'); if (c && c.checked !== ${v}) c.click(); return true })()`); await sleep(200)
    await b.ev(`(() => { if (document.querySelector('.g-menu')) document.querySelector('button[aria-label="메뉴"]').click(); return true })()`); await sleep(4500)
  }
  try {
    await enterLab(b, base, quality)
    out.steps.push(['들어옴', await bakes()])
    await setLow(quality !== 'low'); out.steps.push(['품질 바꿈', await bakes()])
    await hud(b, false); await sleep(300); await b.shot(join(outDir, `${name}-${quality}-toggled.png`)); await hud(b, true)
    await setLow(quality === 'low'); out.steps.push(['품질 되돌림', await bakes()])
    await b.click('button[aria-label="메뉴"]'); await sleep(300); await b.click('.g-menu button', '기본 화면(패널)으로'); await b.waitFor(`!!document.querySelector('main.lab')`); await sleep(3500)
    out.steps.push(['기본 화면', await bakes()])
    await b.click('button.link', '게임 화면으로'); await b.waitFor(`!!document.querySelector('main.game')`); await sleep(3500)
    out.steps.push(['게임 화면', await bakes()])
  } catch (e) { out.error = String(e?.stack ?? e).slice(0, 800) } finally { Object.assign(out, report(b)); await b.close() }
  console.log(JSON.stringify(out))
}

// ---------- 그림 다루기(브라우저 캔버스로 — 그림 패키지 없이) ----------
const dataUrl = (file) => 'data:image/png;base64,' + readFileSync(file).toString('base64')
async function blankPage(outDir, w, h) { const b = await launch(outDir); await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await b.send('Page.navigate', { url: 'about:blank' }); await sleep(300); return b }

/** 지금·새 판 × 높음·낮음 2×2 비교 그림 */
async function sheet(outDir, baseName, newName, cam) {
  const cells = [[baseName, 'high', '지금 · 품질 높음(PC)'], [newName, 'high', '새 판 · 품질 높음(PC)'], [baseName, 'low', '지금 · 품질 낮음(태블릿)'], [newName, 'low', '새 판 · 품질 낮음(태블릿)']]
  const b = await blankPage(outDir, 1926, 1206)
  try {
    const html = `<body style="margin:0;background:#fff;display:grid;grid-template-columns:960px 960px;gap:6px;font:600 20px sans-serif">${cells.map(([n, q, label]) => `<div style="position:relative"><img src="${dataUrl(join(outDir, `${n}-${q}-${cam}.png`))}" style="width:960px;height:600px;display:block"><span style="position:absolute;left:8px;top:8px;background:#141414;color:#fff;padding:6px 10px">${label}</span></div>`).join('')}</body>`
    await b.ev(`(document.documentElement.innerHTML = ${JSON.stringify(html)}, true)`)
    await b.waitFor(`Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0)`)
    await b.shot(join(outDir, `sheet-${newName}-${cam}.png`))
    console.log(`sheet-${newName}-${cam}.png`)
  } finally { await b.close() }
}

/** 계측부 색 재기(설계 §5): 계기 화면 숫자의 가장 밝은 점과 평균, 측정판 종이색(밝은 5%) */
async function colors(outDir, name) {
  const b = await blankPage(outDir, 400, 300)
  const measure = (file, expr) => b.ev(`(async () => { const img = new Image(); img.src = ${JSON.stringify(dataUrl(file))}; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); ${expr} })()`)
  const digits = `const d = g.getImageData(133, 193, 787, 440).data; let n = 0, s = [0, 0, 0], mx = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] < 140) { n++; for (let k = 0; k < 3; k++) { s[k] += d[i + k]; if (d[i + k] > mx[k]) mx[k] = d[i + k] } } return { count: n, mean: s.map((v) => +(v / Math.max(1, n)).toFixed(1)), max: mx }`
  const paper = `const d = g.getImageData(380, 290, 520, 180).data; const px = []; for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]); px.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2])); const top = px.slice(0, Math.ceil(px.length * 0.05)); return { mean: [0, 1, 2].map((k) => +(top.reduce((a, p) => a + p[k], 0) / top.length).toFixed(1)) }`
  const out = {}
  try {
    for (const q of ['high', 'low']) {
      const p = join(outDir, `${name}-${q}-inst-panel.png`), t = join(outDir, `${name}-${q}-inst-tt-left.png`)
      out[q] = { readoutDigits: existsSync(p) ? await measure(p, digits) : null, turntablePaper: existsSync(t) ? await measure(t, paper) : null }
    }
  } finally { await b.close() }
  console.log(JSON.stringify({ name, source: { readoutDigits: [255, 74, 58], turntablePaper: [255, 248, 214] }, ...out }, null, 1))
}

const [cmd, ...a] = process.argv.slice(2)
const dir = (p) => { const d = resolve(p); mkdirSync(d, { recursive: true }); return d }
if (cmd === 'cams') await cams(a[0], dir(a[1]), a[2], a[3] === 'low' ? 'low' : 'high', a[4] ?? 'all')
else if (cmd === 'inst') await inst(a[0], dir(a[1]), a[2], a[3] === 'low' ? 'low' : 'high', a[4] ?? 'disc')
else if (cmd === 'toggle') await toggle(a[0], dir(a[1]), a[2], a[3] === 'low' ? 'low' : 'high')
else if (cmd === 'sheet') await sheet(dir(a[0]), a[1], a[2], a[3])
else if (cmd === 'colors') await colors(dir(a[0]), a[1])
else { console.log('사용: lookdev.mjs cams|inst|toggle|sheet|colors … (scripts/lookdev/README.md)'); process.exit(1) }
process.exit(0)
```

- [ ] **Step 2: 설명서 만들기** — `scripts/lookdev/README.md`

````markdown
# 화면 촬영 도구 (scripts/lookdev)

실습장을 늘 같은 구도로 찍어 겉모습이 바뀐 앞뒤를 견준다(설계 `docs/superpowers/specs/2026-11-11-light-and-material-design.md` §7.2).
헤드리스 크롬(실제 GPU)으로 찍고, GET이 아닌 요청은 모두 막는다(기록 전송·AI 질문 0건). 임시 프로필만 쓰고 끝나면 지운다.

- 필요: 시스템 Chrome(다른 자리에 있으면 환경 변수 `CHROME`), Node 22 이상. 설치할 패키지는 없다.
- 고정 구도, 계측부 흐름, 굽기 통계는 **개발 서버 주소**에서만 된다(Vite가 내주는 모듈과 개발용 값에 기댄다).

## 명령

```bash
node scripts/lookdev/lookdev.mjs cams   <주소> <출력폴더> <이름> <high|low> [구도,구도|all]
node scripts/lookdev/lookdev.mjs inst   <주소> <출력폴더> <이름> <high|low> <disc|panel|turn>
node scripts/lookdev/lookdev.mjs toggle <주소> <출력폴더> <이름> <high|low>
node scripts/lookdev/lookdev.mjs sheet  <출력폴더> <지금이름> <새이름> <구도>
node scripts/lookdev/lookdev.mjs colors <출력폴더> <이름>
```

| 명령 | 하는 일 | 나오는 것 |
|---|---|---|
| `cams` | 고정 구도 10개(`hero top tester carclose lifttop turncar lifts graze north bench`)를 찍는다 | `<이름>-<품질>-<구도>.png`, `<이름>-<품질>-cams.json`(그리기 호출 수·삼각형 수·굽기 통계·오류) |
| `inst` | 계측부 가까이 보기. `disc` 다이얼 게이지 2종, `panel` 계기 화면, `turn` 측정판 좌·우 | `<이름>-<품질>-inst-….png` |
| `toggle` | 품질을 두 번 바꾸고 기본 화면에 다녀온다(부품이 붙고 떨어질 때 오류가 없는지, 그때마다 바닥 그림자를 다시 굽는지) | 표준 출력(JSON: 단계별 굽기 횟수·오류), `<이름>-<품질>-toggled.png` |
| `sheet` | 지금·새 판 × 높음·낮음 2×2 비교 그림 | `sheet-<새이름>-<구도>.png` |
| `colors` | 계기 화면 숫자와 측정판 종이색을 재서 원본 색과 견준다 | 표준 출력(JSON) |

## 겉모습을 바꿀 때

1. 바꾸기 전 판을 `base`라는 이름으로 찍는다(두 품질, `cams`와 `inst` 세 가지).
2. 바꾼 뒤 `new`라는 이름으로 같은 것을 찍는다.
3. `sheet`로 비교 그림을 만들고 `colors`로 계측부 색을 잰다. `toggle`로 품질 바꾸기·화면 바꾸기에서 오류가 없는지 본다.
4. 한도(빛과 재질 설계 §6): 품질 낮음의 그리기 호출 수는 바꾸기 전 값 + 2 이하, 품질 높음은 +8% 이내. 콘솔 오류와 막힌 쓰기 요청은 0건.

출력 폴더는 `scripts/lookdev/out/`(.gitignore에 있음)이나 저장소 밖에 둔다. 구도 좌표는 `lookdev.mjs`의 `CAMS`에 있고, 배치가 바뀌면 거기를 고친다.
````

- [ ] **Step 3: 출력 폴더를 깃에서 빼기** — `.gitignore` 맨 끝에 더한다.

```
# 화면 촬영 도구 출력(로컬 전용)
scripts/lookdev/out/
```

- [ ] **Step 4: 문법 확인**

Run: `node --check scripts/lookdev/lookdev.mjs && npm test -- tests/assetVersions.test.ts`
Expected: 오류 없음, 시험 PASS(스크립트 폴더에 파일을 더해도 기존 시험이 그대로인지)

- [ ] **Step 5: 개발 서버 띄우기(컨트롤러)**

1. `/Users/jamingchu/claude code/.claude/launch.json`을 스크래치패드에 복사해 둔다.
2. 임시 항목 `cozy-transmit-check`를 더한다: `sh -c "cd '/Users/jamingchu/claude code/chassis-3d-lab-cozy' && exec npx vite --port 4319 --strictPort --host 127.0.0.1"`, 포트 4319.
3. `preview_start`로 그 항목을 띄운다. 함께 열리는 내장 브라우저 탭은 쓰기 막기가 없으므로 건드리지 않는다.

- [ ] **Step 6: '지금' 화면 찍기**

```bash
T=scripts/lookdev/lookdev.mjs; O=scripts/lookdev/out; U=http://localhost:4319/
for q in high low; do node $T cams $U $O base $q; for f in disc panel turn; do node $T inst $U $O base $q $f; done; done
node $T colors $O base
```

Expected:
- 명령마다 JSON 한 줄. `error` 없음, `console`·`exceptions`·`blockedWrites` 모두 `[]`.
- `cams`의 `calls`가 위 표의 '지금' 열과 같다(±2).
- `colors`: `low.readoutDigits.max`가 `[255, 74, 58]`, `high.readoutDigits.max`가 `[247, 90, 63]` 안팎.
- `scripts/lookdev/out/`에 `base-…png` 30장(구도 10 × 2, 계측부 5 × 2).

- [ ] **Step 7: 서버 끄고 되돌리기**

`preview_stop` → `launch.json`을 복사본으로 되돌리고 `cmp`로 같은지 확인 → 남은 헤드리스 크롬이 없는지 확인(`pgrep -fl "Google Chrome.*headless"`).

- [ ] **Step 8: 커밋**

```bash
git add scripts/lookdev/lookdev.mjs scripts/lookdev/README.md .gitignore
git commit -m "chore(촬영 도구): 고정 구도로 실습장을 찍어 겉모습 앞뒤를 견주는 도구 — 계측부 가까이 보기·품질 바꾸기 검사·색 재기(패키지 없음, 쓰기 요청 막음)" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 1: 색 보정 곡선 — 부드러운 꺾임

**Files:**
- Create: `src/scene/look/toneCurve.ts`
- Test: `tests/toneCurve.test.ts`

- [ ] **Step 1: 시험 쓰기** — `tests/toneCurve.test.ts`

```ts
// 색 보정 곡선 '부드러운 꺾임'(설계 2026-11-11 §4.2): 꺾임 값까지는 그대로, 그 위만 눌러 준다 — 계측부·색 토큰이 원본대로 보이게
import { describe, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { SOFT_CLIP_GLSL, TONE_ANCHOR, TONE_DESATURATION, TONE_KNEE, installToneCurve, softClip, type Rgb } from '../src/scene/look/toneCurve'

const srgbToLinear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const to8 = (c: number) => Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255)
/** 끼우기 전의 three.js 조각(이 파일의 어떤 시험보다 먼저 잡아 둔다) */
const PRISTINE = THREE.ShaderChunk.tonemapping_pars_fragment
/** 끼운 뒤에 있어야 할 함수 글 */
const PATCHED_FN = `vec3 CustomToneMapping( vec3 color ) {\n  color *= toneMappingExposure;${SOFT_CLIP_GLSL}\n}`

describe('부드러운 꺾임 곡선', () => {
  test('꺾임 값 이하의 색은 그대로 나온다', () => {
    for (const c of [[0, 0, 0], [0.2, 0.5, 0.1], [TONE_KNEE, 0.3, 0.3], [0.01, 0.02, TONE_KNEE]] as Rgb[]) expect(softClip(c)).toEqual(c)
  })
  test('계기 화면 숫자 색(#ff4a3a)은 화면 값 (248, 76, 62)로 나온다 — 원본과 채널마다 10 이내(설계 §5·§10)', () => {
    const out = softClip([srgbToLinear(255), srgbToLinear(74), srgbToLinear(58)]).map(to8)
    expect(out).toEqual([248, 76, 62])
    ;[255, 74, 58].forEach((v, i) => expect(Math.abs(out[i]! - v)).toBeLessThanOrEqual(10))
  })
  test('밝아질수록 커지되 1을 넘지 않는다', () => {
    let prev = 0
    for (let p = 0; p <= 40; p += 0.05) {
      const y = softClip([p, p, p])[0]
      expect(y).toBeGreaterThanOrEqual(prev)
      expect(y).toBeLessThan(1)
      prev = y
    }
    expect(softClip([40, 40, 40])[0]).toBeGreaterThan(0.99)
  })
  test('꺾이는 점에서 끊기지 않는다(위로도 아래로도)', () => {
    const below = softClip([TONE_KNEE, 0, 0])[0], above = softClip([TONE_KNEE + 1e-6, 0, 0])[0]
    expect(Math.abs(above - below)).toBeLessThan(1e-5)
  })
  test('GLSL 글은 같은 상수로 만든다', () => {
    expect(SOFT_CLIP_GLSL).toContain(TONE_KNEE.toFixed(4))
    expect(SOFT_CLIP_GLSL).toContain(TONE_DESATURATION.toFixed(4))
    expect(SOFT_CLIP_GLSL).toContain((1 - TONE_KNEE).toFixed(4))
  })
  test('GLSL 글을 글자 치환으로 JS로 옮겨 돌리면 JS 함수와 같은 값이 나온다(화면에 나가는 식을 지킨다)', () => {
    const body = SOFT_CLIP_GLSL
      .replace(/float /g, 'let ').replace(/max\(/g, 'Math.max(')
      .replace(/color\.([rgb])/g, (_m, ch: string) => `color[${'rgb'.indexOf(ch)}]`)
      .replace(/color \*= ([^;]+);/, 'color = color.map((v) => v * ($1));')
      .replace(/return mix\( color, vec3\( (\w+) \), (\w+) \);/, 'return color.map((v) => v * (1 - $2) + $1 * $2);')
    const glsl = new Function('color', body) as (c: number[]) => number[]
    for (let p = 0; p <= 4; p += 0.01) {
      for (const c of [[p, p, p], [p, 0.3 * p, 0.1 * p], [0.2 * p, p, 0.6 * p]] as Rgb[]) {
        const a = glsl([...c]), b = softClip(c)
        for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i]!, 12)
      }
    }
  })
})

describe('렌더러에 끼우기', () => {
  test('설치된 three.js에 끼울 줄이 꼭 한 번 있고, 곡선이 쓰는 노출 값 선언이 그 앞에 있다(아니면 three.js가 바뀐 것 — toneCurve.ts를 고친다)', () => {
    expect(PRISTINE.split(TONE_ANCHOR).length - 1).toBe(1)
    const exposure = PRISTINE.indexOf('uniform float toneMappingExposure;')
    expect(exposure).toBeGreaterThanOrEqual(0)
    expect(exposure).toBeLessThan(PRISTINE.indexOf(TONE_ANCHOR))
  })
  test('한 번 끼우면 빈 함수 줄만 곡선 함수로 바뀌고, 다시 불러도 그대로다', () => {
    expect(installToneCurve()).toBe(THREE.CustomToneMapping)
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment
    expect(chunk).toBe(PRISTINE.replace(TONE_ANCHOR, PATCHED_FN))
    expect(installToneCurve()).toBe(THREE.CustomToneMapping)
    expect(THREE.ShaderChunk.tonemapping_pars_fragment).toBe(chunk)
  })
  test('이 모듈만 다시 불려도(three.js에는 이미 끼워져 있음) 경고 없이 곡선을 그대로 쓴다', async () => {
    installToneCurve()
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      vi.resetModules()
      const fresh = await import('../src/scene/look/toneCurve')
      // 전제: 모듈을 다시 불러도 three.js는 같은 것이다(다르면 이 시험이 뜻이 없다)
      expect((await import('three')).ShaderChunk).toBe(THREE.ShaderChunk)
      expect(fresh.installToneCurve()).toBe(THREE.CustomToneMapping)
      expect(warn).not.toHaveBeenCalled()
      expect(THREE.ShaderChunk.tonemapping_pars_fragment).toBe(chunk)
    } finally { warn.mockRestore() }
  })
  test('끼울 줄이 없으면 한 번 경고하고 three.js 중립 곡선으로 돈다', async () => {
    const saved = THREE.ShaderChunk.tonemapping_pars_fragment
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      THREE.ShaderChunk.tonemapping_pars_fragment = PRISTINE.replace(TONE_ANCHOR, 'vec3 CustomToneMapping( vec3 color ) {\n\treturn color;\n}')
      vi.resetModules()
      const fresh = await import('../src/scene/look/toneCurve')
      expect(fresh.installToneCurve()).toBe(THREE.NeutralToneMapping)
      expect(fresh.installToneCurve()).toBe(THREE.NeutralToneMapping)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(THREE.ShaderChunk.tonemapping_pars_fragment).not.toContain(SOFT_CLIP_GLSL)
    } finally { THREE.ShaderChunk.tonemapping_pars_fragment = saved; warn.mockRestore() }
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/toneCurve.test.ts`
Expected: FAIL — `../src/scene/look/toneCurve`를 찾을 수 없음

- [ ] **Step 3: 구현** — `src/scene/look/toneCurve.ts`

```ts
// 색 보정 곡선 '부드러운 꺾임'(설계 2026-11-11 §4.2): 꺾임 값까지는 색을 그대로 내보내고, 그보다 밝은 부분만 흰색 쪽으로 눌러 준다.
// 계측부와 화면 색 토큰이 원본대로 보이게 하려는 것이다. 식은 Khronos 중립 곡선의 꺾임 부분과 같고, 어두운 색을 깎는 앞부분이 없다.
// 품질 낮음은 렌더러의 사용자 정의 색 보정으로, 품질 높음은 화면 효과(Effects.tsx)로 같은 식을 쓴다. GLSL 글과 시험용 JS 함수를 같은 상수에서 만든다.
// 렌더러 쪽은 곡선 앞에서 노출 값(toneMappingExposure)을 곱하므로, 두 품질이 같은 색을 내려면 노출이 1이어야 한다(ToneSetup이 1로 둔다).
import * as THREE from 'three'

/** 이 밝기(선형 값)까지는 그대로 내보낸다. 0보다 크고 1보다 작아야 한다. GLSL 글에는 소수 넷째 자리까지 적히므로 그보다 잘게 정하지 않는다 */
export const TONE_KNEE = 0.88
/** 눌린 밝은 색이 흰색 쪽으로 섞이는 세기(GLSL 글에는 소수 넷째 자리까지 적힌다) */
export const TONE_DESATURATION = 0.15

export type Rgb = [number, number, number]

/** GLSL과 같은 식(선형 RGB) */
export function softClip(c: Rgb): Rgb {
  const peak = Math.max(c[0], c[1], c[2])
  if (peak <= TONE_KNEE) return [c[0], c[1], c[2]]
  const d = 1 - TONE_KNEE
  const np = 1 - (d * d) / (peak + d - TONE_KNEE)
  const k = np / peak
  const g = 1 - 1 / (TONE_DESATURATION * (peak - np) + 1)
  const mix = (x: number) => x * k + (np - x * k) * g
  return [mix(c[0]), mix(c[1]), mix(c[2])]
}

/** vec3 color를 받아 돌려주는 GLSL 함수의 몸통(중괄호 없음) */
export const SOFT_CLIP_GLSL = `
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak <= ${TONE_KNEE.toFixed(4)} ) return color;
  float d = ${(1 - TONE_KNEE).toFixed(4)};
  float np = 1.0 - d * d / ( peak + d - ${TONE_KNEE.toFixed(4)} );
  color *= np / peak;
  float g = 1.0 - 1.0 / ( ${TONE_DESATURATION.toFixed(4)} * ( peak - np ) + 1.0 );
  return mix( color, vec3( np ), g );`

/** three.js 셰이더 조각에 있는 빈 사용자 정의 함수. 이 줄을 곡선으로 바꿔 끼운다 */
export const TONE_ANCHOR = 'vec3 CustomToneMapping( vec3 color ) { return color; }'
/** 끼운 뒤의 함수 글 */
const TONE_PATCHED = `vec3 CustomToneMapping( vec3 color ) {\n  color *= toneMappingExposure;${SOFT_CLIP_GLSL}\n}`

let installed: THREE.ToneMapping | null = null

/** 곡선을 한 번만 끼우고, renderer.toneMapping에 넣을 값을 돌려준다. 끼울 줄이 없으면(three.js가 바뀜) 경고하고 three.js의 중립 곡선으로 돌린다 */
export function installToneCurve(): THREE.ToneMapping {
  if (installed !== null) return installed
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment
  // 이 모듈만 다시 불린 경우(개발 서버에서 이 파일을 다시 읽을 때 등): three.js에는 이미 끼워져 있으니 그대로 쓴다
  if (chunk.includes(TONE_PATCHED)) { installed = THREE.CustomToneMapping; return installed }
  if (!chunk.includes(TONE_ANCHOR)) {
    console.warn('[look] 색 보정 곡선을 끼울 자리를 찾지 못해 three.js 중립 곡선으로 돌립니다')
    installed = THREE.NeutralToneMapping
    return installed
  }
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(TONE_ANCHOR, () => TONE_PATCHED)
  installed = THREE.CustomToneMapping
  return installed
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/toneCurve.test.ts && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 10개 PASS, 형 검사 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/scene/look/toneCurve.ts tests/toneCurve.test.ts
git commit -m "feat(빛과 재질): 색 보정 곡선 '부드러운 꺾임' — 꺾임 값까지는 색 그대로, 밝은 부분만 눌러 계측부·색 토큰이 원본대로" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 2: 값 표와 계산 — 품질별 구성·주된 빛 방향·그림자 범위

**Files:**
- Create: `src/scene/look/lookConfig.ts`
- Test: `tests/lookConfig.test.ts`

- [ ] **Step 1: 시험 쓰기** — `tests/lookConfig.test.ts`

```ts
// 실습장 빛·재질 값(설계 2026-11-11 §4): 값 표, 품질별 구성, 주된 빛 방향, 그림자 범위 맞춤
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { BAKE, LOOK, LOOK_DEFAULTS, fitShadowFrustum, keyDirection, labBounds, labZones, lookFor, withOverrides } from '../src/scene/look/lookConfig'

const layout = loadSceneLayout(raw)

describe('품질별 구성', () => {
  test('낮음: 실시간 그림자·화면 효과 없이 주된 빛 그림자를 구워서 깐다', () => {
    const t = lookFor(true, LOOK_DEFAULTS)
    expect(t.realtimeShadows).toBe(false); expect(t.postEffects).toBe(false)
    expect(t.sunShadow).toBe(LOOK_DEFAULTS.sunShadow); expect(t.contactShadow).toBe(LOOK_DEFAULTS.contactShadow)
    expect(t.envResolution).toBe(128)
  })
  test('높음: 실시간 그림자·화면 효과, 구운 것은 닿는 그늘만(약하게)', () => {
    const t = lookFor(false, LOOK_DEFAULTS)
    expect(t.realtimeShadows).toBe(true); expect(t.postEffects).toBe(true)
    expect(t.sunShadow).toBe(0); expect(t.contactShadow).toBe(LOOK_DEFAULTS.contactShadowHigh)
    expect(t.contactShadow).toBeLessThan(lookFor(true, LOOK_DEFAULTS).contactShadow)
    expect(t.envResolution).toBe(256)
  })
  test('낮음은 구석 그늘이 없는 만큼 주변광이 조금 세고, 빛 판이 조금 진하다', () => {
    expect(lookFor(true, LOOK_DEFAULTS).hemi).toBeGreaterThan(lookFor(false, LOOK_DEFAULTS).hemi)
    expect(lookFor(true, LOOK_DEFAULTS).halo).toBeGreaterThan(lookFor(false, LOOK_DEFAULTS).halo)
  })
  test('빛 번짐은 밝기 1을 넘는 것에만 걸린다(계측부 색은 1 이하)', () => {
    expect(LOOK_DEFAULTS.bloomThreshold).toBeGreaterThan(1)
  })
  test('시험 환경에서는 덮어쓰지 않은 기본값을 쓴다', () => {
    expect(LOOK).toEqual(LOOK_DEFAULTS)
  })
})

describe('개발용 조정 인자', () => {
  test('아는 이름의 숫자 값만 덮어쓴 새 값 표를 돌려준다(원본은 바뀌지 않는다)', () => {
    const before = { ...LOOK_DEFAULTS }
    const v = withOverrides(LOOK_DEFAULTS, 'key:2.5,env:0.4')
    expect(v.key).toBe(2.5); expect(v.env).toBe(0.4); expect(v.hemi).toBe(LOOK_DEFAULTS.hemi)
    expect(v).not.toBe(LOOK_DEFAULTS); expect(LOOK_DEFAULTS).toEqual(before)
  })
  test('모르는 이름·물려받은 이름(toString 등)·숫자가 아닌 값·빈 값은 버린다', () => {
    expect(withOverrides(LOOK_DEFAULTS, 'nope:1,key:abc,env:,hemi')).toEqual(LOOK_DEFAULTS)
    expect(Object.keys(withOverrides(LOOK_DEFAULTS, 'toString:1,constructor:2,valueOf:3'))).toEqual(Object.keys(LOOK_DEFAULTS))
    expect(withOverrides(LOOK_DEFAULTS, null)).toBe(LOOK_DEFAULTS)
    expect(withOverrides(LOOK_DEFAULTS, '')).toBe(LOOK_DEFAULTS)
  })
})

describe('주된 빛', () => {
  test('방향은 단위 벡터이고 남서쪽 위를 가리킨다(x = 동, y = 위, z = 남)', () => {
    const d = keyDirection(LOOK_DEFAULTS)
    expect(d.length()).toBeCloseTo(1, 6)
    expect(d.y).toBeCloseTo(Math.sin((LOOK_DEFAULTS.keyElevationDeg * Math.PI) / 180), 6)
    expect(d.z).toBeGreaterThan(0)
    expect(d.x).toBeLessThan(0)
    expect((Math.atan2(d.x, d.z) * 180) / Math.PI).toBeCloseTo(LOOK_DEFAULTS.keyAzimuthDeg, 6)
  })
  test('그림자 범위가 실습장(주 구역 + ABS 구역, 바닥~4.4 m)의 여덟 꼭짓점을 딱 맞게 담는다(옆 여유 0.5 m, 앞뒤 여유 1 m)', () => {
    const b = labBounds(layout), dir = keyDirection(LOOK_DEFAULTS)
    const f = fitShadowFrustum(b, BAKE.casterHeight, dir)
    expect(f.near).toBeGreaterThan(0); expect(f.far).toBeGreaterThan(f.near)
    const cam = new THREE.OrthographicCamera(f.left, f.right, f.top, f.bottom, f.near, f.far)
    cam.position.set(...f.position); cam.lookAt(...f.target); cam.updateMatrixWorld(true); cam.updateProjectionMatrix()
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    for (const x of [b.xMin, b.xMax]) for (const z of [b.zMin, b.zMax]) for (const y of [0, BAKE.casterHeight]) {
      const p = new THREE.Vector3(x, y, z).project(cam)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1); expect(Math.abs(p.y)).toBeLessThanOrEqual(1); expect(Math.abs(p.z)).toBeLessThanOrEqual(1)
      lo.min(p); hi.max(p)
    }
    // 헐겁지도 않다: 옆이 넓으면 그림자 점이 굵어지고, 앞뒤가 길면 그림자 치우침(shadowBias)이 커져 그림자가 물체에서 떨어진다
    const w = f.right - f.left, h = f.top - f.bottom, depth = f.far - f.near
    for (const side of [((lo.x + 1) * w) / 2, ((1 - hi.x) * w) / 2, ((lo.y + 1) * h) / 2, ((1 - hi.y) * h) / 2]) expect(side).toBeCloseTo(0.5, 6)
    for (const end of [((lo.z + 1) * depth) / 2, ((1 - hi.z) * depth) / 2]) expect(end).toBeCloseTo(1, 6)
  })
  test('예전 범위가 놓치던 공용 조작부·ABS 구역 남쪽 끝도 범위 안이다', () => {
    const f = fitShadowFrustum(labBounds(layout), BAKE.casterHeight, keyDirection(LOOK_DEFAULTS))
    const cam = new THREE.OrthographicCamera(f.left, f.right, f.top, f.bottom, f.near, f.far)
    cam.position.set(...f.position); cam.lookAt(...f.target); cam.updateMatrixWorld(true); cam.updateProjectionMatrix()
    const panel = layout.equipment.find((e) => e.kind === 'panel')!
    for (const [x, z] of [[panel.x, panel.z], [layout.absProtrusion!.xMax, layout.absProtrusion!.zMax]] as Array<[number, number]>) {
      const p = new THREE.Vector3(x, 0, z).project(cam)
      expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1)
    }
  })
})

describe('실습장 범위', () => {
  test('주 구역과 ABS 구역을 함께 담는다', () => {
    const b = labBounds(layout)
    expect(b.xMin).toBe(layout.mainZone.xMin); expect(b.xMax).toBe(layout.mainZone.xMax)
    expect(b.zMin).toBe(layout.mainZone.zMin); expect(b.zMax).toBe(layout.absProtrusion!.zMax)
    expect(labZones(layout)).toHaveLength(2)
  })
  test('ABS 구역이 없으면 주 구역만', () => {
    const only = { mainZone: layout.mainZone, absProtrusion: null }
    expect(labZones(only)).toHaveLength(1)
    expect(labBounds(only).zMax).toBe(layout.mainZone.zMax)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/lookConfig.test.ts`
Expected: FAIL — `../src/scene/look/lookConfig`를 찾을 수 없음

- [ ] **Step 3: 구현** — `src/scene/look/lookConfig.ts`

```ts
// 실습장 빛·재질 값(설계 docs/superpowers/specs/2026-11-11-light-and-material-design.md §4). 값은 이 파일 한 곳에만 둔다.
// 채점·기록과 무관한 겉모습 값이고, 과제 진행에 따라 바뀌는 값은 없다(안내 없음 원칙).
import * as THREE from 'three'
import type { Rect, SceneLayout } from '../layoutModel'

/** 바닥 범위(배치 자료의 Rect와 같은 모양) */
export type Bounds = Rect

/** 숫자 값. 개발 서버에서는 주소 인자 ?look=이름:값,이름:값 으로 덮어써 볼 수 있다(운영 묶음에는 없음) */
export const LOOK_DEFAULTS = {
  /** 주된 빛: 세기, 바닥에서 올려다본 각(도), 남쪽에서 동쪽으로 잰 방위(도 — 음수는 서쪽으로 돌아감) */
  key: 3.7, keyElevationDeg: 50, keyAzimuthDeg: -22,
  /** 반구광 세기와 품질 낮음 배수(구석 그늘이 없는 만큼 조금 밝게) */
  hemi: 0.55, hemiLowBoost: 1.15,
  /** 실습장 반사광 세기, 반사광 속 조명판 밝기 */
  env: 0.32, envPanel: 11,
  /** 바닥 거칠기, 바닥 반사 배수 */
  floorRoughness: 0.3, floorReflect: 1,
  /** 구운 그림자 세기: 주된 빛 그림자, 닿는 그늘(낮음·높음 — 높음은 실시간 그림자와 겹쳐 약하게), 빛의 퍼짐 각(도) */
  sunShadow: 0.6, contactShadow: 0.5, contactShadowHigh: 0.4, shadowSoftDeg: 4.5,
  /** 실시간 그림자(품질 높음). shadowBias는 그림자 범위의 앞뒤 길이(지금 약 24 m)에 대한 비율이라, 범위가 달라지면 실제 치우침도 달라진다 */
  shadowRadius: 2.6, shadowBias: -0.0006, shadowNormalBias: 0.06,
  /** 조명판 둘레 빛 판 세기(낮음·높음 — 높음은 화면 효과 빛 번짐이 더해져 약하게) */
  haloLow: 0.3, haloHigh: 0.18,
  /** 화면 효과(품질 높음) */
  aoRadius: 1, aoIntensity: 2.6, bloomThreshold: 1.2, bloom: 0.5, vignetteOffset: 0.3, vignette: 0.45,
}
export type LookValues = typeof LOOK_DEFAULTS

/** "이름:값,이름:값"에서 아는 이름·숫자 값만 받아 덮어쓴 새 값 표를 돌려준다 */
export function withOverrides(base: LookValues, spec: string | null): LookValues {
  if (!spec) return base
  const out: LookValues = { ...base }
  for (const part of spec.split(',')) {
    const [k, raw] = part.split(':')
    const n = Number(raw)
    if (k && Object.hasOwn(base, k) && raw !== undefined && raw.trim() !== '' && Number.isFinite(n)) out[k as keyof LookValues] = n
  }
  return out
}

export const LOOK: LookValues = import.meta.env.DEV && typeof location !== 'undefined' ? withOverrides(LOOK_DEFAULTS, new URLSearchParams(location.search).get('look')) : LOOK_DEFAULTS

export const PALETTE = {
  key: '#fff1e0', sky: '#e8f0ff', ground: '#3f5a46',
  floor: '#22774c', line: '#2f9e68',
  wallUp: '#eeebe4', wallLow: '#8e9a96', hallWall: '#d5cfc5', hallWallLow: '#9a9288', hallFloor: '#b5afa6',
  ceiling: '#d6d1c8', halo: '#fff6e6', background: '#c9c1b5', shadow: '#07180f', aoTint: '#0a1711',
} as const
/** 조명판 색(밝기 1을 넘는 선형 값 — 품질 높음에서 빛 번짐이 걸린다) */
export const PANEL_RGB = [2.6, 2.45, 2.2] as const
export const FOG = { near: 20, far: 62 } as const
export const SHADOW_MAP_SIZE = 2048
/** 구운 바닥 그림자: 그림 크기, 드리우는 물체 최고 높이(m — 천장 4.2 m보다 높아야 한다), 닿는 그늘을 보는 높이(m), 가장자리 폭 범위(m), 굽기 전 기다림(ms).
 *  처음은 로딩 화면이 걷히기 전(불러오기 끝 + 0.4초, LabScreen)에 굽도록 짧게, 다시 굽기는 리프트·차량 움직임이 끝나도록 길게 */
export const BAKE = { size: 1024, depthSize: 2048, contactSize: 512, casterHeight: 4.4, contactFar: 2.2, minPenumbra: 0.02, maxPenumbra: 0.5, firstDelayMs: 150, rebakeDelayMs: 2500 } as const

export interface TierLook { realtimeShadows: boolean; postEffects: boolean; envResolution: number; hemi: number; halo: number; sunShadow: number; contactShadow: number }

/** 품질별 구성(설계 §4.1). 낮음에는 실시간 그림자·화면 효과가 없고, 주된 빛 그림자를 구워서 깐다 */
export function lookFor(lowSpec: boolean, v: LookValues = LOOK): TierLook {
  return lowSpec
    ? { realtimeShadows: false, postEffects: false, envResolution: 128, hemi: v.hemi * v.hemiLowBoost, halo: v.haloLow, sunShadow: v.sunShadow, contactShadow: v.contactShadow }
    : { realtimeShadows: true, postEffects: true, envResolution: 256, hemi: v.hemi, halo: v.haloHigh, sunShadow: 0, contactShadow: v.contactShadowHigh }
}

/** 주된 빛이 있는 쪽을 가리키는 단위 벡터(x = 동, y = 위, z = 남) */
export function keyDirection(v: LookValues = LOOK): THREE.Vector3 {
  const el = (v.keyElevationDeg * Math.PI) / 180, az = (v.keyAzimuthDeg * Math.PI) / 180
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize()
}

/** 실습장 구역들(주 구역, 있으면 ABS 구역) */
export function labZones(layout: Pick<SceneLayout, 'mainZone' | 'absProtrusion'>): Bounds[] {
  return [layout.mainZone, ...(layout.absProtrusion ? [layout.absProtrusion] : [])].map((z) => ({ xMin: z.xMin, xMax: z.xMax, zMin: z.zMin, zMax: z.zMax }))
}

/** 그림자가 닿아야 하는 바닥 범위: 주 구역과 ABS 구역을 함께 담는 직사각형 */
export function labBounds(layout: Pick<SceneLayout, 'mainZone' | 'absProtrusion'>): Bounds {
  const zones = labZones(layout)
  return { xMin: Math.min(...zones.map((z) => z.xMin)), xMax: Math.max(...zones.map((z) => z.xMax)), zMin: Math.min(...zones.map((z) => z.zMin)), zMax: Math.max(...zones.map((z) => z.zMax)) }
}

export interface ShadowFrustum { position: [number, number, number]; target: [number, number, number]; left: number; right: number; bottom: number; top: number; near: number; far: number }

/**
 * 빛 쪽(dir)에서 본 직교 카메라가 범위 상자(바닥 범위 × 높이 0~height)를 딱 담게 맞춘다(옆으로 margin, 앞뒤로 1 m 여유).
 * three.js 카메라와 같은 규칙: 카메라는 -z를 보고, 위는 +y.
 * 조건: dir은 길이 1인 벡터. 범위 상자가 빛 쪽으로 distance - 0.5 m보다 멀리 뻗으면 가까운 쪽이 잘린다(지금 실습장은 가운데에서 가장 먼 꼭짓점까지 약 16 m).
 */
export function fitShadowFrustum(bounds: Bounds, height: number, dir: THREE.Vector3, distance = 40, margin = 0.5): ShadowFrustum {
  const target = new THREE.Vector3((bounds.xMin + bounds.xMax) / 2, 0, (bounds.zMin + bounds.zMax) / 2)
  const position = target.clone().addScaledVector(dir, distance)
  const view = new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0)).setPosition(position).invert()
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const x of [bounds.xMin, bounds.xMax]) for (const z of [bounds.zMin, bounds.zMax]) for (const y of [0, height]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(view)
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z)
  }
  return { position: [position.x, position.y, position.z], target: [target.x, target.y, target.z], left: x0 - margin, right: x1 + margin, bottom: y0 - margin, top: y1 + margin, near: Math.max(0.5, -z1 - 1), far: -z0 + 1 }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/lookConfig.test.ts && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 12개 PASS, 형 검사 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/scene/look/lookConfig.ts tests/lookConfig.test.ts
git commit -m "feat(빛과 재질): 값 표와 계산 — 품질별 구성, 주된 빛 방향, 실습장 전체를 담는 그림자 범위, 개발용 조정 인자" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 3: 그림 만들기 — 바닥 색·광택, 벽 그늘, 바깥 바닥, 둥근 빛

**Files:**
- Create: `src/scene/look/lookTextures.ts`
- Test: `tests/lookTextures.test.ts`

- [ ] **Step 1: 시험 쓰기** — `tests/lookTextures.test.ts`

```ts
// 빛·재질 그림(설계 2026-11-11 §4.5·§4.6): 점마다 계산해 만든다 — 값 범위, 이음매 없음, 같은 입력이면 같은 값
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { drift, epoxyColorAt, epoxyColorTexture, epoxyRoughAt, epoxyRoughnessTexture, glowAt, glowTexture, hallFalloffAt, hallFalloffTexture, wallShadeAt, wallShadeTexture } from '../src/scene/look/lookTextures'

const grid = (n: number) => Array.from({ length: n }, (_, i) => i / (n - 1))

describe('부드러운 흐름', () => {
  test('-1~1 범위이고 같은 입력이면 같은 값', () => {
    for (const u of grid(9)) for (const v of grid(9)) {
      const d = drift(u, v, 11)
      expect(d).toBeGreaterThanOrEqual(-1); expect(d).toBeLessThanOrEqual(1)
      expect(drift(u, v, 11)).toBe(d)
    }
  })
  test('이어 붙여도 이음매가 없다(0과 1에서 같은 값)', () => {
    for (const t of grid(7)) {
      expect(drift(0, t, 5)).toBeCloseTo(drift(1, t, 5), 9)
      expect(drift(t, 0, 5)).toBeCloseTo(drift(t, 1, 5), 9)
    }
  })
  test('씨앗이 다르면 무늬가 다르다', () => {
    expect(drift(0.3, 0.7, 5)).not.toBeCloseTo(drift(0.3, 0.7, 11), 3)
  })
})

describe('에폭시 바닥', () => {
  test('색은 #22774c에서 아주 조금만 벗어난다(얼룩 없음)', () => {
    for (const u of grid(9)) for (const v of grid(9)) {
      const [r, g, b] = epoxyColorAt(u, v)
      expect(Math.abs(r - 34)).toBeLessThanOrEqual(3); expect(Math.abs(g - 119)).toBeLessThanOrEqual(7); expect(Math.abs(b - 76)).toBeLessThanOrEqual(5)
    }
  })
  test('광택 값은 가운데 118 둘레에서 조금씩 다르다', () => {
    const vals = grid(17).flatMap((u) => grid(17).map((v) => epoxyRoughAt(u, v)))
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(118 - 44); expect(Math.max(...vals)).toBeLessThanOrEqual(118 + 44)
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(10)
  })
})

describe('벽 세로 그늘', () => {
  test('아래 띠는 바닥에 닿는 쪽이 가장 어둡고 위로 갈수록 밝다', () => {
    expect(wallShadeAt('low', 0)).toBe(111); expect(wallShadeAt('low', 1)).toBe(255)
    for (let i = 1; i <= 20; i++) expect(wallShadeAt('low', i / 20)).toBeGreaterThanOrEqual(wallShadeAt('low', (i - 1) / 20))
  })
  test('윗벽은 위쪽 끝만 조금 어둡다', () => {
    expect(wallShadeAt('up', 0)).toBe(255); expect(wallShadeAt('up', 1)).toBe(210)
    expect(wallShadeAt('up', 0.5)).toBeGreaterThan(245)
  })
})

describe('바깥 바닥 밝기', () => {
  const zones = [{ xMin: 0, xMax: 18, zMin: 0, zMax: 14 }, { xMin: 14, xMax: 18, zMin: 14, zMax: 24 }]
  test('실습장 안과 바로 둘레는 가장 밝다', () => {
    expect(hallFalloffAt(9, 7, zones)).toBe(255)
    expect(hallFalloffAt(16, 20, zones)).toBe(255)
    expect(hallFalloffAt(-1, 7, zones)).toBe(255)
  })
  test('멀어질수록 어두워지고 6.8 m 밖은 140에서 멈춘다', () => {
    expect(hallFalloffAt(-4, 7, zones)).toBeLessThan(255); expect(hallFalloffAt(-4, 7, zones)).toBeGreaterThan(140)
    expect(hallFalloffAt(-7, 7, zones)).toBeCloseTo(140, 6)
    expect(hallFalloffAt(-9.5, 7, zones)).toBeCloseTo(140, 6)
    expect(hallFalloffAt(-3, 7, zones)).toBeGreaterThan(hallFalloffAt(-5, 7, zones))
  })
})

describe('둥근 빛', () => {
  test('가운데 1, 가장자리 0, 바깥으로 갈수록 줄어든다', () => {
    expect(glowAt(0.5, 0.5)).toBe(1); expect(glowAt(0, 0.5)).toBe(0); expect(glowAt(0.02, 0.02)).toBe(0)
    let prev = 1
    for (let i = 0; i <= 10; i++) { const g = glowAt(0.5 + i * 0.05, 0.5); expect(g).toBeLessThanOrEqual(prev); prev = g }
  })
})

describe('그림 만들기(캔버스 없이)', () => {
  test('바닥 색 그림: sRGB, 반복, 밉맵, 비스듬히 볼 때 선명도 4', () => {
    const t = epoxyColorTexture([4, 3])
    expect(t).toBeInstanceOf(THREE.DataTexture)
    expect(t.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(t.wrapS).toBe(THREE.RepeatWrapping); expect(t.wrapT).toBe(THREE.RepeatWrapping); expect(t.repeat.x).toBe(4); expect(t.repeat.y).toBe(3)
    expect(t.generateMipmaps).toBe(true); expect(t.minFilter).toBe(THREE.LinearMipmapLinearFilter)
    expect(t.anisotropy).toBe(4)
    expect(epoxyColorTexture([4, 3])).toBe(t)
  })
  test('광택 그림은 색 공간 없이(값 그대로)', () => {
    const t = epoxyRoughnessTexture([2, 2])
    expect(t.colorSpace).toBe(THREE.NoColorSpace); expect(t.anisotropy).toBe(4)
  })
  test('만든 바닥 그림을 이어 붙여도 이음매가 없다(맞닿는 끝 줄의 차이가 안쪽 이웃 점의 차이만큼)', () => {
    for (const [t, ch] of [[epoxyColorTexture([1, 1]), 1], [epoxyRoughnessTexture([1, 1]), 0]] as Array<[THREE.DataTexture, number]>) {
      const d = t.image.data as Uint8Array, n = 256
      const at = (x: number, y: number) => d[(y * n + x) * 4 + ch]!
      let wrap = 0, inside = 0
      for (let i = 0; i < n; i++) {
        wrap = Math.max(wrap, Math.abs(at(0, i) - at(n - 1, i)), Math.abs(at(i, 0) - at(i, n - 1)))
        for (let j = 1; j < n; j++) inside = Math.max(inside, Math.abs(at(j, i) - at(j - 1, i)), Math.abs(at(i, j) - at(i, j - 1)))
      }
      expect(wrap).toBeLessThanOrEqual(inside + 1)
    }
  })
  test('모든 그림은 그래픽 장치로 올라가게 표시돼 있다(안 그러면 빈 그림으로 보인다)', () => {
    const hall = { xMin: -10, xMax: 18, zMin: 0, zMax: 30 }
    for (const t of [epoxyColorTexture([4, 3]), epoxyRoughnessTexture([2, 2]), wallShadeTexture('low'), wallShadeTexture('up'), hallFalloffTexture(hall, [hall]), glowTexture('alpha'), glowTexture('rgb')]) expect(t.version).toBeGreaterThan(0)
  })
  test('이어 붙이지 않는 그림: 가장자리에서 멈추고, 선명도 보정은 쓰지 않는다. 밝기를 곱하는 그림은 sRGB, 투명도 그림은 값 그대로', () => {
    const hall = { xMin: -10, xMax: 18, zMin: 0, zMax: 30 }
    const srgb = [wallShadeTexture('low'), wallShadeTexture('up'), hallFalloffTexture(hall, [hall]), glowTexture('rgb')], plain = [glowTexture('alpha')]
    for (const t of [...srgb, ...plain]) { expect(t.wrapS).toBe(THREE.ClampToEdgeWrapping); expect(t.wrapT).toBe(THREE.ClampToEdgeWrapping); expect(t.anisotropy).toBe(1) }
    for (const t of srgb) expect(t.colorSpace).toBe(THREE.SRGBColorSpace)
    for (const t of plain) expect(t.colorSpace).toBe(THREE.NoColorSpace)
  })
  test('벽 그늘 그림은 아래 줄이 v = 0', () => {
    const d = wallShadeTexture('low').image.data as Uint8Array
    expect(d[0]).toBeLessThan(130)
    expect(d[d.length - 4]).toBeGreaterThan(250)
  })
  test('바깥 바닥 그림: 북쪽(z 최소)이 맨 윗줄(v = 1)', () => {
    const hall = { xMin: -10, xMax: 18, zMin: 0, zMax: 30 }
    const t = hallFalloffTexture(hall, [{ xMin: 0, xMax: 18, zMin: 0, zMax: 14 }])
    const d = t.image.data as Uint8Array, n = 128
    const at = (col: number, row: number) => d[(row * n + col) * 4]!
    expect(at(n - 2, n - 2)).toBe(255)
    expect(at(n - 2, 1)).toBeLessThan(160)
  })
  test('둥근 빛 그림: alpha는 흰색에 투명도로, rgb는 밝기로', () => {
    const a = glowTexture('alpha').image.data as Uint8Array, r = glowTexture('rgb').image.data as Uint8Array
    const mid = (32 * 64 + 32) * 4
    expect(a[0]).toBe(255); expect(a[3]).toBe(0); expect(a[mid + 3]).toBeGreaterThan(230)
    expect(r[0]).toBe(0); expect(r[3]).toBe(255); expect(r[mid]).toBeGreaterThan(230)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/lookTextures.test.ts`
Expected: FAIL — `../src/scene/look/lookTextures`를 찾을 수 없음

- [ ] **Step 3: 구현** — `src/scene/look/lookTextures.ts`

```ts
// 빛·재질 다듬기에 쓰는 그림(설계 2026-11-11 §4.5·§4.6). 그림 파일 없이, 점마다 계산해서 만든다.
// 캔버스의 번짐(gradient)·흐림(filter)은 쓰지 않는다: 크롬은 번짐에 미세한 점을 섞어 바닥에 잔 그물 무늬가 보였고, 흐림은 일부 사파리에서 안 된다.
// 만든 그림은 한 번만 만들어 여러 곳이 함께 쓴다. 받은 쪽에서 설정(반복 수 등)을 바꾸지 않는다.
import * as THREE from 'three'
import { PALETTE, type Bounds } from './lookConfig'

/** 결정적 의사 난수(매번 같은 무늬) */
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

const waves = new Map<number, Array<{ fx: number; fy: number; ph: number; amp: number }>>()
/** 이음매 없는 부드러운 흐름(-1~1): 온전한 주기의 코사인 물결 7개. u·v가 0과 1에서 같은 값이다 */
export function drift(u: number, v: number, seed: number): number {
  let w = waves.get(seed)
  if (!w) {
    const r = rng(seed)
    w = Array.from({ length: 7 }, () => {
      const fx = Math.round(r() * 3) * (r() < 0.5 ? -1 : 1), fy = Math.round(r() * 3) * (r() < 0.5 ? -1 : 1)
      return { fx, fy, ph: r() * Math.PI * 2, amp: 1 / (1 + Math.hypot(fx, fy)) }
    })
    waves.set(seed, w)
  }
  let sum = 0, norm = 0
  for (const k of w) { sum += k.amp * Math.cos(2 * Math.PI * (k.fx * u + k.fy * v) + k.ph); norm += k.amp }
  return sum / norm
}

/** 값 표의 바닥 색(#rrggbb)을 sRGB 0~255로 */
const FLOOR_RGB = [1, 3, 5].map((i) => parseInt(PALETTE.floor.slice(i, i + 2), 16)) as [number, number, number]

/** 에폭시 바닥 색(sRGB 0~255): 값 표의 바닥 색(#22774c)에 아주 옅고 넓은 색 흐름만 */
export function epoxyColorAt(u: number, v: number): [number, number, number] {
  const d = drift(u, v, 11)
  return [FLOOR_RGB[0] + d * 3, FLOOR_RGB[1] + d * 7, FLOOR_RGB[2] + d * 5]
}

/** 에폭시 바닥 광택(0~255, 재질 거칠기에 곱해짐): 넓은 얼룩으로 조금씩 다르게 */
export function epoxyRoughAt(u: number, v: number): number {
  return 118 + drift(u, v, 5) * 34 + drift(u * 2, v * 2, 23) * 10
}

/** 벽 세로 그늘(sRGB 회색 0~255, v = 0 아래 → 1 위). low: 바닥에 닿는 쪽이 어둡다. up: 위쪽 끝이 조금 어둡다 */
export function wallShadeAt(kind: 'low' | 'up', v: number): number {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))
  if (kind === 'low') return v < 0.22 ? lerp(111, 210, v / 0.22) : lerp(210, 255, (v - 0.22) / 0.78)
  return v < 0.7 ? lerp(255, 246, v / 0.7) : lerp(246, 210, (v - 0.7) / 0.3)
}

/** 바깥 바닥 밝기(sRGB 회색 0~255): 실습장 구역 안과 둘레 1.3 m는 255, 6.8 m 밖은 140 */
export function hallFalloffAt(x: number, z: number, zones: Bounds[]): number {
  let dist = Infinity
  for (const r of zones) dist = Math.min(dist, Math.hypot(Math.max(r.xMin - x, 0, x - r.xMax), Math.max(r.zMin - z, 0, z - r.zMax)))
  const t = Math.min(1, Math.max(0, (dist - 1.3) / 5.5))
  return 255 - (255 - 140) * (t * t * (3 - 2 * t))
}

/** 둥근 빛(0~1): 가운데 1, 반지름의 45%에서 0.42, 가장자리 0 */
export function glowAt(u: number, v: number): number {
  const r = Math.hypot(u - 0.5, v - 0.5) * 2
  if (r >= 1) return 0
  return r < 0.45 ? 1 - (r / 0.45) * 0.58 : 0.42 * (1 - (r - 0.45) / 0.55)
}

const cache = new Map<string, THREE.DataTexture>()
/** anisotropy: 비스듬히 볼 때의 선명도 보정(넓게 깔리는 바닥 그림에만 쓴다 — 태블릿 부담을 줄이려고 나머지는 1) */
function build(key: string, w: number, h: number, at: (u: number, v: number) => [number, number, number, number], opts: { srgb: boolean; repeat?: [number, number]; anisotropy?: number }): THREE.DataTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at((x + 0.5) / w, (y + 0.5) / h), o = (y * w + x) * 4
    for (let k = 0; k < 4; k++) data[o + k] = Math.round(Math.min(255, Math.max(0, c[k]!)))
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
  if (opts.srgb) t.colorSpace = THREE.SRGBColorSpace
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]) }
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true
  t.anisotropy = opts.anisotropy ?? 1
  t.needsUpdate = true
  cache.set(key, t)
  return t
}

export function epoxyColorTexture(repeat: [number, number]): THREE.DataTexture {
  return build(`epoxy-color-${repeat.join('x')}`, 256, 256, (u, v) => [...epoxyColorAt(u, v), 255], { srgb: true, repeat, anisotropy: 4 })
}
export function epoxyRoughnessTexture(repeat: [number, number]): THREE.DataTexture {
  return build(`epoxy-rough-${repeat.join('x')}`, 256, 256, (u, v) => { const r = epoxyRoughAt(u, v); return [r, r, r, 255] }, { srgb: false, repeat, anisotropy: 4 })
}
export function wallShadeTexture(kind: 'low' | 'up'): THREE.DataTexture {
  return build(`wall-shade-${kind}`, 4, 64, (_u, v) => { const g = wallShadeAt(kind, v); return [g, g, g, 255] }, { srgb: true })
}
/** 바깥 바닥 판(x: 서→동 = u, z: 북→남 = v 1→0)에 맞춘 밝기 그림 */
export function hallFalloffTexture(hall: Bounds, zones: Bounds[]): THREE.DataTexture {
  const key = `hall-${[hall, ...zones].map((r) => [r.xMin, r.xMax, r.zMin, r.zMax].join(',')).join('|')}`
  return build(key, 128, 128, (u, v) => { const g = hallFalloffAt(hall.xMin + u * (hall.xMax - hall.xMin), hall.zMax - v * (hall.zMax - hall.zMin), zones); return [g, g, g, 255] }, { srgb: true })
}
/** 둥근 빛 그림. alpha: 흰색에 투명도로(더하기 섞기 빛 판용), rgb: 밝기로(반사광 속 조명판용).
 *  rgb는 색 그림(sRGB)으로 읽혀서 빛 값으로는 alpha보다 빨리 어두워진다(가운데가 또렷한 반사 — 시안에서 이 모양으로 맞췄다) */
export function glowTexture(mode: 'alpha' | 'rgb'): THREE.DataTexture {
  return build(`glow-${mode}`, 64, 64, (u, v) => { const g = glowAt(u, v) * 255; return mode === 'alpha' ? [255, 255, 255, g] : [g, g, g, 255] }, { srgb: mode === 'rgb' })
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/lookTextures.test.ts && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 18개 PASS, 형 검사 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/scene/look/lookTextures.ts tests/lookTextures.test.ts
git commit -m "feat(빛과 재질): 그림을 점마다 계산해 만들기 — 얼룩 없는 에폭시 색·광택, 벽 세로 그늘, 바깥 바닥 밝기, 둥근 빛(캔버스 번짐·흐림 없이)" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 4: 광택 바닥 재질 — 상자 투영 반사

**Files:**
- Create: `src/scene/look/floorMaterial.ts`
- Test: `tests/floorMaterial.test.ts`

- [ ] **Step 1: 시험 쓰기** — `tests/floorMaterial.test.ts`

```ts
// 광택 에폭시 바닥(설계 2026-11-11 §4.5): three.js 반사 조각의 두 줄을 바꿔 끼운다 — 끼울 줄이 있는지, 끼운 결과가 맞는지
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { FLOOR_ANCHORS, makeFloorMaterial, patchedEnvChunk } from '../src/scene/look/floorMaterial'
import { LOOK_DEFAULTS } from '../src/scene/look/lookConfig'

const count = (s: string, part: string) => s.split(part).length - 1

describe('바닥 반사 조각 고치기', () => {
  const stock = THREE.ShaderChunk.envmap_physical_pars_fragment
  test('설치된 three.js에 끼울 두 줄이 한 번씩 있다(없으면 three.js가 바뀐 것 — floorMaterial.ts를 고친다)', () => {
    expect(count(stock, FLOOR_ANCHORS.reflect)).toBe(1)
    expect(count(stock, FLOOR_ANCHORS.radiance)).toBe(1)
  })
  test('반사 방향을 건물 상자에 맞추는 줄과 반사 배수를 넣는다', () => {
    const out = patchedEnvChunk(stock)!
    expect(out).toContain('lookBoxMax - vLookWorldPos')
    expect(out).toContain('- lookProbe')
    expect(out).toContain('return envMapColor.rgb * envMapIntensity * lookReflect;')
    expect(out.indexOf(FLOOR_ANCHORS.reflect)).toBeLessThan(out.indexOf('lookBoxMax - vLookWorldPos'))
    expect(out).toContain('return PI * envMapColor.rgb * envMapIntensity;')
  })
  test('끼울 줄이 없으면 고치지 않는다(null)', () => {
    expect(patchedEnvChunk('void main() {}')).toBeNull()
    expect(patchedEnvChunk(stock.replace(FLOOR_ANCHORS.radiance, ''))).toBeNull()
  })
})

describe('바닥 재질', () => {
  const box = { min: new THREE.Vector3(-10, 0, 0), max: new THREE.Vector3(18, 4.2, 30) }
  const mat = makeFloorMaterial(box, new THREE.Vector3(9, 1.4, 7), [4, 3])
  test('색 그림과 광택 그림을 쓰고, 실제 거칠기가 값 표의 바닥 거칠기가 되게 맞춘다', () => {
    expect(mat.map).toBeTruthy(); expect(mat.roughnessMap).toBeTruthy()
    expect(mat.roughness * (118 / 255)).toBeCloseTo(LOOK_DEFAULTS.floorRoughness, 6)
    expect(mat.metalness).toBe(0)
    expect(mat.customProgramCacheKey()).toBe('look-floor')
  })
  test('three.js 표준 재질 셰이더에 끼우면 상자·반사 배수 값이 들어간다', () => {
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader }
    mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer)
    expect(shader.vertexShader).toContain('varying vec3 vLookWorldPos;')
    expect(shader.vertexShader).toContain('vLookWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
    expect(shader.fragmentShader).not.toContain('#include <envmap_physical_pars_fragment>')
    expect(shader.fragmentShader).toContain('uniform float lookReflect;')
    expect(shader.fragmentShader).toContain('lookBoxMax - vLookWorldPos')
    expect((shader.uniforms.lookBoxMin!.value as THREE.Vector3).x).toBe(-10)
    expect((shader.uniforms.lookBoxMax!.value as THREE.Vector3).y).toBe(4.2)
    expect((shader.uniforms.lookProbe!.value as THREE.Vector3).y).toBe(1.4)
    expect(shader.uniforms.lookReflect!.value).toBe(LOOK_DEFAULTS.floorReflect)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/floorMaterial.test.ts`
Expected: FAIL — `../src/scene/look/floorMaterial`을 찾을 수 없음

- [ ] **Step 3: 구현** — `src/scene/look/floorMaterial.ts`

```ts
// 광택 에폭시 바닥(설계 2026-11-11 §4.5): 색은 고르게, 광택만 조금씩 다르게. 반사는 건물 상자에 맞춰(상자 투영) 천장 조명이 제자리에 비친다.
// three.js 셰이더 조각의 두 줄을 바꿔 끼운다. 끼울 줄이 없으면(three.js가 바뀜) 고치지 않은 반사로 돌고 경고한다.
import * as THREE from 'three'
import { LOOK } from './lookConfig'
import { epoxyColorTexture, epoxyRoughnessTexture } from './lookTextures'

export const FLOOR_ANCHORS = {
  reflect: 'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
  radiance: 'return envMapColor.rgb * envMapIntensity;',
} as const

const BOX_PROJECT = /* glsl */`
			{ vec3 rd = reflectVec + vec3( 1e-5 ); vec3 t1 = ( lookBoxMax - vLookWorldPos ) / rd; vec3 t2 = ( lookBoxMin - vLookWorldPos ) / rd; vec3 tm = max( t1, t2 ); float tt = min( min( tm.x, tm.y ), tm.z ); reflectVec = normalize( vLookWorldPos + rd * tt - lookProbe ); }`

/** 고친 조각을 돌려준다. 끼울 줄이 하나라도 없으면 null */
export function patchedEnvChunk(chunk: string): string | null {
  if (!chunk.includes(FLOOR_ANCHORS.reflect) || !chunk.includes(FLOOR_ANCHORS.radiance)) return null
  return chunk.replace(FLOOR_ANCHORS.reflect, FLOOR_ANCHORS.reflect + BOX_PROJECT).replace(FLOOR_ANCHORS.radiance, 'return envMapColor.rgb * envMapIntensity * lookReflect;')
}

/** box: 반사를 맞출 건물 상자(바닥 0 ~ 천장), probe: 반사광을 그린 자리, repeat: 바닥 그림 반복 수 */
export function makeFloorMaterial(box: { min: THREE.Vector3; max: THREE.Vector3 }, probe: THREE.Vector3, repeat: [number, number]): THREE.MeshStandardMaterial {
  // 광택 그림의 가운데 값이 118/255라서, 재질 거칠기를 그만큼 키워 실제 거칠기가 LOOK.floorRoughness가 되게 한다
  const mat = new THREE.MeshStandardMaterial({ map: epoxyColorTexture(repeat), roughnessMap: epoxyRoughnessTexture([repeat[0] * 0.77, repeat[1] * 0.77]), roughness: Math.min(1, LOOK.floorRoughness / (118 / 255)), metalness: 0 })
  const chunk = patchedEnvChunk(THREE.ShaderChunk.envmap_physical_pars_fragment)
  if (!chunk) { console.warn('[look] 바닥 반사를 고칠 자리를 찾지 못해 기본 반사로 돌립니다'); return mat }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lookBoxMin = { value: box.min.clone() }
    shader.uniforms.lookBoxMax = { value: box.max.clone() }
    shader.uniforms.lookProbe = { value: probe.clone() }
    shader.uniforms.lookReflect = { value: LOOK.floorReflect }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorldPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLookWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorldPos;\nuniform vec3 lookBoxMin;\nuniform vec3 lookBoxMax;\nuniform vec3 lookProbe;\nuniform float lookReflect;')
      .replace('#include <envmap_physical_pars_fragment>', chunk)
  }
  mat.customProgramCacheKey = () => 'look-floor'
  return mat
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/floorMaterial.test.ts && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 5개 PASS, 형 검사 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/scene/look/floorMaterial.ts tests/floorMaterial.test.ts
git commit -m "feat(빛과 재질): 광택 에폭시 바닥 재질 — 반사를 건물 상자에 맞추고 반사 배수를 따로 둠(끼울 줄이 없으면 기본 반사)" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 5: 계단 줄이기 주소 인자 `?aa=1`

**Files:**
- Modify: `src/app/quality.ts`
- Test: `tests/quality.test.ts`

- [ ] **Step 1: 시험 고치기** — `tests/quality.test.ts`

(1) import 줄에 `antialiasRequested`를 더한다. 바꿀 곳:

```ts
import { AUTO_LOW_FPS, initialQuality, shouldAutoLower } from '../src/app/quality'
```

바꾼 글:

```ts
import { AUTO_LOW_FPS, antialiasRequested, initialQuality, shouldAutoLower } from '../src/app/quality'
```

(2) 마지막 시험 아래(파일 끝의 `})` 앞)에 시험을 더한다. 바꿀 곳:

```ts
    expect(shouldAutoLower({ ...base, low: true })).toBe(false)
  })
})
```

바꾼 글:

```ts
    expect(shouldAutoLower({ ...base, low: true })).toBe(false)
  })
  it('주소 ?aa=1만 품질 낮음의 계단 줄이기를 켠다(기본은 끔)', () => {
    expect(antialiasRequested('?aa=1')).toBe(true)
    expect(antialiasRequested('?q=low&aa=1')).toBe(true)
    expect(antialiasRequested('')).toBe(false)
    expect(antialiasRequested('?aa=0')).toBe(false)
    expect(antialiasRequested('?aa=true')).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/quality.test.ts`
Expected: FAIL — `antialiasRequested`가 없음

- [ ] **Step 3: 구현** — `src/app/quality.ts`

파일 맨 끝에, 빈 줄 하나를 두고 더한다.

```ts
/** 주소의 ?aa=1: 품질 낮음에서도 계단 줄이기(안티에일리어싱)를 켠다. 학교 태블릿에서 켠 것과 끈 것을 비교하려는 것이고 기본은 끔(설계 2026-11-11 §4.11) */
export function antialiasRequested(search: string): boolean {
  return new URLSearchParams(search).get('aa') === '1'
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/quality.test.ts && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 4개 PASS, 형 검사 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/app/quality.ts tests/quality.test.ts
git commit -m "feat(품질): 주소 ?aa=1 — 품질 낮음에서도 계단 줄이기를 켜 볼 수 있게(기본은 끔, 실기기 비교용)" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 6: 장면 부품 — 색 보정 걸기·주된 빛·실습장 반사광·구운 바닥 그림자

아직 장면에 끼우지 않는다(다음 Task). 이 네 파일은 WebGL이 있어야 돌아서 단위 시험이 없다. 여기서는 형 검사만 하고, 끼움은 Task 7의 시험이, 결과는 Task 11이 본다.

**Files:**
- Create: `src/scene/look/ToneSetup.tsx`
- Create: `src/scene/look/KeyLight.tsx`
- Create: `src/scene/look/WorkshopEnv.tsx`
- Create: `src/scene/look/FloorShadowBake.tsx`

- [ ] **Step 1: 색 보정 걸기** — `src/scene/look/ToneSetup.tsx`

```tsx
// 렌더러에 색 보정 곡선을 건다(설계 2026-11-11 §4.2). 품질 높음에서는 화면 효과가 렌더러 쪽 보정을 끄고 같은 곡선을 맨 끝에 건다.
import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { installToneCurve } from './toneCurve'

export function ToneSetup() {
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => { gl.toneMapping = installToneCurve(); gl.toneMappingExposure = 1 }, [gl])
  return null
}
```

- [ ] **Step 2: 주된 빛** — `src/scene/look/KeyLight.tsx`

```tsx
// 주된 빛 하나(설계 2026-11-11 §4.3): 남서쪽 위에서 드는 옅은 따뜻한 빛. 그림자 범위를 실습장 전체에 맞춘다.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BAKE, LOOK, PALETTE, SHADOW_MAP_SIZE, fitShadowFrustum, keyDirection, type Bounds } from './lookConfig'

export function KeyLight({ bounds, castShadow }: { bounds: Bounds; castShadow: boolean }) {
  const ref = useRef<THREE.DirectionalLight>(null)
  const fit = useMemo(() => fitShadowFrustum(bounds, BAKE.casterHeight, keyDirection()), [bounds])
  useLayoutEffect(() => {
    const l = ref.current
    if (!l) return
    l.position.set(...fit.position)
    l.target.position.set(...fit.target)
    l.target.updateMatrixWorld()
    const cam = l.shadow.camera
    cam.left = fit.left; cam.right = fit.right; cam.bottom = fit.bottom; cam.top = fit.top; cam.near = fit.near; cam.far = fit.far
    cam.updateProjectionMatrix()
    l.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
    l.shadow.radius = LOOK.shadowRadius
    l.shadow.bias = LOOK.shadowBias
    l.shadow.normalBias = LOOK.shadowNormalBias
    l.shadow.needsUpdate = true
  }, [fit])
  return <directionalLight ref={ref} color={PALETTE.key} intensity={LOOK.key} castShadow={castShadow} />
}
```

- [ ] **Step 3: 실습장 반사광** — `src/scene/look/WorkshopEnv.tsx`

```tsx
// 실습장 반사광(설계 2026-11-11 §4.3): 정비소 사진 대신, 실습장 가운데에서 건물 껍데기(천장·조명판·벽·바닥)만 한 번 그려 쓴다.
// 두 품질이 같은 반사광을 쓰고 내려받는 파일이 없다. 장비와 사람은 넣지 않는다.
import { Environment, Lightformer } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { SceneLayout } from '../layoutModel'
import { CEILING_H, hallBounds, lightPanels } from '../Surroundings'
import { LOOK } from './lookConfig'
import { glowTexture } from './lookTextures'

/** 반사광을 그리는 자리: 주 구역 가운데, 높이 1.4 m */
export function probePoint(layout: Pick<SceneLayout, 'mainZone'>): THREE.Vector3 {
  const mz = layout.mainZone
  return new THREE.Vector3((mz.xMin + mz.xMax) / 2, 1.4, (mz.zMin + mz.zMax) / 2)
}

/** 반사광 속 면의 밝기(선형 RGB). 실습장 바닥은 채도를 낮춘다 — 그대로 두면 크롬 부품이 초록으로 물든다 */
export const ENV_SHELL = {
  ceiling: [0.55, 0.54, 0.51], wall: [0.74, 0.72, 0.68], wallFar: [0.36, 0.35, 0.33], hallFloor: [0.22, 0.21, 0.2], labFloor: [0.05, 0.12, 0.085],
} as const

export function WorkshopEnv({ layout, resolution }: { layout: SceneLayout; resolution: number }) {
  const b = useMemo(() => hallBounds(layout), [layout])
  const p = useMemo(() => probePoint(layout), [layout])
  const panels = useMemo(() => lightPanels(b), [b])
  const glow = useMemo(() => glowTexture('rgb'), [])
  const mats = useMemo(() => {
    const m = (c: readonly [number, number, number]) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2]), side: THREE.DoubleSide, toneMapped: false })
    return { ceiling: m(ENV_SHELL.ceiling), wall: m(ENV_SHELL.wall), wallFar: m(ENV_SHELL.wallFar), hallFloor: m(ENV_SHELL.hallFloor), labFloor: m(ENV_SHELL.labFloor) }
  }, [])
  const mz = layout.mainZone
  const w = b.xMax - b.xMin, d = b.zMax - b.zMin, cx = (b.xMin + b.xMax) / 2, cz = (b.zMin + b.zMax) / 2
  return (
    <Environment resolution={resolution} frames={1} near={0.1} far={200} environmentIntensity={LOOK.env}>
      {/* 실제 좌표로 놓고 통째로 옮겨, 그리는 자리(p)가 원점에 오게 한다 */}
      <group position={[-p.x, -p.y, -p.z]}>
        <mesh material={mats.ceiling} rotation-x={Math.PI / 2} position={[cx, CEILING_H, cz]}><planeGeometry args={[w, d]} /></mesh>
        <mesh material={mats.hallFloor} rotation-x={-Math.PI / 2} position={[cx, -0.01, cz]}><planeGeometry args={[w, d]} /></mesh>
        <mesh material={mats.labFloor} rotation-x={-Math.PI / 2} position={[(mz.xMin + mz.xMax) / 2, 0, (mz.zMin + mz.zMax) / 2]}><planeGeometry args={[mz.xMax - mz.xMin, mz.zMax - mz.zMin]} /></mesh>
        {/* 벽: 북·동(실습장 쪽, 밝게), 서·남(건물 먼 쪽, 어둡게) */}
        <mesh material={mats.wall} position={[cx, CEILING_H / 2, b.zMin]}><planeGeometry args={[w, CEILING_H]} /></mesh>
        <mesh material={mats.wall} rotation-y={Math.PI / 2} position={[b.xMax, CEILING_H / 2, cz]}><planeGeometry args={[d, CEILING_H]} /></mesh>
        <mesh material={mats.wallFar} rotation-y={Math.PI / 2} position={[b.xMin, CEILING_H / 2, cz]}><planeGeometry args={[d, CEILING_H]} /></mesh>
        <mesh material={mats.wallFar} position={[cx, CEILING_H / 2, b.zMax]}><planeGeometry args={[w, CEILING_H]} /></mesh>
        {panels.map(([x, z]) => <Lightformer key={`${x},${z}`} form="rect" map={glow} intensity={LOOK.envPanel} color="#fffaf0" position={[x, CEILING_H - 0.02, z]} rotation-x={Math.PI / 2} scale={[2.3, 0.95, 1]} />)}
      </group>
    </Environment>
  )
}
```

- [ ] **Step 4: 구운 바닥 그림자** — `src/scene/look/FloorShadowBake.tsx`

셰이더 글(`VERT`·`DEPTH`·`SUN`·`CONTACT`·`BLUR`·`COMBINE`)은 글자 그대로 옮긴다.

```tsx
// 구운 바닥 그림자(설계 2026-11-11 §4.4): 주된 빛 그림자와 닿는 그늘을 한 번만 계산해 바닥 위 판 한 장에 깐다.
// 매 화면 비용은 섞어 그리는 판 한 장뿐이다(예전 닿는 그늘 판과 같음). 품질 낮음은 둘 다, 품질 높음은 닿는 그늘만 굽는다(sun = 0).
// 차례: ① 그림자를 드리우는 물체의 깊이를 빛 쪽에서(주된 빛) ② 바닥 아래에서 위로(닿는 그늘) ③ 바닥의 점마다 가려진 정도 계산 ④ 흐림 ⑤ 합치기
import { useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BAKE, LOOK, PALETTE, fitShadowFrustum, keyDirection, type Bounds } from './lookConfig'

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`
/** three.js 그림자와 같은 방식으로 색에 싸서 적은 깊이를 푼다(packing.glsl.js의 UnpackFactors4) */
const DEPTH = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec4 uRect;
const vec4 UNPACK = vec4( 255.0 / 256.0, 255.0 / 65536.0, 255.0 / 16777216.0, 1.0 / 16777216.0 );
float depthAt( sampler2D t, vec2 uv ) { return dot( texture2D( t, uv ), UNPACK ); }
vec3 floorPoint() { return vec3( uRect.x + vUv.x * uRect.z, 0.0, uRect.y + ( 1.0 - vUv.y ) * uRect.w ); }`
/** 주된 빛 그림자: 가리는 물체를 찾고(32점), 물체가 멀수록 넓게 풀어(64점) 가려진 비율을 적는다 */
const SUN = DEPTH + /* glsl */`
uniform sampler2D tDepth; uniform mat4 uLightVP; uniform float uRange; uniform vec2 uSpan; uniform float uTan; uniform float uMinPen; uniform float uMaxPen; uniform float uBias;
float ign( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
vec2 vogel( float i, float n, float phi ) { float r = sqrt( ( i + 0.5 ) / n ); float a = i * 2.39996323 + phi; return r * vec2( cos( a ), sin( a ) ); }
void main() {
  vec4 lp = uLightVP * vec4( floorPoint(), 1.0 );
  vec3 c = lp.xyz / lp.w * 0.5 + 0.5;
  float phi = ign( gl_FragCoord.xy ) * 6.2831853;
  vec2 searchUV = uMaxPen / uSpan;
  float sum = 0.0; float cnt = 0.0;
  for ( int i = 0; i < 32; i ++ ) {
    float dz = depthAt( tDepth, c.xy + vogel( float( i ), 32.0, phi ) * searchUV );
    if ( dz < c.z - uBias ) { sum += dz; cnt += 1.0; }
  }
  if ( cnt < 0.5 ) { gl_FragColor = vec4( 0.0 ); return; }
  float pen = clamp( ( c.z - sum / cnt ) * uRange * uTan, uMinPen, uMaxPen );
  vec2 penUV = pen / uSpan;
  float sh = 0.0;
  for ( int i = 0; i < 64; i ++ ) sh += step( depthAt( tDepth, c.xy + vogel( float( i ), 64.0, phi + 1.7 ) * penUV ), c.z - uBias );
  gl_FragColor = vec4( sh / 64.0 );
}`
/** 닿는 그늘: 바닥 바로 위에 물체가 있을수록(낮을수록) 짙게 */
const CONTACT = DEPTH + /* glsl */`
uniform sampler2D tDepth; uniform mat4 uUpVP; uniform float uNear; uniform float uRange; uniform float uBelow; uniform float uFar;
void main() {
  vec4 cp = uUpVP * vec4( floorPoint(), 1.0 );
  float d = depthAt( tDepth, cp.xy / cp.w * 0.5 + 0.5 );
  float h = uNear + d * uRange - uBelow;
  gl_FragColor = vec4( d >= 0.999 ? 0.0 : pow( clamp( 1.0 - h / uFar, 0.0, 1.0 ), 1.5 ) );
}`
const BLUR = /* glsl */`
precision highp float; uniform sampler2D tMap; uniform vec2 uStep; varying vec2 vUv;
void main() {
  float a = texture2D( tMap, vUv ).r * 0.1633;
  a += ( texture2D( tMap, vUv + uStep ).r + texture2D( tMap, vUv - uStep ).r ) * 0.1531;
  a += ( texture2D( tMap, vUv + uStep * 2.0 ).r + texture2D( tMap, vUv - uStep * 2.0 ).r ) * 0.12245;
  a += ( texture2D( tMap, vUv + uStep * 3.0 ).r + texture2D( tMap, vUv - uStep * 3.0 ).r ) * 0.0918;
  a += ( texture2D( tMap, vUv + uStep * 4.0 ).r + texture2D( tMap, vUv - uStep * 4.0 ).r ) * 0.051;
  gl_FragColor = vec4( a );
}`
const COMBINE = /* glsl */`
precision highp float; uniform sampler2D tSun; uniform sampler2D tContact; uniform float uSun; uniform float uContact; varying vec2 vUv;
void main() {
  float s = uSun > 0.0 ? texture2D( tSun, vUv ).r * uSun : 0.0;
  float k = texture2D( tContact, vUv ).r * uContact;
  gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 - ( 1.0 - s ) * ( 1.0 - k ) );
}`

function target(size: number, depth: boolean, filter: THREE.MagnificationTextureFilter) {
  return new THREE.WebGLRenderTarget(size, size, { depthBuffer: depth, minFilter: filter, magFilter: filter, generateMipmaps: false })
}

export function FloorShadowBake({ bounds, sun, contact, stateKey }: { bounds: Bounds; sun: number; contact: number; stateKey: string }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const { active } = useProgress()
  // 굽는 때: 모델을 다 불러온 뒤(불러오는 동안은 굽지 않는다), 그리고 상태(리프트·시험 차량·품질)가 바뀌고 조금 뒤
  const [loads, setLoads] = useState(0)
  useEffect(() => { if (!active) setLoads((n) => n + 1) }, [active])
  const want = `${loads}|${stateKey}|${sun}|${contact}`
  const [key, setKey] = useState('')
  useEffect(() => {
    if (active || loads === 0) return
    const t = setTimeout(() => setKey(want), key === '' ? BAKE.firstDelayMs : BAKE.rebakeDelayMs)
    return () => clearTimeout(t)
  }, [want, active]) // eslint-disable-line react-hooks/exhaustive-deps
  const pending = useRef(false)
  useEffect(() => { if (key) pending.current = true }, [key])
  const [failed, setFailed] = useState(false)

  const out = useMemo(() => target(BAKE.size, false, THREE.LinearFilter), [])
  const quad = useMemo(() => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); mesh.frustumCulled = false
    const s = new THREE.Scene(); s.add(mesh)
    const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false })
    return {
      mesh, scene: s, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      depthMat: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }),
      sun: pass(SUN, { uRect: { value: new THREE.Vector4() }, tDepth: { value: null }, uLightVP: { value: new THREE.Matrix4() }, uRange: { value: 1 }, uSpan: { value: new THREE.Vector2(1, 1) }, uTan: { value: 0.08 }, uMinPen: { value: BAKE.minPenumbra }, uMaxPen: { value: BAKE.maxPenumbra }, uBias: { value: 0.0005 } }),
      contact: pass(CONTACT, { uRect: { value: new THREE.Vector4() }, tDepth: { value: null }, uUpVP: { value: new THREE.Matrix4() }, uNear: { value: 0.01 }, uRange: { value: 1 }, uBelow: { value: 0.05 }, uFar: { value: BAKE.contactFar } }),
      blur: pass(BLUR, { tMap: { value: null }, uStep: { value: new THREE.Vector2() } }),
      combine: pass(COMBINE, { tSun: { value: null }, tContact: { value: null }, uSun: { value: 0 }, uContact: { value: 0 } }),
    }
  }, [])
  useEffect(() => () => { out.dispose(); quad.depthMat.dispose(); quad.sun.dispose(); quad.contact.dispose(); quad.blur.dispose(); quad.combine.dispose(); quad.mesh.geometry.dispose() }, [out, quad])

  useFrame(() => {
    if (!pending.current) return
    pending.current = false
    const t0 = performance.now()
    // 한 번 쓰고 버리는 그림들(굽기가 드물어 메모리를 쥐고 있지 않는다)
    const sunDepth = sun > 0 ? target(BAKE.depthSize, true, THREE.NearestFilter) : null
    const upDepth = target(BAKE.size, true, THREE.NearestFilter)
    const a = target(BAKE.size, false, THREE.LinearFilter), b = target(BAKE.size, false, THREE.LinearFilter)
    const ca = target(BAKE.contactSize, false, THREE.LinearFilter), cb = target(BAKE.contactSize, false, THREE.LinearFilter)
    const prev = { rt: gl.getRenderTarget(), over: scene.overrideMaterial, bg: scene.background, auto: gl.shadowMap.autoUpdate, color: gl.getClearColor(new THREE.Color()), alpha: gl.getClearAlpha() }
    const hidden: THREE.Object3D[] = []
    const draw = (mat: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget) => { quad.mesh.material = mat; gl.setRenderTarget(to); gl.clear(); gl.render(quad.scene, quad.cam) }
    const blur = (from: THREE.WebGLRenderTarget, tmp: THREE.WebGLRenderTarget, stepU: number, stepV: number) => {
      quad.blur.uniforms.tMap!.value = from.texture; quad.blur.uniforms.uStep!.value.set(stepU, 0); draw(quad.blur, tmp)
      quad.blur.uniforms.tMap!.value = tmp.texture; quad.blur.uniforms.uStep!.value.set(0, stepV); draw(quad.blur, from)
    }
    try {
      // 그림자를 드리우지 않는 메시(바닥·벽·표시)는 잠깐 숨긴다. 사람은 다른 레이어라 아래 카메라에 보이지 않는다
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.castShadow && m.visible) { m.visible = false; hidden.push(m) } })
      scene.overrideMaterial = quad.depthMat; scene.background = null; gl.shadowMap.autoUpdate = false
      gl.setClearColor(0xffffff, 1)
      const rect = new THREE.Vector4(bounds.xMin, bounds.zMin, bounds.xMax - bounds.xMin, bounds.zMax - bounds.zMin)
      const cx = (bounds.xMin + bounds.xMax) / 2, cz = (bounds.zMin + bounds.zMax) / 2

      // ① 주된 빛 쪽에서 본 깊이
      const cam = new THREE.OrthographicCamera()
      if (sunDepth) {
        const f = fitShadowFrustum(bounds, BAKE.casterHeight, keyDirection())
        cam.position.set(...f.position); cam.up.set(0, 1, 0); cam.lookAt(...f.target)
        cam.left = f.left; cam.right = f.right; cam.bottom = f.bottom; cam.top = f.top; cam.near = f.near; cam.far = f.far
        cam.updateProjectionMatrix(); cam.updateMatrixWorld(true)
        gl.setRenderTarget(sunDepth); gl.clear(); gl.render(scene, cam)
      }
      // ② 바닥 아래에서 위로 본 깊이
      const up = new THREE.OrthographicCamera(-(bounds.xMax - bounds.xMin) / 2, (bounds.xMax - bounds.xMin) / 2, (bounds.zMax - bounds.zMin) / 2, -(bounds.zMax - bounds.zMin) / 2, 0.01, 0.05 + BAKE.contactFar)
      up.position.set(cx, -0.05, cz); up.up.set(0, 0, 1); up.lookAt(cx, 1, cz); up.updateMatrixWorld(true)
      gl.setRenderTarget(upDepth); gl.clear(); gl.render(scene, up)

      scene.overrideMaterial = prev.over; scene.background = prev.bg
      for (const o of hidden) o.visible = true
      hidden.length = 0
      gl.setClearColor(0x000000, 0)

      // ③ 바닥의 점마다 계산 → ④ 흐림
      if (sunDepth) {
        const u = quad.sun.uniforms
        u.uRect!.value.copy(rect); u.tDepth!.value = sunDepth.texture
        u.uLightVP!.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
        u.uRange!.value = cam.far - cam.near; u.uSpan!.value.set(cam.right - cam.left, cam.top - cam.bottom)
        u.uTan!.value = Math.tan((LOOK.shadowSoftDeg * Math.PI) / 180); u.uBias!.value = 0.03 / (cam.far - cam.near)
        draw(quad.sun, a)
        blur(a, b, 1 / BAKE.size, 1 / BAKE.size)
      }
      const c = quad.contact.uniforms
      c.uRect!.value.copy(rect); c.tDepth!.value = upDepth.texture
      c.uUpVP!.value.multiplyMatrices(up.projectionMatrix, up.matrixWorldInverse)
      c.uNear!.value = up.near; c.uRange!.value = up.far - up.near
      draw(quad.contact, ca)
      blur(ca, cb, 2 / 256, 2 / 256)
      blur(ca, cb, 0.8 / 256, 0.8 / 256)
      // ⑤ 합쳐서 한 장으로
      const m = quad.combine.uniforms
      m.tSun!.value = a.texture; m.tContact!.value = ca.texture; m.uSun!.value = sunDepth ? sun : 0; m.uContact!.value = contact
      draw(quad.combine, out)
      if (failed) setFailed(false)
      if (import.meta.env.DEV) {
        // 개발 서버 전용: 화면 촬영 도구가 굽기가 됐는지 확인한다
        const px = new Uint8Array(BAKE.size * BAKE.size * 4)
        gl.readRenderTargetPixels(out, 0, 0, BAKE.size, BAKE.size, px)
        let sum = 0, max = 0
        for (let i = 3; i < px.length; i += 4) { sum += px[i]!; if (px[i]! > max) max = px[i]! }
        const w = window as unknown as { __lookdev?: { bakes: Array<{ key: string; mean: number; max: number; ms: number }> } }
        ;(w.__lookdev ??= { bakes: [] }).bakes.push({ key, mean: +(sum / (BAKE.size * BAKE.size) / 255).toFixed(4), max: +(max / 255).toFixed(3), ms: Math.round(performance.now() - t0) })
      }
    } catch (e) {
      console.warn('[look] 바닥 그림자 굽기에 실패해 그림자 판을 숨깁니다', e)
      setFailed(true)
    } finally {
      for (const o of hidden) o.visible = true
      scene.overrideMaterial = prev.over; scene.background = prev.bg; gl.shadowMap.autoUpdate = prev.auto
      gl.setClearColor(prev.color, prev.alpha); gl.setRenderTarget(prev.rt)
      sunDepth?.dispose(); upDepth.dispose(); a.dispose(); b.dispose(); ca.dispose(); cb.dispose()
    }
  })

  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: out.texture, color: PALETTE.shadow, transparent: true, depthWrite: false }), [out])
  useEffect(() => () => mat.dispose(), [mat])
  if (failed || key === '') return null
  return (
    <mesh rotation-x={-Math.PI / 2} position={[(bounds.xMin + bounds.xMax) / 2, 0.006, (bounds.zMin + bounds.zMax) / 2]} material={mat} renderOrder={1}>
      <planeGeometry args={[bounds.xMax - bounds.xMin, bounds.zMax - bounds.zMin]} />
    </mesh>
  )
}
```

- [ ] **Step 5: 형 검사와 전체 시험**

Run: `node_modules/.bin/tsc -p tsconfig.json --noEmit && npm test`
Expected: 형 검사 오류 없음, 전체 PASS(새 파일은 아직 어디서도 쓰지 않는다)

- [ ] **Step 6: 커밋**

```bash
git add src/scene/look/ToneSetup.tsx src/scene/look/KeyLight.tsx src/scene/look/WorkshopEnv.tsx src/scene/look/FloorShadowBake.tsx
git commit -m "feat(빛과 재질): 장면 부품 — 색 보정 걸기, 그림자 범위를 맞춘 주된 빛, 실습장 자체로 만든 반사광, 한 번 구워 까는 바닥 그림자(주된 빛 + 닿는 그늘 한 장)" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 7: 장면에 끼우기 — 조명·반사광·바닥·그림자·벽·조명판·화면 효과

**Files:**
- Modify: `src/scene/LabScene.tsx`
- Modify: `src/scene/Surroundings.tsx`
- Modify: `src/scene/models/models.tsx`
- Modify: `src/scene/Effects.tsx`(통째로 바꿈)
- Modify: `src/screens/LabScreen.tsx`
- Modify: `src/screens/AvatarScreen.tsx`
- Test: `tests/lookWiring.test.ts`

- [ ] **Step 1: 끼움 시험 쓰기** — `tests/lookWiring.test.ts`

```ts
// 빛과 재질 배선(설계 2026-11-11): 장면이 새 부품을 쓰는지, 태블릿 묶음·계측부·운영 묶음을 지키는지 소스 글로 확인한다
import fs from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (p: string) => fs.readFileSync(p, 'utf8')
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []))

describe('실습장 장면', () => {
  const scene = read('src/scene/LabScene.tsx')
  test('색 보정 곡선 · 주된 빛 · 실습장 반사광 · 구운 바닥 그림자를 쓴다', () => {
    expect(scene).toMatch(/<ToneSetup \/>/)
    expect(scene).toMatch(/<KeyLight bounds=\{shadowBounds\} castShadow=\{tier\.realtimeShadows\} \/>/)
    expect(scene).toMatch(/<WorkshopEnv layout=\{layout\} resolution=\{tier\.envResolution\} \/>/)
    expect(scene).toMatch(/<FloorShadowBake bounds=\{shadowBounds\} sun=\{tier\.sunShadow\} contact=\{tier\.contactShadow\} stateKey=/)
    expect(scene).toMatch(/<Surroundings layout=\{layout\} halo=\{tier\.halo\} \/>/)
    expect(scene).toMatch(/const tier = useMemo\(\(\) => lookFor\(lowSpec\), \[lowSpec\]\)/)
  })
  test('실시간 그림자는 품질 높음에서만, 번짐을 조절할 수 있는 종류로', () => {
    expect(scene).toMatch(/<Canvas shadows=\{tier\.realtimeShadows \? 'percentage' : false\}/)
  })
  test('정비소 사진·예전 닿는 그늘·예전 바닥 무늬를 쓰지 않는다', () => {
    expect(scene).not.toMatch(/Environment files=/)
    expect(scene).not.toMatch(/LAB_HDRI|ContactShadows|BakedFloorShadows|epoxyFloorTexture|Lightformer/)
    expect(scene).toMatch(/makeFloorMaterial\(/)
  })
  test('바닥 표시선은 조명을 받는 칠 색이다(형광 초록 아님)', () => {
    expect(scene).not.toMatch(/#1fbf6b/)
    expect(scene.match(/<meshStandardMaterial color=\{PALETTE\.line\} roughness=\{0\.5\} \/>/g)).toHaveLength(2)
  })
  test('품질 낮음의 계단 줄이기는 주소 인자로만 켠다', () => {
    expect(scene).toMatch(/antialias: !lowSpec \|\| antialias,/)
    const lab = read('src/screens/LabScreen.tsx')
    expect(lab).toMatch(/const \[antialias\] = useState\(\(\) => typeof window !== 'undefined' && antialiasRequested\(window\.location\.search\)\)/)
    expect(lab.match(/lowSpec=\{lowSpec\} antialias=\{antialias\}/g)).toHaveLength(2)
  })
})

describe('태블릿 묶음 보호', () => {
  test('postprocessing을 들여오는 파일은 Effects.tsx 하나뿐이다', () => {
    const users = walk('src').filter((f) => /from '(@react-three\/)?postprocessing'/.test(read(f)))
    expect(users).toEqual([join('src', 'scene', 'Effects.tsx')])
  })
  test('화면 효과는 품질 높음에서만 따로 불러온다', () => {
    const scene = read('src/scene/LabScene.tsx')
    expect(scene).toMatch(/const Effects = lazy\(\(\) => import\('\.\/Effects'\)\)/)
    expect(scene).toMatch(/\{tier\.postEffects && <Suspense fallback=\{null\}><Effects \/><\/Suspense>\}/)
  })
  test('화면 효과 순서: 구석 그늘 → 빛 번짐 → 색 보정 곡선 → 계단 줄이기 → 가장자리', () => {
    const fx = read('src/scene/Effects.tsx')
    const order = ['<N8AO ', '<Bloom ', '<primitive object={softClip}', '<SMAA />', '<Vignette '].map((t) => fx.indexOf(t))
    expect(order.every((i) => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(fx).toMatch(/luminanceThreshold=\{LOOK\.bloomThreshold\}/)
    expect(fx).not.toMatch(/ToneMappingMode|ACES/)
  })
})

describe('계측부는 조명·색 보정과 무관한 재질 그대로', () => {
  test('계기 화면·조작부 글자', () => {
    const abs = read('src/scene/models/AbsPanelModel.tsx')
    expect(abs).toMatch(/new THREE\.MeshBasicMaterial\(\{ map: tex, toneMapped: false \}\)/)
    expect(abs).toMatch(/new THREE\.MeshBasicMaterial\(\{ map: absTesterLabelTexture\(\), transparent: true, depthWrite: false, toneMapped: false \}\)/)
  })
  test('측정판 눈금·바늘', () => {
    const tt = read('src/scene/models/TurntableDial.tsx')
    expect(tt).toMatch(/<meshBasicMaterial map=\{tex\} transparent depthWrite=\{false\} toneMapped=\{false\} \/>/)
    expect(tt).toMatch(/<meshBasicMaterial color="#d50000" toneMapped=\{false\} \/>/)
  })
})

describe('그 밖의 배선', () => {
  test('개발용 조정 인자 ?look= 는 개발 서버에서만 읽는다(운영 묶음에서 빠진다)', () => {
    const cfg = read('src/scene/look/lookConfig.ts')
    expect(cfg).toMatch(/export const LOOK: LookValues = import\.meta\.env\.DEV && typeof location !== 'undefined' \? withOverrides\(LOOK_DEFAULTS, new URLSearchParams\(location\.search\)\.get\('look'\)\) : LOOK_DEFAULTS/)
    const readers = walk('src').filter((f) => /\.get\('look'\)/.test(read(f)))
    expect(readers).toEqual([join('src', 'scene', 'look', 'lookConfig.ts')])
  })
  test('굽기 통계도 개발 서버에서만 낸다', () => {
    const bake = read('src/scene/look/FloorShadowBake.tsx')
    expect(bake.match(/__lookdev/g)!.length).toBeGreaterThan(0)
    expect(bake.indexOf('if (import.meta.env.DEV) {')).toBeGreaterThan(0)
    expect(bake.indexOf('if (import.meta.env.DEV) {')).toBeLessThan(bake.indexOf('__lookdev'))
  })
  test('캐릭터 만들기 화면도 같은 색 보정 곡선', () => {
    expect(read('src/screens/AvatarScreen.tsx')).toMatch(/<SeeCharacters \/>\n\s+<ToneSetup \/>/)
  })
  test('조명판과 빛 판은 묶어서 그린다(메시 2개)', () => {
    const sur = read('src/scene/Surroundings.tsx')
    expect(sur).toMatch(/new THREE\.InstancedMesh\(geometry, material, spots\.length\)/)
    expect(sur.match(/<CeilingInstances /g)).toHaveLength(2)
    expect(sur).not.toMatch(/panels\.map\(/)
  })
  test('그림은 캔버스 번짐·흐림 없이 만든다', () => {
    const tex = read('src/scene/look/lookTextures.ts')
    expect(tex).not.toMatch(/createRadialGradient|createLinearGradient|\.filter = |getContext/)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/lookWiring.test.ts`
Expected: FAIL — 15개 가운데 9개 실패('실습장 장면' 5개, '화면 효과는 품질 높음에서만 따로 불러온다', '화면 효과 순서', '캐릭터 만들기 화면', '조명판과 빛 판'). 나머지 6개는 이미 통과한다

- [ ] **Step 3: 화면 효과 바꾸기** — `src/scene/Effects.tsx`를 통째로 아래로 바꾼다.

```tsx
// 품질 높음 화면 효과(설계 2026-11-11 §4.7): 구석 그늘(AO) · 빛 번짐(밝기 1.2를 넘는 광원·강한 반사만) · 색 보정 곡선 · 계단 현상 줄이기 · 가장자리 어둡게.
// 첫 화면 내려받기를 줄이려고 따로 나눠 품질 높음일 때만 불러온다(태블릿 품질 낮음은 내려받지 않음). postprocessing을 들여오는 파일은 이것 하나여야 한다.
import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing'
import { Effect } from 'postprocessing'
import { useMemo } from 'react'
import { LOOK, PALETTE } from './look/lookConfig'
import { SOFT_CLIP_GLSL } from './look/toneCurve'

/** 렌더러의 사용자 정의 색 보정과 같은 식(toneCurve.ts). 화면 효과를 쓰면 렌더러 쪽 보정이 꺼지므로 맨 끝에서 한 번 건다 */
class SoftClipEffect extends Effect {
  constructor() {
    super('SoftClipEffect', /* glsl */`
vec3 lookSoftClip( vec3 color ) {${SOFT_CLIP_GLSL}
}
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) { outputColor = vec4( lookSoftClip( max( inputColor.rgb, vec3( 0.0 ) ) ), inputColor.a ); }`)
  }
}

export default function Effects() {
  // 이 효과는 GPU 자원을 따로 쥐지 않는다(셰이더는 효과 묶음이 갖는다). dispose={null}은 R3F가 이 객체를 건드리지 않게 하는 표시다
  const softClip = useMemo(() => new SoftClipEffect(), [])
  return (
    <EffectComposer multisampling={0}>
      <N8AO halfRes aoRadius={LOOK.aoRadius} intensity={LOOK.aoIntensity} distanceFalloff={0.9} color={PALETTE.aoTint} />
      <Bloom mipmapBlur luminanceThreshold={LOOK.bloomThreshold} luminanceSmoothing={0.2} intensity={LOOK.bloom} radius={0.72} />
      <primitive object={softClip} dispose={null} />
      <SMAA />
      <Vignette offset={LOOK.vignetteOffset} darkness={LOOK.vignette} />
    </EffectComposer>
  )
}
```

`<primitive … dispose={null} />`에 `softClip.dispose()`를 부르는 정리 코드를 더하지 않는다. R3F가 `dispose={null}`을 객체에 그대로 써넣어서, 화면이 바뀔 때 "dispose is not a function" 오류가 난다(복사본에서 확인).

- [ ] **Step 4: 둘레 고치기** — `src/scene/Surroundings.tsx`

(1) import를 고친다(`useEffect` 추가, 값 표와 그림 들여오기). 바꿀 곳:

```tsx
import { useMemo } from 'react'
import type { SceneLayout } from './layoutModel'
```

바꾼 글:

```tsx
import { useEffect, useMemo } from 'react'
import type { SceneLayout } from './layoutModel'
import { PALETTE, PANEL_RGB, labZones } from './look/lookConfig'
import { glowTexture, hallFalloffTexture, wallShadeTexture } from './look/lookTextures'
```

(2) `InnerWall` 주석 줄 위에 조명판 묶음 부품을 더한다. 바꿀 곳:

```tsx
/** 안쪽을 보는 벽 한 면(바깥에서는 보이지 않음) */
```

바꾼 글:

```tsx
/** 같은 판 여러 장을 한 번에 그린다(조명판·빛 판 — 아래를 보는 면). 재질이나 자리가 바뀌면 묶음을 새로 만든다 */
function CeilingInstances({ spots, y, geometry, material }: { spots: Array<[number, number]>; y: number; geometry: THREE.BufferGeometry; material: THREE.Material }) {
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(geometry, material, spots.length)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), one = new THREE.Vector3(1, 1, 1)
    spots.forEach(([x, z], i) => im.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, one)))
    im.instanceMatrix.needsUpdate = true
    im.frustumCulled = false
    return im
  }, [spots, y, geometry, material])
  useEffect(() => () => { mesh.dispose() }, [mesh])
  return <primitive object={mesh} />
}

/** 안쪽을 보는 벽 한 면(바깥에서는 보이지 않음) */
```

(3) 부품 머리와 재질을 고친다(`halo` 속성, 바깥 바닥·벽 그늘 그림, 조명판 밝기, 빛 판 재질). 바꿀 곳:

```tsx
export function Surroundings({ layout }: { layout: SceneLayout }) {
  const b = useMemo(() => hallBounds(layout), [layout])
  const mats = useMemo(() => ({
    floor: new THREE.MeshStandardMaterial({ color: '#a39a8f', roughness: 0.85 }),
    wall: new THREE.MeshStandardMaterial({ color: '#f3ece2', roughness: 0.9 }),
    wallLow: new THREE.MeshStandardMaterial({ color: '#b8a58f', roughness: 0.9 }),
    // 천장은 조명 영향 없이 밝은 회색(반구광의 바닥색이 아래 보는 면을 초록으로 물들이지 않게)
    ceiling: new THREE.MeshBasicMaterial({ color: '#e6ded3' }),
    panel: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  }), [])
```

바꾼 글:

```tsx
export function Surroundings({ layout, halo }: { layout: SceneLayout; halo: number }) {
  const b = useMemo(() => hallBounds(layout), [layout])
  const mats = useMemo(() => ({
    // 바깥 바닥은 실습장에서 멀수록 어둡게(시선이 실습장에 모이게)
    floor: new THREE.MeshStandardMaterial({ color: PALETTE.hallFloor, map: hallFalloffTexture(b, labZones(layout)), roughness: 0.82 }),
    wall: new THREE.MeshStandardMaterial({ color: PALETTE.hallWall, map: wallShadeTexture('up'), roughness: 0.9 }),
    wallLow: new THREE.MeshStandardMaterial({ color: PALETTE.hallWallLow, map: wallShadeTexture('low'), roughness: 0.9 }),
    // 천장은 조명 영향 없이 밝은 회색(반구광의 바닥색이 아래 보는 면을 초록으로 물들이지 않게)
    ceiling: new THREE.MeshBasicMaterial({ color: PALETTE.ceiling }),
    // 조명판: 밝기 1을 넘는 흰색(품질 높음에서 빛 번짐이 걸린다)
    panel: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(PANEL_RGB[0], PANEL_RGB[1], PANEL_RGB[2]) }),
  }), [b, layout])
  // 조명판 둘레의 옅은 빛 판(더하기 섞기)
  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTexture('alpha'), color: PALETTE.halo, transparent: true, opacity: halo, depthWrite: false, blending: THREE.AdditiveBlending }), [halo])
```

(4) 빛 판 모양을 더한다. 바꿀 곳:

```tsx
  const panelGeo = useMemo(() => new THREE.PlaneGeometry(1.2, 0.3), [])
```

바꾼 글:

```tsx
  const panelGeo = useMemo(() => new THREE.PlaneGeometry(1.2, 0.3), [])
  const haloGeo = useMemo(() => new THREE.PlaneGeometry(2.0, 0.95), [])
```

(5) 조명판 90장을 메시 90개 대신 묶음 2개(조명판·빛 판)로 그린다. 바꿀 곳:

```tsx
      {panels.map(([x, z]) => <mesh key={`${x},${z}`} rotation-x={Math.PI / 2} position={[x, CEILING_H - 0.01, z]} geometry={panelGeo} material={mats.panel} />)}
```

바꾼 글:

```tsx
      <CeilingInstances spots={panels} y={CEILING_H - 0.01} geometry={panelGeo} material={mats.panel} />
      <CeilingInstances spots={panels} y={CEILING_H - 0.02} geometry={haloGeo} material={haloMat} />
```

- [ ] **Step 5: 벽·기둥 재질 고치기** — `src/scene/models/models.tsx`

(1) import 두 줄을 더한다. 바꿀 곳:

```tsx
import { absTesterFaceTexture, cabinetPlateTexture, checkerPlateTexture, dangerSignTexture, rollerTexture, woodTexture } from './textures'
```

바꾼 글:

```tsx
import { absTesterFaceTexture, cabinetPlateTexture, checkerPlateTexture, dangerSignTexture, rollerTexture, woodTexture } from './textures'
import { PALETTE } from '../look/lookConfig'
import { wallShadeTexture } from '../look/lookTextures'
```

(2) 벽·기둥 재질을 고친다. 바꿀 곳:

```tsx
    wallWhite: new THREE.MeshStandardMaterial({ color: '#eceff1', roughness: 0.9, side: THREE.FrontSide }),
    wallGrey: new THREE.MeshStandardMaterial({ color: '#9aa2a7', roughness: 0.85, side: THREE.FrontSide }),
    pillarWhite: new THREE.MeshStandardMaterial({ color: '#f1f3f4', roughness: 0.85 }),
```

바꾼 글:

```tsx
    // 벽·기둥 아래 띠: 바닥에 닿는 쪽이 어두운 세로 그늘 그림을 곱한다(설계 2026-11-11 §4.6). 천장에 닿는 쪽 그늘은 Surroundings의 윗벽이 맡는다
    wallWhite: new THREE.MeshStandardMaterial({ color: PALETTE.wallUp, roughness: 0.9, side: THREE.FrontSide }),
    wallGrey: new THREE.MeshStandardMaterial({ color: PALETTE.wallLow, map: wallShadeTexture('low'), roughness: 0.85, side: THREE.FrontSide }),
    pillarWhite: new THREE.MeshStandardMaterial({ color: PALETTE.wallUp, roughness: 0.85 }),
```

- [ ] **Step 6: 장면 고치기** — `src/scene/LabScene.tsx`

(1) 첫 줄 설명을 고친다. 바꿀 곳:

```tsx
// 3D 실습장 장면 — 사진 기준 장비 모델(models/), 품질 2단계(낮음: 그림자·화면 효과 끔, 해상도 1배, 반사광은 간단한 빛 — 모델은 두 품질 같음), 바닥 탭 이동, 시점 3단계
```

바꾼 글:

```tsx
// 3D 실습장 장면 — 사진 기준 장비 모델(models/), 품질 2단계(낮음: 실시간 그림자·화면 효과 끔, 해상도 1배 — 모델·빛·반사광은 두 품질 같고 바닥 그림자는 구워서 깐다, look/), 바닥 탭 이동, 시점 3단계
```

(2) drei에서 들여오는 것을 줄인다. 바꿀 곳:

```tsx
import { ContactShadows, Environment, Html, Lightformer, OrbitControls, useProgress } from '@react-three/drei'
```

바꾼 글:

```tsx
import { Html, OrbitControls, useProgress } from '@react-three/drei'
```

(3) 예전 바닥 무늬 import 줄을 지운다. 지울 곳(줄째로 지우고 빈 줄을 남기지 않는다):

```tsx
import { epoxyFloorTexture } from './models/textures'
```

(4) 정비소 사진 import 두 줄을 새 부품 import로 바꾼다. 바꿀 곳:

```tsx
import { assetUrl } from '../app/assetUrl'
import { LAB_HDRI } from '../app/intro'
```

바꾼 글:

```tsx
import { CEILING_H, hallBounds } from './Surroundings'
import { FOG, PALETTE, labBounds, lookFor } from './look/lookConfig'
import { WorkshopEnv, probePoint } from './look/WorkshopEnv'
import { makeFloorMaterial } from './look/floorMaterial'
import { KeyLight } from './look/KeyLight'
import { ToneSetup } from './look/ToneSetup'
import { FloorShadowBake } from './look/FloorShadowBake'
```

(5) `LabSceneProps`에 `antialias`를 더한다. 바꿀 곳:

```tsx
  lowSpec: boolean
  /** 올려 둔 리프트 ID(표시 전용, 과제 기록과 무관) */
```

바꾼 글:

```tsx
  lowSpec: boolean
  /** 품질 낮음에서도 계단 줄이기를 켠다(주소 ?aa=1 — 실기기 비교용, app/quality.ts) */
  antialias?: boolean
  /** 올려 둔 리프트 ID(표시 전용, 과제 기록과 무관) */
```

(6) 예전 닿는 그늘 부품 `BakedFloorShadows`를 주석과 함께 통째로 지운다(뒤따르는 빈 줄 하나 포함). 지울 곳(줄째로 지우고 빈 줄을 남기지 않는다):

```tsx
/**
 * 바닥 그림자 굽기: 장비·차량 그림자를 위에서 한 번(20프레임) 계산해 바닥에 깐다. 품질 낮음(폰·태블릿)도 거의 공짜로 그림자가 생긴다.
 * 모델을 다 불러온 뒤·리프트를 올리고 내린 뒤·시험 차량 자세가 바뀐 뒤 2.5초 기다렸다 다시 굽는다. 사람은 레이어 2라 빠진다.
 */
function BakedFloorShadows({ bounds, stateKey, strong }: { bounds: { xMin: number; xMax: number; zMin: number; zMax: number }; stateKey: string; strong: boolean }) {
  const { active } = useProgress()
  const want = `${active ? 'loading' : 'ready'}|${stateKey}`
  const [key, setKey] = useState(want)
  useEffect(() => { const t = setTimeout(() => setKey(want), 2500); return () => clearTimeout(t) }, [want])
  const w = bounds.xMax - bounds.xMin, d = bounds.zMax - bounds.zMin
  return <ContactShadows key={key} frames={20} position={[(bounds.xMin + bounds.xMax) / 2, 0.006, (bounds.zMin + bounds.zMax) / 2]} scale={[w, d]}
    resolution={1024} blur={2.4} far={3.2} opacity={strong ? 0.6 : 0.38} color="#0b1a12" />
}
```

(7) `LabScene` 인자에 `antialias = false`를 더한다(`lowSpec,` 바로 뒤. 이 긴 줄의 나머지는 그대로 둔다). 바꿀 곳:

```tsx
export function LabScene({ layout, start, selectedId, highlightIds, lowSpec, raisedLiftIds = [],
```

바꾼 글:

```tsx
export function LabScene({ layout, start, selectedId, highlightIds, lowSpec, antialias = false, raisedLiftIds = [],
```

(8) 바닥 재질을 새 재질로 바꾸고, 품질별 구성과 그림자 범위를 더한다. 바꿀 곳:

```tsx
    return new THREE.MeshStandardMaterial({ map: epoxyFloorTexture(repeat), roughness: 0.38, metalness: 0.02, envMapIntensity: 0.35 })
  }, [mz.xMax, mz.xMin, mz.zMax, mz.zMin])
```

바꾼 글:

```tsx
    const hall = hallBounds(layout)
    return makeFloorMaterial({ min: new THREE.Vector3(hall.xMin, 0, hall.zMin), max: new THREE.Vector3(hall.xMax, CEILING_H, hall.zMax) }, probePoint(layout), repeat)
  }, [layout, mz.xMax, mz.xMin, mz.zMax, mz.zMin])
  const tier = useMemo(() => lookFor(lowSpec), [lowSpec])
  const shadowBounds = useMemo(() => labBounds(layout), [layout])
```

(9) `<Canvas>`의 그림자·계단 줄이기 속성을 고치고, 그 바로 위의 `hdri` 줄을 지운다(`dpr`부터 `powerPreference` 앞까지는 그대로). 바꿀 곳:

```tsx
  const hdri = assetUrl(LAB_HDRI)
  return (
    <Canvas shadows={!lowSpec} dpr={lowSpec ? 1 : [1, 1.5]} camera={{ position: [start.x + 4, 5.5, start.z + 6], fov: 50, near: 0.08, far: 120 }} gl={{ antialias: !lowSpec, powerPreference
```

바꾼 글:

```tsx
  return (
    <Canvas shadows={tier.realtimeShadows ? 'percentage' : false} dpr={lowSpec ? 1 : [1, 1.5]} camera={{ position: [start.x + 4, 5.5, start.z + 6], fov: 50, near: 0.08, far: 120 }} gl={{ antialias: !lowSpec || antialias, powerPreference
```

(10) 배경·안개·둘레·조명·반사광 줄들을 통째로 바꾼다. 바꿀 곳:

```tsx
      <color attach="background" args={['#efe4d6']} />
      <fog attach="fog" args={['#efe4d6', 24, 60]} />
      <Surroundings layout={layout} />
      <hemisphereLight args={['#fff1dc', '#4f6b4c', lowSpec ? 1.1 : 0.7]} />
      <directionalLight color="#ffe9cf" position={[mz.xMax * 0.6, 14, mz.zMax * 0.3]} intensity={lowSpec ? 1.0 : 1.4} castShadow={!lowSpec}
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-bias={-0.0005} />
      {/* 반사광: 품질 높음은 정비소 HDRI(1.6 MB), 낮음은 내려받기 없이 천장 조명판 모양의 간단한 빛으로 만든다 */}
      {!lowSpec ? <Suspense fallback={null}><Environment files={hdri} environmentIntensity={0.45} /></Suspense> : (
        <Environment resolution={32} environmentIntensity={0.6}>
          <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
          <Lightformer form="rect" intensity={0.6} position={[0, 1, -8]} scale={[20, 3, 1]} />
          <Lightformer form="rect" intensity={0.6} position={[0, 1, 8]} rotation-y={Math.PI} scale={[20, 3, 1]} />
        </Environment>
      )}
```

바꾼 글:

```tsx
      {/* 빛과 재질(설계 2026-11-11): 색 보정 곡선 · 주된 빛 하나 · 낮춘 주변광 · 실습장 자체로 만든 반사광. 두 품질이 같은 빛을 쓴다 */}
      <ToneSetup />
      <color attach="background" args={[PALETTE.background]} />
      <fog attach="fog" args={[PALETTE.background, FOG.near, FOG.far]} />
      <Surroundings layout={layout} halo={tier.halo} />
      <hemisphereLight args={[PALETTE.sky, PALETTE.ground, tier.hemi]} />
      <KeyLight bounds={shadowBounds} castShadow={tier.realtimeShadows} />
      <WorkshopEnv layout={layout} resolution={tier.envResolution} />
```

(11) 닿는 그늘 부품을 구운 바닥 그림자 부품으로 바꾼다. 바꿀 곳:

```tsx
      <BakedFloorShadows bounds={{ xMin: mz.xMin, xMax: mz.xMax, zMin: mz.zMin, zMax: Math.max(mz.zMax, ab?.zMax ?? mz.zMax) }}
        stateKey={`${raisedLiftIds.join(',')}|${rig.vehicle}|${rig.liftUp}`} strong={lowSpec} />
```

바꾼 글:

```tsx
      {/* 바닥 그림자: 낮음은 주된 빛 그림자 + 닿는 그늘, 높음은 닿는 그늘만 굽는다(주된 빛 그림자는 실시간) */}
      <FloorShadowBake bounds={shadowBounds} sun={tier.sunShadow} contact={tier.contactShadow} stateKey={`${raisedLiftIds.join(',')}|${rig.vehicle}|${rig.liftUp}`} />
```

(12) 트인 변의 초록 띠를 조명을 받는 칠 색으로 바꾼다. 바꿀 곳:

```tsx
              <planeGeometry args={horizontal ? [len, 0.3] : [0.3, len]} />
              <meshBasicMaterial color="#1fbf6b" />
```

바꾼 글:

```tsx
              <planeGeometry args={horizontal ? [len, 0.3] : [0.3, len]} />
              <meshStandardMaterial color={PALETTE.line} roughness={0.5} />
```

(13) 시작점 고리도 같은 칠 색으로 바꾼다. 바꿀 곳:

```tsx
<ringGeometry args={[0.3, 0.45, 24]} /><meshBasicMaterial color="#1fbf6b" /></mesh>
```

바꾼 글:

```tsx
<ringGeometry args={[0.3, 0.45, 24]} /><meshStandardMaterial color={PALETTE.line} roughness={0.5} /></mesh>
```

(14) 화면 효과를 켜는 조건을 품질별 구성에서 읽는다(`lookFor`의 `postEffects` — 품질 낮음은 false). 바꿀 곳:

```tsx
      {!lowSpec && <Suspense fallback={null}><Effects /></Suspense>}
```

바꾼 글:

```tsx
      {tier.postEffects && <Suspense fallback={null}><Effects /></Suspense>}
```

고친 뒤 `LabScene.tsx`에 `hdri`, `LAB_HDRI`, `assetUrl`, `Environment`, `Lightformer`, `ContactShadows`, `epoxyFloorTexture`라는 글자가 남아 있으면 안 된다(`grep -n "hdri\|LAB_HDRI\|assetUrl\|Lightformer\|ContactShadows\|epoxyFloorTexture" src/scene/LabScene.tsx` → 결과 없음). `useProgress`·`useState`·`useEffect`·`Suspense`는 다른 곳에서 쓰므로 import에 그대로 둔다.

- [ ] **Step 7: 화면 쪽 고치기** — `src/screens/LabScreen.tsx`

(1) import에 `antialiasRequested`를 더한다. 바꿀 곳:

```tsx
import { initialQuality, shouldAutoLower } from '../app/quality'
```

바꾼 글:

```tsx
import { antialiasRequested, initialQuality, shouldAutoLower } from '../app/quality'
```

(2) 품질 설명 주석을 사실에 맞게 고친다. 바꿀 곳:

```tsx
터치 기기(태블릿·폰)는 '낮음'(그림자·환경광 끔, 해상도 1배)으로 시작
```

바꾼 글:

```tsx
터치 기기(태블릿·폰)는 '낮음'(실시간 그림자·화면 효과 끔, 해상도 1배 — 빛과 구운 바닥 그림자는 그대로)으로 시작
```

(3) `lowSpec` 상태 줄 아래에 `antialias`를 더한다. 바꿀 곳:

```tsx
  const [lowSpec, setLowSpecRaw] = useState(quality0.low)
```

바꾼 글:

```tsx
  const [lowSpec, setLowSpecRaw] = useState(quality0.low)
  const [antialias] = useState(() => typeof window !== 'undefined' && antialiasRequested(window.location.search))
```

(4) `<LabScene …>` 두 곳(게임 화면·기본 화면) 모두에 `antialias`를 넘긴다(같은 글이 두 번 나온다 — 둘 다 바꾼다). 바꿀 곳(2번 나온다):

```tsx
highlightIds={requiredNow ? [requiredNow] : []} lowSpec={lowSpec} raisedLiftIds={raisedLifts}
```

바꾼 글:

```tsx
highlightIds={requiredNow ? [requiredNow] : []} lowSpec={lowSpec} antialias={antialias} raisedLiftIds={raisedLifts}
```

(5) 기본 화면 '품질 낮음' 칸의 설명 글귀(마우스를 올리면 보이는 글)를 사실에 맞게 고친다 — 낮음에도 구운 그림자가 있다. 바꿀 곳:

```tsx
title="낮음: 그림자·화면 효과를 끄고 해상도를 낮춰 태블릿에서 부드럽게(모델은 같음)"
```

바꾼 글:

```tsx
title="낮음: 실시간 그림자·화면 효과를 끄고 해상도를 낮춰 태블릿에서 부드럽게(모델·빛은 같음)"
```

- [ ] **Step 8: 캐릭터 만들기 화면** — `src/screens/AvatarScreen.tsx`

(1) import 한 줄을 더한다. 바꿀 곳:

```tsx
import { CHARACTER_LAYER, CharacterModel, STUDENT_OUTFIT } from '../scene/models/CharacterModel'
```

바꾼 글:

```tsx
import { CHARACTER_LAYER, CharacterModel, STUDENT_OUTFIT } from '../scene/models/CharacterModel'
import { ToneSetup } from '../scene/look/ToneSetup'
```

(2) 미리보기 캔버스 안, `<SeeCharacters />` 아래에 한 줄을 더한다. 바꿀 곳:

```tsx
            <SeeCharacters />
```

바꾼 글:

```tsx
            <SeeCharacters />
            <ToneSetup />
```

- [ ] **Step 9: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 전체 PASS(`tests/lookWiring.test.ts` 15개 포함), 형 검사 오류 없음

- [ ] **Step 10: 커밋**

```bash
git add src/scene/LabScene.tsx src/scene/Surroundings.tsx src/scene/models/models.tsx src/scene/Effects.tsx src/screens/LabScreen.tsx src/screens/AvatarScreen.tsx tests/lookWiring.test.ts
git commit -m "feat(빛과 재질): 장면에 끼우기 — 주된 빛·실습장 반사광·광택 바닥·구운 바닥 그림자, 벽 그늘·바깥 바닥 어둡게·조명판 묶음과 빛 판, 화면 효과에 빛 번짐·꺾임 곡선, 표시선 칠 색" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 8: 정비소 사진(HDRI) 걷어내기

반사광을 실습장 자체로 만들게 되어 더 쓰지 않는다(§4.10, MOON 결정 §11-2).

**Files:**
- Modify: `src/app/intro.ts`, `src/App.tsx`, `src/app/assetUrl.ts`
- Modify: `scripts/build-asset-versions.mjs`, `src/data/assetVersions.json`(다시 만듦)
- Delete: `public/assets/hdri/autoshop_01_1k.hdr`
- Modify: `docs/design/docs/08_ASSET_AND_COPYRIGHT.md`
- Test: `tests/intro.test.ts`, `tests/assetVersions.test.ts`, `tests/lookWiring.test.ts`

- [ ] **Step 1: 시험 고치기** — `tests/intro.test.ts`

(1) import에서 `LAB_HDRI`를 뺀다. 바꿀 곳:

```ts
import { LAB_HDRI, PRELOAD_MODELS, introPlan, parseIntroPrefs, preloadPlan, tipsFor } from '../src/app/intro'
```

바꾼 글:

```ts
import { PRELOAD_MODELS, introPlan, parseIntroPrefs, preloadPlan, tipsFor } from '../src/app/intro'
```

(2) 정비소 사진 시험 두 개를 세 개로 바꾼다. 바꿀 곳:

```ts
  test('품질 높음(PC)은 정비소 HDRI·화면 효과 코드도 처음부터 받는다(실습장 진입 대기 줄이기)', () => {
    const p = preloadPlan(false)
    expect(p.hdri).toBe(LAB_HDRI); expect(p.effects).toBe(true)
    expect(existsSync(new URL(`../public/assets/${LAB_HDRI}`, import.meta.url))).toBe(true)
  })
  test('품질 낮음(태블릿)은 쓰지 않는 HDRI·효과 코드를 받지 않는다(태블릿 내려받기 보호)', () => {
    expect(preloadPlan(true)).toMatchObject({ hdri: null, effects: false })
  })
```

바꾼 글:

```ts
  test('품질 높음(PC)은 화면 효과 코드도 처음부터 받는다(실습장 진입 대기 줄이기)', () => {
    expect(preloadPlan(false).effects).toBe(true)
  })
  test('품질 낮음(태블릿)은 쓰지 않는 효과 코드를 받지 않는다(태블릿 내려받기 보호)', () => {
    expect(preloadPlan(true).effects).toBe(false)
  })
  test('정비소 HDRI는 더 받지 않는다 — 반사광은 실습장 자체로 만든다(2026-11-11)', () => {
    expect(Object.keys(preloadPlan(false)).sort()).toEqual(['effects', 'models'])
    expect(existsSync(new URL('../public/assets/hdri', import.meta.url))).toBe(false)
  })
```

- [ ] **Step 2: 시험 고치기** — `tests/assetVersions.test.ts`

HDRI 주소 검사를 '모델만 있다' 검사로 바꾼다. 바꿀 곳:

```ts
  test('모델·HDRI 주소에 내용 해시 꼬리표가 붙는다', () => {
    expect(assetUrl('models/k3.glb')).toMatch(/assets\/models\/k3\.glb\?v=[0-9a-f]{10}$/)
    expect(assetUrl('hdri/autoshop_01_1k.hdr')).toMatch(/\?v=[0-9a-f]{10}$/)
```

바꾼 글:

```ts
  test('모델 주소에 내용 해시 꼬리표가 붙는다', () => {
    expect(assetUrl('models/k3.glb')).toMatch(/assets\/models\/k3\.glb\?v=[0-9a-f]{10}$/)
    expect(Object.keys(versions).every((k) => k.startsWith('models/'))).toBe(true)
```

- [ ] **Step 3: 끼움 시험 더하기** — `tests/lookWiring.test.ts`

`'화면 효과 순서: …'` 시험 아래(`describe('태블릿 묶음 보호', …)`의 마지막)에 시험을 더한다. 바꿀 곳:

```ts
    expect(fx).not.toMatch(/ToneMappingMode|ACES/)
  })
})
```

바꾼 글:

```ts
    expect(fx).not.toMatch(/ToneMappingMode|ACES/)
  })
  test('정비소 사진을 미리 받지 않는다', () => {
    expect(read('src/App.tsx')).not.toMatch(/useEnvironment|hdri/i)
    expect(read('src/app/intro.ts')).not.toMatch(/LAB_HDRI|hdri: /)
  })
})
```

- [ ] **Step 4: 실패 확인**

Run: `npm test -- tests/intro.test.ts tests/assetVersions.test.ts tests/lookWiring.test.ts`
Expected: FAIL — 3개 실패(파일마다 하나): `preloadPlan`에 아직 `hdri`가 있고 파일·폴더·꼬리표가 남아 있음

- [ ] **Step 5: 미리 받기에서 빼기** — `src/app/intro.ts`

`LAB_HDRI`를 지우고 `preloadPlan`에서 `hdri`를 뺀다. 바꿀 곳:

```ts
/** 실습장 정비소 HDRI — 품질 높음에서만 쓴다(품질 낮음은 내려받기 없는 간단한 빛) */
export const LAB_HDRI = 'hdri/autoshop_01_1k.hdr'

/** 처음부터 미리 받을 것(첫 로딩 줄이기 2026-11-03). 품질 높음이면 HDRI·화면 효과 코드도 함께 받아 실습장 진입 뒤 대기를 없앤다.
 *  품질 낮음(터치 기기)은 둘 다 쓰지 않으므로 받지 않는다(태블릿 내려받기 보호) */
export function preloadPlan(low: boolean): { models: string[]; hdri: string | null; effects: boolean } {
  return { models: PRELOAD_MODELS.map((f) => `models/${f}`), hdri: low ? null : LAB_HDRI, effects: !low }
}
```

바꾼 글:

```ts
/** 처음부터 미리 받을 것(첫 로딩 줄이기 2026-11-03). 품질 높음이면 화면 효과 코드도 함께 받아 실습장 진입 뒤 대기를 없앤다.
 *  품질 낮음(터치 기기)은 화면 효과를 쓰지 않으므로 받지 않는다(태블릿 내려받기 보호). 반사광은 실습장 자체로 만들어 받을 파일이 없다(2026-11-11) */
export function preloadPlan(low: boolean): { models: string[]; effects: boolean } {
  return { models: PRELOAD_MODELS.map((f) => `models/${f}`), effects: !low }
}
```

- [ ] **Step 6: 앱에서 빼기** — `src/App.tsx`

(1) import에서 `useEnvironment`를 뺀다. 바꿀 곳:

```tsx
import { useEnvironment, useGLTF } from '@react-three/drei'
```

바꾼 글:

```tsx
import { useGLTF } from '@react-three/drei'
```

(2) 미리 받기 주석 두 줄을 고친다. 바꿀 곳:

```tsx
  // 실습장 3D 모델을 처음부터 미리 받아 둔다(인트로·코드 입력·캐릭터 만들기 동안). 실습장의 useGLTF·Environment가 같은 캐시를 쓴다
  // 품질 높음이면 HDRI·화면 효과 코드도 함께(실습장과 같은 품질 판정 — app/quality.ts)
```

바꾼 글:

```tsx
  // 실습장 3D 모델을 처음부터 미리 받아 둔다(인트로·코드 입력·캐릭터 만들기 동안). 실습장의 useGLTF가 같은 캐시를 쓴다
  // 품질 높음이면 화면 효과 코드도 함께(실습장과 같은 품질 판정 — app/quality.ts). 반사광은 실습장 자체로 만들어 받을 파일이 없다
```

(3) 정비소 사진 미리 받기 줄을 지운다. 지울 곳(줄째로 지우고 빈 줄을 남기지 않는다):

```tsx
    if (plan.hdri) useEnvironment.preload({ files: assetUrl(plan.hdri) })
```

- [ ] **Step 7: 주석 고치기** — `src/app/assetUrl.ts`

주석의 예에서 HDRI를 뺀다. 바꿀 곳:

```ts
/** rel 예: 'models/k3.glb', 'hdri/autoshop_01_1k.hdr' */
```

바꾼 글:

```ts
/** rel 예: 'models/k3.glb' */
```

- [ ] **Step 8: 꼬리표 스크립트 고치기** — `scripts/build-asset-versions.mjs`

(1) 첫 줄 설명을 고친다. 바꿀 곳:

```js
// 3D 자료 버전 꼬리표 생성(2026-11-03): public/assets/{models,hdri}의 파일마다 내용 해시(앞 10자)를 src/data/assetVersions.json에 쓴다.
```

바꾼 글:

```js
// 3D 자료 버전 꼬리표 생성(2026-11-03): public/assets/models의 파일마다 내용 해시(앞 10자)를 src/data/assetVersions.json에 쓴다.
// (정비소 HDRI는 2026-11-11부터 쓰지 않는다 — 반사광을 실습장 자체로 만든다)
```

(2) 훑는 폴더에서 `hdri`를 뺀다(폴더가 없어지므로). 바꿀 곳:

```js
  for (const dir of ['models', 'hdri']) {
```

바꾼 글:

```js
  for (const dir of ['models']) {
```

- [ ] **Step 9: 파일 지우고 꼬리표 다시 만들기**

```bash
git rm public/assets/hdri/autoshop_01_1k.hdr
node scripts/build-asset-versions.mjs
```

Expected: `asset versions 18`. `src/data/assetVersions.json`에서 마지막 `hdri/…` 줄이 빠지고 그 앞줄 끝의 쉼표가 없어진다(`git diff --stat src/data/assetVersions.json` → 1줄 추가, 2줄 삭제). `public/assets/hdri` 폴더가 없어진다.

- [ ] **Step 10: 저작권 표에 적기** — `docs/design/docs/08_ASSET_AND_COPYRIGHT.md`

HDRI 줄의 맨 끝 칸(용도)만 바꾼다. 바꿀 곳:

```
| 품질 '높음'의 반사·환경광. '낮음'에서는 불러오지 않음 |
```

바꾼 글:

```
| 0.3.2-demo까지 품질 '높음'의 반사·환경광으로 썼다. **0.3.3-demo부터 쓰지 않고 파일도 저장소에서 지웠다**(2026-11-11 — 반사광을 실습장 자체로 만든다. 깃 이력에는 남아 있다) |
```

- [ ] **Step 11: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 전체 PASS(`tests/lookWiring.test.ts` 16개), 형 검사 오류 없음

- [ ] **Step 12: 커밋**

```bash
git add src/app/intro.ts src/App.tsx src/app/assetUrl.ts scripts/build-asset-versions.mjs src/data/assetVersions.json docs/design/docs/08_ASSET_AND_COPYRIGHT.md tests/intro.test.ts tests/assetVersions.test.ts tests/lookWiring.test.ts
git commit -m "chore(빛과 재질): 정비소 HDRI 걷어내기 — 미리 받기·파일·꼬리표에서 빼고 저작권 표에 기록(PC 내려받기 1.6 MB 줄어듦)" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

(`git rm`으로 지운 파일은 이미 스테이지에 있다.)

---

### Task 9: 앱 판 0.3.3-demo

겉모습이 달라진 판을 기록의 `clientAppVersion`으로 가른다(§8). 채점·기록 형식은 그대로다.

**Files:**
- Modify: `src/app/buildInfo.ts`
- Modify: `src/records/researchBundle.ts`(설명서 글 한 곳)
- Test: `tests/buildInfo.test.ts`, `tests/researchBundle.test.ts`

- [ ] **Step 1: 시험 고치기** — `tests/buildInfo.test.ts`

마지막 시험을 바꾼다. 바꿀 곳:

```ts
  test('계산기(2026-11-11)부터 기본 판 0.3.2-demo — 계산기 이전 기록과 가른다(0.3.1-demo는 채점 규칙 가)', () => { expect(APP_BASE_VERSION).toBe('0.3.2-demo') })
```

바꾼 글:

```ts
  test('빛과 재질 다듬기(2026-11-11)부터 기본 판 0.3.3-demo — 겉모습이 달라진 판을 기록에서 가른다(0.3.2-demo는 계산기, 0.3.1-demo는 채점 규칙 가)', () => { expect(APP_BASE_VERSION).toBe('0.3.3-demo') })
```

- [ ] **Step 2: 시험 더하기** — `tests/researchBundle.test.ts`

연구자가 받는 묶음의 설명서(README.txt)가 판의 뜻을 알려 준다. 겉모습이 달라진 판도 거기에 적는다.

`'연구자 전용 주의, …'` 시험 바로 아래에 시험을 더한다. 바꿀 곳:

```ts
    expect(b.counts).toMatchObject({ received: 0, usable: 0, problem: 0 })
  })
```

바꾼 글:

```ts
    expect(b.counts).toMatchObject({ received: 0, usable: 0, problem: 0 })
  })

  test('겉모습이 달라진 판(0.3.3-demo)을 알린다 — 채점·기록은 같음', async () => {
    const readme = file(await bundle([]), 'README.txt')
    expect(readme).toContain('0.3.3-demo부터 실습장 조명·바닥 겉모습이 달라짐(채점·기록은 같음)')
  })
```

- [ ] **Step 3: 실패 확인**

Run: `npm test -- tests/buildInfo.test.ts tests/researchBundle.test.ts`
Expected: FAIL — 2개 실패(`'0.3.2-demo'`를 받음, 설명서에 0.3.3-demo 글이 없음)

- [ ] **Step 4: 구현** — `src/app/buildInfo.ts`

판 설명 주석 한 줄을 더하고 판을 올린다. 바꿀 곳:

```ts
export const APP_BASE_VERSION = '0.3.2-demo'
```

바꾼 글:

```ts
// 0.3.3-demo(2026-11-11): 빛과 재질 다듬기(조명·그림자·바닥·색 보정)부터. 채점·기록은 그대로이고 겉모습만 달라 이 판으로 가른다
export const APP_BASE_VERSION = '0.3.3-demo'
```

- [ ] **Step 5: 설명서 글 고치기** — `src/records/researchBundle.ts`

연구용 묶음 설명서의 `clientAppVersion` 열 설명에 이 판을 더한다(글만 바꾼다. 묶음 만드는 코드는 건드리지 않는다). 바꿀 곳:

```ts
0.3.1-demo부터 계산 답을 다시 절사하지 않고 채점, 0.3.2-demo부터 계산기. 이어 하기로 이어진 수행은 처음 시작한 판이 남는다
```

바꾼 글:

```ts
0.3.1-demo부터 계산 답을 다시 절사하지 않고 채점, 0.3.2-demo부터 계산기, 0.3.3-demo부터 실습장 조명·바닥 겉모습이 달라짐(채점·기록은 같음). 이어 하기로 이어진 수행은 처음 시작한 판이 남는다
```

- [ ] **Step 6: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 전체 PASS, 형 검사 오류 없음. 다른 시험이 판 번호 글자 `0.3.2-demo`에 기대어 실패하면 고치지 말고 멈춰서 알린다.

- [ ] **Step 7: 커밋**

```bash
git add src/app/buildInfo.ts src/records/researchBundle.ts tests/buildInfo.test.ts tests/researchBundle.test.ts
git commit -m "chore(판): 앱 판 0.3.3-demo — 빛과 재질 다듬기부터(겉모습만 달라짐, 채점·기록 그대로), 연구용 묶음 설명서에 판의 뜻 적기" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 10: 전체 확인 — 시험·형 검사·빌드·묶음

**Files:** 없음(확인만). 고칠 것이 나오면 고치지 말고 멈춰서 알린다.

- [ ] **Step 1: 전체 시험과 형 검사**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: `Test Files 124 passed`, `Tests 1012 passed`, 형 검사 오류 없음

- [ ] **Step 2: 빌드**

Run: `npm run build`
Expected: 오류 없이 끝남. `src/data/assetVersions.json`은 바뀌지 않는다(`git status --short`에 나오지 않음).

- [ ] **Step 3: 묶음 크기**

Run: `ls -l dist/assets/*.js`
Expected: `index-*.js` 1,630,421바이트 이하(지금 1,600,421 + 30,000. 복사본에서는 1,605,698), `Effects-*.js` 353,498바이트 이하(지금 313,498 + 40,000. 복사본에서는 320,222)

- [ ] **Step 4: 묶음 내용**

```bash
grep -c "__lookdev" dist/assets/index-*.js
grep -c 'get("look")' dist/assets/index-*.js
grep -c "postprocessing" dist/assets/index-*.js
grep -c "autoshop" dist/assets/*.js
grep -c "lookReflect" dist/assets/index-*.js
ls dist/assets
```

Expected: 앞의 네 줄은 모두 `0`(개발용 코드·화면 효과 패키지·정비소 사진이 주 묶음에 없음. `grep -c`가 0이면 종료 코드 1이 나오는 것은 정상), `lookReflect`는 1 이상, `dist/assets`에 `hdri` 폴더가 없음.

- [ ] **Step 5: 남은 것 확인**

Run: `git status --short`
Expected: `?? tsconfig.tsbuildinfo`만(커밋하지 않는다)

---

### Task 11: 화면 확인 — 새 판을 찍어 '지금'과 견준다 (컨트롤러)

**Files:** 없음(확인). 값을 조정하면 `src/scene/look/lookConfig.ts`와 설계 문서 §12.

- [ ] **Step 1: 개발 서버 띄우기** — Task 0의 Step 5와 같다.

- [ ] **Step 2: 새 판 찍기**

```bash
T=scripts/lookdev/lookdev.mjs; O=scripts/lookdev/out; U=http://localhost:4319/
for q in high low; do node $T cams $U $O new $q; for f in disc panel turn; do node $T inst $U $O new $q $f; done; node $T toggle $U $O new $q; done
node $T colors $O new
```

- [ ] **Step 3: 통과 기준과 견주기**

| 무엇 | 기준 |
|---|---|
| 오류 | 모든 명령에서 `error` 없음, `console`·`exceptions`·`blockedWrites`가 `[]` |
| 그리기 호출 수(낮음) | 구도 10개 모두 `base` 값 + 2 이하 |
| 그리기 호출 수(높음) | 구도 10개 모두 `base` 값의 1.08배 이하 |
| 구운 그림자 | `bakes`의 `mean`이 낮음 0.05~0.5, 높음 0.01~0.3 |
| 품질 바꾸기 | `toggle`의 다섯 단계에서 굽기 횟수가 1 → 2 → 3 → 4 → 5로 늘고 오류 없음 |
| 계기 화면 숫자 | `colors`의 `readoutDigits.max`가 낮음 `[255, 74, 58]`(= `base`), 높음은 원본과 채널마다 10 이내(복사본에서는 `[248, 76, 62]`) |
| 측정판 종이색 | `turntablePaper.mean`이 두 품질 모두 원본 `[255, 248, 214]`와 채널마다 10 이내(복사본에서는 높음 `[246, 239, 208]`, 낮음 `[255, 247, 217]`) |

값은 `scripts/lookdev/out/new-…-cams.json`, `base-…-cams.json`에 있다.

- [ ] **Step 4: 비교 그림 만들기**

```bash
for c in hero top north lifttop tester turncar carclose graze inst-panel inst-disc inst-tt-left; do node $T sheet $O base new $c; done
```

- [ ] **Step 5: 눈으로 확인**(그림을 직접 열어 본다)
  - 품질 낮음에도 기둥·차·작업대 그림자가 바닥에 있고, 방향이 높음과 같다(`sheet-new-lifttop.png`).
  - 흰 차 표면에 점 무늬가 없다(`new-high-carclose.png`).
  - 바닥에 잔 그물 무늬가 없다(`new-low-graze.png`).
  - 은색 차가 은색이고, 벽이 누렇지 않다(`sheet-new-hero.png`).
  - 품질을 바꾼 뒤에도 천장 조명 둘레에 옅은 빛이 있다(`new-high-toggled.png`).
  - 다이얼 게이지 눈금·숫자·바늘, 계기 화면 숫자, 측정판 눈금이 '지금'만큼 읽힌다(`sheet-new-inst-….png`).

- [ ] **Step 6: 값 조정(필요할 때만)**
  - 조정은 `lookConfig.ts`의 `LOOK_DEFAULTS`·`PALETTE`에서만 한다. 먼저 주소 인자로 시험한다(예: `http://localhost:4319/?look=key:3.4,floorReflect:0.8`).
  - 값을 바꾸면 `npm test`를 다시 돌리고(값을 글자로 적은 시험은 없지만 관계를 보는 시험이 있다), Step 2~5를 다시 한다.
  - 바뀐 값을 설계 문서 §12에 표로 적는다(값 이름, 시안 값, 최종 값, 바꾼 까닭). 바꾸지 않았으면 "시안 값 그대로"라고 적는다.

- [ ] **Step 7: 서버 끄고 되돌리기** — Task 0의 Step 7과 같다.

- [ ] **Step 8: 기록 커밋**

```bash
git add docs/superpowers/specs/2026-11-11-light-and-material-design.md
git commit -m "docs(빛과 재질 설계): 구현 뒤 화면 확인 결과와 최종 값(§12)" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

(값을 조정했으면 `src/scene/look/lookConfig.ts`도 함께 넣는다.)

- [ ] **Step 9: MOON에게 보이기** — 비교 그림(`sheet-new-hero`, `top`, `north`, `lifttop`, `inst-panel`)과 통과 기준 표를 보인다. 합치기·재배포는 MOON이 "브랜치 합쳐"·"재배포해"라고 할 때만 한다.

---

### Task 12: 마무리

- [ ] **Step 1: 최종 코드 검토** — 검토 에이전트 하나를 붙인다. 중점:
  - 채점·기록 쪽이 바뀌지 않았는가(`git diff --stat e1d36c2..HEAD -- src/domain src/delivery src/records` → `src/records/researchBundle.ts` 1줄뿐: 설명서 글).
  - 과제 진행에 따라 바뀌는 빛·그림자가 없는가(안내 없음 원칙, §5-3).
  - 주 묶음에 `postprocessing`이 들어가지 않는가.
  - 굽기가 실패해도 실습이 되는가(`FloorShadowBake`의 `try`/`finally`가 숨긴 메시·렌더러 상태를 모두 되돌리는가).
- [ ] **Step 2: 브랜치 마무리** — superpowers:finishing-a-development-branch. main 합치기는 MOON이 "브랜치 합쳐"라고 할 때, 공개판은 "재배포해"라고 할 때만. 서버(Supabase) 변경은 없다.
- [ ] **Step 3: MOON에게 남길 말**
  - 실기기 확인 네 가지(§7.3): 들어갈 때·리프트를 올린 뒤 멈칫하는지, 태블릿 화면 인상, 계측부 읽힘, `?aa=1` 비교.
  - Hermes에게 전할 말: "0.3.3-demo부터 조명·바닥 겉모습 변경, 채점·기록 불변."
