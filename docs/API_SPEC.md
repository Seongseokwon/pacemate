# PaceMate AI(가칭) API 명세 v1.0

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 (2026-11-14 승인) |
| 작성일 | 2026-11-14 |
| 기준 문서 | `docs/PRD.md` v1.0, `docs/ARCHITECTURE.md` v1.0, `docs/DATABASE.md` v1.0 |
| 범위 | 앱이 호출하는 HTTP API, 웹훅·내부 작업 엔드포인트, LLM 도구 인터페이스. 구현 코드는 포함하지 않는다. |

## 0. 문서 사용 규칙

1. 이 문서가 API 형식의 단일 출처다. 구현할 때 요청·응답 스키마는 `packages/shared`의 zod 스키마로 옮기고, 앱과 서버가 그 스키마를 함께 쓴다(`AD-04`).
2. 필드를 추가하는 변경은 자유롭다. 필드를 지우거나 뜻을 바꾸는 변경은 출시된 앱을 깨뜨리므로 이 문서를 먼저 고치고 개발자 승인을 받는다.
3. 이 문서가 이전 문서에 더한 내용은 §8에 모았다.

---

## 1. 공통 규칙

| 항목 | 규칙 |
|---|---|
| 기본 경로 | `/v1` |
| 형식 | JSON, 필드 이름은 `camelCase` |
| 인증 | `Authorization: Bearer <액세스 토큰>`. 인증 서비스가 발급한 토큰이다(`AD-05`). |
| 앱 정보 | 모든 요청에 `X-App-Version`, `X-App-Platform`(`ios` / `android`) 헤더를 보낸다(`F11-R06`). |
| 날짜 | `YYYY-MM-DD` 문자열 |
| 시각 | ISO 8601 UTC 문자열 |
| 거리 | km 숫자 |
| 시간 길이 | 초 단위 정수 |
| 사용자 지정 | 경로와 본문에 사용자 ID를 넣지 않는다. 서버가 토큰에서 얻는다(`DI-07`). |
| 목록 | 최신순. `before`(이전 응답의 마지막 항목 ID)와 `limit`(기본 30, 최대 100)으로 이어서 조회한다. 응답은 `{ items, hasMore }`다. 이어서 조회하지 않는 목록(기간의 훈련, 연결 후보)은 `{ items }`다. |
| 요청 제한 | 사용자별 분당 60회, 채팅 전송은 분당 10회(초기값) |

### 1.1 오류 응답

```json
{ "code": "PROPOSAL_EXPIRED", "message": "이 제안은 만료됐어요. 다시 물어봐 주세요." }
```

`code`는 앱이 분기하는 고정 값이고, `message`는 사용자에게 그대로 보여 줄 수 있는 한국어 문장이다.

| HTTP | `code` | 상황 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 요청 형식·범위 오류. `fields`에 항목별 사유가 담긴다 |
| 401 | `UNAUTHENTICATED` | 토큰 없음·만료·위조 |
| 403 | `CONSENT_REQUIRED` | 필수 동의를 마치지 않은 계정(§2.1) |
| 403 | `LIMIT_REACHED` | 이용 한도 초과. `usage`가 함께 온다 |
| 403 | `PRO_REQUIRED` | Pro 전용 기능 |
| 404 | `NOT_FOUND` | 대상이 없거나 다른 사용자의 것 |
| 404 | `NO_ACTIVE_PLAN` | 활성 계획 없음 |
| 409 | `PLAN_ALREADY_ACTIVE` | 활성 계획이 있는데 새 계획을 만들려 함 |
| 409 | `PLAN_ACTIVE` | 활성 계획이 있어 프로필을 직접 바꿀 수 없음(변경 제안 사용) |
| 409 | `PROPOSAL_EXPIRED` | 제안 만료 |
| 409 | `PROPOSAL_NOT_PENDING` | 취소되었거나 새 제안으로 대체된 제안 |
| 409 | `PLAN_CHANGED` | 제안 이후 계획이 바뀜(`DI-03`) |
| 409 | `TARGET_CHANGED` | 대상 훈련이 이미 완료되었거나 날짜가 지남 |
| 409 | `SESSION_ALREADY_COMPLETED` | 연결하려는 훈련에 이미 기록이 있음 |
| 409 | `WORKOUT_DUPLICATE` | 같은 날짜·거리·시간의 기록이 있음. `confirmDuplicate`로 다시 보내면 저장 |
| 409 | `CHAT_BUSY` | 이전 메시지를 처리 중 |
| 422 | `PACE_OUT_OF_RANGE` | 계산된 페이스가 비정상 범위. `confirmPace`로 다시 보내면 저장 |
| 422 | `SAFETY_CHECK_FAILED` | 안전 규칙 위반으로 적용 불가 |
| 422 | `PLAN_NOT_FEASIBLE` | 조건에 맞는 계획·변경안을 만들 수 없음 |
| 422 | `RECENT_DISTANCE_REQUIRED` | 목표 변경에 쓸 기록이 2주(초기값) 치가 안 되어 최근 주간 거리가 필요함. 앱은 주간 거리를 묻고 `profile.recentWeeklyKm`을 붙여 다시 보낸다(PRD `F02-R09`) |
| 426 | `APP_UPDATE_REQUIRED` | 지원하지 않는 앱 버전 |
| 429 | `RATE_LIMITED` | 요청 제한 초과 |
| 500 | `INTERNAL_ERROR` | 서버 오류 |
| 503 | `AI_UNAVAILABLE` | LLM 응답 실패·시간 초과. 이용량은 차감되지 않는다 |

앱은 `401`이면 로그인 화면으로, `426`이면 업데이트 화면으로, `CONSENT_REQUIRED`면 동의 화면으로 이동한다. 그 밖에는 `message`를 보여 준다.

---

## 2. 공통 객체

### 2.1 Usage

| 필드 | 타입 | 설명 |
|---|---|---|
| `tier` | `free` / `pro` | |
| `chat` | `{ used, limit, pool }` | AI 대화. `pool`은 지금 차감되는 곳이다: `trial`(가입 체험분) 또는 `month`(이번 달 한도). `used`와 `limit`은 그 `pool`의 값이다 |
| `reschedule` | `{ used, limit, pool }` | AI 일정 변경. 위와 같다. 대화와 `pool`이 다를 수 있다 |
| `resetsOn` | 날짜 | 월 한도의 다음 초기화 날짜. 체험분은 초기화되지 않는다 |

무료 요금제에서 체험분이 남아 있으면 `pool`은 `trial`, 다 쓰면 `month`다. Pro는 항상 `month`다(PRD §8.2). `LIMIT_REACHED`와 한도 안내 카드는 `month`까지 다 썼을 때만 나온다. 화면 표시("체험 대화 N회 남음", "이번 달 n/5")와 체험분을 다 쓴 순간의 한 줄 안내는 앱이 이 객체로 만든다(`UI_UX.md` §7.1, §7.3).

### 2.2 Session (훈련)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | uuid | |
| `date` | 날짜 | |
| `type` | `walk_run` / `easy` / `tempo` / `long` / `race` | |
| `distanceKm` | 숫자 또는 null | |
| `durationMin` | 정수 또는 null | |
| `runIntervalMin` | 정수 또는 null | 걷고 달리기에서 한 번에 달리는 시간(분). 시간 기준 `walk_run`에만 있다(`TE-S14`) |
| `paceRange` | `{ minSecPerKm, maxSecPerKm }` 또는 null | 권장 페이스 범위 |
| `weekNumber` | 정수 | |
| `status` | `planned` / `completed` / `missed` / `skipped` | 서버가 판정(`DATABASE.md` §3.4) |
| `workoutId` | uuid 또는 null | 연결된 기록 |
| `original` | `{ date, type, distanceKm, durationMin }` 또는 null | 값이 있으면 "변경됨" |

표시 이름, 체감 강도 안내, 설명 문구는 `type`별로 `packages/shared`에 있다. 응답에 넣지 않는다.

### 2.3 Workout (운동 기록)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | uuid | |
| `date` | 날짜 | |
| `distanceKm` | 숫자 | |
| `durationSec` | 정수 | |
| `paceSecPerKm` | 정수 | 서버가 계산 |
| `condition` | 1~5 또는 null | MVP의 화면과 채팅은 받지 않는다(PRD `F07-R01`). 필드는 남겨 둔다 |
| `rpe` | 1~10 또는 null | 운동 강도 |
| `memo` | 문자열 또는 null | 통증 내용. 기록 화면의 통증 입력칸에서 받는다 |
| `plannedSessionId` | uuid 또는 null | |
| `source` | `app` / `chat` | |

### 2.4 Proposal (변경 제안)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | uuid | |
| `type` | `reschedule` / `goal_change` / `workout_log` | |
| `status` | `pending` / `approved` / `cancelled` / `superseded` / `expired` | `expired`는 서버가 만료 시각으로 판정한 값 |
| `expiresAt` | 시각 | 제안을 만든 날의 자정(`Asia/Seoul` 기준 다음 날 0시, PRD `DI-05`) |
| `reasonLine` | 문자열 또는 null | 카드에 보여 줄 이유 한 줄. 서버가 제안의 사유와 요청 내용으로 만든 템플릿 문구다(PRD `F05-R03`). LLM의 문장이 아니다 |
| `consumesQuota` | boolean | 승인 시 AI 일정 변경 이용량을 차감하는지. 놓친 훈련이 많은 주의 일정 변경(PRD §8.2)이면 false다. 제안을 만들 때 정해지고 바뀌지 않는다 |
| `changes` | 배열 | 훈련별 변경. `{ sessionId, action, before, after }`. `action`은 `move` / `skip` / `modify` / `add` / `remove`. `before`·`after`는 `{ date, type, distanceKm, durationMin }` 또는 null. 새로 추가되는 훈련(`add`)의 `sessionId`는 null이다 |
| `impact` | 객체 또는 null | `{ weeklyDistanceBeforeKm, weeklyDistanceAfterKm, skippedCount }` |
| `warnings` | 문자열 배열 | 경고 코드. 문구는 `packages/shared`에 둔다 |
| `goal` | 객체 또는 null | 목표 변경일 때 `{ before, after }` |
| `workout` | 객체 또는 null | 기록 등록일 때 저장될 기록 내용과 연결될 훈련 |

### 2.5 ChatMessage

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | uuid | |
| `role` | `user` / `assistant` / `system` | |
| `content` | 문자열 | |
| `status` | `processing` / `done` / `failed` | |
| `createdAt` | 시각 | |
| `card` | 객체 또는 null | `{ type, proposal?, data? }`. `type`은 `proposal` / `plan_summary` / `weekly_summary` / `limit` / `result` |

`card.type`이 `proposal`이면 `card.proposal`에 Proposal 객체가 **현재 상태로** 담긴다. 과거 대화를 다시 열어도 버튼 활성 여부가 정확하다.

---

## 3. 엔드포인트

### 3.1 계정 (F01)

로그인·로그아웃·토큰 갱신은 인증 서비스의 앱 SDK가 처리한다. API에는 로그인 엔드포인트가 없다.

| 메서드 · 경로 | 설명 |
|---|---|
| `GET /v1/me` | 내 상태 조회. 앱 시작 시 호출해 다음 화면을 정한다 |
| `POST /v1/me` | 필수 동의 제출, 계정 생성 |
| `DELETE /v1/me` | 계정 삭제 |
| `PUT /v1/me/coach` | AI 코치 바꾸기(PRD `F04-R11`~`R13`) |

**`GET /v1/me`** 응답

| 필드 | 설명 |
|---|---|
| `registered` | 필수 동의를 마쳤는지. false면 동의 화면으로 |
| `onboardingCompleted` | 프로필이 있는지. false면 온보딩으로 |
| `hasActivePlan` | 활성 계획이 있는지 |
| `authProvider` | `apple` / `google` |
| `coach` | `oni` / `suri` / `bungae`. 동의 전이면 null |
| `usage` | Usage 객체 |
| `subscription` | `{ productId, store, expiresAt, willRenew }` 또는 null |

이 엔드포인트와 `POST /v1/me`만 동의 전 계정이 호출할 수 있다. 나머지는 `CONSENT_REQUIRED`를 돌려준다.

**`POST /v1/me`** 요청: `consentVersion`, `agreedTerms`, `agreedPrivacy`, `agreedHealthData`. 세 동의가 모두 true여야 한다(`F01-R02`). 이미 가입된 계정이 다시 호출하면 기존 상태를 돌려준다.

**`PUT /v1/me/coach`** 요청: `{ coach }`. 응답: `{ coach }`. 이용량을 차감하지 않고 횟수를 제한하지 않는다(PRD `F04-R13`, `D-15`). 저장된 대화는 바꾸지 않으며, 다음 `POST /v1/chat/messages`부터 바뀐 코치의 말투로 답한다. 처리 중인 메시지가 있으면 그 응답은 이전 코치의 말투일 수 있다.

**`DELETE /v1/me`**: 성공하면 `204`. 외부 서비스 삭제가 중간에 실패하면 `500`을 돌려주고, 다시 호출하면 이어서 처리한다(ARCHITECTURE §9).

### 3.2 프로필 (F02)

| 메서드 · 경로 | 설명 |
|---|---|
| `GET /v1/profile` | 프로필 조회 |
| `PUT /v1/profile` | 프로필 저장. 온보딩 완료 시, 그리고 활성 계획이 없을 때 사용 |

**`PUT /v1/profile`** 요청

| 필드 | 필수 | 값 |
|---|---|---|
| `experience` | ✓ | `none` / `under_6m` / `under_2y` / `over_2y` |
| `continuousRun` | ✓ | `under_10m` / `under_30m` / `under_60m` / `over_60m` |
| `recentWeeklyKm` | | 0~100. null이면 "잘 모르겠어요" |
| `recentRecord` | | `{ distanceKm, durationSec }` 또는 `{ paceSecPerKm }` 또는 null |
| `weeklyRunCount` | ✓ | 2~5 |
| `preferredWeekdays` | ✓ | 1(월)~7(일) 배열. 길이가 `weeklyRunCount` 이상 |

응답은 저장된 프로필과 서버가 분류한 `level`이다. 활성 계획이 있으면 `PLAN_ACTIVE`를 돌려준다. 이 경우 변경은 §3.6의 목표·프로필 변경 제안으로 한다(`F02-R05`).

### 3.3 계획과 훈련 (F03, F06)

| 메서드 · 경로 | 설명 |
|---|---|
| `POST /v1/plan/preview` | 계획 미리보기. 저장하지 않는다 |
| `POST /v1/plan` | 계획 확정·저장 |
| `GET /v1/plan` | 활성 계획 요약 |
| `GET /v1/sessions?from=&to=` | 기간의 훈련 목록 (캘린더). 최대 62일 |
| `GET /v1/sessions/{id}` | 훈련 상세 |
| `GET /v1/home` | 홈 화면 데이터 |

**`POST /v1/plan/preview`와 `POST /v1/plan`** 요청은 같다.

| 필드 | 필수 | 값 |
|---|---|---|
| `goalDistance` | ✓ | `five_k` / `ten_k` / `half` / `none`(목표 없음) |
| `goalTimeSec` | | 목표 기록. `none`이면 보내지 않는다 |
| `raceDate` | | 오늘 이후 날짜. `none`이면 보내지 않는다 |
| `continuation` | | `true`면 유지 계획을 만든다(`F03-R10`). 미리보기 요청에만 쓴다. 기본값 `false` |

- 미리보기 응답: `options` 배열. 항목마다 `kind`(`race_prep` / `base_building` / `maintenance`), `startDate`, `endDate`, `totalWeeks`, `sessions`(Session 배열, ID 없음), `warnings`가 있다. 만들 수 있는 계획만 들어 있으므로 항목은 하나 또는 둘이다(`TE-G06`).
- `warnings`는 경고 코드의 배열이다: `RACE_PREP_NOT_REACHABLE`, `GOAL_TIME_TOO_FAST`, `GOAL_TIME_NOT_CHECKED`. 문구는 `packages/shared`에 있다.
- `raceDate`는 내일 이후여야 한다. 러닝 프로필이 없으면 `NOT_FOUND`다.
- `goalDistance`가 `none`인데 `goalTimeSec`이나 `raceDate`가 있으면 `VALIDATION_ERROR`다(`F02-R07`). `none`의 미리보기는 항상 기초 훈련 계획 하나이고 `warnings`가 비어 있다. 확정 요청의 `kind`가 `race_prep`이면 `PLAN_NOT_FEASIBLE`이다(`F03-R09`).
- `continuation`이 `true`면 `goalDistance`는 `none`이어야 하고 아니면 `VALIDATION_ERROR`다. 기간이 끝난 계획이 없으면 `NOT_FOUND`, 끝나지 않은 활성 계획이 있으면 `PLAN_ALREADY_ACTIVE`다. 미리보기는 유지 계획(`maintenance`) 하나이고 `warnings`가 비어 있다(`TE-G10`). 확정 요청은 `goalDistance`를 `none`, `kind`를 `maintenance`로 보내며 조건은 같다. `continuation` 없이 만든 미리보기에는 `maintenance`가 들어 있지 않다.
- 확정 요청에는 고른 계획의 `kind`를 더한다. 그 종류의 계획을 만들 수 없는 입력이면 `PLAN_NOT_FEASIBLE`이다.
- Training Engine이 결정적이므로 확정 요청은 같은 입력으로 다시 계산해 저장한다. 미리보기 결과를 서버에 보관하지 않는다.
- 확정 응답은 `GET /v1/plan`과 같다. 활성 계획이 이미 있으면 `PLAN_ALREADY_ACTIVE`. 기간이 끝난 계획은 이 요청에서 종료 처리된다(`F03-R08`).
- 어떤 계획도 만들 수 없으면 `PLAN_NOT_FEASIBLE`이다. 완주 준비 계획만 만들 수 없는 경우는 오류가 아니다. `options`에 기초 훈련 계획만 담고 그 `warnings`에 이유를 넣는다(`TE-G06`).

**`GET /v1/plan`** 응답: `id`, `kind`, `goalDistance`, `goalTimeSec`, `raceDate`, `startDate`, `endDate`, `version`, `warnings`, `progress`(`{ completed, total }`), `isFinished`(종료일이 지났는지), `focus`.

`focus`는 목표 없음 계획이 무엇을 향하는지다(`F03-R09`). `goalDistance`가 `none`이 아니면 null이다. 미리보기의 `options` 항목에도 있다. 문구는 `packages/shared`에 둔다.

| 값 | 조건 | 문구 |
|---|---|---|
| `continuous_30min` | 시간 기반 계획이고 첫 주의 `runIntervalMin`이 30 미만 | 30분 쉬지 않고 달리기 |
| `habit` | 그 밖(첫 주의 `runIntervalMin`이 30이거나 거리 기반). `kind`가 `maintenance`면 첫 주와 관계없이 이 값이다(`F03-R10`) | 꾸준히 달리는 습관 만들기 |

계획의 첫 주 훈련으로 판정하므로 DB에 따로 저장하지 않는다.

**`GET /v1/sessions?from=&to=`** 는 끝난 계획의 훈련과 생략된 훈련도 돌려준다. 날짜순이다.

**`GET /v1/sessions/{id}`** 응답: Session 필드에 더해 `workout`(Workout 또는 null), `changes`(이 훈련이 바뀐 이력의 배열: `changedAt`, `reason`, `before`, `after`. `before`·`after`는 `{ date, type, distanceKm, durationMin }` 또는 null).

**`GET /v1/home`** 응답

| 필드 | 설명 |
|---|---|
| `plan` | `GET /v1/plan`과 같은 요약 또는 null |
| `daysToRace` | 대회까지 남은 날 또는 null |
| `todaySession` | Session 또는 null |
| `weekSessions` | 이번 주 Session 배열. 계획이 시작 전이면 첫 주의 Session 배열 |
| `daysToStart` | 계획 시작일까지 남은 날 또는 null. 계획이 시작 전일 때만 값이 있다(첫 홈의 "다음 주 시작" 상태, PRD §5.4) |
| `yesterdaySession` | 어제의 미완료 훈련(생략 제외) 또는 null. 홈의 어제 훈련 기록 카드에 쓴다. 이틀 전 훈련은 넣지 않는다 |
| `weekMissedCount` | 이번 주 미완료 훈련 수. 2 이상이면 앱이 [코치와 일정 조정하기]를 보여 준다(PRD `F05-R14`) |
| `managerMessage` | `{ code, text }`. 서버 규칙으로 만든 템플릿 문구(PRD §5.4). `code`는 `NO_PLAN`, `PLAN_FINISHED`, `PLAN_NOT_STARTED`, `RACE_DAY`, `TODAY_DONE`, `TODAY_SESSION`, `MISSED_SESSION`, `REST_DAY` 중 하나이며 이 순서로 먼저 맞는 것을 쓴다 |

`todaySession`과 `weekSessions`는 활성 계획의 훈련이다. `todaySession`에는 생략된 훈련을 넣지 않는다. `daysToRace`는 대회가 지났으면 null이다. 목표 없음 계획이 끝났을 때의 `PLAN_FINISHED` 문구는 다음 목표를 권한다(`F03-R08`). 코드는 같다. 계획이 끝났으면 `plan`은 끝난 계획의 요약(`isFinished`가 true)이고, 앱은 이때 [이어서 훈련하기]를 보여 준다. `plan`이 null이면 [새 목표 설정]만 보여 준다.

### 3.4 운동 기록 (F07)

| 메서드 · 경로 | 설명 |
|---|---|
| `GET /v1/workouts?before=&limit=` | 기록 목록 |
| `GET /v1/workouts/stats` | 이번 주·이번 달의 거리와 횟수. 응답: `{ week, month }`, 각각 `{ distanceKm, count }` |
| `GET /v1/workouts/link-candidates?date=` | 그 날짜의 기록에 연결할 수 있는 훈련 후보 |
| `POST /v1/workouts` | 기록 저장 |
| `GET /v1/workouts/{id}` | 기록 상세 |
| `PATCH /v1/workouts/{id}` | 기록 수정 |
| `DELETE /v1/workouts/{id}` | 기록 삭제 |

**`POST /v1/workouts`** 요청

| 필드 | 필수 | 값 |
|---|---|---|
| `date` | ✓ | 오늘 이전(오늘 포함) |
| `distanceKm` | ✓ | 0.1~100 |
| `durationSec` | ✓ | 60~43200 |
| `condition` | | 1~5 |
| `rpe` | | 1~10. 운동 강도 |
| `memo` | | 최대 500자. 통증 내용 |
| `plannedSessionId` | | 연결할 훈련. 없으면 자유 러닝 |
| `confirmDuplicate` | | true면 중복 확인을 건너뛴다 |
| `confirmPace` | | true면 페이스 범위 확인을 건너뛴다 |

- `condition`은 받지만 앱은 보내지 않는다(PRD `F07-R01`).
- 응답: `201`과 `{ workout, weekProgress, coachLine }`. `workout`은 Workout, `weekProgress`는 `{ completed, planned }`(이번 주 완료·계획 훈련 수, 활성 계획이 없으면 null), `coachLine`은 `{ code, text }`로 서버 규칙의 템플릿 문구다. LLM을 호출하지 않는다(PRD `F07-R10`). 코드와 문구는 `packages/shared`에 둔다.
- `WORKOUT_DUPLICATE`, `PACE_OUT_OF_RANGE`는 앱이 확인 창을 띄우고 해당 확인 필드를 붙여 다시 보낸다(`F07-R03`). 중복 확인은 연타나 재전송으로 같은 기록이 두 번 저장되는 것도 막는다.
- `PATCH`는 같은 필드를 선택적으로 받는다. `plannedSessionId: null`은 연결 해제다.

**`GET /v1/workouts/link-candidates`** 응답: Session 배열. 같은 날짜의 훈련이 맨 앞이고, 이어서 같은 주의 예정·미완료 훈련이다(`F07-R04`). 이미 기록이 연결된 훈련은 빠진다.

### 3.5 채팅 (F04)

| 메서드 · 경로 | 설명 |
|---|---|
| `GET /v1/chat/messages?before=&limit=` | 대화 조회 |
| `POST /v1/chat/messages` | 메시지 전송, AI 응답 수신 |
| `GET /v1/chat/suggestions` | 빠른 질문 추천 |

**`POST /v1/chat/messages`** 요청

| 필드 | 필수 | 값 |
|---|---|---|
| `clientMessageId` | ✓ | 앱이 만든 uuid. 재전송 시 같은 값을 쓴다 |
| `content` | ✓ | 1~500자 |
| `sessionId` | | 훈련 상세에서 "AI에게 변경 요청"으로 들어온 경우의 대상 훈련(`F05-R11`) |

응답

| 상황 | HTTP | 본문 |
|---|---|---|
| 처리 완료 | 200 | `{ userMessage, replies, usage }`. `replies`는 ChatMessage 배열(AI 문장과 카드) |
| 한도 초과 | 200 | 위와 같되 `replies`가 `limit` 카드 하나. LLM은 호출되지 않는다(`F04-R06`) |
| 같은 `clientMessageId`가 처리 중 | 202 | `{ status: "processing" }` |
| 같은 `clientMessageId`가 이미 완료 | 200 | 저장된 결과 그대로 |
| 다른 메시지를 처리 중 | 409 | `CHAT_BUSY` |
| LLM 실패 | 503 | `AI_UNAVAILABLE` |

- 응답이 끊기거나 시간 초과가 나면 앱은 **같은 `clientMessageId`로 다시 보낸다.** `202`면 잠시 뒤(초기값 3초) 다시 보낸다. 별도의 상태 조회 엔드포인트는 없다.
- `503` 이후 사용자가 [다시 보내기]를 누르면 새 `clientMessageId`로 보낸다.
- 앱의 요청 제한 시간은 75초(초기값)다. 서버의 메시지 처리 제한 시간 60초보다 길어야 한다.

**`GET /v1/chat/suggestions`** 응답: `{ suggestions: [{ code, text }] }`. 고정 목록에서 상황에 맞게 고른 것이다(`F04-R05`).

### 3.6 변경 제안 (F05)

| 메서드 · 경로 | 설명 |
|---|---|
| `GET /v1/proposals/{id}` | 제안 조회 |
| `POST /v1/proposals/{id}/approve` | 제안 승인. **데이터가 실제로 바뀌는 유일한 지점** |
| `POST /v1/proposals/{id}/cancel` | 제안 취소 |
| `POST /v1/proposals/goal-change` | 마이페이지에서 목표·프로필 변경 제안 생성 |

채팅에서 만들어지는 제안은 서버가 LLM 도구 호출로 생성한다(§6). 앱이 일정 변경 제안을 직접 만드는 엔드포인트는 없다(`D-07`).

**`POST /v1/proposals/{id}/approve`**: 요청 본문 없음.

| 상황 | HTTP | 본문 |
|---|---|---|
| 승인 성공 | 200 | `{ proposal, resultMessage, usage }`. `resultMessage`는 대화에 추가된 결과 ChatMessage |
| 이미 승인된 제안 | 200 | 처음 승인 때와 같은 본문(`DI-04`) |
| 만료 | 409 | `PROPOSAL_EXPIRED` |
| 취소·대체됨 | 409 | `PROPOSAL_NOT_PENDING` |
| 계획이 바뀜 | 409 | `PLAN_CHANGED` |
| 대상 훈련이 바뀜 | 409 | `TARGET_CHANGED` |
| 안전 규칙 위반 | 422 | `SAFETY_CHECK_FAILED` |
| 한도 초과 | 403 | `LIMIT_REACHED`. 제안은 대기 상태로 남는다 |

승인 요청은 몇 번을 보내도 결과가 같다. 앱은 실패 시 그대로 다시 보내도 된다. 성공 후 앱은 계획·훈련·홈·이용량 조회를 다시 불러온다.

**`POST /v1/proposals/{id}/cancel`**: 대기 중이면 취소하고 Proposal을 돌려준다. 이미 취소된 제안이면 그대로 돌려준다. 승인된 제안은 `PROPOSAL_NOT_PENDING`.

**`POST /v1/proposals/goal-change`** 요청: `goal`(`goalDistance`, `goalTimeSec`, `raceDate` 중 바꿀 값)과 `profile`(§3.2의 필드 중 바꿀 값) 중 하나 이상. 응답은 Proposal이다.

- `goal`을 바꾸면 서버는 최근 기록(초기값: 최근 3주)으로 최근 주간 거리를 구해 계획을 다시 계산한다. 기록이 있는 기간이 2주(초기값) 미만이고 `profile.recentWeeklyKm`이 없으면 `RECENT_DISTANCE_REQUIRED`를 돌려준다. 앱은 주간 거리 한 문항을 묻고 다시 보낸다(PRD `F02-R09`). 계산 방법의 세부는 `T-403`에서 정해 `DECISIONS.md`에 기록한다.
- 목표 변경 횟수는 제한하지 않는다. 앱은 채팅의 제안 카드와 같은 화면으로 보여 주고 승인·취소한다. 이 경로의 제안은 `consumesQuota`가 false다(PRD §6.5).

### 3.7 주간 요약 (F08)

| 메서드 · 경로 | 설명 |
|---|---|
| `GET /v1/summaries/weekly?weekStart=` | 주간 요약. `weekStart`는 월요일. 생략하면 이번 주 |

응답: `weekStart`, `plannedCount`, `completedCount`, `totalDistanceKm`, `completionRate`(0~1), `nextSession`(Session 또는 null), `aiFeedback`(문자열 또는 null), `aiFeedbackAvailable`.

- 수치는 요청 시점의 데이터로 계산한다.
- `aiFeedback`은 Pro 사용자이고 그 주의 피드백이 생성되어 있을 때만 값이 있다. 이 요청은 LLM을 호출하지 않는다(`F08-R02`).
- `aiFeedbackAvailable`이 false면 무료 사용자다. 앱은 Pro 안내를 보여 준다.

### 3.8 알림 (F09)

| 메서드 · 경로 | 설명 |
|---|---|
| `GET /v1/notification-settings` | 알림 설정 조회 |
| `PUT /v1/notification-settings` | 알림 설정 저장 |
| `PUT /v1/push-tokens` | 푸시 토큰 등록. 요청: `token`, `platform` |
| `DELETE /v1/push-tokens/{token}` | 푸시 토큰 삭제. 로그아웃 직전에 호출 |

알림 설정 필드: `workoutReminder`(boolean), `reminderHour`(8~20), `missedNotice`(boolean), `weeklySummary`(boolean). 설정 행이 없는 사용자는 기본값으로 응답한다. 대회 전날 알림과 계획 종료 알림은 설정 필드를 따로 두지 않고 `workoutReminder`와 `reminderHour`를 따른다(`F09-R08`, `F09-R09`).

### 3.9 구독 (F10)

| 메서드 · 경로 | 설명 |
|---|---|
| `POST /v1/subscription/sync` | 구독 서비스에 조회해 구독 상태를 갱신하고 돌려준다 |

- 앱은 구매 직후와 [구독 복원] 직후에 호출한다(`F10-R04`, `F10-R09`).
- 응답: `{ subscription, usage }`. 아직 반영되지 않았으면 `subscription`이 null이다. 앱은 "확인 중"을 보여 주고 잠시 뒤 다시 호출한다.
- 평소의 구독 상태는 `GET /v1/me`로 확인한다.
- 구매 자체는 구독 서비스의 앱 SDK가 스토어와 처리한다. API에는 구매 엔드포인트가 없다.

---

## 4. 웹훅과 내부 작업

앱이 호출하지 않는다. 사용자 토큰 대신 각각의 비밀값으로 검증한다. 호출자는 `Authorization: Bearer <비밀값>`을 보내고, 웹훅과 내부 작업의 비밀값은 서로 다르다.

| 메서드 · 경로 | 호출자 | 설명 |
|---|---|---|
| `POST /v1/webhooks/subscription` | 구독 서비스 | 구독 이벤트 수신. 이벤트 ID로 중복을 무시한다 |
| `POST /v1/internal/jobs/workout-reminders` | 예약 실행기 | 예정 운동 알림, 대회 전날 알림, 계획 종료 알림 발송 |
| `POST /v1/internal/jobs/missed-notices` | 예약 실행기 | 미완료 훈련 안내 발송. 어제 훈련이 미완료인 사용자에게 하루 한 번(PRD `F09-R11`) |
| `POST /v1/internal/jobs/weekly-summary` | 예약 실행기 | 주간 요약 생성·발송. 계획한 훈련도 기록도 없는 주에는 알림을 보내지 않는다(`F09-R10`) |
| `GET /health` | 호스팅 플랫폼 | 상태 확인. 인증 없음, DB 연결 확인 |

- 웹훅은 처리에 성공했거나 이미 처리한 이벤트면 `200`을 돌려준다. 그 밖의 응답이면 구독 서비스가 다시 보낸다.
- 내부 작업은 여러 번 호출되어도 결과가 같다(ARCHITECTURE §11). 응답: `{ processed, sent, failed }`.

---

## 5. 앱에서 직접 호출하는 외부 서비스

| 서비스 | 용도 | API를 거치지 않는 이유 |
|---|---|---|
| 인증 서비스 | 로그인, 토큰 갱신, 로그아웃 | SDK가 세션을 관리한다 |
| 구독 서비스 | 상품 조회, 구매, 복원 | 스토어 결제는 기기에서만 가능하다 |
| 분석 서비스 | `paywall_viewed`, 앱 실행 | 서버가 알 수 없는 이벤트다 |
| 오류 모니터링 | 앱 오류 | |

그 밖의 분석 이벤트는 서버가 보낸다(ARCHITECTURE §12).

---

## 6. LLM 도구 인터페이스

LLM에 제공하는 도구 7개의 입력과 출력이다(PRD §6.2). HTTP 엔드포인트가 아니라 서버 안에서 실행되는 함수이며, §3의 엔드포인트와 같은 서비스 로직을 쓴다.

공통 규칙:

- 모든 도구는 인증된 사용자 기준으로 실행된다. 입력에 사용자 ID가 없다.
- 입력은 서버가 스키마로 검증한다. 실패하면 `{ error: "INVALID_INPUT", message }`를 돌려주고 실행하지 않는다.
- 출력에는 LLM이 사용자에게 설명하는 데 필요한 값만 넣는다. 내부 ID 중 다음 도구 호출에 필요한 것(`sessionId`)은 포함한다.
- 데이터를 바꾸는 도구는 없다.
- 고른 코치는 도구 입력·출력에 넣지 않는다. 코치는 시스템 지침의 말투 부분만 바꾸고(PRD `AI-11`), 도구의 동작과 결과는 코치와 관계없이 같다.

### 조회 도구

| 도구 | 입력 | 출력 |
|---|---|---|
| `get_runner_profile` | 없음 | 프로필, 수준, 목표(거리·기록·대회 날짜), 대회까지 남은 날. 활성 계획이 없으면 목표는 null. 목표 없음이면 목표는 `{ goalDistance: 'none', focus }`이고 기록·대회 날짜·남은 날을 넣지 않는다 |
| `get_training_plan` | `from`, `to` (날짜, 최대 28일) | 계획 요약(주차, 진행률)과 기간 내 훈련 목록: `sessionId`, `date`, 요일, `type`, `distanceKm`, `durationMin`, `status` |
| `get_workout_history` | `from`, `to` (날짜, 최대 90일) | 기록 목록: `date`, `distanceKm`, `durationSec`, `paceSecPerKm`, `rpe`(운동 강도), `memo`(통증 내용), 연결된 훈련의 `type` |
| `get_weekly_summary` | `weekStart` (월요일) | §3.7의 수치 |

### 제안 도구

**`propose_reschedule`** 입력

| 필드 | 필수 | 값 |
|---|---|---|
| `changeType` | ✓ | `move`(특정 훈련 이동) / `unavailable_dates`(불가일 반영) / `reduce_count`(이번 주 횟수 축소) / `ease`(당일 완화·휴식) |
| `reason` | ✓ | `schedule` / `fatigue` / `pain` |
| `sessionId` | `move`, `ease`에 필수 | 대상 훈련 |
| `targetDate` | `move`에 필수 | 옮길 날짜 |
| `unavailableDates` | `unavailable_dates`에 필수 | 날짜 배열, 최대 14일(`TE-R05`). 이번 주와 다음 주 안의 날짜만(`TE-R10`) |
| `weekStart`, `maxSessions` | `reduce_count`에 필수 | 대상 주와 그 주에 가능한 횟수 |
| `easeOption` | `ease`에 필수 | `rest`(쉬기) / `lighter`(더 가볍게) |

훈련의 거리·강도는 입력에 없다. Training Engine이 정한다(PRD §6.1, `AI-03`).

**`propose_goal_change`** 입력: `goalDistance`, `goalTimeSec`, `raceDate` 중 바꿀 값과, 선택으로 `recentWeeklyKm`(0~100). `recentWeeklyKm`은 `RECENT_DISTANCE_REQUIRED`를 받은 뒤 사용자에게 "요즘 일주일에 얼마나 달려요?"를 묻고 그 답으로만 넣는다. `goalTimeSec`과 `raceDate`는 null로 보내면 값을 지운다. `goalDistance`를 `none`으로 바꾸면 두 값도 지운다. 바꾼 뒤의 목표가 `none`인데 두 값 중 하나가 남으면 입력 오류다.

**`propose_workout_log`** 입력: `date`, `distanceKm`, `durationSec`(이상 필수), `rpe`, `memo`, `sessionId`(연결할 훈련). `condition`은 받지 않는다(PRD `F07-R01`). 사용자가 말하지 않은 `rpe`는 넣지 않는다. `memo`에는 사용자가 말한 통증 내용만 넣는다.

**제안 도구의 출력** (세 도구 공통)

| 상황 | 출력 |
|---|---|
| 제안 생성 | `{ created: true, proposalId, summary }`. `summary`는 변경 목록, 영향 요약, 경고를 LLM이 설명할 수 있는 형태로 담는다 |
| 만들 수 없음 | `{ created: false, reasonCode, message }` |

`reasonCode` 값

| 값 | 상황 | 근거 |
|---|---|---|
| `NO_ACTIVE_PLAN` | 활성 계획 없음 | |
| `TARGET_NOT_CHANGEABLE` | 대상이 완료되었거나 과거 훈련 | `TE-R01` |
| `OUT_OF_WEEK` | 다른 주로 옮기려 함 | `TE-R02` |
| `OUT_OF_RANGE` | 다음 주보다 뒤의 훈련이나 날짜를 바꾸려 함 | `TE-R10` |
| `RECENT_DISTANCE_REQUIRED` | 목표 변경에 쓸 기록이 2주 치가 안 되고 `recentWeeklyKm`이 없음 | `F02-R09` |
| `RACE_DAY_FIXED` | 대회 당일 일정 | `TE-R06` |
| `PERIOD_TOO_LONG` | 불가 기간이 14일 초과 | `TE-R05` |
| `NO_SAFE_OPTION` | 안전한 배치가 없음. 생략안도 만들 수 없는 경우 | `TE-R08` |
| `NOTHING_TO_CHANGE` | 대상 기간에 바꿀 훈련이 없음 | |
| `SESSION_ALREADY_COMPLETED` | 연결하려는 훈련에 이미 기록이 있음 | `DI-10` |
| `WORKOUT_DUPLICATE` | 같은 기록이 이미 있음 | |
| `INVALID_VALUE` | 범위를 벗어난 값(미래 날짜, 비정상 페이스 등) | `F07-R03` |

제안이 만들어지면 서버는 응답의 `replies`에 제안 카드를 넣는다. LLM의 문장은 카드 위에 붙는 설명일 뿐이고, 카드 내용은 저장된 제안에서 그린다(PRD §6.1).

---

## 7. 요구사항 대응표

| PRD | 엔드포인트 |
|---|---|
| F01 | `/v1/me` |
| F02 | `/v1/profile`, `/v1/proposals/goal-change` |
| F03 | `/v1/plan/preview`, `/v1/plan` |
| F04 | `/v1/chat/*`, `/v1/me/coach` |
| F05 | `/v1/proposals/*`, §6 제안 도구 |
| F06 | `/v1/sessions`, `/v1/home` |
| F07 | `/v1/workouts/*` |
| F08 | `/v1/summaries/weekly`, 내부 작업 `weekly-summary` |
| F09 | `/v1/notification-settings`, `/v1/push-tokens`, 내부 작업 |
| F10 | `/v1/subscription/sync`, `/v1/webhooks/subscription`, `GET /v1/me`의 `usage` |
| F11 | 서버 내부에서 전송. `X-App-Version` 확인 |

---

## 8. 이 문서가 더한 것 (2026-11-14 승인)

| 항목 | 내용 | 영향 |
|---|---|---|
| 컨디션·운동 강도를 선택 입력으로 변경 | 필수는 날짜·거리·시간뿐이다. 채팅으로 기록할 때 사용자가 말하지 않은 값을 AI가 지어내지 않게 한다. | PRD `F07-R01`, `DATABASE.md` §3.5에 반영함 |
| 활성 계획이 있을 때 프로필 직접 수정 불가 | 프로필 변경도 목표 변경과 같은 제안·승인 경로를 거친다. `F02-R05`의 구체화다. | §3.2, §3.6 |
| 채팅 재전송 방식 | 상태 조회 엔드포인트 없이 같은 `clientMessageId`로 다시 보낸다. | §3.5 |
| 기록 중복·페이스 확인 방식 | 서버가 오류를 돌려주고 앱이 확인 필드를 붙여 다시 보낸다. | §3.4 |
| 홈 전용 엔드포인트 | 홈 화면 데이터를 한 번에 받는다. 매니저 메시지가 서버 규칙이라 어차피 서버 호출이 필요하다. | §3.3 |
| 화면 흐름 확정에 따른 변경 (2026-11-17) | 카카오 로그인(`authProvider`), 홈의 `daysToStart`·`yesterdaySession`·`weekMissedCount`, 기록 저장 응답의 `weekProgress`·`coachLine`, Proposal의 `reasonLine`과 만료 시각(만든 날 자정), 목표 변경의 `RECENT_DISTANCE_REQUIRED`, 일정 변경 범위의 `OUT_OF_RANGE`, 채팅 기록 등록에서 `condition` 제외 | §2, §3.1, §3.3, §3.4, §3.6, §6. `packages/shared`의 스키마는 각 구현 작업에서 고친다(`DEVELOPMENT_PLAN.md`) |
| AI 코치 3명 (2026-11-18) | `GET /v1/me`의 `coach`, `PUT /v1/me/coach`. 코치는 도구에 넘기지 않는다 | §3.1, §6, PRD `F04-R11`~`R13` |
| 카카오 로그인 제외 (2026-11-18) | `authProvider`에서 `kakao`를 뺐다. `packages/shared`의 `authProviderSchema`는 이미 `apple` / `google`이다 | §2, PRD `F01-R01` |
