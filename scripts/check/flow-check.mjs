// 흐름 확인(사용: node flow-check.mjs <주소> <출력폴더> guided|unguided). 처음 작성: Codex 검토 A1·A2·A6·A8 화면 확인 — 로컬 빌드, 기본 화면(패널), 기록 모드 D-01(이 기기에만 저장, 서버 전송 없음).
// GET 외 요청은 모두 막는다(AI 질문·기록 전송 0건). 질문 창은 열기만 하고 보내지 않는다.
import puppeteer from 'puppeteer-core';
const [URL, OUT, MODE] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 120000 });
const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)) });
const blocked = []; await p.setRequestInterception(true);
p.on('request', (r) => { if (r.method() !== 'GET') { blocked.push(r.method() + ' ' + r.url().slice(0, 80)); r.abort() } else r.continue() });
await p.setViewport({ width: 1280, height: 860 });
await p.evaluateOnNewDocument(() => localStorage.setItem('chassis.intro.v1', JSON.stringify({ seen: true, off: true })));
await p.goto(URL, { waitUntil: 'domcontentloaded' }); await sleep(1000);
const X = async (xp) => { for (let i = 0; i < 40; i++) { const [el] = await p.$$('xpath/' + xp); if (el) return el; await sleep(300) } throw new Error('not found ' + xp) };
const click = async (xp, wait = 400) => { await (await X(xp)).click(); await sleep(wait) };
const btn = (t) => `.//button[contains(normalize-space(.), "${t}")]`;
const out = { mode: MODE };
await p.type('input[aria-label="익명 코드"]', 'D-01');
await click('.//label[contains(., "최소회전반경 측정 및 판정 — 사례 1")]/input');
if (MODE === 'unguided') await click('.//input[@name="mode"]/parent::label[contains(., "안내 없음")]/input');
await click(btn('과제 수령하러 가기'), 800);
await click(btn('이대로 시작'), 1500);
for (let i = 0; i < 60; i++) { if (!(await p.$('.g-loading'))) break; await sleep(500) }
const guide = await p.$$('xpath/.//div[contains(@class,"g-guide")]//button'); if (guide[0]) { await guide[0].click(); await sleep(300) }
await click('.//button[@aria-label="메뉴"]'); await click(btn('기본 화면(패널)으로'), 800);
// A8: 질문 창 안내(열기만)
const [openChat] = await p.$$('xpath/' + btn('질문 창 열기'));
if (openChat) { await openChat.click(); await sleep(300); out.chatNotice = await p.$eval('.chatnotice', (e) => e.innerText).catch(() => null) }
await click(btn('교관에게 가기'), 7000);
await click(btn('교관과 대화하기'), 500);
await click(btn('과제 수령'), 1000);
const KW = { 1: '보호구', 2: '시동이 꺼져', 3: '측정판 중앙', 4: '회전 방향을 확인', 5: '끝까지 돌린다', 6: '최대 조향각을 읽어', 7: '직진 상태로', 8: '산출하고' };
const doStep = async (n) => { await click(`(.//li[contains(., "${KW[n]}")]//button[normalize-space(.)="수행"])[1]`, 500) };
await doStep(1);
// A1: 다음 단계 장비 안내(.need) — 안내 있음에만
out.needAfterPpe = await p.$eval('.need', (e) => e.innerText).catch(() => null);
await click(btn('최소회전반경 측정 차량로 가기'), 7000);
for (const n of [2, 3, 4]) await doStep(n); await sleep(1500); await p.screenshot({ path: `${OUT}/${MODE}_before_steer.png` }); await doStep(5);
await sleep(1500); await p.screenshot({ path: `${OUT}/${MODE}_steered.png` }); // A6: 기본 화면 바퀴 조향
await p.type('input[aria-label="좌측 바퀴 조향각"]', '35'); await click('.//input[@aria-label="좌측 바퀴 조향각"]/following::button[1]');
await p.type('input[aria-label="우측 바퀴 조향각"]', '30'); await click('.//input[@aria-label="우측 바퀴 조향각"]/following::button[1]');
await doStep(6); await doStep(7);
await p.type('input[aria-label="최소회전반경"]', '5.5'); await click('.//input[@aria-label="최소회전반경"]/following::button[1]');
await click('.//input[@name="verdict"]/parent::label[contains(., "양호")]/input'); await click('.//td[contains(., "기준 이하이면 양호")]/following-sibling::td//button[contains(., "입력")]');
await doStep(8);
await click(btn('NPC 검사 받기'), 2000);
// A2: 결과표
out.h1 = await p.$eval('h1', (e) => e.textContent);
out.resultTable = await p.$$eval('table.sheet tbody tr', (rows) => rows.map((r) => r.innerText.replace(/\s+/g, ' ')));
out.summary = await p.$$eval('.result li', (lis) => lis.slice(0, 6).map((l) => l.innerText));
out.detailsClosed = await p.$eval('details', (d) => !d.open).catch(() => 'no details');
out.nextNote = await p.$$eval('p.small', (ps) => ps.map((x) => x.innerText).find((t) => t.includes('다음 학생')) ?? null);
await p.screenshot({ path: `${OUT}/${MODE}_result.png`, fullPage: true });
console.log(JSON.stringify({ errs, blocked, ...out }, null, 1));
await b.close();
