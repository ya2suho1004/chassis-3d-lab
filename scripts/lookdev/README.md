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
