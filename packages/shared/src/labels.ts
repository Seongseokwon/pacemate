import type { SessionType } from './enums';

/** 훈련 종류의 화면 표시 이름과 체감 안내 문구(UI_UX §8.1). 응답에는 `type`만 담고 문구는 여기서 찾는다. */
export const SESSION_TYPE_LABELS: Record<SessionType, { name: string; guidance: string }> = {
  walk_run: { name: '걷고 달리기', guidance: '걷기와 달리기를 번갈아 해요' },
  easy: { name: '가볍게 달리기', guidance: '편하게 대화할 수 있는 속도예요' },
  tempo: { name: '조금 빠르게 달리기', guidance: '숨이 조금 차지만 유지할 수 있는 속도예요' },
  long: { name: '길게 달리기', guidance: '편한 속도로 평소보다 오래 달려요' },
  race: { name: '대회', guidance: '대회 날이에요' },
};
