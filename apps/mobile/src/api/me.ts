import { type Coach, coachChoiceSchema, type CreateMeRequest, meResponseSchema } from '@pacemate/shared';
import { z } from 'zod';
import { apiFetch } from './client';

export const ME_KEY = ['me'] as const;

export const getMe = () => apiFetch('/v1/me', meResponseSchema);

export const createMe = (body: CreateMeRequest) => apiFetch('/v1/me', meResponseSchema, { method: 'POST', body });

export const deleteMe = () => apiFetch('/v1/me', z.undefined(), { method: 'DELETE' });

/** AI 코치 바꾸기(F04-R11~R13). 이용량을 차감하지 않는다 */
export const setCoach = (coach: Coach) => apiFetch('/v1/me/coach', coachChoiceSchema, { method: 'PUT', body: { coach } });
