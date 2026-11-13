# 캐릭터 만들기·닉네임 설계 (2026-11-03, 사용자 승인)

## 목적
- 게임처럼 처음에 자기 캐릭터를 만들고 닉네임을 정하게 해 몰입을 높인다.
- 연구 기록·서버·AI에는 아무것도 더하지 않는다(IRB 원고 변경 없음).

## 결정(사용자 2026-11-02~03)
| 항목 | 결정 |
|---|---|
| 만드는 때 | 익명 코드별로 처음 한 번. 이 기기에 그 코드의 캐릭터가 없을 때만 나오고, 실습장 메뉴(≡) "캐릭터 다시 꾸미기"로 바꿀 수 있다. 비기록 모드는 매번 만들고 저장하지 않는다 |
| 닉네임 | 앞말 12개 × 뒷말 12개에서 골라 붙이고 🎲로 무작위로 뽑는다. 직접 입력 없음 |
| 꾸미기 | 체형 2(화면 표시 "체형 1·체형 2", 남학생형 1.45 m·여학생형 1.37 m — 2026-11-13 새 비례로 바꿈, 처음에는 1.72 m·1.62 m), 머리 모양 4, 머리색 5, 피부색 5, 눈 색 4. 실습복은 친환경자동차과 색으로 고정 |
| 모델 | A안: 체형별 glb 2개(`character.glb`·`character-b.glb`), 각 파일에 머리 부품 4개(`Hair_Short`·`Hair_Fringe`·`Hair_Bob`·`Hair_Tied`)를 넣고 앱이 하나만 보인다 |

## 동작
- **흐름:** 시작 화면 → (일반: 익명 코드 확인) → 캐릭터 만들기(필요할 때) → 실습장.
- **저장:** localStorage `chassis.avatar.v1` = `{ [익명코드]: AvatarProfile }`.
  - 이 기기에만 둔다.
  - 기록 payload·서버·AI 요청에는 넣지 않는다.
  - 읽을 때 값을 검사해서 모르는 값이면 무시하고 다시 만들게 한다.
- **보이는 곳:**
  - 실습장 왼쪽 위 표시가 "닉네임 · A-01"이 된다(비기록이면 "닉네임 · 기록 안 됨").
  - NPC 교관 첫 인사에서 닉네임으로 부른다.
  - 결과 화면 제목에 닉네임이 들어간다.
- **NPC 교관:** 꾸미기와 상관없다(짧은 머리, 짙은 남색 옷). 2026-11-13부터 교관 전용 모델(`character-npc.glb`, 키 1.62 m, 형광 연두 조끼)을 쓴다(설계 `2026-11-13-character-and-motion-design.md`).
- **모양:** 모두 특정 인물을 닮지 않은 일반형이다.

## 구조
- `src/app/avatar.ts`(순수)
  - 선택지 목록: `BODY`, `HAIR_STYLE`, `HAIR_COLOR`, `SKIN`, `EYE`, `NICK_FRONT`, `NICK_BACK`
  - 타입 `AvatarProfile`
  - 함수 `defaultProfile`·`randomNickname`·`nicknameOf`·`parseAvatarStore`·`loadAvatar`·`saveAvatar`
- `scripts/blender/build_character.py`
  - 인자 `--body a|b`로 체형 치수를 바꾸고, 머리 부품 4개를 Head 뼈에 붙인다.
  - 출력은 `character.glb`(a)와 `character-b.glb`(b)다.
- `CharacterModel`
  - `appearance`(체형·머리 모양·색)를 받는다.
  - 체형에 맞는 glb를 쓰고, 고른 머리 부품만 보이며, Skin·Hair·Eye 재질 색을 바꾼다.
- `src/screens/AvatarScreen.tsx`
  - 3D 미리보기(R3F Canvas, 서 있기 동작, 끌어서 돌리기)와 선택 칸, "이대로 시작"을 둔다.
- `App.tsx`: `avatar` 화면 상태를 더한다. LabScreen·ResultScreen에 profile을 넘긴다.
- `LabScreen`
  - 왼쪽 위 표시, 메뉴의 "캐릭터 다시 꾸미기"(실습장 위에 같은 화면을 띄움)를 둔다.
  - `LabScene`에 학생 외모를 넘긴다.
- `NpcDialog`: 첫 인사 대사에 닉네임을 넣는다.

## 시험
- avatar 순수 함수: 기본값, 닉네임 조합, 저장소 검사(모르는 값·깨진 JSON 무시), 코드별 분리.
- 모델 자산: 두 glb에 머리 부품 4개, 동작 6개, Skin·Hair·Eye·Top·Bottom·Shoes 재질이 있고, 체형 b의 키가 더 작다.
- 기록 payload에 닉네임·외모 키가 없다.
- 전체 시험 통과, 운영 빌드 확인.
- 개발 서버(태블릿·폰)에서 만들기 → 실습장 → 표시·NPC 인사를 확인하고 캡처한다.

## 범위 밖
- 실습복 남색 줄무늬, 체형 3가지 이상, 직접 입력 닉네임, 서버 저장
