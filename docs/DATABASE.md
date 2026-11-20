# PaceMate AI(가칭) 데이터베이스 설계 v1.0

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 (2026-11-14 승인) |
| 작성일 | 2026-11-14 |
| 기준 문서 | `docs/PRD.md` v1.0 (§7.6, §9), `docs/ARCHITECTURE.md` v1.0 |
| 범위 | 테이블, 컬럼, 제약, 인덱스, 삭제 정책. Prisma 스키마 파일과 마이그레이션은 구현 단계에서 이 문서를 따라 작성한다. |

## 0. 문서 사용 규칙

1. 이 문서가 테이블 구조의 단일 출처다. 구현 중 구조를 바꿔야 하면 이 문서를 먼저 고친다.
2. PRD §9의 개념 모델과 달라진 부분은 §8에 모았다. 2026-11-14에 승인되었고, PRD §9와 다르면 이 문서가 우선한다.
3. 정합성 규칙(`DI-nn`)이 어느 제약으로 구현되는지는 §6에 있다. 제약을 지우거나 바꿀 때는 해당 규칙이 계속 지켜지는지 확인한다.

---

## 1. 공통 규칙

| 항목 | 규칙 |
|---|---|
| DBMS | PostgreSQL (Supabase 호스팅) |
| 이름 | 테이블과 컬럼은 `snake_case`, 테이블은 복수형. Prisma 모델은 `PascalCase` 단수형으로 대응시킨다. |
| 기본 키 | `uuid`. 자연 키가 있는 테이블은 그 키를 쓴다(예: `usage_counters`). |
| 날짜 | 훈련·운동·대회 날짜는 `date`. 시간대 없음(`DI-09`). |
| 시각 | `timestamptz`, UTC 저장 |
| 거리 | km, `numeric`. 부동소수 타입을 쓰지 않는다. |
| 시간 길이 | 초 단위 `integer` |
| 열거형 | Prisma enum. 값은 영어 소문자 `snake_case`이고 글자로 시작한다(Prisma 식별자 규칙). |
| 계산 가능한 값 | 저장하지 않는다. 평균 페이스, 훈련 완료 여부, 달성률, 제안 만료 여부가 해당한다. |
| 사용자 소유 | 사용자 데이터 테이블은 모두 `user_id`를 가진다. 모든 조회에 `user_id` 조건을 건다(`DI-07`). |
| 삭제 | 계정 삭제는 `users` 행 삭제 하나로 연쇄 삭제된다(§7). 그 밖에 논리 삭제 컬럼은 두지 않는다. |

### 외부 접근 차단 (필수)

Supabase는 `public` 스키마의 테이블을 자동 생성 API로 노출한다. 이 프로젝트에서 DB에 접근하는 것은 Backend API뿐이므로(ARCHITECTURE §14) 다음을 적용한다.

1. **모든 테이블에 행 수준 보안(RLS)을 켜고 정책은 만들지 않는다.** 앱에 들어가는 공개 키로는 어떤 행도 읽거나 쓸 수 없다.
2. Backend API는 RLS를 우회하는 서버 전용 접속 정보로 연결한다.
3. 새 테이블을 추가하는 마이그레이션에는 RLS 활성화를 반드시 포함한다. 빠뜨리면 테스트(`services/api/test/database.test.ts`)가 실패한다. Prisma가 마이그레이션 기록에 쓰는 `_prisma_migrations` 테이블에도 RLS를 켠다.
4. 출시 전 보안 점검(PRD §12) 항목에 "실제 Supabase의 공개 키로 테이블 조회 불가"를 넣는다. 로컬 테스트는 권한만 있는 다른 역할로 이를 흉내 낸다.

---

## 2. 테이블 목록

| 테이블 | 내용 | PRD §9 엔티티 |
|---|---|---|
| `users` | 계정, 동의 내역 | User |
| `runner_profiles` | 러닝 프로필 | RunnerProfile |
| `training_plans` | 목표와 훈련 계획 | Goal + TrainingPlan |
| `planned_sessions` | 계획된 훈련 | PlannedSession |
| `workout_logs` | 운동 기록 | WorkoutLog |
| `chat_messages` | 대화 | ChatMessage |
| `change_proposals` | 변경 제안 | ChangeProposal |
| `plan_change_logs` | 변경 이력 | PlanChangeLog |
| `subscriptions` | 구독 상태 | Subscription |
| `subscription_events` | 구독 서비스 웹훅 수신 기록 | (추가) |
| `usage_counters` | 월별 이용량 | UsageCounter |
| `usage_trials` | 가입 체험분의 사용량 | UsageTrial |
| `ai_call_logs` | LLM 호출 기록 | AiCallLog |
| `weekly_summaries` | 주간 요약 | WeeklySummary |
| `notification_settings` | 알림 설정 | NotificationSetting |
| `push_tokens` | 기기 푸시 토큰 | NotificationSetting에서 분리 |
| `notification_logs` | 알림 발송 기록 | NotificationLog |

```text
users ─1:1─ runner_profiles
users ─1:N─ training_plans ─1:N─ planned_sessions ─1:0..1─ workout_logs
users ─1:N─ workout_logs
users ─1:N─ chat_messages ─N:0..1─ change_proposals ─1:0..1─ plan_change_logs
users ─1:1─ subscriptions, notification_settings
users ─1:1─ usage_trials (`identity_hash`로 찾는다. 외래 키가 아니다)
users ─1:N─ usage_counters, ai_call_logs, weekly_summaries, push_tokens, notification_logs
```

---

## 3. 테이블 정의

표의 "필수"는 `NOT NULL`을 뜻한다.

### 3.1 `users`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | uuid | ✓ | 기본 키. 인증 서비스의 사용자 ID를 그대로 쓴다. |
| `auth_provider` | enum `apple` / `google` | ✓ | |
| `coach` | enum `oni` / `suri` / `bungae` | ✓ | 고른 AI 코치(PRD `F04-R11`). 기본값 `oni`(PRD `D-15`). AI 응답의 말투만 정한다 |
| `identity_hash` | text | | 로그인 연결 전에는 null. 로그인 공급자와 공급자가 준 사용자 식별자를 서버 비밀값으로 HMAC-SHA256한 값. 유일. 같은 Apple·Google 계정이면 탈퇴 뒤 다시 가입해도 같다. `usage_trials`를 찾는 키다 |
| `terms_agreed_at` | timestamptz | ✓ | 이용약관 동의 시각 |
| `privacy_agreed_at` | timestamptz | ✓ | 개인정보 처리방침 동의 시각 |
| `health_data_agreed_at` | timestamptz | ✓ | 운동 데이터 처리 동의 시각 |
| `consent_version` | text | ✓ | 동의한 약관·정책의 버전 |
| `deletion_requested_at` | timestamptz | | 계정 삭제가 중간에 실패한 경우 재시도 표시 |
| `created_at` | timestamptz | ✓ | |

- 이메일과 이름은 저장하지 않는다. 서비스 기능에 쓰이지 않는다.
- 행은 필수 동의를 마친 시점에 만든다(`F01-R02`). 동의 전에는 행이 없다.
- 온보딩 완료 여부는 `runner_profiles` 행의 유무로 판단한다. 온보딩 도중의 답변은 기기에만 저장한다(§8).

### 3.2 `runner_profiles`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `user_id` | uuid | ✓ | 기본 키, `users` 참조 |
| `experience` | enum `none` / `under_6m` / `under_2y` / `over_2y` | ✓ | 러닝 경험 |
| `continuous_run` | enum `under_10m` / `under_30m` / `under_60m` / `over_60m` | ✓ | 쉬지 않고 달릴 수 있는 시간 |
| `recent_weekly_km` | numeric(5,1) | | 비어 있으면 "잘 모르겠어요". 0~100 |
| `recent_pace_sec_per_km` | integer | | 최근 평균 페이스. 기록(거리+시간)으로 입력하면 환산해 저장 |
| `recent_record_km` | numeric(5,2) | | 기록으로 입력한 경우의 거리 |
| `weekly_run_count` | smallint | ✓ | 2~5 |
| `preferred_weekdays` | smallint[] | ✓ | 1(월)~7(일). 개수가 `weekly_run_count` 이상 |
| `level` | enum `beginner` / `novice` / `intermediate` | ✓ | Training Engine이 분류한 수준(`TE-G01`) |
| `updated_at` | timestamptz | ✓ | |

### 3.3 `training_plans`

목표와 계획을 한 행에 둔다(§8).

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | uuid | ✓ | 기본 키 |
| `user_id` | uuid | ✓ | `users` 참조 |
| `status` | enum `active` / `ended` | ✓ | |
| `kind` | enum `race_prep` / `base_building` / `maintenance` | ✓ | 완주 준비 계획 / 기초 훈련 계획(`TE-G06`) / 유지 계획(`TE-G10`) |
| `goal_distance` | enum `five_k` / `ten_k` / `half` / `none` | ✓ | `none`은 목표 없음(`F03-R09`) |
| `goal_time_sec` | integer | | 목표 기록 |
| `race_date` | date | | 대회 날짜 |
| `start_date` | date | ✓ | |
| `end_date` | date | ✓ | 대회일 또는 표준 기간의 마지막 날 |
| `version` | integer | ✓ | 1에서 시작. 승인된 변경마다 1 증가(`DI-03`) |
| `warnings` | jsonb | ✓ | 생성 시 경고 코드 목록(`TE-G06`). 없으면 빈 배열 |
| `engine_version` | text | ✓ | 계획을 만든 Training Engine 설정의 버전 |
| `created_at` | timestamptz | ✓ | |
| `ended_at` | timestamptz | | |

- **부분 유일 인덱스**: `(user_id)` where `status = 'active'`. 사용자당 활성 계획 1개(`DI-13`).
- 계획 종료(`F03-R08`)는 `end_date`와 오늘을 비교해 판정하고, 새 계획을 만들 때 이전 행을 `ended`로 바꾼다.
- 목표 변경은 같은 행의 목표 컬럼을 고치고 `version`을 올린다. 이전 목표는 `plan_change_logs`의 변경 전 내용에 남는다.

### 3.4 `planned_sessions`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | uuid | ✓ | 기본 키 |
| `plan_id` | uuid | ✓ | `training_plans` 참조 |
| `user_id` | uuid | ✓ | `users` 참조. 조회와 소유 확인용 |
| `date` | date | ✓ | |
| `type` | enum `walk_run` / `easy` / `tempo` / `long` / `race` | ✓ | `race`는 대회 당일 표시(`TE-G08`) |
| `distance_km` | numeric(4,1) | | 거리 또는 시간 중 하나는 있어야 한다 |
| `duration_min` | smallint | | `walk_run`처럼 시간 기준인 훈련 |
| `run_interval_min` | smallint | | 걷고 달리기에서 한 번에 달리는 시간(분). 시간 기준 `walk_run`에는 꼭 있다(`TE-S14`) |
| `pace_min_sec_per_km` | integer | | 권장 페이스 범위(빠른 쪽). 최근 기록이 없으면 비움 |
| `pace_max_sec_per_km` | integer | | 권장 페이스 범위(느린 쪽) |
| `week_number` | smallint | ✓ | 계획의 몇 주차인지 |
| `is_skipped` | boolean | ✓ | 변경 제안으로 생략된 훈련. 기본값 false |
| `original` | jsonb | | 처음 변경될 때 저장하는 최초 내용(날짜, 종류, 거리, 시간). 값이 있으면 "변경됨"(`F06-R04`) |
| `created_at` | timestamptz | ✓ | |

- **부분 유일 인덱스**: `(plan_id, date)` where `is_skipped = false`. 하루에 훈련 1개(`TE-S05`).
- 인덱스: `(user_id, date)`.
- 체크: `distance_km`와 `duration_min` 중 하나 이상 존재.
- 체감 강도 안내 문구와 훈련 설명은 저장하지 않는다. `type`별 문구를 `packages/shared`에 둔다.
- 이 테이블을 수정하는 코드는 `proposal` 모듈의 승인 처리뿐이다(ARCHITECTURE §5.2).

훈련 상태는 저장하지 않고 아래처럼 판정한다.

| 상태 | 조건 |
|---|---|
| 완료 | 연결된 `workout_logs` 행이 있음 |
| 생략 | `is_skipped = true` |
| 예정 | 위에 해당하지 않고 `date`가 오늘 이후(오늘 포함) |
| 미완료 | 위에 해당하지 않고 `date`가 오늘 이전 |

진행률(홈 화면)은 `완료 훈련 수 / (전체 훈련 수 − 생략 훈련 수)`이며 `race`는 세지 않는다.

### 3.5 `workout_logs`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | uuid | ✓ | 기본 키 |
| `user_id` | uuid | ✓ | `users` 참조 |
| `date` | date | ✓ | 오늘 이전(오늘 포함). 서버에서 검증 |
| `distance_km` | numeric(5,2) | ✓ | 체크: 0.1~100 |
| `duration_sec` | integer | ✓ | 체크: 60~43200 |
| `average_heart_rate` | integer | | Apple 건강에서 가져온 평균 심박수(bpm) |
| `condition` | smallint | | 체크: 1~5. MVP의 화면과 채팅은 받지 않아 비어 있다(PRD `F07-R01`). 컬럼은 남겨 둔다 |
| `rpe` | smallint | | 운동 강도(주관적 운동 강도). 체크: 1~10. 선택 입력 |
| `memo` | text | | 통증 내용. 기록 화면의 통증 입력칸에서 받는다. 최대 500자 |
| `planned_session_id` | uuid | | `planned_sessions` 참조, **유일**. 비어 있으면 자유 러닝 |
| `source` | enum `app` / `chat` / `healthkit` | ✓ | 입력 경로 |
| `started_at` / `ended_at` | timestamptz | | Apple 건강 운동의 시작·종료 시각. 기존 기록은 비어 있을 수 있다 |
| `healthkit_id` | uuid | | 가져온 기록의 HealthKit ID. 자동 연결의 동률을 일정하게 처리한다. 기존 기록은 비어 있을 수 있다 |
| `auto_linked` | boolean | ✓ | Apple 건강 자동 연결 여부. 사용자가 연결을 선택하면 false |
| `manual_link` | boolean | ✓ | 사용자가 연결 또는 자유 러닝을 직접 선택한 경우 true |
| `separate_run` | boolean | ✓ | 사용자가 다른 달리기라고 확인하여 비슷한 기록 묶음에서 제외한 경우 true |
| `created_at` / `updated_at` | timestamptz | ✓ | |

- `planned_session_id`의 유일 제약이 훈련과 기록의 1:1 연결을 보장한다(`DI-10`).
- 인덱스: `(user_id, date)`.
- 평균 페이스는 `duration_sec / distance_km`로 계산한다(`F07-R02`).
- 비슷한 기록 묶음은 저장된 운동 시각과 거리·시간으로 계산하며, `separate_run` 기록은 독립적으로 센다. 기존 Apple 건강 기록은 시각이 없어 수동 기록과만 비교할 수 있다.
- 기록을 삭제하면 연결이 사라지고 훈련은 예정 또는 미완료로 돌아간다(`F07-R06`). 별도 갱신이 필요 없다.

### 3.5.1 `healthkit_imports`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `user_id` | uuid | ✓ | `users` 참조. 계정 삭제 시 함께 삭제 |
| `external_id` | uuid | ✓ | HealthKit workout UUID |

- `(user_id, external_id)`를 기본 키로 하고 행 수준 보안을 켠다.
- 운동 기록을 수정하거나 삭제해도 식별자를 유지해 재가져오기를 막는다.

### 3.6 `chat_messages`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | uuid | ✓ | 기본 키 |
| `user_id` | uuid | ✓ | `users` 참조 |
| `role` | enum `user` / `assistant` / `system` | ✓ | `system`은 서버가 만든 결과·한도 안내 메시지 |
| `content` | text | ✓ | 본문 |
| `status` | enum `processing` / `done` / `failed` | ✓ | 사용자 메시지의 처리 상태. 그 밖의 메시지는 `done` |
| `client_message_id` | uuid | | 사용자 메시지에만 있음 |
| `card_type` | enum `proposal` / `plan_summary` / `weekly_summary` / `limit` / `result` | | 카드가 있는 메시지 |
| `card_data` | jsonb | | 요약·한도·결과 카드의 표시 내용. 응답 시점의 값을 그대로 저장 |
| `proposal_id` | uuid | | `change_proposals` 참조. 제안 카드는 제안 행의 현재 상태로 그린다 |
| `created_at` | timestamptz | ✓ | |

- **유일 인덱스**: `(user_id, client_message_id)`. 같은 메시지를 두 번 처리하지 않는다.
- **부분 유일 인덱스**: `(user_id)` where `status = 'processing'`. 사용자당 처리 중인 메시지 1건(ARCHITECTURE §7.5).
- 인덱스: `(user_id, created_at)`.
- 사용자당 대화방이 하나이므로 대화방 테이블은 없다.

### 3.7 `change_proposals`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | uuid | ✓ | 기본 키 |
| `user_id` | uuid | ✓ | `users` 참조 |
| `plan_id` | uuid | | `training_plans` 참조. 활성 계획이 없는 사용자의 기록 등록 제안은 비움 |
| `type` | enum `reschedule` / `goal_change` / `workout_log` | ✓ | PRD §6.5 |
| `source` | enum `chat` / `settings` | ✓ | 진입 경로. 이용량 차감 여부는 `type`, `source`, `quota_exempt`로 정한다 |
| `quota_exempt` | boolean | ✓ | 놓친 훈련이 많은 주의 일정 변경이라 차감하지 않는 제안(PRD §8.2). 기본값 false. 제안을 만들 때 정한다 |
| `status` | enum `pending` / `approved` / `cancelled` / `superseded` | ✓ | |
| `base_plan_version` | integer | | 제안 생성 시점의 계획 버전(`DI-03`) |
| `reason` | enum `schedule` / `fatigue` / `pain` | | 일정 변경의 사유 |
| `request` | jsonb | ✓ | 구조화된 요청 내용(변경 유형, 대상, 불가일 등) |
| `payload` | jsonb | ✓ | 계산된 변경 내용. 카드 표시와 승인 적용에 쓴다 |
| `result` | jsonb | | 승인 결과. 중복 승인 시 그대로 돌려준다(`DI-04`) |
| `expires_at` | timestamptz | ✓ | 만든 날의 자정(`Asia/Seoul` 기준 다음 날 0시, 초기값, `DI-05`) |
| `created_at` | timestamptz | ✓ | |
| `resolved_at` | timestamptz | | 승인·취소·대체 시각 |

- **부분 유일 인덱스**: `(user_id)` where `status = 'pending'`. 사용자당 대기 제안 1건(`DI-05`). 새 제안을 만들 때 같은 트랜잭션에서 기존 대기 제안을 `superseded`로 바꾼다.
- "만료" 상태는 저장하지 않는다. `status = 'pending'`이고 `expires_at`이 지났으면 만료다.
- `payload`의 형식은 `packages/shared`의 zod 스키마로 정의하고, 읽을 때마다 검증한다.

| `type` | `payload` 내용 |
|---|---|
| `reschedule` | 훈련별 변경 목록(훈련 ID, 동작: 이동 / 생략 / 완화, 변경 전, 변경 후), 영향 요약, 경고 |
| `goal_change` | 새 목표 값, 새 프로필 값(마이페이지에서 프로필을 함께 바꾼 경우), 삭제할 훈련 ID 목록, 새로 만들 훈련 목록, 경고 |
| `workout_log` | 기록 내용(날짜, 거리, 시간, 컨디션, 강도, 메모), 연결할 훈련 ID |

### 3.8 `plan_change_logs`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | uuid | ✓ | 기본 키 |
| `user_id` | uuid | ✓ | `users` 참조 |
| `plan_id` | uuid | ✓ | `training_plans` 참조 |
| `proposal_id` | uuid | ✓ | `change_proposals` 참조, **유일** |
| `plan_version` | integer | ✓ | 변경 후 계획 버전 |
| `before` | jsonb | ✓ | 바뀐 훈련과 목표의 변경 전 내용 |
| `after` | jsonb | ✓ | 변경 후 내용 |
| `reason` | text | | 사유 |
| `source` | enum `chat` / `settings` | ✓ | |
| `created_at` | timestamptz | ✓ | |

- `before`와 `after`의 형식은 `{ sessions: [{ id, date, type, distanceKm, durationMin }], goal: { goalDistance, goalTimeSec, raceDate } 또는 없음 }`이다. 바뀐 훈련만 담는다. 새로 생긴 훈련은 `after`에만, 지워진 훈련은 `before`에만 있다. 훈련 상세의 변경 이력(`GET /v1/sessions/{id}`)이 이 형식으로 읽는다.
- 추가만 한다(`DI-08`). 수정·삭제하는 코드를 두지 않으며, 계정 삭제 때만 지워진다.
- `proposal_id` 유일 제약은 한 제안이 두 번 적용되는 것을 DB 차원에서도 막는다.
- 운동 기록 등록 제안은 계획을 바꾸지 않으므로 이 테이블에 남기지 않는다.

### 3.9 `subscriptions`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `user_id` | uuid | ✓ | 기본 키, `users` 참조 |
| `product_id` | text | ✓ | 스토어 상품 ID(월간 / 연간) |
| `store` | enum `app_store` / `play_store` | ✓ | |
| `expires_at` | timestamptz | ✓ | 구독 서비스가 알려 준 만료 시각 |
| `will_renew` | boolean | ✓ | 자동 갱신 예정 여부 |
| `updated_at` | timestamptz | ✓ | |

- 행이 없으면 무료 사용자다.
- **Pro 판정**: 행이 있고 `expires_at`이 현재보다 뒤. 이 판정은 `usage` 모듈의 함수 하나에만 있다(`F10-R03`).
- 환불이 통지되면 `expires_at`을 통지 시각으로 바꾼다.

### 3.10 `subscription_events`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `event_id` | text | ✓ | 기본 키. 구독 서비스의 이벤트 ID |
| `user_id` | uuid | | `users` 참조 |
| `type` | text | ✓ | 이벤트 종류 |
| `payload` | jsonb | ✓ | 수신 내용 |
| `received_at` | timestamptz | ✓ | |

- 기본 키 충돌로 중복 수신을 무시한다. 결제 문의 대응의 근거 자료이기도 하다.

### 3.11 `usage_counters`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `user_id` | uuid | ✓ | 기본 키(1), `users` 참조 |
| `month` | char(7) | ✓ | 기본 키(2). `Asia/Seoul` 기준 `YYYY-MM` |
| `chat_count` | integer | ✓ | AI 대화 수. 기본값 0 |
| `reschedule_count` | integer | ✓ | AI 일정 변경 수. 기본값 0 |

- 달이 바뀌면 새 행이 생긴다. 초기화 작업이 없다.
- 증가는 "현재 값이 한도 미만일 때만 1 증가"하는 조건부 갱신으로 한다(`DI-12`).

**`usage_trials`** (가입 체험분, PRD §8.2)

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `identity_hash` | text | ✓ | 기본 키. `users.identity_hash`와 같은 값. `users`를 참조하지 않는다 |
| `chat_count` | integer | ✓ | 체험분에서 쓴 AI 대화 수. 기본값 0 |
| `reschedule_count` | integer | ✓ | 체험분에서 쓴 AI 일정 변경 수. 기본값 0 |
| `account_deleted_at` | timestamptz | | 계정을 삭제한 시각. 다시 가입하면 비운다 |

- 행이 없으면 하나도 쓰지 않은 것이다. 처음 차감할 때 만든다.
- 무료 요금제의 차감은 이 표를 먼저 조건부 갱신하고, 갱신된 행이 없으면(체험분을 다 썼으면) `usage_counters`를 조건부 갱신한다. 둘 다 갱신되지 않으면 한도 초과다(`DI-12`).
- 체험분의 크기는 설정 상수에 있다. 이 표에는 쓴 횟수만 둔다.
- 계정을 삭제해도 이 행은 남는다. 같은 로그인 계정으로 다시 가입하면 같은 행을 이어 쓰므로 체험분을 새로 받지 못한다(PRD §8.2, `DI-11`).
- `account_deleted_at`이 1년(초기값)을 넘은 행은 내부 작업이 지운다. 기간은 `D-12`에서 확정한다.
- 이 행에는 해시와 횟수만 있다. 해시의 비밀값은 다른 비밀값과 같이 호스팅 플랫폼의 비밀값 저장소에 둔다.

### 3.12 `ai_call_logs`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | uuid | ✓ | 기본 키 |
| `user_id` | uuid | | `users` 참조. 계정 삭제 시 비운다 |
| `purpose` | enum `chat` / `weekly_feedback` | ✓ | |
| `model` | text | ✓ | 모델 ID |
| `prompt_version` | text | ✓ | 시스템 지침 버전 |
| `input_tokens` / `output_tokens` | integer | ✓ | |
| `cached_input_tokens` | integer | | 프롬프트 캐시로 읽은 토큰 수 |
| `cost_usd` | numeric(10,6) | ✓ | 비용 추정치 |
| `tool_call_count` | smallint | ✓ | |
| `success` | boolean | ✓ | |
| `error_code` | text | | 실패 사유 코드 |
| `latency_ms` | integer | ✓ | |
| `created_at` | timestamptz | ✓ | |

- 채팅 본문과 응답 내용은 저장하지 않는다.
- 인덱스: `(user_id, created_at)`, `(created_at)`.
- 사용자별 월 AI 비용(`AC-F11-02`)은 이 테이블을 집계한다.

### 3.13 `weekly_summaries`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `user_id` | uuid | ✓ | 기본 키(1), `users` 참조 |
| `week_start` | date | ✓ | 기본 키(2). 그 주의 월요일 |
| `planned_count` | smallint | ✓ | 계획한 훈련 수(생략 제외) |
| `completed_count` | smallint | ✓ | 완료한 훈련 수 |
| `total_distance_km` | numeric(6,2) | ✓ | 그 주 모든 기록의 거리 합(자유 러닝 포함) |
| `ai_feedback` | text | | Pro 사용자에게만 생성(`F08-R02`) |
| `created_at` | timestamptz | ✓ | |

- 기본 키가 `(사용자, 주)`이므로 작업을 다시 실행해도 중복 생성되지 않는다.
- 일요일 저녁에 만든 뒤 그 주의 기록이 수정되어도 다시 계산하지 않는다. 채팅의 주간 분석(`F08-R05`)은 이 테이블이 아니라 실시간 조회 결과를 쓴다.

### 3.14 `notification_settings`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `user_id` | uuid | ✓ | 기본 키, `users` 참조 |
| `workout_reminder` | boolean | ✓ | 예정 운동 알림. 대회 전날 알림과 계획 종료 알림도 이 값을 따른다(`F09-R08`, `F09-R09`). 기본값 true |
| `reminder_hour` | smallint | ✓ | 알림 시각. 8~20, 기본값 8 |
| `missed_notice` | boolean | ✓ | 미완료 훈련 안내. 기본값 true |
| `weekly_summary` | boolean | ✓ | 주간 요약 알림. 기본값 true |

### 3.15 `push_tokens`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `token` | text | ✓ | 기본 키 |
| `user_id` | uuid | ✓ | `users` 참조 |
| `platform` | enum `ios` / `android` | ✓ | |
| `updated_at` | timestamptz | ✓ | |

- 한 사용자가 여러 기기를 쓸 수 있다. 같은 토큰이 다른 계정으로 등록되면 소유자를 바꾼다.
- 로그아웃 시 그 기기의 토큰을 지운다.

### 3.16 `notification_logs`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `user_id` | uuid | ✓ | 기본 키(1), `users` 참조 |
| `type` | enum `workout_reminder` / `missed_notice` / `weekly_summary` / `race_eve` / `plan_finished` | ✓ | 기본 키(2) |
| `date` | date | ✓ | 기본 키(3). 발송 기준 날짜 |
| `sent_at` | timestamptz | ✓ | |

- 행 추가에 성공한 경우에만 발송한다(ARCHITECTURE §11).

---

## 4. 주요 쓰기 처리와 트랜잭션

| 처리 | 한 트랜잭션 안에서 하는 일 |
|---|---|
| 계획 최초 저장 | 이전 활성 계획을 `ended`로 변경 → `training_plans` 추가 → `planned_sessions` 일괄 추가 |
| 제안 생성 | 기존 대기 제안을 `superseded`로 변경 → `change_proposals` 추가 |
| 일정 변경 승인 | 제안 잠금 → 계획 잠금·버전 확인 → 이용량 조건부 증가 → `planned_sessions` 수정(처음 바뀌는 훈련은 `original` 저장) → `plan_change_logs` 추가 → 계획 `version` 증가 → 제안 `approved` → 결과 메시지 추가 |
| 목표 변경 승인 | 위와 같되 훈련 수정 대신 "오늘 이후의 완료되지 않은 훈련 삭제 → 새 훈련 추가", 계획의 목표 컬럼 수정 |
| 기록 등록 승인 | 제안 잠금 → (훈련 연결 시) 계획 잠금 → `workout_logs` 추가 → 제안 `approved` → 결과 메시지 추가 |
| 기록 저장·수정·삭제(화면) | (훈련 연결 시) 계획 잠금 → `workout_logs` 변경 |
| 채팅 응답 완료 | AI 메시지 추가 → 사용자 메시지 `done` → `chat_count` 증가 |

- 잠금 순서는 항상 사용자 → 제안 → 계획이다. 제안 생성·승인·취소와 기록 저장이 모두 사용자 행을 먼저 잠근다.
- 목표 변경에서 삭제 대상은 연결된 기록이 없는 훈련뿐이다. 기록이 연결된 훈련은 날짜와 관계없이 남긴다(`DI-13`).
- 트랜잭션 격리 수준은 PostgreSQL 기본값을 쓴다. 정합성은 행 잠금과 유일 제약으로 확보한다.

---

## 5. 인덱스 요약

| 테이블 | 인덱스 | 용도 |
|---|---|---|
| `training_plans` | 부분 유일 `(user_id)` where active | 활성 계획 1개 |
| `planned_sessions` | 부분 유일 `(plan_id, date)` where not skipped | 하루 1훈련 |
| `planned_sessions` | `(user_id, date)` | 캘린더·주간 조회 |
| `workout_logs` | 유일 `(planned_session_id)` | 훈련당 기록 1개 |
| `workout_logs` | `(user_id, date)` | 기록 목록·통계 |
| `chat_messages` | 유일 `(user_id, client_message_id)` | 중복 전송 방지 |
| `chat_messages` | 부분 유일 `(user_id)` where processing | 동시 처리 1건 |
| `chat_messages` | `(user_id, created_at)` | 대화 조회 |
| `change_proposals` | 부분 유일 `(user_id)` where pending | 대기 제안 1건 |
| `plan_change_logs` | 유일 `(proposal_id)` | 제안당 적용 1회 |
| `ai_call_logs` | `(user_id, created_at)`, `(created_at)` | 비용 집계 |

부분 유일 인덱스는 Prisma 스키마 문법으로 표현할 수 없어 마이그레이션 SQL에 직접 쓴다. 이렇게 넣은 인덱스와 제약을 Prisma가 다음 마이그레이션에서 지우려 하지 않는 것을 확인했다. 그 밖의 인덱스는 실제 조회가 느려졌을 때 추가한다.

### 체크 제약

값의 범위는 서버 코드가 먼저 검증하고, DB가 마지막으로 한 번 더 막는다. 마이그레이션 SQL에 직접 쓴다.

| 테이블 | 제약 |
|---|---|
| `runner_profiles` | `weekly_run_count` 2~5, `recent_weekly_km` 0~100, `preferred_weekdays`는 1~7이고 개수가 `weekly_run_count` 이상 |
| `training_plans` | `version` 1 이상, `end_date`가 `start_date` 이후, `goal_distance`가 `none`이면 `kind`는 `base_building` 또는 `maintenance`이고 `goal_time_sec`과 `race_date`가 없음. `kind`가 `maintenance`면 `goal_distance`는 `none` |
| `planned_sessions` | `distance_km`와 `duration_min` 중 하나 이상 존재 |
| `workout_logs` | `distance_km` 0.1~100, `duration_sec` 60~43200, `condition` 1~5, `rpe` 1~10, `memo` 500자 이하 |
| `usage_counters` | `month`는 `YYYY-MM` 형식, 횟수는 0 이상 |
| `usage_trials` | 횟수는 0 이상 |
| `notification_settings` | `reminder_hour` 8~20 |

---

## 6. 정합성 규칙과 구현 위치

| 규칙 | DB에서 보장 | 애플리케이션에서 보장 |
|---|---|---|
| `DI-01` 변경 경로 단일화 | - | `planned_sessions` 수정 코드가 `proposal` 모듈에만 있음 |
| `DI-02` 승인은 단일 트랜잭션 | 트랜잭션 | §4 |
| `DI-03` 버전 확인 | 계획 행 잠금 | `base_plan_version` 비교 |
| `DI-04` 중복 승인 | 제안 행 잠금, `plan_change_logs.proposal_id` 유일 | 승인된 제안이면 `result` 반환 |
| `DI-05` 대기 제안 1건, 만료 | 부분 유일 인덱스 | `expires_at` 비교 |
| `DI-06` AI는 완료 훈련·기존 기록 변경 불가 | - | 도구에 수정·삭제 기능 없음, 승인 시 대상 재확인 |
| `DI-07` 사용자 소유권 | 모든 테이블에 `user_id` | 모든 조회에 `user_id` 조건 |
| `DI-08` 변경 이력 추가 전용 | - | 수정·삭제 코드 없음 |
| `DI-09` 날짜 기준 | `date` 타입 | "오늘" 계산 함수 하나 |
| `DI-10` 훈련·기록 1:1 | `planned_session_id` 유일 | - |
| `DI-11` 계정 삭제 | 연쇄 삭제(§7) | 외부 서비스 삭제 요청 |
| `DI-12` 이용량 원자적 증가 | 조건부 갱신 | - |
| `DI-13` 활성 계획 1개 | 부분 유일 인덱스 | 목표 변경 시 기록이 연결된 훈련 유지 |
| `TE-S05` 하루 1훈련 | 부분 유일 인덱스 | 검증기 |

---

## 7. 계정 삭제

`users` 행을 지우면 아래처럼 처리된다(`DI-11`).

| 테이블 | 처리 |
|---|---|
| `runner_profiles`, `training_plans`, `planned_sessions`, `workout_logs`, `chat_messages`, `change_proposals`, `plan_change_logs`, `subscriptions`, `usage_counters`, `weekly_summaries`, `notification_settings`, `push_tokens`, `notification_logs` | 연쇄 삭제 |
| `ai_call_logs` | `user_id`를 비우고 행은 남긴다. 본문이 없는 비용 통계다. |
| `subscription_events` | `user_id`를 비우고 행은 남긴다. 결제 관련 보존 대상 여부는 `D-12`에서 확인한다. |
| `usage_trials` | 행을 남기고 `account_deleted_at`을 채운다. 체험분을 다시 받지 못하게 하기 위해서다. 1년(초기값) 뒤 지운다. 보존 항목과 기간은 `D-12`에서 확인한다. |

`subscription_events.payload`에는 구독 서비스의 사용자 식별자(우리 사용자 ID)가 들어 있다. 보존 기간과 익명화 필요 여부를 `D-12` 검토 항목에 넣는다.

---

## 8. PRD §9 대비 변경 사항 (2026-11-14 승인)

| 변경 | 이유 |
|---|---|
| Goal을 `training_plans`에 합침 | 목표와 계획은 항상 함께 만들어지고 사용자당 활성 1개씩이다. 테이블을 나누면 두 개의 "활성 1개" 규칙을 따로 맞춰야 한다. 목표 변경 이력은 `plan_change_logs`에 남는다. |
| 온보딩 도중의 답변을 서버에 저장하지 않음 | 기기에만 저장한다. 같은 기기에서는 이어서 진행되고(`AC-F02-03`), 다른 기기로 로그인하면 온보딩을 처음부터 한다. 미완성 프로필 행을 다루지 않아도 된다. |
| 제안의 "만료" 상태를 저장하지 않음 | `expires_at` 비교로 판정한다. 만료 처리 작업이 필요 없다. |
| 훈련의 "완료" 상태를 저장하지 않음 | 연결된 기록의 유무로 판정한다(`DI-10`). |
| `planned_sessions.type`에 `race` 추가 | 대회 당일을 캘린더에 표시하기 위한 값이다(`TE-G08`). 훈련 종류 4종은 그대로다. |
| 이메일·이름을 저장하지 않음 | 서비스 기능에 쓰이지 않는다. 수집 항목이 줄어든다. |
| `push_tokens`를 별도 테이블로 분리 | 한 사용자가 여러 기기를 쓸 수 있다. |
| `subscription_events` 추가 | 웹훅 중복 수신 방지와 결제 문의 대응 |
| 운동 기록의 컨디션·운동 강도를 선택 입력으로 둠 | 채팅으로 기록할 때 사용자가 말하지 않은 값을 AI가 지어내지 않게 한다(`API_SPEC.md` §6에서 추가) |
| 컨디션을 받지 않고 `memo`를 통증 내용으로 씀 (2026-11-17) | 기록 입력을 줄인다(PRD `F07-R01`). 컬럼은 지우지 않아 마이그레이션이 필요 없다 |
| 홈의 "어제 훈련 기록" 카드를 닫은 사실을 저장하지 않음 (2026-11-17) | 기기에만 저장한다. 훈련 상태는 연결된 기록으로만 판정하고(§3.4), `planned_sessions`는 제안 승인으로만 바꾼다(`DI-01`) |
| `users.coach` 추가 (2026-11-18) | 사용자당 하나뿐인 설정이고 계정과 수명이 같아 `users`에 둔다. 바꾼 이력은 남기지 않는다. 이전 대화는 그대로 두고 다음 답변부터 말투만 바뀌기 때문이다(PRD `F04-R13`) |
