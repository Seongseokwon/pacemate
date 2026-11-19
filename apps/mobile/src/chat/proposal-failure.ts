import { ApiClientError, type ApiClientErrorCode } from '@/api/client';

/** 제안 카드의 승인·취소가 실패했을 때 카드가 할 일(UI_UX §7.2 "승인 실패") */
export type ProposalFailure =
  /** 만료됐다. 카드를 만료 상태로 바꾼다(AC-F05-11) */
  | { kind: 'expired' }
  /** 이미 취소·대체·승인됐다. 제안을 다시 불러와 실제 상태를 보여 준다 */
  | { kind: 'not_pending'; message: string }
  /** 이번 달 일정 변경을 다 썼다. 카드는 대기로 두고 아래에 한도 안내를 붙인다 */
  | { kind: 'limit'; resetsOn?: string }
  /** 다시 보내면 될 수 있는 실패. [다시 시도]를 둔다 */
  | { kind: 'retry'; message: string }
  /** 다시 물어봐야 하는 실패(`PLAN_CHANGED` 등). 버튼을 없앤다(AC-F05-05) */
  | { kind: 'final'; message: string };

const RETRYABLE: ReadonlySet<ApiClientErrorCode> = new Set(['NETWORK_ERROR', 'INVALID_RESPONSE', 'INTERNAL_ERROR', 'RATE_LIMITED']);
const FALLBACK = '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

export function proposalFailureOf(error: unknown): ProposalFailure {
  if (!(error instanceof ApiClientError)) return { kind: 'retry', message: FALLBACK };
  if (error.code === 'PROPOSAL_EXPIRED') return { kind: 'expired' };
  if (error.code === 'PROPOSAL_NOT_PENDING') return { kind: 'not_pending', message: error.message };
  if (error.code === 'LIMIT_REACHED') return { kind: 'limit', resetsOn: error.detail.usage?.resetsOn };
  if (RETRYABLE.has(error.code)) return { kind: 'retry', message: error.message };
  return { kind: 'final', message: error.message };
}
