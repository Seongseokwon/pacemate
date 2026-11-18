import { type CreateMeRequest, meResponseSchema } from '@pacemate/shared';
import { z } from 'zod';
import { apiFetch } from './client';

export const ME_KEY = ['me'] as const;

export const getMe = () => apiFetch('/v1/me', meResponseSchema);

export const createMe = (body: CreateMeRequest) => apiFetch('/v1/me', meResponseSchema, { method: 'POST', body });

export const deleteMe = () => apiFetch('/v1/me', z.undefined(), { method: 'DELETE' });
