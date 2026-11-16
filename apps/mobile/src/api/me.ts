import { type CreateMeRequest, type MeResponse, meResponseSchema } from '@pacemate/shared';
import type { Href } from 'expo-router';
import { z } from 'zod';
import { apiFetch } from './client';

export const ME_KEY = ['me'] as const;

export const getMe = () => apiFetch('/v1/me', meResponseSchema);

export const createMe = (body: CreateMeRequest) => apiFetch('/v1/me', meResponseSchema, { method: 'POST', body });

export const deleteMe = () => apiFetch('/v1/me', z.undefined(), { method: 'DELETE' });

/** 로그인한 계정이 가야 할 화면(PRD §5.2, F01-R07). 로그인하지 않은 경우는 401 분기가 로그인 화면으로 보낸다. */
export function nextRoute(me: Pick<MeResponse, 'registered' | 'onboardingCompleted'>): Href {
  if (!me.registered) return '/consent';
  if (!me.onboardingCompleted) return '/(onboarding)';
  return '/(tabs)';
}
