# PaceMate AI(가칭) — AI 도구 공통 작업 지침

이 파일은 Codex CLI와 Claude Code가 함께 읽는다. `CLAUDE.md`가 이 파일을 불러오므로 **공통 지침은 여기에만 쓴다.** 두 파일에 같은 내용을 나눠 쓰지 않는다.

---

## ⚠️ 작업 시작 전 필독

**[`docs/URGENT_PRE_MVP.md`](docs/URGENT_PRE_MVP.md)를 먼저 읽으세요.**  
이 문서에 있는 P0 긴급 작업이 `DEVELOPMENT_PLAN.md`의 다른 작업보다 우선합니다. 계획과 충돌하면 개발자(석원님)에게 확인을 요청하세요.

---

## 프로젝트

대화로 러닝 훈련 계획과 운동 기록을 관리하는 AI 러닝 매니저 모바일 앱이다(iOS / Android, 한국 시장). 실제 출시와 유료 사용자 확보가 목표인 1인 개발 프로젝트이며, Claude Code와 Codex CLI를 함께 쓴다.

## 현재 상태

설계 문서와 기반 코드 위에 M1~M3 기능(온보딩, 계획 생성·유지 계획, 홈·캘린더, 운동 기록, 코치 고르기)과 M4의 서버 기반(Engine 변경기, 이용량, LLM 게이트웨이, 제안·승인 모듈), 채팅 서버(`T-405`, `T-406`)와 AI 코치 화면(`T-408`), Apple 건강 기록 가져오기(`T-303`)가 들어가 있다. 로그인 연결(`T-106`, `D-A1`), 실제 LLM 공급자(`T-407`, `D-A3`), 가입 체험분(`T-410`), 구독, 알림은 아직 없다. 그래서 채팅과 로그인 뒤 흐름은 테스트로만 검증했고 기기 확인은 남아 있다. 기능 작업은 두 도구가 나눠서 병행한다. 진행 상황은 `docs/DEVELOPMENT_PLAN.md`의 작업 표가 기준이다.

## 문서

| 문서 | 내용 | 읽는 때 |
|---|---|---|
| `PROJECT_CONTEXT.md` | 사업 배경, 확정 사항, 공통 원칙(§16) | 처음 한 번 |
| `docs/DECISIONS.md` | 확정된 의사결정 기록 | 기술 선택이 궁금할 때 |
| `docs/PRD.md` | 기능 요구사항, 안전·정합성 규칙, 인수 기준 | 모든 작업 전에 해당 요구사항 ID를 찾아 읽는다 |
| `docs/ARCHITECTURE.md` | 시스템 구성, 모듈 경계, 처리 방식 | 새 모듈이나 외부 연동을 다룰 때 |
| `docs/DATABASE.md` | 테이블, 제약, 인덱스 | DB를 읽거나 쓰는 코드를 다룰 때 |
| `docs/API_SPEC.md` | HTTP API, LLM 도구 인터페이스 | 엔드포인트, 앱의 API 호출, 도구를 다룰 때 |
| [`docs/UI_UX.md`](docs/UI_UX.md) | 디자인 토큰, 컴포넌트, 화면 설계, 문구 기준, Figma 원본과 프로토타입 링크 | 화면을 만들거나 고칠 때 |
| [`docs/design/README.md`](docs/design/README.md) | 화면 참조 이미지, 아이콘, 코치 이미지, Figma MCP 없이 UI 검증하는 절차 | UI를 검증할 때. Figma MCP 대신 저장소 파일을 쓴다 |
| `docs/DEVELOPMENT_PLAN.md` | 작업 목록, 순서, 상태 | 작업을 시작하고 끝낼 때 |

문서가 서로 다르면 `PROJECT_CONTEXT.md`의 확정 사항 → `DECISIONS.md` → `PRD.md` → 나머지 순으로 우선한다. 충돌을 발견하면 임의로 고치지 말고 개발자에게 알린다.

UI를 확인하거나 구현할 때는 [`docs/design/README.md`](docs/design/README.md)의 참조 이미지와 자산으로 검증한다(Figma MCP 할당량 절약). Figma 원본은 [`docs/UI_UX.md`의 Figma 참조](docs/UI_UX.md#figma-참조)에 있다. 시안과 요구사항이 다르면 차이를 기록하고 위 문서 우선순위를 따른다.

## 작업 절차

1. `docs/DEVELOPMENT_PLAN.md`에서 작업 ID(`T-nnn`)를 확인한다. 선행 작업이 끝났는지 보고, 상태를 "진행"으로 바꾼다.
2. 작업에 적힌 요구사항 ID를 `PRD.md`에서 읽고, 관련된 설계 문서의 절을 읽는다.
3. 구현하고 테스트를 작성해 실행한다.
4. 작업의 완료 조건을 확인하고 상태를 "검토"로 바꾼다. "완료"는 개발자가 정한다.
5. 구현한 요구사항 ID, 테스트 결과, 남은 문제를 보고한다. 실패한 테스트나 건너뛴 부분을 숨기지 않는다.
   기기에서 봐야 하는 것이 있으면 `docs/DEVELOPMENT_PLAN.md` §7에 확인 요청을 적는다.
6. 구현하다가 문서와 다르게 해야 할 이유가 생기면 멈추고 문서 수정을 먼저 제안한다.

## 반드시 지킬 구조 규칙

어기면 안전성이나 데이터 정합성이 깨지는 규칙이다. 근거는 괄호 안의 문서에 있다.

1. **LLM 도구에 데이터를 바꾸는 기능을 넣지 않는다.** 도구는 조회와 제안 생성만 한다. 실제 변경은 사용자의 버튼 승인으로만 일어난다(PRD §6.1).
2. **`planned_sessions`를 수정하는 코드는 `proposal` 모듈의 승인 처리에만 둔다**(PRD `DI-01`).
3. **`packages/training-engine`은 순수 로직이다.** DB, 네트워크, 파일, 시스템 시각에 접근하지 않는다. 오늘 날짜는 인자로 받는다(ARCHITECTURE §6).
4. **훈련의 종류·거리·강도는 Training Engine만 정한다.** LLM이 만든 수치를 저장하거나 사용자에게 제안하지 않는다(PRD `AI-03`).
5. **검증기를 통과하지 못한 계획이나 변경안은 저장하지도 제안하지도 않는다**(PRD `TE-S12`).
6. **LLM을 호출하는 코드는 LLM 게이트웨이 한 곳에만 둔다**(ARCHITECTURE §7.2).
7. **사용자 ID는 검증된 토큰에서만 얻는다.** 요청에 담긴 사용자 ID를 믿지 않고, 모든 조회에 사용자 조건을 건다(PRD `DI-07`).
8. **새 테이블에는 행 수준 보안을 켜고 정책을 만들지 않는다**(DATABASE §1).
9. **비밀값을 저장소와 앱 번들에 넣지 않는다.**
10. **채팅 본문과 메모를 로그, 분석 이벤트, 오류 보고에 남기지 않는다**(PRD `F11-R04`).
11. **실패를 성공처럼 표시하지 않는다.** 화면에서도, 작업 보고에서도 마찬가지다(PRD `F05-R07`).

## 범위

- PRD §1.4의 제외 기능과 ARCHITECTURE §19의 "쓰지 않는 것"은 만들지 않는다. 필요하다고 판단되면 먼저 제안한다.
- 문서에 정해진 것 외의 의존성은 추가하기 전에 이유와 함께 제안한다.
- 아직 정해지지 않은 사항은 임의로 확정하지 않는다: LLM 공급자(`D-03`), 훈련 안전 수치와 기준 계획표(`D-04`), 법률 검토(`D-12`), 서비스명(`D-14`).
- 요청받은 작업 범위를 넘는 리팩터링이나 기능 추가를 하지 않는다.

## 코드 규칙

- 설명, 문서, 커밋 메시지는 한국어로 쓴다. 코드 식별자는 영어 관례를 따른다.
- TypeScript `strict`를 켠다.
- 요청·응답·도구 인자의 형식은 `packages/shared`의 zod 스키마로 한 번만 정의하고 앱과 서버가 함께 쓴다.
- 문서에 (초기값)으로 표시된 수치는 설정 상수 한 곳에 둔다.
- 날짜는 `YYYY-MM-DD` 문자열로 주고받는다. "오늘"은 서버의 함수 하나로만 계산한다(ARCHITECTURE §13).
- 주석은 코드로 드러나지 않는 이유만 한 줄로 쓴다.
- 새 로직에는 테스트를 붙인다. Training Engine은 규칙마다 테스트를 두고 테스트 이름에 규칙 ID(`TE-S01` 등)를 넣는다. 트랜잭션과 유일 제약은 실제 PostgreSQL로 검증한다.
- 사용자에게 보이는 문구는 쉬운 한국어 존댓말로 쓴다. 러닝 전문 용어를 그대로 노출하지 않는다(UI_UX §9).
- 화면 코드에 색상 값과 크기 숫자를 직접 쓰지 않는다. `apps/mobile/src/ui`의 컴포넌트와 토큰을 쓴다(UI_UX §3, §4).
- 구조 규칙의 일부(패키지 의존 규칙, Training Engine의 순수성, 훈련 수정 위치, 앱의 색상 값)는 린트가 검사한다(`eslint.config.mjs`). 걸리면 규칙을 끄지 말고 구조를 고친다. 규칙을 바꿀 때는 `eslint.config.test.ts`에 사례를 더한다.

## 두 도구의 협업

- 작업 하나는 한 도구가 맡는다. 다른 도구가 "진행" 중인 작업의 파일을 고치지 않는다.
- 다른 도구가 작성한 코드를 임의로 덮어쓰지 않는다. 고쳐야 하면 이유를 보고한다.
- **작업 폴더는 도구마다 다르다.** Claude Code는 `pacemate`, Codex CLI는 그 옆의 `pacemate-codex`에서 작업한다. 둘은 같은 저장소의 git worktree다. 상대 도구의 폴더에서 파일을 고치거나 브랜치를 바꾸지 않는다.
  - 한 브랜치는 한 폴더에서만 열리므로 로컬 `main`을 체크아웃하지 않는다. 새 작업은 `git fetch origin` 뒤 `git switch -c task/T-nnn-짧은-설명 origin/main`으로 시작한다.
  - `node_modules`, 빌드 결과, `.env`는 폴더마다 따로 있다.
  - 로컬 DB 컨테이너는 하나를 함께 쓰고 DB 이름만 나눈다. 같은 DB를 쓰면 동시에 돌린 테스트가 서로의 데이터를 지운다. Codex는 `services/api/.env`의 `DATABASE_URL`에 `pacemate_codex`를 쓰고, 테스트와 `pnpm check` 앞에 `TEST_DATABASE_URL=postgresql://pacemate:pacemate@localhost:5433/pacemate_codex_test`를 붙인다.
  - 컨테이너는 어느 폴더에서든 `docker compose -f ../pacemate/docker-compose.yml up -d`로 띄운다. `pacemate-codex`에서 `docker compose up -d`를 실행하면 컨테이너가 하나 더 생겨 포트가 겹친다.
- 작업마다 브랜치를 쓴다: `task/T-nnn-짧은-설명`. 커밋 메시지에 작업 ID와 요구사항 ID를 넣는다.
- 작업이 끝나 상태를 "검토"로 바꾸면 작업 브랜치에 커밋하고 푸시한 뒤 `main`으로 PR을 올린다. PR 본문에 작업 ID, 요구사항 ID, 테스트 결과, 남은 문제를 적는다.
- `main`에 직접 커밋하거나 푸시하지 않는다. 병합은 개발자가 한다.
- 한 도구가 구현한 작업은 다른 도구가 PRD §11의 인수 기준으로 검토한다.
- 작업별 담당은 `docs/DEVELOPMENT_PLAN.md` §5에 있다. 자기 담당이 아닌 작업은 시작하지 않는다. 담당을 바꾸려면 개발자에게 제안한다.
- **앱 빌드는 개발자가 하고, 기기 확인은 개발자가 요청할 때 도구가 Maestro로 한다.** 도구는 개발 빌드(`ios`, `android`), 시뮬레이터·에뮬레이터 실행, EAS 빌드를 돌리지 않는다. `pnpm check`는 도구가 돌린다. 기기에서 봐야 하는 것은 `docs/DEVELOPMENT_PLAN.md` §7에 준비·순서·기대 결과를 적고, 확인을 기다리지 않고 "검토"로 넘긴다. 확인 요청을 적을 때 `apps/mobile/maestro/`에 그 흐름을 더한다.
  - 개발자가 빌드한 앱을 시뮬레이터에 띄우고 확인을 요청하면, 도구는 `apps/mobile/maestro/README.md`대로 흐름을 돌리고 스크린샷을 기대 결과와 비교해 §7의 결과 칸을 채운다. 눈으로 본 것과 흐름이 통과한 것을 구분해 적고, 못 본 부분은 "일부 확인"으로 남긴다.
  - 앱 데이터를 지우는 흐름(`clearState`)은 기기에 저장된 온보딩 답변과 번들러 연결을 지운다. 돌리기 전에 개발자에게 알린다.

## 명령어

저장소 루트에서 실행한다. Node 22 이상과 pnpm이 필요하다(pnpm 버전은 `package.json`의 `packageManager`를 따른다).

| 명령 | 하는 일 |
|---|---|
| `pnpm install` | 의존성 설치 |
| `pnpm build` | 모든 패키지 빌드. 의존 순서대로 실행된다 |
| `pnpm typecheck` | 모든 패키지의 타입 검사 |
| `pnpm lint` | 저장소 전체 린트(ESLint) |
| `pnpm test` | 모든 패키지의 테스트 |
| `pnpm check` | 빌드 → 타입 검사 → 린트 → 테스트. 작업을 끝내기 전에 통과시킨다 |
| `pnpm --filter @pacemate/api test` | 한 패키지만 실행(패키지 이름을 바꿔 쓴다) |
| `pnpm --filter @pacemate/api dev` | API를 감시 모드로 실행. `services/api/.env`가 필요하다(`.env.example` 참고) |
| `docker compose up -d` | 로컬 PostgreSQL 실행(포트 5433). API 실행과 API 테스트에 필요하다. `pacemate` 폴더에서만 이렇게 실행한다("두 도구의 협업" 참고) |
| `pnpm --filter @pacemate/api db:migrate` | 스키마 변경으로 새 마이그레이션을 만들고 개발 DB에 적용 |
| `pnpm --filter @pacemate/mobile ios` | iOS 개발 빌드를 만들어 시뮬레이터에서 실행. CocoaPods가 필요하다. 개발자가 실행한다 |
| `pnpm --filter @pacemate/mobile android` | Android 개발 빌드를 만들어 에뮬레이터에서 실행. 아래 환경 변수가 필요하다. 개발자가 실행한다 |
| `pnpm --filter @pacemate/mobile dev` | 이미 설치된 개발 빌드에 연결할 번들러만 실행 |

- 패키지: `@pacemate/shared`(`packages/shared`), `@pacemate/training-engine`(`packages/training-engine`), `@pacemate/api`(`services/api`), `@pacemate/mobile`(`apps/mobile`).
- **`packages/*`를 고친 뒤에는 `pnpm build`를 다시 실행한다.** API는 패키지의 소스가 아니라 빌드 결과(`dist`)를 쓴다. 빌드하지 않으면 API의 타입 검사와 테스트가 이전 내용을 본다.
- API와 패키지는 ESM이다. 상대 경로 import에 `.js` 확장자를 붙인다(`import { x } from './file.js'`).
- 테스트는 API와 패키지가 Vitest, 앱이 Jest다(`AD-12`). 테스트 함수는 `vitest`에서 직접 import한다. 앱의 컴포넌트 테스트는 `@testing-library/react-native`로 쓴다.
- 테스트 파일은 대상 파일 옆에 `*.test.ts`로 둔다. API의 HTTP 수준 테스트는 `services/api/test/`에 둔다. 앱의 `src/app/` 안에는 테스트를 두지 않는다. 그 폴더의 파일은 모두 화면으로 묶여 앱이 뜨지 않는다. 화면 테스트는 `apps/mobile/src/__tests__/`에 둔다.
- TypeScript는 6 버전을 쓴다. 7 버전은 typescript-eslint가 지원하지 않는다.
- Prisma는 7 버전을 쓴다. npm의 `latest`가 8의 출시 후보(RC)를 가리키므로 버전을 지정해 설치한다.
- API 테스트는 `pacemate_test` DB를 쓰고 테스트마다 테이블을 비운다. 마이그레이션은 테스트 시작 때 자동으로 적용된다. 이름이 `_test`로 끝나지 않는 DB에서는 테스트가 실행되지 않는다.
- 앱(`apps/mobile`)
  - Expo Go로는 실행하지 않는다. 개발 빌드를 쓴다(ARCHITECTURE §8).
  - Android 빌드에는 `ANDROID_HOME`(Android SDK 경로)과 `JAVA_HOME`(JDK 경로)이 필요하다. Android Studio에 포함된 JDK를 쓸 수 있다.
  - 에뮬레이터에서 로컬 API를 쓰려면 `adb reverse tcp:3000 tcp:3000`을 먼저 실행한다. 앱의 API 주소는 `apps/mobile/.env`의 `EXPO_PUBLIC_API_URL`이다(`.env.example` 참고).
  - 네이티브 모듈이 있는 패키지는 `pnpm --filter @pacemate/mobile exec expo install <패키지>`로 추가한다. Expo SDK에 맞는 버전이 설치된다.
  - `ios/`와 `android/` 폴더는 빌드 때 생성되며 커밋하지 않는다. 네이티브 설정은 `app.json`과 설정 플러그인으로 한다.
  - API는 `src/api/client.ts`의 `apiFetch`로만 호출한다. 응답은 `packages/shared`의 스키마로 검증된다.
  - 앱을 열 때 갈 화면은 `src/app/index.tsx`가 `GET /v1/me`로 정한다. 로그인 세션은 `src/auth/session.ts`만 다룬다(인증 SDK는 `D-A1` 뒤에 여기에 붙인다).
  - 온보딩 답변은 `src/onboarding/draft.ts`가 기기의 보안 저장소에 둔다. 서버에는 온보딩을 마칠 때 한 번 보낸다.
  - `401`, `426`, `CONSENT_REQUIRED` 오류는 `src/api/query-client.ts`가 로그인·업데이트·동의 화면으로 보낸다. 화면마다 따로 처리하지 않는다.
  - 내부 테스트와 스토어 빌드는 EAS로 만든다(`eas.json`). 계정과 서명 설정은 `T-504`에서 한다.
- 엔드포인트의 요청·응답 스키마는 `packages/shared/src/api.ts`에 있다. 엔드포인트와 화면은 이 스키마를 쓰고, 형식을 바꿀 때는 `docs/API_SPEC.md`를 먼저 고친다.
- API에서 "오늘" 날짜는 `services/api/src/common/today.ts`의 `today()`로만 구한다.
- LLM은 `services/api/src/chat/llm/llm-gateway.ts`의 `LlmGateway`로만 호출한다. 호출 기록은 게이트웨이가 남긴다. 테스트에서는 `FakeLlmProvider`에 응답 대본을 준다. `chat` 모듈만 쓰는 (초기값) 수치는 `services/api/src/chat/chat.config.ts`에 둔다.
- 필수 동의를 마치지 않은 계정의 요청은 `ConsentGuard`가 `CONSENT_REQUIRED`로 거절한다. 동의 전에도 호출할 수 있어야 하는 경로(`/v1/me`)에만 `@AllowUnregistered()`를 붙인다(`services/api/src/auth/consent.guard.ts`).
- 계획 생성(`generate`)과 수준 분류(`classifyLevel`)의 수치는 `packages/training-engine/src/safety-config.ts`의 `PLAN`에, 검증기의 수치는 같은 파일의 `SAFETY`에 있다. 생성기는 검증기를 통과한 계획만 돌려주지만, 저장하기 전에 API가 `validate`를 다시 부른다(`TE-S12`). 경고 코드와 문구는 `packages/shared`의 `planWarningSchema`, `PLAN_WARNING_LABELS`에 있다.
- 계획 API는 `services/api/src/plan`에 있다. Training Engine의 `generate`, `validate`는 `TRAINING_ENGINE`으로 주입받는다(`plan/training-engine.ts`). 훈련 상태(예정·완료·미완료·생략)는 저장하지 않고 `plan/session.mapper.ts`의 `statusOf`로 판정한다.
- DB의 날짜 컬럼과 `YYYY-MM-DD` 문자열은 `services/api/src/common/dates.ts`의 함수로 바꾼다.
- API 테스트에서 "오늘"을 고정할 때는 `vi.useFakeTimers({ toFake: ['Date'] })`로 날짜만 바꾼다(`services/api/test/plan.e2e.test.ts`).
- 수준 분류(`TE-G01`) 같은 훈련 판단은 API에 직접 쓰지 않고 `packages/training-engine`의 함수를 주입받는다(`services/api/src/profile/level-classifier.ts`).
- API의 HTTP 수준 테스트는 `services/api/test/test-app.ts`의 `createTestApp`으로 앱을 띄운다.
- 웹훅과 내부 작업 엔드포인트에는 `@Public()`과 `@UseGuards(secretGuard(...))`를 함께 붙인다(`services/api/src/common/secret.guard.ts`).
- 테이블을 추가하거나 바꿀 때는 `docs/DATABASE.md`를 먼저 고친다. 새 테이블의 마이그레이션에는 `ENABLE ROW LEVEL SECURITY`를 넣는다. 부분 유일 인덱스와 체크 제약은 마이그레이션 SQL에 직접 쓴다.
- 설치 스크립트가 있는 의존성을 추가하면 `pnpm install`이 실패한다. `pnpm-workspace.yaml`의 `allowBuilds`에 그 패키지의 허용 여부를 적는다.
