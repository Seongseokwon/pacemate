# 디자인 참조 자산 — UI 검증 가이드

이 폴더는 에이전트가 **Figma MCP를 호출하지 않고** 구현한 UI를 검증할 수 있도록 참조 이미지와 자산을 모은 곳입니다.

## 규칙: Figma MCP 대신 저장소 파일로 검증

UI를 확인하거나 구현할 때는 **Figma MCP를 호출하지 않고** 이 폴더의 파일을 씁니다. Figma MCP 할당량을 아끼기 위한 방침입니다.

### 진실의 원천

| 항목 | 파일 | 용도 |
|---|---|---|
| 디자인 토큰 | `docs/design-tokens/c2-dark.json`, `c2-light.json` | 색상, 간격, 글자 크기, 모서리 반지름 값. 하드코딩된 HEX 색상이나 숫자를 토큰으로 바꿀 때 참조 |
| 동작과 문구 | `docs/UI_UX.md`, `docs/DECISIONS.md` | 컴포넌트 구성, 문구 기준, UX 결정 사항 |
| 레이아웃 참조 | `docs/design/screens/*.png` | 화면별 최종 레이아웃(C2, 390×844를 2배 확대한 780×1688 PNG) |
| 아이콘 | `docs/design/icons/*.svg` | 개발 이름으로 된 아이콘 30종(24px 그리드, 선 1.8, `currentColor`) |
| 코치 이미지 | `docs/design/coaches/` | 온이·수리·번개 프로필 사진(원형, 배경 제거 컷아웃), 앱 크기별 @3x PNG |

## 자가 검증 절차

화면을 구현한 뒤 참조 이미지와 비교해 레이아웃, 문구, 색상, 간격이 맞는지 확인합니다.

### 1. 앱을 실행하고 스크린샷 캡처

| 환경 | 명령 |
|---|---|
| iOS 시뮬레이터 | `xcrun simctl io booted screenshot out.png` |
| Android 에뮬레이터 | `adb exec-out screencap -p > out.png` |
| 웹 미리보기 | Playwright `page.screenshot({ path: 'out.png' })` |

### 2. 참조 PNG와 나란히 열어 비교

캡처한 스크린샷을 `docs/design/screens/<화면ID>-<slug>-c2.png`와 나란히 열고 아래 항목을 확인합니다.

- **레이아웃**: 요소의 위치, 크기, 배치가 맞는지
- **문구**: 버튼과 레이블의 텍스트가 `UI_UX.md` 문구 기준에 맞는지
- **색상**: 하드코딩된 HEX 값이 없고 토큰을 쓰는지. 의심스러운 색은 `design-tokens/c2-dark.json`에서 확인
- **간격**: 4의 배수 간격이 맞는지

### 3. 차이를 표로 기록

| 화면 ID | 항목 | 기준 (참조 이미지/문서) | 현재 (구현) | 수정 여부 |
|---|---|---|---|---|
| 11a | 버튼 색상 | `accent` (#FF5E00) | 하드코딩 #FF6000 | 토큰으로 수정 |
| 12a | 말풍선 간격 | 좌우 16px | 좌우 12px | 16으로 수정 |

### 4. 우선순위

- 참조 이미지와 `docs/UI_UX.md` 또는 `docs/PRD.md`가 다르면 **문서가 이긴다**. 차이를 보고한다.
- 참조 이미지에 없는 상태(빈 상태, 오류, 로딩)는 임의로 만들지 않고 **'확인 필요'**로 표시한다.

## 참고 사항

- C2 UI는 2026-11-18에 최종 확정되었습니다(`docs/UI_UX.md` §0, `UX-07`).
- 석원님이 구현 결과를 보고 UI를 수정할 수 있습니다. 그때는 참조 이미지가 업데이트됩니다.
- Figma 원본: [PaceMate · Mobile UI](https://www.figma.com/design/EOg570LuvtAluAwOcaD1vb). 접근 권한이 필요하거나 MCP 할당량이 부족하면 이 폴더의 파일을 씁니다.

---

## 화면 목록 (68장)

참조: `screens/_figma-manifest.md`의 전체 목록. 파일 이름: `<화면ID>-<slug>-c2.png`

### 01–03 / 샘플 화면 (13장)

| 그룹 | 화면 ID | 파일 |
|---|---|---|
| 01 / 일상 훈련과 AI 일정 변경 | S01a, S01b, S01c, S01d | `S01a-home-c2.png` ~ `S01d-calendar-changed-c2.png` |
| 02 / 온보딩 · 운동 기록 · 설정 | S02a ~ S02f | `S02a-onboarding-goal-c2.png` ~ `S02f-coach-setting-c2.png` |
| 03 / AI 코치 3종 · 말투 미리보기 | S03a, S03b, S03c | `S03a-coach-oni-c2.png`, `S03b-coach-suri-c2.png`, `S03c-coach-beongae-c2.png` |

### 04 / 첫 실행 플로우 (25장)

인트로, 로그인, 약관, 온보딩, 계획 생성, 코치 고르기, 알림, 첫 홈

- `01-splash-c2.png`
- `02a-intro-1-c2.png` ~ `02c-intro-3-c2.png`
- `03-login-c2.png`, `04-terms-c2.png`, `05-onboarding-start-c2.png`
- `06a-experience-c2.png` ~ `06i-race-date-c2.png` (온보딩 9단계)
- `07-generating-c2.png`
- `08a-preview-choice-c2.png` ~ `08d-coach-select-c2.png`
- `09-notification-c2.png`
- `10a-home-no-plan-c2.png` ~ `10c-home-next-week-c2.png`

### 05–09 / 핵심 플로우 (30장)

| 그룹 | 화면 범위 | 주제 |
|---|---|---|
| 05 / 오늘 훈련 · 기록 | 11a ~ 11g (7장) | 홈 오늘 훈련, 상세, 기록 입력, 어제 훈련, 놓침, 알림 |
| 06 / 채팅으로 일정 바꾸기 | 12a ~ 12g (7장) | 코치 채팅, 여행 질문, 변경 제안, 적용, 만료, 통증, 진입 |
| 07 / 목표 · 코치 변경 | 13a ~ 13f (6장) | 내 목표, 새 목표 선택, 질문, 확인, 제안, 코치 바꾸기 |
| 08 / 이용 한도 · 구독 | 14a ~ 14e (5장) | 체험 소진, 한도 카드, 페이월, 결제 확인, 이용량 |
| 09 / 계획 종료 · 알림 | 15a ~ 15e (5장) | 계획 종료, 목표 없음 종료, 유지 계획, 대회 전날, 알림 모음 |

---

## 하위 폴더

| 폴더 | 내용 | 상세 |
|---|---|---|
| `screens/` | 화면 68장 + 매니페스트 | 780×1688 PNG, `_figma-manifest.md` |
| `icons/` | 아이콘 30종 + README | 개발 이름 23개 + extra 7개, SVG, `README.md` |
| `coaches/` | 코치 프로필 이미지 | `circle/`, `cutout/` (온이, 수리, 번개 @3x PNG), `README.md` |
