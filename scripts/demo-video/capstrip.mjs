// caps.json → 자막 띠 PNG(1280x64)와 ffmpeg 명령 인자 만들기
import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const [DIR] = process.argv.slice(2);
const { t0, end, caps } = JSON.parse(fs.readFileSync(`${DIR}/caps.json`));
const segs = []; caps.forEach((c, i) => { const a = Math.max(0, c.t - t0), z = (i + 1 < caps.length ? caps[i + 1].t : end) - t0; if (c.text) segs.push({ a, z, text: c.text }) });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 64 });
for (const [i, s] of segs.entries()) {
  await p.setContent(`<body style="margin:0;background:#0a1428;height:64px;display:flex;align-items:center;justify-content:center;color:#fff;font:600 24px -apple-system,'Apple SD Gothic Neo',sans-serif">${s.text.replace(/</g, '&lt;')}</body>`);
  await p.screenshot({ path: `${DIR}/cap${i}.png` }); s.file = `cap${i}.png`;
}
await b.close();
const inputs = segs.flatMap((s) => ['-i', s.file]);
let f = `[0:v]fps=30,pad=1280:784:0:0:color=0x0a1428[v0]`;
segs.forEach((s, i) => { f += `;[v${i}][${i + 1}:v]overlay=0:720:enable='between(t,${s.a.toFixed(2)},${s.z.toFixed(2)})'[v${i + 1}]` });
f += `;[v${segs.length}]format=yuv420p[out]`;
fs.writeFileSync(`${DIR}/ff.json`, JSON.stringify(['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt', ...inputs, '-filter_complex', f, '-map', '[out]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-movflags', '+faststart', 'demo.mp4']));
console.log(segs.map((s) => `${s.a.toFixed(1)}-${s.z.toFixed(1)} ${s.text}`).join('\n'));
