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
/** 한 화면의 WebGL 그리기 호출·삼각형 수, 그리고 그래픽 장치에 새로 만든 것(그림·그림판·셰이더·버퍼)의 누적 수 */
const GL_STATS = `(() => { if (window.__glStats) return; const st = { frames: 0, last: { calls: 0, tris: 0 }, hist: [], made: { textures: 0, framebuffers: 0, programs: 0, buffers: 0 } }; window.__glStats = st; let fc = 0, ft = 0;
  const wrap = (p) => { if (!p) return; const de = p.drawElements, da = p.drawArrays, dei = p.drawElementsInstanced, dai = p.drawArraysInstanced;
    for (const [fn, key] of [['createTexture', 'textures'], ['createFramebuffer', 'framebuffers'], ['createProgram', 'programs'], ['createBuffer', 'buffers']]) { const orig = p[fn]; p[fn] = function () { st.made[key]++; return orig.apply(this, arguments) } }
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
  const bakes = () => bakeCount(b)
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
    await hud(b, false); await sleep(300); await b.shot(join(outDir, `${name}-${quality}-toggled-back.png`)); await hud(b, true)
    await b.click('button[aria-label="메뉴"]'); await sleep(300); await b.click('.g-menu button', '기본 화면(패널)으로'); await b.waitFor(`!!document.querySelector('main.lab')`); await sleep(3500)
    out.steps.push(['기본 화면', await bakes()])
    await b.click('button.link', '게임 화면으로'); await b.waitFor(`!!document.querySelector('main.game')`); await sleep(3500)
    out.steps.push(['게임 화면', await bakes()])
  } catch (e) { out.error = String(e?.stack ?? e).slice(0, 800) } finally { Object.assign(out, report(b)); await b.close() }
  console.log(JSON.stringify(out))
}

/** 반사광 그리기 횟수를 세게 한다: 정육면체 그림의 첫 면을 그리기 시작할 때마다 센다 */
const ENV_HOOK = `(async () => { ${R3F} if (!window.__envCaptures) { const c = (window.__envCaptures = { n: 0 }), gl = st.gl, set = gl.setRenderTarget.bind(gl); gl.setRenderTarget = (rt, face, mip) => { if (rt && rt.isWebGLCubeRenderTarget && (face ?? 0) === 0) c.n++; return set(rt, face, mip) } } return true })()`
const bakeCount = async (b) => ((await b.ev(`window.__lookdev ? window.__lookdev.bakes : null`)) ?? []).length

/** 걷는 동안, 한 번만 해야 하는 일(실습장 반사광 그리기·바닥 그림자 굽기)을 되풀이하지 않는지 본다. 고정 구도 촬영으로는 드러나지 않는 부담이다 */
async function walk(base, outDir, name, quality) {
  const b = await launch(outDir)
  const out = { name, quality }
  const captures = () => b.ev(`window.__envCaptures.n`)
  const bakes = () => bakeCount(b)
  try {
    await enterLab(b, base, quality)
    await b.ev(ENV_HOOK)
    const bake0 = await bakes()
    await sleep(2000)
    const idle = await captures(), t0 = Date.now()
    out.envCaptures = { idle, walking: 0 }
    // 빈 바닥 지점 세 곳(작업대 앞 두 곳, 최소회전반경 차량 앞)을 차례로 두 바퀴 걷는다.
    // 첫 바퀴는 처음 보이는 물체를 그래픽 장치에 올리느라 새로 만드는 것이 있다. 둘째 바퀴에서 새로 만든 것이 있으면 걷는 동안 무언가를 되풀이해 만드는 것이다
    const made = () => b.ev(`({ ...window.__glStats.made })`)
    let made1 = null
    for (let lap = 1; lap <= 2; lap++) {
      for (const [x, z] of [[16.6, 1.6], [16.6, 2.75], [2.6, 5.85]]) {
        await walkTo(b, x, z)
        out.envCaptures.walking = (await captures()) - idle
        out.walkSeconds = +((Date.now() - t0) / 1000).toFixed(1)
      }
      if (lap === 1) made1 = await made()
    }
    const made2 = await made()
    out.madeSecondLap = Object.fromEntries(Object.keys(made2).map((k) => [k, made2[k] - made1[k]]))
    out.bakes = { before: bake0, after: await bakes() }
  } catch (e) { out.error = String(e?.stack ?? e).slice(0, 800) } finally { Object.assign(out, report(b)); await b.close() }
  console.log(JSON.stringify(out))
}

/** 그래픽 장치 연결을 끊었다 되돌린다(기기 메모리가 모자랄 때 생기는 일). 한 번만 만들어 둔 것(반사광·구운 그림자)이 돌아오는지 본다 */
async function ctx(base, outDir, name, quality) {
  const b = await launch(outDir)
  const out = { name, quality }
  try {
    await enterLab(b, base, quality)
    await b.ev(ENV_HOOK)
    await hud(b, false); await setCam(b, CAMS.hero); await sleep(700)
    await b.shot(join(outDir, `${name}-${quality}-ctx-before.png`))
    const bake0 = await bakeCount(b)
    await b.ev(`(async () => { ${R3F} window.__ctxExt = st.gl.getContext().getExtension('WEBGL_lose_context'); window.__ctxExt.loseContext(); return true })()`)
    await sleep(1500)
    out.lost = await b.ev(`(async () => { ${R3F} return st.gl.getContext().isContextLost() })()`)
    await b.ev(`(window.__ctxExt.restoreContext(), true)`)
    await sleep(7000)
    out.restored = !(await b.ev(`(async () => { ${R3F} return st.gl.getContext().isContextLost() })()`))
    out.envCapturesAfter = await b.ev(`window.__envCaptures.n`)
    out.bakes = { before: bake0, after: await bakeCount(b) }
    await b.shot(join(outDir, `${name}-${quality}-ctx-after.png`))
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
else if (cmd === 'walk') await walk(a[0], dir(a[1]), a[2], a[3] === 'low' ? 'low' : 'high')
else if (cmd === 'ctx') await ctx(a[0], dir(a[1]), a[2], a[3] === 'low' ? 'low' : 'high')
else if (cmd === 'sheet') await sheet(dir(a[0]), a[1], a[2], a[3])
else if (cmd === 'colors') await colors(dir(a[0]), a[1])
else { console.log('사용: lookdev.mjs cams|inst|toggle|walk|ctx|sheet|colors … (scripts/lookdev/README.md)'); process.exit(1) }
process.exit(0)
