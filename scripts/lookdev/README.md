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
node scripts/lookdev/lookdev.mjs walk   <주소> <출력폴더> <이름> <high|low> [guided]
node scripts/lookdev/lookdev.mjs ctx    <주소> <출력폴더> <이름> <high|low> [guided]
node scripts/lookdev/lookdev.mjs goal   <주소> <출력폴더> <이름> <high|low> [guided|unguided]
node scripts/lookdev/lookdev.mjs sound  <주소> <출력폴더> <이름>
node scripts/lookdev/lookdev.mjs sheet  <출력폴더> <지금이름> <새이름> <구도>
node scripts/lookdev/lookdev.mjs colors <출력폴더> <이름>
```

| 명령 | 하는 일 | 나오는 것 |
|---|---|---|
| `cams` | 고정 구도 10개(`hero top tester carclose lifttop turncar lifts graze north bench`)를 찍는다 | `<이름>-<품질>-<구도>.png`, `<이름>-<품질>-cams.json`(그리기 호출 수·삼각형 수·굽기 통계·오류) |
| `inst` | 계측부 가까이 보기. `disc` 다이얼 게이지 2종, `panel` 계기 화면, `turn` 측정판 좌·우 | `<이름>-<품질>-inst-….png` |
| `toggle` | 품질을 두 번 바꾸고 기본 화면에 다녀온다(부품이 붙고 떨어질 때 오류가 없는지, 그때마다 바닥 그림자를 다시 굽는지) | 표준 출력(JSON: 단계별 굽기 횟수·오류), `<이름>-<품질>-toggled.png`(바꾼 뒤), `…-toggled-back.png`(되돌린 뒤) |
| `walk` | 빈 바닥 세 곳을 두 바퀴 걷는 동안, 한 번만 해야 하는 일(실습장 반사광 그리기·바닥 그림자 굽기)을 되풀이하지 않는지, 둘째 바퀴에서 그래픽 장치에 새로 만드는 것(그림·그림판·셰이더·버퍼)이 없는지 센다 | 표준 출력(JSON: `envCaptures.walking`이 0, `bakes`가 그대로, `madeSecondLap`의 `textures`·`framebuffers`·`programs`가 0이고 `buffers`가 100 이하여야 한다) |
| `ctx` | 그래픽 장치 연결을 끊었다 되돌린다(기기 메모리가 모자랄 때 생기는 일). 반사광과 구운 그림자가 돌아오는지 본다 | 표준 출력(JSON: `envCapturesAfter` 1, 굽기 횟수 +1), `<이름>-<품질>-ctx-before.png`, `…-ctx-after.png` |
| `goal` | 목적지 표식·방향 화살표·누름 고리(손맛 설계 `docs/superpowers/specs/2026-11-12-feel-design.md` §4.3·§4.5). `guided`(기본)는 안내 있음으로 과제를 받아 첫 단계를 끝낸 뒤 표식을 다섯 구도로 찍고, 여덟 방향에서 화살표가 HUD와 겹치지 않는지, 표식이 그리기 호출을 몇 번 더하는지, 장비를 누르면 고리가 떴다 사라지는지 본다. `unguided`는 같은 흐름에서 표식 물체와 화살표가 하나도 없는지 센다 | `<이름>-<품질>-goal-….png`, `<이름>-<품질>-goal.json`(`unguided`는 `…-goal-unguided.json`) |
| `sound` | 소리 엔진(`src/scene/sound.ts`)의 소리를 화면 밖 장치에 그려 세기·길이·음높이 중심·300 Hz 아래 몫을 잰다(소리를 내지 않는다). 이어지는 소리를 멈출 때와 소리를 끌 때 세기가 커지거나 남지 않는지도 잰다(`stops`). 한도(손맛 설계 §4.4)를 넘으면 실패로 끝난다 | 표준 출력(JSON), `<이름>-sound.json` |
| `sheet` | 지금·새 판 × 높음·낮음 2×2 비교 그림 | `sheet-<새이름>-<구도>.png` |
| `colors` | 계기 화면 숫자와 측정판 종이색을 재서 원본 색과 견준다 | 표준 출력(JSON) |

## 겉모습을 바꿀 때

1. 바꾸기 전 판을 `base`라는 이름으로 찍는다(두 품질, `cams`와 `inst` 세 가지).
2. 바꾼 뒤 `new`라는 이름으로 같은 것을 찍는다.
3. `sheet`로 비교 그림을 만들고 `colors`로 계측부 색을 잰다. `toggle`로 품질 바꾸기·화면 바꾸기에서 오류가 없는지 본다.
4. `walk`와 `ctx`로, 고정 구도 촬영으로는 드러나지 않는 것(걷는 동안의 숨은 부담, 연결이 끊겼다 돌아온 뒤의 화면)을 본다.
5. 한도(빛과 재질 설계 §6): 품질 낮음의 그리기 호출 수는 바꾸기 전 값 + 2 이하, 품질 높음은 +8% 이내. 콘솔 오류와 막힌 쓰기 요청은 0건.

`walk`와 `ctx`에 `guided`를 붙이면 과제를 받고 첫 단계를 끝내 목적지 표식이 떠 있는 채로 돌린다. 개발 서버를 오래 켜 둔 채 파일을 많이 바꿨으면 서버를 새로 띄운 뒤 확인한다(예전 파일을 내주는 일이 있었다).

출력 폴더는 `scripts/lookdev/out/`(.gitignore에 있음)이나 저장소 밖에 둔다. 구도 좌표는 `lookdev.mjs`의 `CAMS`에 있고, 배치가 바뀌면 거기를 고친다.
