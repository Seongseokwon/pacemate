import { weeklySummaryResponseSchema } from '@pacemate/shared';
import { apiFetch } from './client';

export const WEEKLY_SUMMARY_KEY = ['weekly-summary'] as const;

/** 이번 주 요약(F08-R01). 지난주를 볼 때는 그 주의 월요일을 넘긴다 */
export const getWeeklySummary = (weekStart?: string) => apiFetch(`/v1/summaries/weekly${weekStart ? `?weekStart=${weekStart}` : ''}`, weeklySummaryResponseSchema);
