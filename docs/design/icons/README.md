# C2/Icon ↔ 개발 아이콘 목록 대응표 (2026-11-18)

- 그리드 24px, 선 1.8, 둥근 끝(round cap/join), 채움 없음. 색은 `currentColor`(기본 `text/primary`, 활성 `text/accent`).
- C2/Icon은 22종이었고, 개발 목록 23개 가운데 **8개가 빠져 있어서 같은 선 스타일로 새로 그렸어요**. 이제 30종이에요.
- **저장소**: 개발 이름으로 된 SVG 23개 + C2에만 있는 것 7개 = 총 30개 SVG가 `docs/design/icons/` 폴더에 있습니다.
- 아래 표에서 언급하는 `icons/c2-icon-new-8.svg`, `components/*.svg` 파일은 Figma 작업 디렉터리 참조이며 저장소에는 포함되지 않았습니다.

## 개발 23개 → C2/Icon

| # | 개발 이름 | C2/Icon 변형 | 상태 | 메모 |
|---|---|---|---|---|
| 1 | home | `Name=home` | 있음 | 하단 탭 홈 |
| 2 | coach | `Name=coach` | 있음 | 하단 탭 AI 코치(말풍선) |
| 3 | calendar | `Name=cal` | 이름 다름 | |
| 4 | record | `Name=log` | 이름 다름 | 하단 탭 기록(막대) |
| 5 | profile | `Name=my` | 이름 다름 | 하단 탭 마이. `user`와 모양이 같아요 |
| 6 | run | `Name=run` | 있음 | |
| 7 | walk | `Name=walk` | **새로 그림** | 걷기·달리기 훈련 종류 |
| 8 | flag | `Name=flag` | 있음 | 목표·대회 |
| 9 | check | `Name=check` | 있음 | |
| 10 | close | `Name=close` | 있음 | |
| 11 | back | `Name=back` | 있음 | 왼쪽 꺾쇠 |
| 12 | next | `Name=chev` | 이름 다름 | 오른쪽 꺾쇠(목록 행 끝) |
| 13 | add | `Name=plus` | 이름 다름 | |
| 14 | edit | `Name=edit` | **새로 그림** | 연필 |
| 15 | delete | `Name=delete` | **새로 그림** | 휴지통 |
| 16 | send | `Name=up` | 이름 다름 | 위쪽 화살표. 입력창 보내기 버튼 |
| 17 | swap | `Name=swap` | 있음 | 일정 바꾸기 |
| 18 | warning | `Name=warning` | **새로 그림** | 세모 느낌표(몸 상태 안내 배너 등) |
| 19 | info | `Name=info` | **새로 그림** | 원 안 i |
| 20 | bell | `Name=bell` | 있음 | |
| 21 | crown | `Name=crown` | **새로 그림** | Pro 표시 |
| 22 | chevron | `Name=chevron` | **새로 그림** | 아래쪽 꺾쇠(펼치기·드롭다운). 오른쪽 꺾쇠는 `next` |
| 23 | more | `Name=more` | **새로 그림** | 가로 점 3개 |

## C2에만 있는 7개 (개발 목록에 없음)

| C2/Icon | 쓰는 곳 | 제안 |
|---|---|---|
| `arrow` | 변경 제안 카드의 변경 전 → 후 | 개발 목록에 `arrowRight`로 추가하거나 텍스트 화살표로 대체 |
| `clock` | 시간·기록 표시 | 필요하면 추가 |
| `pulse` | 컨디션·강도 | 필요하면 추가 |
| `spark` | AI 피드백·Pro 강조 | 필요하면 추가 |
| `user` | `my`와 같은 모양 | 중복이라 `profile` 하나로 써도 돼요 |
| `gear` | 설정 | 필요하면 추가 |
| `lock` | 약관과 정책 | 필요하면 추가 |

판단: 개발 쪽 `next`와 `chevron`이 둘 다 꺾쇠라서, `next`=오른쪽(기존 `chev`), `chevron`=아래쪽(새로 그림)으로 나눴어요. 개발 쪽 뜻이 다르면 알려 주세요.
