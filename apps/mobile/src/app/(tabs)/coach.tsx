import { CHAT_MESSAGE_MAX_LENGTH, COACH_LABELS, DEFAULT_COACH, type ChatMessage, type Proposal, type SendChatMessageRequest } from '@pacemate/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, type ScrollViewInstance, View } from 'react-native';
import { approveProposal, cancelProposal, CHAT_KEY, getChatMessages, getChatSuggestions, sendChatMessage } from '@/api/chat';
import { ApiClientError } from '@/api/client';
import { getMe, ME_KEY } from '@/api/me';
import { getSession } from '@/api/plan';
import { isRedirectError, redirectOnApiError } from '@/api/query-client';
import { ChatCardView } from '@/chat/chat-card';
import { Button, CoachAvatar, Field, Screen, Stack, Text, TextInput, useTheme } from '@/ui';

export default function Coach() {
  const params = useLocalSearchParams<{ draft?: string; sessionId?: string }>();
  return <CoachContent key={`${params.draft ?? ''}:${params.sessionId ?? ''}`} />;
}

function CoachContent() {
  const t = useTheme();
  const params = useLocalSearchParams<{ draft?: string; sessionId?: string }>();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ME_KEY, queryFn: getMe });
  const history = useQuery({ queryKey: CHAT_KEY, queryFn: () => getChatMessages() });
  const target = useQuery({ queryKey: ['session', params.sessionId], queryFn: () => getSession(params.sessionId!), enabled: !!params.sessionId });
  const suggestions = useQuery({ queryKey: ['chat-suggestions'], queryFn: getChatSuggestions });
  const [draft, setDraft] = useState(params.draft ?? '');
  const [sessionId, setSessionId] = useState<string | undefined>(params.sessionId);
  const [localMessages, setMessages] = useState<ChatMessage[] | null>(null);
  const [localHasMore, setHasMore] = useState<boolean | null>(null);
  const messages = localMessages ?? [...(history.data?.items ?? [])].reverse();
  const hasMore = localHasMore ?? history.data?.hasMore ?? false;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ request: SendChatMessageRequest; newId: boolean } | null>(null);
  const [cardError, setCardError] = useState<string>();
  const [localUsage, setUsage] = useState(me.data?.usage);
  const usage = localUsage ?? me.data?.usage;
  const lock = useRef(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const scrollToLatest = useRef(true);
  const [sending, setSending] = useState<string>();
  const coach = me.data?.coach ?? DEFAULT_COACH;
  const send = async (request: SendChatMessageRequest) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFailure(null); setDraft(''); setSending(request.content);
    try {
      let response;
      try { response = await sendChatMessage(request); }
      catch (error) {
        if (!(error instanceof ApiClientError) || error.code !== 'NETWORK_ERROR') throw error;
        response = await sendChatMessage(request);
      }
      while ('status' in response) { await new Promise((resolve) => setTimeout(resolve, 3000)); response = await sendChatMessage(request); }
      scrollToLatest.current = true;
      setMessages((previous) => [...(previous ?? messages).filter((m) => m.id !== response.userMessage.id), response.userMessage, ...response.replies]);
      setUsage(response.usage); setSessionId(undefined);
    } catch (error) {
      if (isRedirectError(error)) redirectOnApiError(error);
      else setFailure({ request, newId: error instanceof ApiClientError && error.code === 'AI_UNAVAILABLE' });
    } finally { lock.current = false; setBusy(false); setSending(undefined); }
  };
  const start = (content: string) => { if (content.trim()) void send({ clientMessageId: randomUUID(), content: content.trim(), ...(sessionId && { sessionId }) }); };
  const act = async (proposal: Proposal, action: 'approve' | 'cancel' | 'alternative') => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setCardError(undefined);
    try {
      const result = action === 'approve' ? await approveProposal(proposal.id) : await cancelProposal(proposal.id);
      const updated = 'proposal' in result ? result.proposal : result;
      setMessages((previous) => (previous ?? messages).map((m) => m.card?.type === 'proposal' && m.card.proposal.id === proposal.id ? { ...m, card: { type: 'proposal' as const, proposal: updated } } : m).concat('resultMessage' in result ? [result.resultMessage] : []));
      if ('usage' in result) setUsage(result.usage);
      if (action === 'alternative') setDraft('다른 방법도 알려 줘');
      void queryClient.invalidateQueries({ queryKey: ['home'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    } catch (error) { if (isRedirectError(error)) redirectOnApiError(error); else setCardError(error instanceof Error ? error.message : '처리하지 못했어요. 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const loadMore = async () => {
    if (!hasMore || !messages.length || lock.current) return;
    lock.current = true;
    scrollToLatest.current = false;
    try { const page = await getChatMessages(messages[0]!.id); setMessages((previous) => [...page.items.reverse(), ...(previous ?? messages)]); setHasMore(page.hasMore); }
    catch (error) { if (isRedirectError(error)) redirectOnApiError(error); else setCardError('이전 대화를 불러오지 못했어요.'); }
    finally { lock.current = false; }
  };
  return <Screen title={COACH_LABELS[coach].name} headerRight={<Stack direction="row" align="center"><CoachAvatar coach={coach} size="header" />{usage && <Text>이번 달 {usage.chat.used}/{usage.chat.limit}</Text>}</Stack>} scroll={false} loading={history.isLoading} error={history.isError ? '대화를 불러오지 못했어요.' : undefined} onRetry={() => void history.refetch()} footer={<Stack gap={2}>
    {sessionId && <Button variant="text" label={target.data ? `${target.data.date} · 대상 훈련 선택 해제` : '대상 훈련 선택 해제'} onPress={() => setSessionId(undefined)} />}
    <ScrollView horizontal keyboardShouldPersistTaps="handled"><Stack direction="row" gap={2}>{suggestions.data?.suggestions.map((s) => <Button key={s.code} variant="secondary" label={s.text} disabled={busy} onPress={() => start(s.text)} />)}</Stack></ScrollView>
    <Stack direction="row" gap={2} align="center"><Stack fill><Field label="메시지"><TextInput value={draft} onChangeText={setDraft} maxLength={CHAT_MESSAGE_MAX_LENGTH} editable={!busy} placeholder="코치에게 물어보세요" /></Field></Stack><Button label="보내기" disabled={busy || !draft.trim()} onPress={() => start(draft)} /></Stack>
  </Stack>}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" onContentSizeChange={() => { if (scrollToLatest.current) { scroll.current?.scrollToEnd({ animated: false }); scrollToLatest.current = false; } }} onScroll={({ nativeEvent }) => { if (nativeEvent.contentOffset.y <= 0) void loadMore(); }} scrollEventThrottle={400}>
      <Stack>{messages.length === 0 && !busy && <><CoachAvatar coach={coach} size="profile" /><Text variant="title2">무엇이든 편하게 물어보세요</Text><Text tone="secondary">일정 조정, 훈련 방법, 기록 분석을 도와드려요.</Text></>}{messages.map((message, index) => <View key={message.id} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'stretch', gap: t.spacing[2] }}>{(index === 0 || messages[index - 1]?.createdAt.slice(0, 10) !== message.createdAt.slice(0, 10)) && <Text variant="caption" tone="secondary">{message.createdAt.slice(0, 10)}</Text>}<Stack direction="row" gap={2}>{message.role === 'assistant' && <CoachAvatar coach={coach} size="message" />}<View style={message.role === 'user' ? { backgroundColor: t.color.background.muted, borderRadius: t.radius.chat, padding: t.spacing[3] } : undefined}><Text>{message.content}</Text></View></Stack>{message.role === 'user' && message.status === 'failed' && <><Text tone="error">보내지 못했어요</Text><Button variant="secondary" label="다시 보내기" onPress={() => start(message.content)} disabled={busy} /></>}{message.card && <ChatCardView card={message.card} busy={busy} error={cardError} onApprove={(p) => void act(p, 'approve')} onCancel={(p) => void act(p, 'cancel')} onAlternative={(p) => void act(p, 'alternative')} />}</View>)}
      {sending && <Text>{sending}</Text>}{failure && <><Text>{failure.request.content}</Text><Text tone="error">보내지 못했어요</Text><Button label="다시 보내기" variant="secondary" onPress={() => void send({ ...failure.request, clientMessageId: failure.newId ? randomUUID() : failure.request.clientMessageId })} /></>}
      {busy && <Text>답변을 준비하고 있어요.</Text>}</Stack>
    </ScrollView>
  </Screen>;
}
