import { createWorkoutResponseSchema, healthkitWorkoutResponseSchema, linkCandidatesResponseSchema, workoutSchema, workoutStatsResponseSchema, workoutsResponseSchema, type CreateWorkoutRequest, type HealthkitWorkoutRequest, type UpdateWorkoutRequest } from '@pacemate/shared';
import { z } from 'zod';
import { apiFetch } from './client';

export const getWorkouts = (before?: string) => apiFetch(`/v1/workouts${before ? `?before=${encodeURIComponent(before)}` : ''}`, workoutsResponseSchema);
export const getWorkoutStats = () => apiFetch('/v1/workouts/stats', workoutStatsResponseSchema);
export const getCandidates = (date: string) => apiFetch(`/v1/workouts/link-candidates?date=${encodeURIComponent(date)}`, linkCandidatesResponseSchema);
export const createWorkout = (body: CreateWorkoutRequest) => apiFetch('/v1/workouts', createWorkoutResponseSchema, { method: 'POST', body });
export const importHealthkitWorkout = (body: HealthkitWorkoutRequest) => apiFetch('/v1/workouts/healthkit', healthkitWorkoutResponseSchema, { method: 'POST', body });
export const updateWorkout = (id: string, body: UpdateWorkoutRequest) => apiFetch(`/v1/workouts/${id}`, workoutSchema, { method: 'PATCH', body });
export const deleteWorkout = (id: string) => apiFetch(`/v1/workouts/${id}`, z.undefined(), { method: 'DELETE' });
