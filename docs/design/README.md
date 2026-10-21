# 자동차섀시정비 3D 가상 실습장 설계 묶음

2026-10-16 설계 검토본 v0.1 → **2026-10-20 현장자료 반영본 v0.2** · 실행 앱은 아직 만들지 않았습니다. 2026-10-16 원본은 `../design-v0.1/`에 그대로 보존했고, 바뀐 곳과 근거는 [10 변경 기록](docs/10_CHANGELOG_2026-10-20.md)에 있습니다. 최신 사용자 확인은 `../01_CURRENT_STATE.txt`와 `../evidence/teacher-confirmed.json`이 우선합니다.

**먼저 [00 프로젝트 개요](docs/00_PROJECT_BRIEF.md)를 읽어 주세요.** 실제 학교 실습장 배치를 최대한 재현하고, 첫 작동 과제는 제동력 측정 및 판독 하나로 제한하는 설계입니다. 사진 44장과 손 스케치 1장으로 주요 장비의 상대 배치는 정리됐지만(`../review/layout-review.txt`), 실측 치수·차량/시험기 기준·연구운영 세부는 교사와 확인할 항목으로 남아 있습니다(`layoutConfirmed=false`, `researchEligible=false`).

## 교사가 먼저 볼 세 문서

1. [프로젝트 개요](docs/00_PROJECT_BRIEF.md): 추천안과 확인할 사항.
2. [게임 흐름·화면 설명](docs/02_GAME_FLOW_AND_STORYBOARD.md): 학생이 무엇을 하며 어떤 피드백을 받는지.
3. [실제 배치 조사표](docs/08_ASSET_AND_COPYRIGHT.md): 사진·스케치·치수·장비 정보를 어떻게 준비할지.

## 요청한 11개 문서

| 파일 | 내용 |
|---|---|
| [00_PROJECT_BRIEF.md](docs/00_PROJECT_BRIEF.md) | 목적·범위·확정 결정·추천·성공 기준 |
| [01_REQUIREMENTS.md](docs/01_REQUIREMENTS.md) | 학생/교사/연구/비기능 요구사항과 수용 기준 |
| [02_GAME_FLOW_AND_STORYBOARD.md](docs/02_GAME_FLOW_AND_STORYBOARD.md) | NPC·화면·게임·저장·접수 상태 전이 |
| [03_TECH_ARCHITECTURE.md](docs/03_TECH_ARCHITECTURE.md) | 기술 대안·책임·폴더·교사운영·성능·배포 |
| [04_TASK_AND_LOG_SCHEMA.md](docs/04_TASK_AND_LOG_SCHEMA.md) | 과제·측정·계산·판정·로그·API 계약 |
| [05_RESEARCH_DATA_PIPELINE.md](docs/05_RESEARCH_DATA_PIPELINE.md) | 선저장·접수·멱등·재전송·CSV·IRB |
| [06_MVP_ROADMAP.md](docs/06_MVP_ROADMAP.md) | 단계별 작업·완료 증거·위험·검증 |
| [07_DESIGN_PRINCIPLE_TRACEABILITY.md](docs/07_DESIGN_PRINCIPLE_TRACEABILITY.md) | 원문 논문 쪽수와 기능·검증 연결 |
| [08_ASSET_AND_COPYRIGHT.md](docs/08_ASSET_AND_COPYRIGHT.md) | 실제 공간 조사·에셋·라이선스·NCS 사용 (2026-10-20 조사표 채움) |
| [10_CHANGELOG_2026-10-20.md](docs/10_CHANGELOG_2026-10-20.md) | 2026-10-20 현장자료 반영 변경 기록과 근거 |
| [11_실측_항목_목록.md](docs/11_실측_항목_목록.md) | 교사 눈검토 뒤 확정한 실측 항목 A~G |
| [layout-draft-v0.html](docs/layout-draft-v0.html) | 상대 배치 개념도 v0(교사 눈검토 완료본, 보존) |
| [layout-draft-v1.html](docs/layout-draft-v1.html) | 상대 배치 개념도 v1(방위·열린 면·시작점 반영, 치수 없음, 재확인 체크표) |
| [layout-draft-v1-1.html](docs/layout-draft-v1-1.html) | 개념도 v1-1(ABS 돌출·44번 바깥 도형 수정, 새 표시 전용 확인 표) — 현재 교사 확인용 |
| [layout-draft-v2-brake-local.html](docs/layout-draft-v2-brake-local.html) | 제동력 구역 국소 미터 도면(부분 실측 2026-10-21, 확인 필요 표시) |
| [layout.surveyed.partial.json](docs/layout.surveyed.partial.json) | 부분 실측 기록(layout.schema 형식 통과, 승인 아님) |
| [teacher-check-0A-brake.html](docs/teacher-check-0A-brake.html) | 0A 교사 확인지(제동력 조작 순서·단위·기준·절사·축) — 2026-10-21 제출 완료 |
| [task.braking-force.case-lv1.json](docs/task.braking-force.case-lv1.json) / [case-lv2](docs/task.braking-force.case-lv2.json) | 교사 승인 과제 데이터(1.1.0 제안본 기준) |
| [12_0D_준비검토.md](docs/12_0D_준비검토.md) | 0D 실행 준비 검토표(구현 시작 가능 범위) |
| [CLAUDE.md](CLAUDE.md) | 구현 에이전트가 지켜야 할 범위·금지·검증·커밋 원칙 |
| [IMPLEMENTATION_PROMPT_FOR_CLAUDE_CODE.md](IMPLEMENTATION_PROMPT_FOR_CLAUDE_CODE.md) | 구현을 시작할 때 사용할 단계별 인수 프롬프트 |

추가로 [출처·결정 기록](docs/09_SOURCE_AUDIT_AND_DECISIONS.md), [자료 해시 목록](SOURCE_MANIFEST.json), [설계 검증 결과](DESIGN_VALIDATION.md)를 제공합니다. `contracts/`에는 검토용 JSON Schema 5개, `examples/`에는 미승인 설정·배치와 합성 기록 예시 5개가 있습니다. 실제 학생 기록·비밀·원문 PDF·원본 소스 전체는 포함하지 않습니다.

## 예시를 사용하는 주의점

과제·배치 예시의 `null`은 빠뜨린 구현값이 아니라 **아직 확인되지 않은 값**입니다. 도면·실측·교사 승인 없이 임의로 채우지 않습니다. 예시의 날짜는 형식 검증을 위한 2000-01-01이며 실제 수업·연구 일정이 아닙니다. 학생 코드는 가짜 `D-00`입니다. UUID도 고정 합성 예시이므로 실제 수행에서는 새 UUID를 생성합니다.

`record.demo-aborted.json`은 미승인 설정 때문에 연구에 사용할 수 없는 중단 기록입니다. `delivery.pending.json`과 `submission.demo-request.json`은 계약 예시이며 실제 저장·전송이 발생했다는 증거가 아닙니다. 정상 접수 receipt 예시는 실제 서버가 없으므로 만들지 않았습니다.

스키마 형식 검사는 실제 절차·기준·배치 승인이나 저장·접수 실행 검증을 대신하지 않습니다. 연구용 진입은 콘텐츠·배치·연구사용·운영정책의 별도 검토가 필요합니다.

## 추천과 다음 한 단계

추천 구조는 React/Vite/TypeScript + Three/R3F, IndexedDB, 같은 출처 제출 중계, Apps Script와 교사 비공개 Sheet입니다. Cloudflare Pages+Functions는 호스팅 우선 제안이며 설정·배포·운영비 검증은 하지 않았습니다.

평면 스케치와 사진 묶음은 2026-10-20에 확보했습니다(`../review/`, `../evidence/`). 가장 먼저 할 일은 **교사가 눈으로 확인할 상대 배치 초안을 검토하고, 실측 치수·개방 연결부·학생 시작점과 제동력 시험기의 조작 순서·판정 기준을 확정하는 것**입니다. 1차 협업 결과는 `../collaboration/CLAUDE_REVIEW.txt`, 다음 단계 추천은 `../collaboration/NEXT_STEP.txt`에 있습니다. 구현은 설계 검토 후 인수 프롬프트의 0단계부터 시작합니다.

## 2026-10-21 Codex 계약·독립 검토

- [13 과제·등록 사전 검토](docs/13_TASK_DATA_REVIEW_AND_VOCABULARY.md)
- [14 부분 실측 검토](docs/14_PARTIAL_SURVEY_REVIEW.md)
- [15 직접 제출 수신·7개 시험 묶음](docs/15_DIRECT_SUBMISSION_TEST_DESIGN.md)
- [16 계약1.1.0·호환 결정](docs/16_CONTRACT_1_1_DECISIONS_AND_COMPATIBILITY.md)
- [검증 결과](DESIGN_VALIDATION.md):로컬계약검증과실제제품검증을구분한다.
- [Claude 회신](../collaboration/CODEX_RETURN_2026-10-21_CONTRACTS.txt)

기존1.0.0 계약·예시는legacy/1.0.0에보존했다. 상위pending인과제를운영승인완료로읽지않는다.
