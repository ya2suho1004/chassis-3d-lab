# 시연 예비 영상 녹화 (docs/demo/시연_예비영상_11-10.mp4)

「기록 없이 하기」·최소회전반경 사례 1·안내 있음 흐름을 헤드리스 크롬(실제 GPU)으로 찍는다. GET 외 요청은 모두 막는다(서버 기록 0).
필요: 시스템 Chrome, ffmpeg, `puppeteer-core`(이 저장소 의존성에는 없음 — 임시 폴더에 설치해 실행).

```bash
node demovid.mjs "https://chassis-3d-lab.vercel.app/?q=high" out   # 또는 로컬 빌드 주소
sed -i '' "s#^file 'out/#file '#" out/list.txt                       # 목록 경로를 out 기준으로
node capstrip.mjs out && (cd out && node -e "require('child_process').execFileSync('ffmpeg', require('./ff.json'), {stdio:'inherit'})")
```
자막은 앱 화면을 가리지 않도록 영상 아래 64px 띠에 넣는다(1280×784).
