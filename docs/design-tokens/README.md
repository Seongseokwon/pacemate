# PaceMate 디자인 토큰 (C2 스타일)

2026-11-18에 확정된 C2(다크 + 주황) 스타일의 디자인 토큰 값이다.

## 파일

- `c2-dark.json` — 다크 테마 토큰 (MVP 적용)
- `c2-light.json` — 라이트 테마 토큰 (MVP는 다크만 적용, 라이트는 준비만 완료)

## 토큰 구조

각 JSON 파일에는 두 카테고리의 토큰이 있다:

### 1. 색상 토큰 (29개)
- `background`: body, surface, raised, muted
- `text`: primary, secondary, disabled, accent
- `icon`: secondary
- `accent`, `onAccent`, `accentMuted`
- `border`, `borderEmphasized`
- `overlay`, `skeleton`
- 상태 색상: `text.success`, `successMuted`, `text.warning`, `warningMuted`, `text.error`, `errorMuted`, `text.info`, `infoMuted`
- 훈련 종류 색상: `session.walkRun`, `session.easy`, `session.tempo`, `session.long`, `session.race`

### 2. 숫자 토큰 (21개)
- `spacing`: xs(8), sm(12), md(16), lg(24), xl(32)
- `radius`: inner(10), element(14), container(20), page(28), bubble(18), full(9999)
- `font.size`: xs(12), sm(14), md(16), lg(20), xl(28), xxl(36)
- `font.weight`: regular(400), medium(500), bold(700)
- `iconSize`: sm(16), md(20), lg(24)

## 사용 방법

구현할 때는 `docs/UI_UX.md` §3의 토큰 표를 기준으로 한다. 이 JSON 파일은 개발 참조용이다.

화면 코드에 색상 값(`#0B1018` 등)이나 숫자를 직접 쓰지 않고, 토큰 이름(`background.body`, `spacing.md` 등)을 사용한다.

## 주의사항

- MVP는 다크 테마만 적용한다.
- `tempo` 훈련 종류의 색은 아직 최종 확정되지 않았다(`UX-08`).
- 컴포넌트 색은 아직 변수에 연결되지 않았으므로, 개발은 토큰 이름·값을 기준으로 한다.
