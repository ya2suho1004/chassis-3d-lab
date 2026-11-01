# 최소회전반경 측정 과제 설계 (2026-11-02, 사용자 승인)

## 목적과 범위
- 제동력 측정 과제에 이어 **두 번째 정식 연구 과제**로 최소회전반경 측정을 넣는다. 두 학급 모두 수행하고, 수행 기록을 수집하며, 사전·사후 검사에도 문항이 들어간다.
- **11-04 13:00 IRB 제출 전**에 실제로 동작하는 과제(3D 조작·판정·기록·서버 접수·AI 교관 문맥)까지 만든다. 재배포는 사용자가 "재배포해"라고 할 때만 한다.
- 기존 제동력 과제의 동작·기록·시험은 바뀌지 않아야 한다(회귀 없음).

## 근거
- 교사 확인(사용자 = 실습 담당 교사 MOON, 2026-11-02 대화): L·r 값 제시, R 소수 첫째 자리(둘째에서 절사), 시동 끈 상태에서 조향, 사례 값, 8단계.
- NCS LM1506030326 조향장치 정비 p.73(정의·기준 12 m 이내·식), p.78~79(조작 점검 순서).
- 학교 답안지(`thesis/07_simulation/craftsman_exam/자동차섀시 답안지.pdf` 5-짝수, 드라이브 “자동차섀시 답안작성 연습1.pdf”): 기록 형식(회전 방향·좌우 바퀴 최대 조향각·기준값·측정값·산출 근거·판정), sin 30°~35° 표, 연습 문제 값.

## 과제 내용
| 순서 | stepId | 단계 | actionType | 검사 |
|---|---|---|---|---|
| 1 | `ppe` | 보호구 착용 확인 | confirm | 완료 시 s-ppe |
| 2 | `engineOff` | 시동 OFF 확인 | confirm | 완료 시 s-engine |
| 3 | `turntable` | 앞바퀴가 측정판 중앙에 있고 측정판이 0°인지 점검 | inspect | 선행 ppe·engineOff |
| 4 | `direction` | 지정된 회전 방향 확인 | confirm | 선행 turntable |
| 5 | `steer` | 핸들을 지정 방향 끝까지 돌림 | operate | 안전 s-ppe·s-engine(없으면 안전 차단), 선행 direction |
| 6 | `read` | 좌·우 바퀴 측정판 각도 판독·입력 | read | 응답 leftAngle·rightAngle |
| 7 | `return` | 바퀴를 직진으로 되돌림 | operate | 선행 read |
| 8 | `record` | 산출 근거·R·판정 기록 | submit | 응답 radius·vehicleCondition |

- 제시값: 축거 L 2.7 m, r 0.1 m, sin 30°~35° 표(sin 30°=0.5, 31°=0.5150, 32°=0.5299, 33°=0.5446, 34°=0.5592, 35°=0.5736), 지정 회전 방향.
- 응답: `leftAngle`·`rightAngle`(measurement, °, 정수), `radius`(calculation, m, 소수 첫째 자리 절사 `truncate1`), `vehicleCondition`(judgment, pass/fail).
- 기준값(정답): R = L ÷ sin(바깥쪽 바퀴 각) + r — **sin은 제시한 표 값**을 쓴다(학생과 같은 값). 좌회전이면 바깥쪽 = 우측 바퀴, 우회전이면 좌측 바퀴. 판정은 기재값(절사값) ≤ 12 m이면 양호(경계 포함).
- 사례 1 `case-left-35-30-2.7`: 좌회전, 좌 35°·우 30° → 2.7 ÷ 0.5 + 0.1 = 5.5 m 양호.
- 사례 2 `case-right-32-36-2.7`: 우회전, 좌 32°·우 36° → 2.7 ÷ 0.5299 + 0.1 = 5.195… → 5.1 m 양호.
- 피드백 문구: 제동력 과제의 0E 원칙(관찰하지 않은 상태를 단정하지 않음, 정답 숫자 미노출)으로 과제 파일에 따로 둔다. 무안내 모드는 제동력과 같은 정책(최초 응답 모두 저장 뒤 정오 설명, 안전 경고는 즉시).

## 구조 변경
1. **과제 데이터**: `src/data/tasks/task.min-turning-radius.case-lv1.json`·`-lv2.json`. `ApprovedTask.measurement`에 조향 필드(`turnDirection`, `leftAngleDeg`, `rightAngleDeg`, `wheelbaseM`, `kingpinOffsetM`, `sinTable`)와 `ruleset.radiusMaxM`를 선택 필드로 더한다. 제동력 필드는 그대로.
2. **판정**: `src/domain/turningJudge.ts`(순수 함수) — 바깥쪽 바퀴 고르기, 표 sin, 절사, 12 m 비교, 판정 불가 사유. `grading.createResponseSheet`가 taskId로 계산기를 고른다(제동력 경로는 그대로).
3. **엔진**: `RESPONSE_REQUIREMENTS`에 `anglesRead`·`radiusSubmitted` 추가, `engineOff` 완료 시 s-engine 충족. 제동력 전용 부수효과(motor·enter·off)는 그대로.
4. **기록 1.2.0**: `taskId` enum [`braking-force`, `min-turning-radius`], `calculationAnswers.unit` enum [`%`, `m`]. 앱은 제동력도 1.2.0으로 쓴다(1.1.0과 필드 동일). 서버는 1.0.0·1.1.0·1.2.0을 받는다. Supabase Edge Function 재배포 필요.
5. **AI 교관 문맥**: `taskContext.generated.json`에 두 번째 과제를 넣는다(정답 값 비노출 검사 유지).
6. **3D**: K3 모델의 `Wheel_FL`·`Wheel_FR`을 조향 단계에서 돌린다(안쪽 바퀴가 더 큼). 측정판 위에 각도 눈금판(CanvasTexture)과 바늘. 판독 단계에서 “📟 측정판 보기”로 좌·우 측정판을 가까이 본다. 과제 대상 장비 `min-turning-radius-01`을 interactive로.
7. **화면**: 과제 패널에 제시값(L·r·회전 방향·sin 표)과 응답 칸(좌·우 각도, R, 판정). 시작·교사 화면의 과제 사례 목록에 두 사례 추가.

## 시험
- 판정: 바깥쪽 바퀴, 표 sin, 절사(5.5 경계 포함), 12 m 경계, 잘못된 입력은 판정 불가.
- 엔진: 순서 차단, 시동 OFF 없이 조향 시 안전 차단·집계, 응답 없으면 미완료.
- 기록: 1.2.0 스키마 통과, 서버 코어가 1.2.0 수용, 제동력 기록 회귀.
- 기존 시험 전부 통과.
- 개발 서버에서 사례 1·2 처음부터 제출까지.

## IRB 인계(집필 Hermes)
- 연구 범위 문구, 수행 기록 수집 항목, 사전·사후 검사·전문가 타당화 도구 문항 추가 위치를 정리한 인계 문서를 `thesis/_meetings` 또는 IRB 폴더에 둔다. 원고 본문은 직접 고치지 않는다.

## 범위 밖
- 학생이 줄자로 축거를 재는 조작, 불량 사례, 실제 측정판 고정 핀 조작(장비 확인 뒤 추가).
