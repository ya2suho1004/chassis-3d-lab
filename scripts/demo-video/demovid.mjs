// 시연 예비 영상 — 공개 주소, 「기록 없이 하기」, 최소회전반경 사례 1·안내 있음, 게임 화면 그대로 녹화.
// GET 외 요청은 모두 막고 적어 둔다(서버 기록 0). 화면 위 자막은 녹화용으로만 끼워 넣는 것(앱 변경 아님).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [URL, OUT] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1280, H = 720;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`] });
const p = await b.newPage(); await p.setViewport({ width: W, height: H });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)) });
const blocked = []; await p.setRequestInterception(true);
p.on('request', (r) => { if (r.method() !== 'GET') { blocked.push(r.method() + ' ' + r.url().slice(0, 90)); r.abort() } else r.continue() });
const log = []; const t0 = Date.now(); const mark = (s) => log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
const X = async (xp, n = 60) => { for (let i = 0; i < n; i++) { const [el] = await p.$$('xpath/' + xp); if (el) return el; await sleep(250) } throw new Error('not found ' + xp) };
const click = async (xp, wait = 600) => { await (await X(xp)).click(); await sleep(wait) };
const btn = (t) => `.//button[contains(normalize-space(.), "${t}")]`;
const caps = []; const cap = async (text) => { caps.push({ t: Date.now() / 1000, text }) };
const shot = (n) => p.screenshot({ path: `${OUT}/k_${n}.png` });
const act = async (wait = 1800) => { // 안내 있음: 다음 할 일 버튼(힌트 제외) 하나 누르기
  const el = await X('.//div[contains(@class,"g-actions")]/button[not(contains(., "힌트"))]'); const t = await el.evaluate((e) => e.textContent); await el.click(); mark('act ' + t); await sleep(wait); return t };
const closeToast = async () => { const x = await p.$('.g-toast .g-x'); if (x) { await x.click(); await sleep(300) } };

fs.mkdirSync(`${OUT}/f`, { recursive: true });
const cdp = await p.createCDPSession(); const frames = []; let fn = 0;
cdp.on('Page.screencastFrame', (f) => { const file = `${OUT}/f/${String(fn++).padStart(6, '0')}.jpg`; fs.writeFileSync(file, Buffer.from(f.data, 'base64')); frames.push({ file, t: f.metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}) });
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
mark('rec start');
await cap('섀시 가상 실습장 — 기록 없는 실습 흐름 (시연 예비 영상 · AI 교관 장면 없음)'); await sleep(3200);
await p.mouse.click(W / 2, H / 2); mark('intro click'); await sleep(3500);
await cap(''); await X('.//button[contains(., "기록 없이 하기")]'); await sleep(800); await shot('start');
await cap('① 시작 화면 — 과제(최소회전반경 사례 1)와 안내 있음 고르기');
await click('.//label[contains(., "최소회전반경 측정 및 판정 — 사례 1")]/input', 1500);
await click(btn('기록 없이 하기'), 1500); mark('norecord');
await cap('② 캐릭터 만들기 — 체형·머리·색·조합형 닉네임');
const sels = await p.$$('select');
for (const [i, want] of [[0, '씩씩한'], [1, '정비사']]) { const v = await sels[i].evaluate((el, w) => [...el.options].find((o) => o.text.trim() === w)?.value, want); if (v != null) { await sels[i].select(v); await sleep(700) } }
for (const t of ['체형 2', '단발']) { const [e] = await p.$$(`xpath/.//button[normalize-space(.)="${t}"]`); if (e) { await e.click(); await sleep(1200) } }
await sleep(2500); await shot('avatar');
await click(btn('이대로 시작'), 500); mark('lab loading');
await cap('③ 실습장 준비');
for (let i = 0; i < 120 && await p.$('.g-loading'); i++) await sleep(500);
mark('lab loaded'); await sleep(1500);
const g = await p.$$('xpath/.//div[contains(@class,"g-guide")]//button'); if (g[0]) { await sleep(1500); await g[0].click(); await sleep(800) }
await cap('④ 실습장 둘러보기 — 교관에게 가서 과제 받기'); await shot('lab'); await sleep(1500);
await click('.//div[contains(@class,"g-quest-btns")]/button[normalize-space(.)="교관에게"]', 7000); mark('at npc');
const aim = await p.$('.g-aim'); if (aim) { await aim.click(); await sleep(1000) }
else for (const [x, y] of [[641, 280], [640, 300], [683, 380], [636, 312]]) { if (await p.$('.g-say')) break; await p.mouse.click(x, y); await sleep(1200) }
await X('.//span[contains(@class,"g-say")]'); await sleep(2500); await shot('npc');
for (let i = 0; i < 4 && await p.$('.g-more'); i++) { await p.click('.g-bubble'); await sleep(2600) }
await click(btn('과제 받기'), 2200); await click(btn('시작하기'), 1500); mark('task received');
await cap('⑤ 안내 있음 — 다음 할 일이 화면에 보임'); await shot('task'); await sleep(2000);
await act(); await closeToast(); // 1 보호구
await cap('⑥ 측정 차량으로 이동');
await click('.//div[contains(@class,"g-quest-btns")]/button[contains(., "최소회전반경 측정 차량")]', 7000); mark('at car');
await cap('⑦ 단계 수행 — 시동 OFF·측정판·회전 방향·핸들 끝까지');
for (let i = 0; i < 4; i++) { await act(2000); await closeToast() }
await shot('steered');
await cap('⑧ 측정판 보기 — 좌·우 바퀴 최대 조향각 읽기');
await click(btn('측정판 보기'), 3500); await shot('tt_left');
await click(btn('우측 바퀴'), 3500); await shot('tt_right');
await click('.//div[contains(@class,"g-ttbar")]/button[contains(., "닫기")]', 1200);
await cap('⑨ 작업 목록에 읽은 값 입력');
await click('.//div[contains(@class,"g-quest-btns")]/button[normalize-space(.)="작업 목록"]', 1200);
await p.type('input[aria-label="좌측 바퀴 조향각"]', '35', { delay: 120 }); await click('.//input[@aria-label="좌측 바퀴 조향각"]/following::button[1]', 900);
await p.type('input[aria-label="우측 바퀴 조향각"]', '30', { delay: 120 }); await click('.//input[@aria-label="우측 바퀴 조향각"]/following::button[1]', 1500);
await click('.//button[@aria-label="작업 목록 닫기"]', 800);
await act(); await closeToast(); // 6 읽기
await act(); await closeToast(); // 7 직진 복귀
await cap('⑩ 바깥쪽 바퀴(30°)로 최소회전반경 산출: 2.7 ÷ sin30° + 0.1 = 5.5 m → 판정');
await click('.//div[contains(@class,"g-quest-btns")]/button[normalize-space(.)="작업 목록"]', 1200);
await p.type('input[aria-label="최소회전반경"]', '5.5', { delay: 150 }); await click('.//input[@aria-label="최소회전반경"]/following::button[1]', 1000);
await click('.//input[@name="verdict"]/parent::label[contains(., "양호")]/input', 800);
await click('.//td[contains(., "기준 이하이면 양호")]/following-sibling::td//button[contains(., "입력")]', 1500); await shot('inputs');
await click('.//button[@aria-label="작업 목록 닫기"]', 800);
await act(); await closeToast(); // 8 산출·판정
await cap('⑪ 교관에게 검사 받기');
await click('.//div[contains(@class,"g-quest-btns")]/button[normalize-space(.)="교관에게"]', 7000);
const aim2 = await p.$('.g-aim'); if (aim2) { await aim2.click(); await sleep(1000) }
else for (const [x, y] of [[641, 280], [640, 300], [683, 380], [636, 312]]) { if (await p.$('.g-say')) break; await p.mouse.click(x, y); await sleep(1200) }
for (let i = 0; i < 4 && await p.$('.g-more'); i++) { await p.click('.g-bubble'); await sleep(2200) }
await click(btn('검사 받기'), 3000); mark('inspected');
await cap('⑫ 결과 — 기록 없이 한 수행이라 저장·전송하지 않음'); await shot('result'); await sleep(4000);
await p.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' })); await sleep(3500);
await cap(''); await sleep(800);
const stopT = Date.now() / 1000; await cdp.send('Page.stopScreencast'); mark('rec stop');
const lines = []; for (let i = 0; i < frames.length; i++) { const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : Math.max(1, stopT - frames[i].t); lines.push(`file '${frames[i].file}'`, `duration ${Math.max(d, 0.001).toFixed(4)}`) }
lines.push(`file '${frames[frames.length - 1].file}'`); fs.writeFileSync(`${OUT}/list.txt`, lines.join('\n'));
const span = frames.length ? frames[frames.length - 1].t - frames[0].t : 0;
fs.writeFileSync(`${OUT}/caps.json`, JSON.stringify({ t0: frames[0]?.t, end: stopT, caps }));
log.push(`frames ${frames.length}, span ${span.toFixed(1)}s, avg fps ${(frames.length / span).toFixed(1)}`);
const h1 = await p.$eval('h1', (e) => e.textContent).catch(() => null);
console.log(JSON.stringify({ errs, blocked, h1, log }, null, 1));
await b.close();
