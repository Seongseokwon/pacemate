import { profileResponseSchema, type SaveProfileRequest } from '@pacemate/shared';
import { apiFetch } from './client';

export const saveProfile = (body: SaveProfileRequest) => apiFetch('/v1/profile', profileResponseSchema, { method: 'PUT', body });
