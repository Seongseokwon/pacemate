import {
  type ConfirmPlanRequest,
  homeResponseSchema,
  planSummarySchema,
  type PreviewPlanRequest,
  previewPlanResponseSchema,
  sessionDetailResponseSchema,
  sessionsResponseSchema,
} from '@pacemate/shared';
import { apiFetch } from './client';

export const HOME_KEY = ['home'] as const;
export const SESSIONS_KEY = ['sessions'] as const;

export const previewPlan = (body: PreviewPlanRequest) => apiFetch('/v1/plan/preview', previewPlanResponseSchema, { method: 'POST', body });

export const confirmPlan = (body: ConfirmPlanRequest) => apiFetch('/v1/plan', planSummarySchema, { method: 'POST', body });

export const getHome = () => apiFetch('/v1/home', homeResponseSchema);

export const getSessions = (from: string, to: string) =>
  apiFetch(`/v1/sessions?from=${from}&to=${to}`, sessionsResponseSchema);

export const getSession = (id: string) => apiFetch(`/v1/sessions/${encodeURIComponent(id)}`, sessionDetailResponseSchema);
