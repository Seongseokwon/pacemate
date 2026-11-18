# PaceMate C2 Figma 작업 파일 목록

> **저장소 참고**: 이 파일은 Figma 작업 목록 원본입니다. 아래에 언급된 SVG, 시트, 컴포넌트 파일은 저장소에 포함되지 않았습니다. 저장소에 있는 것은 **68개 화면 PNG 파일**(`<화면ID>-<slug>-c2.png`)과 이 매니페스트 파일뿐입니다.

모든 화면은 390×844 SVG(글자는 실제 `<text>`, Pretendard)와 2x PNG 미리보기(780×1688)입니다. 피그마에는 SVG를 넣고, PNG는 확인용입니다.

## 시트(그룹 보드)

| 놓는 순서 | 시트 이름 | SVG | PNG | 크기 | 화면 수 |
|---|---|---|---|---|---|
| 1 | 01–03 / 샘플 화면 (C2) | `sheets/01-03-samples-c2.svg` | `sheets/01-03-samples-c2.png` | 2900×3474 | 13 |
| 2 | 04 / 첫 실행 플로우 (C2) | `sheets/04-first-launch-c2.svg` | `sheets/04-first-launch-c2.png` | 2900×5130 | 25 |
| 3 | 05–09 / 핵심 플로우 (C2) | `sheets/05-09-core-flows-c2.svg` | `sheets/05-09-core-flows-c2.png` | 3370×5610 | 30 |
| 4 | 10 / C2 컴포넌트 & 토큰 | `components/10-c2-components-tokens.svg` | `components/10-c2-components-tokens.png` | 2560×7121 | 토큰 39 · 컴포넌트 40여 칸 · 아이콘 30 |

시트 SVG는 화면 SVG를 그대로 안에 넣은 형태라 글자가 살아 있습니다. 화면을 하나씩 프레임으로 두고 싶으면 아래 개별 SVG를 쓰면 됩니다.

## 01 / 일상 훈련과 AI 일정 변경

| 순서 | 화면 ID | 이름 | 파일 (screens/) |
|---|---|---|---|
| 1 | S01a | 홈 | `S01a-home-c2.svg` (+ `.png`) |
| 2 | S01b | AI 코치/승인 대기 | `S01b-coach-pending-c2.svg` (+ `.png`) |
| 3 | S01c | AI 코치/적용 완료 | `S01c-coach-applied-c2.svg` (+ `.png`) |
| 4 | S01d | 캘린더/변경 반영 | `S01d-calendar-changed-c2.svg` (+ `.png`) |

## 02 / 온보딩 · 운동 기록 · 설정

| 순서 | 화면 ID | 이름 | 파일 (screens/) |
|---|---|---|---|
| 1 | S02a | 온보딩/목표 선택 | `S02a-onboarding-goal-c2.svg` (+ `.png`) |
| 2 | S02b | 첫 훈련 계획/미리보기 | `S02b-plan-preview-c2.svg` (+ `.png`) |
| 3 | S02c | 운동 기록 | `S02c-log-list-c2.svg` (+ `.png`) |
| 4 | S02d | 운동 기록/입력 | `S02d-log-input-c2.svg` (+ `.png`) |
| 5 | S02e | 마이 | `S02e-my-c2.svg` (+ `.png`) |
| 6 | S02f | AI 코치 설정 | `S02f-coach-setting-c2.svg` (+ `.png`) |

## 03 / AI 코치 3종 · 말투 미리보기

| 순서 | 화면 ID | 이름 | 파일 (screens/) |
|---|---|---|---|
| 1 | S03a | AI 코치/온이 말투 | `S03a-coach-oni-c2.svg` (+ `.png`) |
| 2 | S03b | AI 코치/수리 말투 | `S03b-coach-suri-c2.svg` (+ `.png`) |
| 3 | S03c | AI 코치/번개 말투 | `S03c-coach-beongae-c2.svg` (+ `.png`) |

## 04 / 첫 실행 플로우 (6열 배치, 같은 줄 화살표)

| 순서 | 화면 ID | 이름 | 파일 (screens/) |
|---|---|---|---|
| 1 | 01 | 스플래시 | `01-splash-c2.svg` (+ `.png`) |
| 2 | 02a | 인트로 1 | `02a-intro-1-c2.svg` (+ `.png`) |
| 3 | 02b | 인트로 2 | `02b-intro-2-c2.svg` (+ `.png`) |
| 4 | 02c | 인트로 3 | `02c-intro-3-c2.svg` (+ `.png`) |
| 5 | 03 | 로그인 | `03-login-c2.svg` (+ `.png`) |
| 6 | 04 | 약관 동의 | `04-terms-c2.svg` (+ `.png`) |
| 7 | 05 | 온보딩 시작 | `05-onboarding-start-c2.svg` (+ `.png`) |
| 8 | 06a | 온보딩 경험 | `06a-experience-c2.svg` (+ `.png`) |
| 9 | 06b | 온보딩 달리기 시간 | `06b-run-duration-c2.svg` (+ `.png`) |
| 10 | 06c | 온보딩 주간 거리 | `06c-weekly-distance-c2.svg` (+ `.png`) |
| 11 | 06d | 온보딩 최근 기록 | `06d-recent-record-c2.svg` (+ `.png`) |
| 12 | 06e | 온보딩 주간 횟수 | `06e-weekly-count-c2.svg` (+ `.png`) |
| 13 | 06f | 온보딩 선호 요일 | `06f-preferred-days-c2.svg` (+ `.png`) |
| 14 | 06g | 온보딩 목표 거리 | `06g-goal-distance-c2.svg` (+ `.png`) |
| 15 | 06h | 온보딩 목표 기록 | `06h-goal-time-c2.svg` (+ `.png`) |
| 16 | 06i | 온보딩 대회 날짜 | `06i-race-date-c2.svg` (+ `.png`) |
| 17 | 07 | 계획 생성 중 | `07-generating-c2.svg` (+ `.png`) |
| 18 | 08a | 계획 미리보기 선택 | `08a-preview-choice-c2.svg` (+ `.png`) |
| 19 | 08b | 계획 미리보기 기초만 | `08b-preview-base-only-c2.svg` (+ `.png`) |
| 20 | 08c | 계획 미리보기 목표 없음 | `08c-preview-no-goal-c2.svg` (+ `.png`) |
| 21 | 08d | 코치 고르기 | `08d-coach-select-c2.svg` (+ `.png`) |
| 22 | 09 | 알림 권한 안내 | `09-notification-c2.svg` (+ `.png`) |
| 23 | 10a | 첫 홈 계획 없음 | `10a-home-no-plan-c2.svg` (+ `.png`) |
| 24 | 10b | 첫 홈 이번 주 시작 | `10b-home-this-week-c2.svg` (+ `.png`) |
| 25 | 10c | 첫 홈 다음 주 시작 | `10c-home-next-week-c2.svg` (+ `.png`) |

## 05 / 오늘 훈련 · 기록

| 순서 | 화면 ID | 이름 | 파일 (screens/) |
|---|---|---|---|
| 1 | 11a | 홈 오늘 훈련 | `11a-home-today-c2.svg` (+ `.png`) |
| 2 | 11b | 훈련 상세 | `11b-session-detail-c2.svg` (+ `.png`) |
| 3 | 11c | 기록 입력 | `11c-log-input-c2.svg` (+ `.png`) |
| 4 | 11d | 기록 완료 | `11d-log-done-c2.svg` (+ `.png`) |
| 5 | 11e | 홈 어제 훈련 | `11e-home-yesterday-c2.svg` (+ `.png`) |
| 6 | 11f | 홈 이번 주 2회 놓침 | `11f-home-missed-twice-c2.svg` (+ `.png`) |
| 7 | 11g | 알림 어제 훈련 기록 | `11g-notif-yesterday-c2.svg` (+ `.png`) |

## 06 / 채팅으로 일정 바꾸기

| 순서 | 화면 ID | 이름 | 파일 (screens/) |
|---|---|---|---|
| 1 | 12a | 코치 채팅 기본 | `12a-chat-default-c2.svg` (+ `.png`) |
| 2 | 12b | 여행 확인 질문 | `12b-chat-travel-question-c2.svg` (+ `.png`) |
| 3 | 12c | 변경 제안 카드 | `12c-chat-proposal-c2.svg` (+ `.png`) |
| 4 | 12d | 적용 결과 | `12d-chat-applied-c2.svg` (+ `.png`) |
| 5 | 12e | 만료된 제안 | `12e-chat-expired-c2.svg` (+ `.png`) |
| 6 | 12f | 통증 심함 | `12f-chat-pain-c2.svg` (+ `.png`) |
| 7 | 12g | 놓친 훈련 진입 | `12g-chat-missed-entry-c2.svg` (+ `.png`) |

## 07 / 목표 · 코치 변경

| 순서 | 화면 ID | 이름 | 파일 (screens/) |
|---|---|---|---|
| 1 | 13a | 내 목표 | `13a-my-goal-c2.svg` (+ `.png`) |
| 2 | 13b | 새 목표 선택 | `13b-goal-select-c2.svg` (+ `.png`) |
| 3 | 13c | 기록 부족 시 질문 | `13c-goal-weekly-distance-c2.svg` (+ `.png`) |
| 4 | 13d | 목표 변경 확인 | `13d-goal-confirm-c2.svg` (+ `.png`) |
| 5 | 13e | 새 계획 제안 | `13e-goal-proposal-c2.svg` (+ `.png`) |
| 6 | 13f | 코치 바꾸기 | `13f-my-coach-change-c2.svg` (+ `.png`) |

## 08 / 이용 한도 · 구독

| 순서 | 화면 ID | 이름 | 파일 (screens/) |
|---|---|---|---|
| 1 | 14a | 체험분 소진 안내 | `14a-chat-trial-used-c2.svg` (+ `.png`) |
| 2 | 14b | 한도 안내 카드 | `14b-chat-limit-card-c2.svg` (+ `.png`) |
| 3 | 14c | 페이월 | `14c-paywall-c2.svg` (+ `.png`) |
| 4 | 14d | 결제 확인 중 | `14d-payment-checking-c2.svg` (+ `.png`) |
| 5 | 14e | 마이 이용량 | `14e-my-usage-c2.svg` (+ `.png`) |

## 09 / 계획 종료 · 알림

| 순서 | 화면 ID | 이름 | 파일 (screens/) |
|---|---|---|---|
| 1 | 15a | 홈 계획 종료 | `15a-home-plan-ended-c2.svg` (+ `.png`) |
| 2 | 15b | 목표 없음 계획 종료 | `15b-home-no-goal-ended-c2.svg` (+ `.png`) |
| 3 | 15c | 유지 계획 미리보기 | `15c-maintenance-preview-c2.svg` (+ `.png`) |
| 4 | 15d | 홈 대회 전날 | `15d-home-race-eve-c2.svg` (+ `.png`) |
| 5 | 15e | 알림 모음 | `15e-notif-all-c2.svg` (+ `.png`) |

## 에셋 (assets/)

- `coach-{oni,suri,beongae}-{512,160,96}.png`: 원형으로 잘라 낸 투명 배경 코치 아바타(v3, 주황 루트 안테나 통일). 원본 정사각형은 `/workspace/design-styles/coaches/v3/coach-*-v3.jpg`.
- 응원 테마 그림(`cheer-*.png`)은 2026-11-18 응원 테마를 코치 3종으로 합치면서 뺐습니다(보관: `fix-2026-11-18/removed-screens/`).

## 2026-11-18 수정

- 수정 요청 반영 내역과 Figma 작업 순서: `fix-2026-11-18/checklist.md` · 자료: `fix-2026-11-18/` (icons, race-goal-card, coaches, tokens, brand).
- 로그인 카카오 제거 → Apple + Google(공식 로고 원본) · 주황 위 글자 남색 `#0B1018` · `session/tempo` 연두 `#B8E04A`/`#567300` · 샘플 문구 현재 규칙 · 응원 테마 삭제(코치 3종으로 합침).

## 원본 코드 (src/)

- `c2.py` 다크 재스타일 엔진 · `build_screens.py` 화면 55장 · `samples.py` 샘플 13장 · `remaining.py` 컴포넌트 라이브러리 SVG · `tokens_2026_11_18.py` 변수 파일 · `sheets.py` 시트 3장 · `components.py` 컴포넌트 시트 · `render.py` 크롬 렌더러.
- 다시 만들기: `cd /workspace/figma-c2/src && python3 build_screens.py && python3 samples.py && python3 sheets.py && python3 components.py && python3 remaining.py && python3 tokens_2026_11_18.py && python3 docs.py`
