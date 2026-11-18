# PaceMate AI — MVP 전 긴급 작업 (P0)

**작성일**: 2026-11-18  
**상태**: 긴급  
**목적**: MVP 출시 전에 우선적으로 완료해야 하는 P0 작업 목록

---

## 읽기 전에

**이 문서는 현재 계획된 작업보다 우선합니다.** `DEVELOPMENT_PLAN.md`의 작업 순서와 충돌하면, 아래 P0 항목을 먼저 진행하고 개발자(석원님)에게 확인을 요청하세요.

---

## 배경 (2026-11-18 방향 검토)

설계대로 진행 중이지만, 현재 MVP는 "계획 앱에 채팅으로 일정을 조정하는 기능"에 가깝고, **채팅 앱**의 느낌이 약합니다. 가장 큰 격차는:

### 건강 데이터 연동이 없음
- 코치가 실제 러닝 기록을 보지 못하고, 사용자가 수동으로 입력해야 함
- 한국 경쟁사는 이미 건강 데이터 연동 + AI 코치를 제공:
  - **루핀**: 건강 데이터 + 채팅 코치
  - **런타인**: 계획/조정 구조가 거의 같음

### 우선순위
- 개발자는 iPhone 사용자 → **Apple 건강(HealthKit)이 먼저**, Android Health Connect는 P1
- 출시 전에 건강 데이터 연동이 없으면 경쟁력이 약함

---

## P0 긴급 작업 (MVP 전 완료 필수)

### 1. Apple 건강(HealthKit) 러닝 기록 읽기

#### 왜 긴급한가
- 수동 입력만으로는 사용자 경험이 불편하고 경쟁사 대비 뒤처짐
- 실제 기록이 있어야 코치가 제대로 동작 (Training Engine의 최근 기록 기준)
- iPhone 사용자가 주 타깃이므로 HealthKit이 먼저

#### MVP 범위
- **포함**:
  - 러닝 workout 읽기: 거리, 시간, 페이스, 날짜 (필수)
  - 심박수(선택, 있으면 가져오기)
  - 수동 입력과 자동 가져온 기록의 중복 제거
  - 권한 요청 흐름 (온보딩 또는 기록 탭)
  - 가져온 기록을 `workout_logs`에 저장 및 `planned_sessions`와 연결
- **제외**:
  - 걷기, 사이클, 수영 등 다른 운동
  - 실시간 동기화 (백그라운드 갱신은 P1)
  - 수면, 심박 변이도 등 고급 지표
  - Android Health Connect (P1, 별도 작업)

#### 영향받는 부분
- **새 파일**:
  - `apps/mobile/src/health/healthkit.ts` (HealthKit 연동)
  - `apps/mobile/src/health/sync.ts` (기록 동기화 로직)
- **기존 파일 수정**:
  - `apps/mobile/app.json`: HealthKit config plugin 추가
  - `apps/mobile/src/app/(tabs)/records.tsx`: [건강 앱에서 가져오기] 버튼
  - `services/api/src/records/records.service.ts`: 중복 제거 로직
  - `packages/shared/src/api.ts`: 건강 데이터 출처 필드 (`source: 'manual' | 'healthkit'`)
- **의존성**:
  - Expo 개발 빌드 필요 (Expo Go 불가, `ARCHITECTURE.md` §8)
  - `react-native-health` 또는 Expo health plugin 검토 필요

#### 완료 기준
- HealthKit 권한을 요청하고 승인하면 최근 30일 러닝 기록을 가져온다
- 같은 날짜+거리+시간의 기록은 중복으로 판단해 하나만 저장한다
- 가져온 기록이 기록 목록에 보이고 훈련과 자동 연결된다
- 수동 입력한 기록과 구분되어 표시된다
- iOS 시뮬레이터와 실기기에서 동작 확인

#### 작업 ID
- 새 작업 `T-303` (M3 기록에 추가)

---

### 2. Apple/Google 로그인 실제 연결 (D-A1)

#### 왜 긴급한가
- 기기 QA(`DEVELOPMENT_PLAN.md` §7, B-01~B-20)를 시작할 수 없음
- 로그인 화면 이후의 모든 흐름이 막혀 있음 (`session.ts`의 `signIn()`이 항상 오류)
- 온보딩, 계획 생성, 채팅, 기록 등 모든 기능 검증 불가

#### MVP 범위
- **포함**:
  - Supabase Auth 연동 (계획된 인증 서비스, `ARCHITECTURE.md` AD-05)
  - Apple 로그인: Sign in with Apple
  - Google 로그인: Google Sign-In
  - 토큰 발급 및 갱신
  - `apps/mobile/src/auth/session.ts`의 `signIn()` 구현
  - `services/api/src/auth`에서 토큰 검증
  - 계정 삭제 시 인증 서비스 쪽 삭제 연동
- **제외**:
  - 카카오 로그인 (MVP에서 제외, 출시 후 검토, `PRD.md` §1.4)

#### 영향받는 부분
- **기존 파일 수정**:
  - `apps/mobile/src/auth/session.ts`: `signIn()` 구현
  - `apps/mobile/src/api/client.ts`: 토큰 제공 (`setAccessTokenProvider`)
  - `services/api/src/auth/auth.guard.ts`: Supabase 토큰 검증
  - `services/api/src/auth/auth.service.ts`: 계정 삭제 시 Supabase 호출
  - `apps/mobile/app.json`: OAuth redirect URI 설정
- **환경 변수**:
  - `services/api/.env`: Supabase 프로젝트 URL, anon key, service role key
  - `apps/mobile/.env`: Supabase 프로젝트 URL, anon key

#### 완료 기준
- Apple, Google 각각으로 로그인·로그아웃이 동작한다 (`AC-F01-01`, `AC-F01-03`)
- 로그인 후 `/v1/me`를 호출해 프로필을 받는다
- 동의하지 않은 계정은 `CONSENT_REQUIRED`로 차단된다
- 계정 삭제 시 Supabase에서도 삭제되고, 재가입하면 신규 계정으로 시작된다 (`AC-F01-04`)
- iOS와 Android 실기기에서 동작 확인

#### 작업 ID
- 기존 `T-106`의 남은 부분 완료

---

### 3. 체험분 한도 실제 적용 (T-410)

#### 왜 긴급한가
- `packages/shared/src/config.ts`의 `TRIAL_LIMITS`는 정의되어 있지만
- `services/api/src/usage/usage.service.ts`가 체험분을 무시하고 있음
- 무료 사용자가 월 5회만 쓸 수 있어, 체험분 없이는 제품을 제대로 경험할 수 없음
- `AC-F10-05`, `AC-F10-07` 인수 기준 미충족

#### MVP 범위
- **포함**:
  - `usage_trials` 테이블 생성 및 마이그레이션 (`DATABASE.md` §3.11)
  - `users.identity_hash` 컬럼 추가 (로그인 계정 식별자 해시)
  - `usage.service.ts`에 체험분 로직 추가:
    - 체험분이 남아 있으면 체험분에서 차감
    - 다 쓰면 월 한도에서 차감
    - Pro 전환 시 체험분 차감 중단, 무료 복귀 시 재개
  - `packages/shared/src/api.ts`의 `usageSchema`에 `pool: 'trial' | 'month'` 추가
  - 탈퇴 시 프로필·계획·기록은 삭제, `usage_trials`만 1년간 보존
  - 재가입 시 같은 `identity_hash`면 체험분 이어서 사용
- **제외**: 없음

#### 영향받는 부분
- **새 파일**:
  - `services/api/prisma/migrations/xxx_add_usage_trials.sql`
  - `services/api/prisma/migrations/xxx_add_identity_hash.sql`
- **기존 파일 수정**:
  - `services/api/src/usage/usage.service.ts`: 체험분 로직
  - `services/api/src/auth/auth.service.ts`: 로그인 시 `identity_hash` 생성·저장
  - `services/api/src/users/users.service.ts`: 계정 삭제 시 체험분 보존
  - `packages/shared/src/api.ts`: `usageSchema`에 `pool` 추가
  - `apps/mobile/src/app/(tabs)/coach.tsx`: 이용량 표시 변경
  - `apps/mobile/src/app/(tabs)/my.tsx`: 이용량 표시 변경

#### 완료 기준
- 무료 사용자의 첫 대화는 체험분(30회)에서 차감된다 (`AC-F10-05`)
- 체험분을 다 쓴 응답 아래에 한 줄 안내가 보인다
- 이후 대화는 월 한도(5회)에서 차감된다
- Pro 전환 후 무료 복귀 시 체험분이 남아 있으면 이어서 쓴다
- 탈퇴 후 재가입 시 체험분이 이어진다 (`AC-F10-07`)
- 동시 요청에도 한도를 넘지 않는다 (`AC-F10-04`)

#### 작업 ID
- 기존 `T-410`

---

### 4. 코치 채팅·제안 카드 (M4: T-403 → T-405/T-406/T-408)

#### 왜 긴급한가
- 제품의 **핵심 차별화 기능**
- 코치 탭이 아직 placeholder 상태
- 일정 변경 제안·승인 없이는 MVP가 아님

#### MVP 범위
- **포함**:
  - `T-403`: 제안 모듈 (생성, 승인 트랜잭션, 취소, 목표·프로필 변경)
  - `T-405`: 도구 레지스트리와 도구 7개
  - `T-406`: 메시지 처리기, 컨텍스트 구성기, 시스템 지침 v1, 채팅 API
  - `T-408`: AI 코치 화면 (대화, 카드 5종, 빠른 질문, 재전송, 승인·취소)
- **제외**: 없음 (M4 전체가 핵심)

#### 영향받는 부분
- **새 파일**:
  - `services/api/src/proposal/` (제안 모듈 전체)
  - `services/api/src/chat/` (채팅 모듈 전체)
  - `services/api/src/chat/llm/` (LLM 게이트웨이, 도구 레지스트리)
  - `services/api/src/chat/tools/` (7개 도구)
  - `apps/mobile/src/app/(tabs)/coach.tsx` (채팅 화면)
  - `apps/mobile/src/chat/` (채팅 컴포넌트: 카드, 메시지)
- **기존 파일 수정**:
  - `packages/shared/src/api.ts`: 채팅·제안 스키마
  - `services/api/src/app.module.ts`: 채팅·제안 모듈 등록

#### 완료 기준
- 시나리오 S2(여행 일정 반영), S3(컨디션 저하), S4(채팅 기록 등록)가 처음부터 끝까지 동작한다
- 변경 제안 카드에 전후 비교, 이유, [적용하기]/[다른 방법 보기]가 보인다
- [적용하기]를 누르면 캘린더에 반영된다 (`AC-F05-01`)
- 중복 승인, 버전 불일치, 만료 시 적절히 처리한다 (`AC-F05-04`, `AC-F05-05`, `AC-F05-11`)
- 통증 표현에 진단·치료 없이 진료 안내가 포함된다 (`AC-F04-04`)

#### 작업 ID
- 기존 `T-403`, `T-405`, `T-406`, `T-408`
- `DEVELOPMENT_PLAN.md`에서 "대기" 상태

---

### 5. 코치가 먼저 말 걸기 (최소형)

#### 왜 긴급한가
- 사용자가 앱을 잊지 않도록 re-engagement 필요
- 현재 계획: 사용자가 먼저 말을 걸어야만 코치가 응답
- 최소형: LLM 없이 템플릿 기반 알림으로 시작

#### MVP 범위
- **포함**:
  - 템플릿 기반 로컬/푸시 알림 (LLM 호출 없음)
  - 코치 말투별 문구 (온이/수리/번개)
  - 알림 종류:
    - 놓친 훈련 안내 (다음 날 오전 9시, 이미 `F09-R11`에 있음)
    - 주 시작 전 리마인더 (일요일 저녁, 선택)
    - 주간 요약 (일요일 저녁, 이미 `F09-R01`에 있음)
  - 알림을 누르면 해당 화면으로 이동
- **제외**:
  - LLM이 생성한 메시지
  - 실시간 대화 시작
  - 복잡한 컨텍스트 기반 알림

#### 영향받는 부분
- **기존 파일 수정**:
  - `services/api/src/notifications/templates.ts`: 코치별 문구 추가
  - `services/api/src/notifications/notifications.service.ts`: 코치 정보 조회 후 문구 선택
  - `services/api/src/scheduled/send-reminders.ts`: 주 시작 전 리마인더 (선택)
- **결정 필요**:
  - `D-16`: 알림 문구에 코치 말투를 쓸지 중립 문구로 고정할지

#### 완료 기준
- 놓친 훈련 안내가 코치별 말투로 온다
- 주간 요약 알림이 코치별 말투로 온다
- 알림을 누르면 해당 화면(홈 또는 기록 탭)으로 이동한다
- 코치를 바꾸면 다음 알림부터 바뀐 말투로 온다

#### 작업 ID
- 기존 `T-601` 확장
- `DEVELOPMENT_PLAN.md` §4에 `D-16` 추가

---

### 6. 무료 월 5회 한도 검증 장치

#### 왜 긴급한가
- 무료 한도(월 5회)가 사용자 경험을 해칠 수 있음
- 출시 후 한도를 조정하려면 앱 업데이트 필요 (스토어 심사 대기)
- **한도가 engagement에 미치는 영향**을 측정하고, **서버에서 즉시 조정 가능**해야 함

#### MVP 범위
- **포함**:
  - 분석 이벤트 추가:
    - `trial_exhausted`: 체험분을 다 쓴 시점
    - `monthly_limit_reached`: 월 한도에 도달한 시점
    - `paywall_viewed_from_limit`: 한도 도달 후 페이월 노출
  - 측정 지표 정의:
    - 체험분 소진율 (7일/14일/30일)
    - D7/D30 재방문률 (체험분 사용자 vs 월 한도 사용자)
    - 페이월 노출 → 결제 전환율
  - **서버 설정으로 한도 변경 가능**:
    - `packages/shared/src/config.ts`의 `PLAN_LIMITS`, `TRIAL_LIMITS`만 고치면 반영
    - 앱 업데이트 없이 서버 배포만으로 한도 조정
    - 환경 변수로도 override 가능 (초기값은 config.ts)
- **제외**:
  - A/B 테스트 (수동 분석으로 충분)
  - 실시간 대시보드 (출시 후 검토)

#### 영향받는 부분
- **기존 파일 수정**:
  - `services/api/src/usage/usage.service.ts`: 한도 도달 시 이벤트 발송
  - `services/api/src/analytics/analytics.service.ts`: 이벤트 정의 추가
  - `apps/mobile/src/api/query-client.ts`: 한도 안내 카드 표시 시 이벤트
  - `packages/shared/src/config.ts`: 환경 변수 override 로직 (선택)

#### 완료 기준
- 체험분 소진 시 `trial_exhausted` 이벤트가 기록된다
- 월 한도 도달 시 `monthly_limit_reached` 이벤트가 기록된다
- 페이월 노출 시 `paywall_viewed` 이벤트에 `source: 'limit'`가 포함된다
- PostHog 또는 선택한 분석 도구에서 위 지표를 조회할 수 있다
- `config.ts`의 값을 고치고 배포하면 한도가 바뀐다 (앱 업데이트 없이)

#### 작업 ID
- 새 작업 `T-505` (M5 분석/구독에 추가)

---

## P1 작업 (MVP 직후 우선순위)

아래는 출시 직후 빠르게 추가할 항목들입니다. MVP에는 포함하지 않지만, 사용자 피드백에 따라 우선순위가 바뀔 수 있습니다.

### 1. Android Health Connect 연동
- Apple 건강 연동과 같은 구조
- 작업 ID: 새 작업 `T-304`

### 2. 코치 memory (대화 이력 기반 개인화)
- 사용자의 선호, 패턴을 기억해 응답에 반영
- LLM 컨텍스트에 요약 추가

### 3. 음성 run logging
- 러닝 중 음성으로 "5km 30분 뛰었어" → 기록 등록
- 음성 인식 API 연동 필요

### 4. Growing coach character
- 훈련 달성, 마일스톤에 따라 코치가 성장
- 배지, 레벨업 등 gamification

### 5. 대회 정보 연동
- 국내 마라톤 대회 일정 자동 제안
- 수동 입력 대신 선택

### 6. Strava / Garmin 연동
- 외부 플랫폼의 러닝 기록 가져오기

### 7. 카카오 로그인
- Supabase가 네이티브 지원 (나중 추가 비용 작음)
- 현재 MVP에서 제외 (`PRD.md` §1.4)

---

## P2 작업 (출시 후 검토)

- 실시간 음성 AI 코칭
- 러닝 크루/커뮤니티
- Apple Watch 앱
- 자동 대회 접수

---

## 작업 순서 및 의존성

```
우선순위 1 (병행 가능):
├─ T-106 (Apple/Google 로그인) ← 모든 기기 QA의 선행 조건
├─ T-410 (체험분 한도) ← 이용량 모듈 완성
└─ T-303 (HealthKit 연동) ← 새 작업

우선순위 2 (T-106 완료 후):
├─ T-403, T-405, T-406, T-408 (코치 채팅·제안 카드) ← 제품 핵심
└─ T-601 확장 (코치 먼저 말 걸기)

우선순위 3 (분석):
└─ T-505 (한도 검증 장치) ← M5와 병행
```

---

## `DEVELOPMENT_PLAN.md`에 반영할 내용

### 새 작업 추가
- `T-303`: Apple 건강(HealthKit) 러닝 기록 읽기 (P0, M3 기록에 추가)
- `T-505`: 무료 월 5회 한도 검증 장치 (P0, M5 분석/구독에 추가)
- `T-304`: Android Health Connect 연동 (P1, MVP 직후)

### 작업 상태 업데이트
- `T-411`: "진행" → "검토" (PR #46에서 이미 병합됨)

### §7 빌드 확인 요청
- B-01~B-20: `T-106` (로그인 연결) 완료 후 시작 가능

---

## `DECISIONS.md`에 기록할 내용

```markdown
## 2026-11-18 — Apple 건강 연동을 MVP 범위에 넣음 (iOS 먼저)

개발자가 방향 검토 후 Apple 건강(HealthKit) 연동을 MVP에 포함하기로 결정했다. Android Health Connect는 P1(MVP 직후)로 미룬다.

| 항목 | 결정 |
|---|---|
| Apple 건강 연동 | MVP 범위에 포함. 러닝 workout 읽기(거리, 시간, 페이스, 날짜, 심박수 선택), 중복 제거, 권한 요청 |
| Android Health Connect | P1. iOS 연동 완료 후 진행 |
| 배경 | 한국 경쟁사(루핀, 런타인)는 이미 건강 데이터 + AI 코치 제공. 수동 입력만으로는 사용자 경험 부족. 개발자가 iPhone 사용자이므로 iOS 우선 |
```

---

## 참고

- 이 문서의 작업 ID와 파일 경로는 2026-11-18 시점의 저장소 상태 기준입니다.
- 충돌이나 불명확한 부분은 개발자에게 확인을 요청하세요.
- 작업을 시작하기 전에 `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`의 관련 절을 먼저 읽으세요.
