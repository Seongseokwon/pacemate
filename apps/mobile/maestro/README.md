# 기기 확인 흐름 (Maestro)

`docs/DEVELOPMENT_PLAN.md` §7의 확인 요청을 시뮬레이터에서 자동으로 누르고 찍는 흐름이다. 파일 이름의 번호가 §7의 번호다. 빌드와 시뮬레이터 실행은 개발자가 하고, 흐름은 개발자가 요청할 때 도구가 돌린다(`docs/DECISIONS.md` 2026-11-18 "기기 확인을 Maestro로 한다").

## 설치 (기기마다 한 번)

Maestro는 저장소의 의존성이 아니다. Java 17 이상이 필요하며 Android Studio에 들어 있는 것을 쓸 수 있다.

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
curl -L "https://get.maestro.mobile.dev" | bash   # ~/.maestro에 설치된다
```

Homebrew의 `maestro`는 Intel Mac에서 의존 패키지(`openjdk`)가 설치되지 않는다.

## 준비 (개발자)

1. 개발 빌드를 시뮬레이터에 설치하고 연다. 한 대만 켜 둔다.
2. 번들러(`pnpm --filter @pacemate/mobile dev`), 로컬 DB와 API를 켠다.
3. Android 에뮬레이터는 `adb reverse tcp:3000 tcp:3000`과 `adb reverse tcp:8081 tcp:8081`을 해 둔다. 앱 데이터를 지운 뒤 번들러에 주소(`http://localhost:8081`)로 다시 붙기 때문이다.

## 실행 (도구)

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" PATH="$HOME/.maestro/bin:$PATH"
maestro test apps/mobile/maestro                      # config.yaml의 순서로 전부
maestro test apps/mobile/maestro/b07-consent.yaml     # 하나만
maestro --device emulator-5554 test apps/mobile/maestro   # 기기를 골라서(iOS는 시뮬레이터 UDID)
```

- 스크린샷과 실패 기록은 `~/.maestro/tests/<실행 시각>/`에 남는다. 흐름이 통과해도 스크린샷을 §7의 기대 결과와 비교한 뒤 결과 칸을 채운다.
- `b17-intro`와 `b10-b13-onboarding`은 앱 데이터를 지운다(`common/fresh-launch.yaml`). 기기에 저장된 온보딩 답변과 번들러 연결이 지워지므로 돌리기 전에 개발자에게 알린다.
- 화면 낭독, 알림, 실기기에서만 되는 동작은 Maestro로 보지 않는다. 개발자가 확인한다.
- `tags: manual`이 붙은 흐름은 사람이 앞선 조건을 준비해야 해서 전체 실행에서 빠진다(`config.yaml`의 `excludeTags`). 파일을 지정해 하나씩 돌린다.
  - `b06-offline`: API를 끈 채로 시작하고, 흐름이 기다리는 동안 API를 켜고 [다시 시도]를 누른다.
  - `b21-healthkit`: 실제 iPhone에서 돌리고, 건강 앱 권한 창을 사람이 허용한다.
- 사람이 중간에 누르는 흐름이 있다. 흐름은 최대 90초 기다린다: `b27-google-login`(Google 계정 고르기), `b28-apple-login`(Apple 로그인), `b06-offline`, `b21-healthkit`.
- 계정 상태가 필요한 흐름은 `config.yaml`의 주석에 적었다: 로그인(`b14`, `b22`~`b26`, `b29`, `b30`), 활성 계획(`b26`, `b30`), 기간이 끝난 계획(`b20`), 실제 LLM 공급자(`b22`~`b24`). `b29-my-page`는 로그아웃으로 끝난다.

## 흐름 목록

| §7 번호 | 파일 | 앞선 조건 |
|---|---|---|
| B-01, B-04, B-09 | `b01-b04-b09-launch.yaml` | 로그인하지 않은 상태 |
| B-02, B-03 | `b02-b03-update.yaml` | B-03은 `.env`에 스토어 주소 |
| B-05 | `b05-login.yaml` | 로그인 설정이 없는 빌드 |
| B-06 | `b06-offline.yaml` (manual) | API를 끈다 |
| B-07 | `b07-consent.yaml` | - |
| B-08 | `b08-delete-account.yaml` | - |
| B-10~B-13 | `b10-b13-onboarding.yaml` | 앱 데이터를 지운다 |
| B-14 | `b14-records.yaml` | 로그인 |
| B-15 | `b15-theme.yaml` | - |
| B-16 | `b16-icons.yaml` | - |
| B-17 | `b17-intro.yaml` | 앱 데이터를 지운다 |
| B-18 | `b18-start.yaml` | - |
| B-19 | `b19-coach-select.yaml` | - |
| B-20 | `b20-plan-continue.yaml` | 기간이 끝난 계획 |
| B-21 | `b21-healthkit.yaml` (manual) | 실제 iPhone, 최근 러닝 기록 |
| B-22~B-24 | `b22-chat-s2.yaml`, `b23-chat-s3.yaml`, `b24-chat-s4.yaml` | 로그인, 실제 LLM 공급자 |
| B-25 | `b25-similar-workouts.yaml` | 비슷한 수동·Apple 건강 기록 |
| B-26 | `b26-goal-change.yaml` | 활성 5km 계획 |
| B-27 | `b27-google-login.yaml` | 로그인 설정(`.env`) |
| B-28 | `b28-apple-login.yaml` | Apple 개발자 계정으로 서명한 빌드 |
| B-29 | `b29-my-page.yaml` | 로그인. 로그아웃으로 끝난다 |
| B-30 | `b30-weekly-summary.yaml` | 활성 계획과 이번 주 기록 |

## 흐름 쓰기

- §7에 확인 요청을 더하는 도구가 같은 번호의 흐름을 더하고 `config.yaml`의 순서에 넣는다.
- 요소는 화면 낭독용 이름으로 찾는다. 이름에 선택 상태가 붙는 요소(예: `이용약관 필수, 선택됨`)는 정규식으로 쓰고, 붙지 않는 요소는 `selected: true`로 확인한다. 이름과 속성은 `maestro hierarchy`로 볼 수 있다.
- 위치로 누르는 곳은 `shortcut:` 주석을 단다. 접근성 이름을 붙이면 글자로 바꾼다.
- Android에서는 `scrollUntilVisible`이 보이는 요소도 못 찾을 때가 있다. 정해진 거리만 `swipe`하고 `assertVisible`로 도착을 확인한다.
- 흐름이 통과해도 화면이 기대와 다를 수 있다. 위치로 누르는 단계는 스크린샷으로 실제로 눌렸는지 본다.
