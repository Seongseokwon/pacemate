import {
  approveProposalResponseSchema,
  chatMessagesResponseSchema,
  chatSuggestionsResponseSchema,
  proposalSchema,
  sendChatMessageResponseSchema,
  type SendChatMessageRequest,
} from '@pacemate/shared';
import { apiFetch } from './client';

export const CHAT_KEY = ['chat'] as const;

export const getChatMessages = (before?: string) =>
  apiFetch(`/v1/chat/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`, chatMessagesResponseSchema);

export const getChatSuggestions = () => apiFetch('/v1/chat/suggestions', chatSuggestionsResponseSchema);

export const sendChatMessage = (body: SendChatMessageRequest) =>
  apiFetch('/v1/chat/messages', sendChatMessageResponseSchema, { method: 'POST', body, timeoutMs: 75_000 });

export const approveProposal = (id: string) =>
  apiFetch(`/v1/proposals/${encodeURIComponent(id)}/approve`, approveProposalResponseSchema, { method: 'POST' });

export const cancelProposal = (id: string) =>
  apiFetch(`/v1/proposals/${encodeURIComponent(id)}/cancel`, proposalSchema, { method: 'POST' });

export const getProposal = (id: string) => apiFetch(`/v1/proposals/${encodeURIComponent(id)}`, proposalSchema);
