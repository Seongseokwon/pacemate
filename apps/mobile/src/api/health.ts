import { z } from 'zod';
import { apiFetch } from './client';

export const getHealth = () => apiFetch('/health', z.object({ status: z.literal('ok') }));
