import {
  CHAT_MESSAGE_MAX_LENGTH,
  COACH_LABELS,
  DEFAULT_COACH,
  SESSION_TYPE_LABELS,
  type ChatMessage,
  type Proposal,
  type SendChatMessageRequest,
  type Usage,
} from '@pacemate/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, type ScrollViewInstance } from 'react-native';
import { approveProposal, cancelProposal, CHAT_KEY, getChatMessages, getChatSuggestions, getProposal, sendChatMessage } from '@/api/chat';
import { ApiClientError } from '@/api/client';
import { getMe, ME_KEY } from '@/api/me';
import { getSession, HOME_KEY, SESSIONS_KEY } from '@/api/plan';
import { isRedirectError, redirectOnApiError } from '@/api/query-client';
import { ChatCardView, type ProposalCardState } from '@/chat/chat-card';
import { ChatBubble, ChatSystemMessage, DateDivider, TypingIndicator } from '@/chat/chat-messages';
import { proposalFailureOf } from '@/chat/proposal-failure';
import { chatUsageLabel, TRIAL_EXHAUSTED_MESSAGE, trialJustExhausted } from '@/usage/labels';
import { Button, Chip, CoachAvatar, Field, formatShortDate, IconButton, localDateOf, Screen, Stack, Text, TextInput } from '@/ui';

type CardAction = 'approve' | 'cancel' | 'alternative';
// 같은 메시지를 처리하는 중이라는 응답(202)을 받았을 때 다시 묻는 간격
const PROCESSING_POLL_MS = 3000;

export default function Coach() {
  const params = useLocalSearchParams<{ draft?: string; sessionId?: string }>();
  // 홈이나 훈련 상세에서 새 값으로 들어오면 입력창과 대상 훈련을 새로 채운다
  return <CoachContent key={`${params.draft ?? ''}:${params.sessionId ?? ''}`} />;
}

function CoachContent() {
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
  const [sending, setSending] = useState<string>();
  const [failure, setFailure] = useState<{ request: SendChatMessageRequest; newId: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [cardStates, setCardStates] = useState<Record<string, ProposalCardState & { action?: CardAction }>>({});
  const [localUsage, setUsage] = useState<Usage>();
  const usage = localUsage ?? me.data?.usage;
  // 체험분을 다 쓴 응답의 ID. 대화 기록에 저장하지 않아 다시 열면 보이지 않는다(UI_UX §7.3)
  const [trialNoticeAfter, setTrialNoticeAfter] = useState<string>();
  // 상태 갱신보다 먼저 막아야 연속으로 눌러도 요청이 한 번만 간다(AC-F05-04)
  const lock = useRef(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const scrollToLatest = useRef(true);
  const coach = me.data?.coach ?? DEFAULT_COACH;

  const send = async (request: SendChatMessageRequest) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    setDraft('');
    setSending(request.content);
    try {
      let response;
      try {
        response = await sendChatMessage(request);
      } catch (error) {
        // 연결이 끊긴 경우만 같은 clientMessageId로 한 번 더 보낸다. 서버가 중복을 막는다
        if (!(error instanceof ApiClientError) || error.code !== 'NETWORK_ERROR') throw error;
        response = await sendChatMessage(request);
      }
      while ('status' in response) {
        await new Promise((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
        response = await sendChatMessage(request);
      }
      const reply = response;
      scrollToLatest.current = true;
      setMessages((previous) => [...(previous ?? messages).filter((m) => m.id !== reply.userMessage.id), reply.userMessage, ...reply.replies]);
      if (trialJustExhausted(usage, reply.usage)) setTrialNoticeAfter(reply.replies.at(-1)?.id ?? reply.userMessage.id);
      setUsage(reply.usage);
      void refreshReplacedProposals(messages, reply.replies);
      setSessionId(undefined);
    } catch (error) {
      if (isRedirectError(error)) redirectOnApiError(error);
      // AI 응답 실패는 서버가 메시지를 실패로 기록하므로 새 ID로 다시 보낸다
      else setFailure({ request, newId: error instanceof ApiClientError && error.code === 'AI_UNAVAILABLE' });
    } finally {
      lock.current = false;
      setBusy(false);
      setSending(undefined);
    }
  };

  const start = (content: string) => {
    const text = content.trim();
    if (text) void send({ clientMessageId: randomUUID(), content: text, ...(sessionId && { sessionId }) });
  };

  const replaceProposal = (updated: Proposal, appended: ChatMessage[] = []) =>
    setMessages((previous) =>
      (previous ?? messages)
        .map((m) => (m.card?.type === 'proposal' && m.card.proposal.id === updated.id ? { ...m, card: { type: 'proposal' as const, proposal: updated } } : m))
        .concat(appended),
    );

  // 새 제안이 생기면 서버가 이전 대기 제안을 대체로 바꾸므로 그 상태를 다시 받는다(DI-05)
  const refreshReplacedProposals = async (earlier: ChatMessage[], replies: ChatMessage[]) => {
    const fresh = new Set(replies.flatMap((m) => (m.card?.type === 'proposal' ? [m.card.proposal.id] : [])));
    if (fresh.size === 0) return;
    const stale = earlier.flatMap((m) => (m.card?.type === 'proposal' && m.card.proposal.status === 'pending' && !fresh.has(m.card.proposal.id) ? [m.card.proposal.id] : []));
    await Promise.all(
      stale.map(async (id) => {
        try {
          replaceProposal(await getProposal(id));
        } catch {
          // 다시 받지 못하면 대기로 남고, 승인하면 서버가 거절해 실제 상태를 다시 받는다
        }
      }),
    );
  };

  // 앱을 다시 열었을 때 처리 중이던 메시지가 있으면 끝날 때까지 대화를 다시 받는다. 서버는 2분 넘게 끝나지 않으면 실패로 바꾼다
  const restoring = !busy && messages.some((m) => m.role === 'user' && m.status === 'processing');
  // 서버의 대화는 카드에 제안의 현재 상태를 담아 주므로, 다시 받은 쪽으로 덮으면 대체된 카드도 함께 바뀐다
  const applyLatest = (page: ChatMessage[]) => {
    const latest = [...page].reverse();
    const byId = new Map(latest.map((m) => [m.id, m]));
    const known = new Set(messages.map((m) => m.id));
    const added = latest.filter((m) => !known.has(m.id));
    setMessages((previous) => {
      const base = previous ?? messages;
      return [...base.map((m) => byId.get(m.id) ?? m), ...added.filter((m) => !base.some((b) => b.id === m.id))];
    });
    if (added.length === 0) return;
    scrollToLatest.current = true;
    // 처리 중에 쓴 이용량은 대화 응답으로 받지 못했으므로 다시 받는다
    setUsage(undefined);
    void queryClient.invalidateQueries({ queryKey: ME_KEY });
    void refreshReplacedProposals(messages, added);
  };
  useQuery({
    queryKey: [...CHAT_KEY, 'restore'],
    queryFn: async () => {
      const page = await getChatMessages();
      applyLatest(page.items);
      return page;
    },
    enabled: restoring,
    refetchInterval: restoring ? PROCESSING_POLL_MS : false,
  });
  const waiting = busy || restoring;

  const setCardState = (id: string, state: ProposalCardState & { action?: CardAction }) => setCardStates((previous) => ({ ...previous, [id]: state }));

  const act = async (proposal: Proposal, action: CardAction) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setCardState(proposal.id, { pending: action === 'approve' ? 'approve' : 'cancel', action });
    try {
      if (action === 'approve') {
        const result = await approveProposal(proposal.id);
        replaceProposal(result.proposal, [result.resultMessage]);
        setUsage(result.usage);
        for (const queryKey of [HOME_KEY, SESSIONS_KEY, ME_KEY, ['session'], ['workouts'], ['workout-stats']]) void queryClient.invalidateQueries({ queryKey });
      } else {
        replaceProposal(await cancelProposal(proposal.id));
        // 다른 방법은 입력창만 채우고 보내지 않는다(F05-R13)
        if (action === 'alternative') setDraft('다른 방법도 알려 줘');
      }
      setCardState(proposal.id, {});
    } catch (error) {
      if (isRedirectError(error)) {
        setCardState(proposal.id, {});
        redirectOnApiError(error);
        return;
      }
      const failed = proposalFailureOf(error);
      if (failed.kind === 'expired') {
        replaceProposal({ ...proposal, status: 'expired' });
        setCardState(proposal.id, {});
      } else if (failed.kind === 'not_pending') {
        // 이미 승인·취소·대체된 제안이다. 실제 상태를 받아 카드에 보여 준다
        try {
          replaceProposal(await getProposal(proposal.id));
          setCardState(proposal.id, {});
        } catch {
          setCardState(proposal.id, { failure: failed, action });
        }
      } else {
        if (failed.kind === 'limit' && error instanceof ApiClientError && error.detail.usage) setUsage(error.detail.usage);
        setCardState(proposal.id, { failure: failed, action });
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || !messages.length || lock.current) return;
    lock.current = true;
    scrollToLatest.current = false;
    setLoadError(undefined);
    try {
      const page = await getChatMessages(messages[0]!.id);
      setMessages((previous) => [...page.items.reverse(), ...(previous ?? messages)]);
      setHasMore(page.hasMore);
    } catch (error) {
      if (isRedirectError(error)) redirectOnApiError(error);
      else setLoadError('이전 대화를 불러오지 못했어요.');
    } finally {
      lock.current = false;
    }
  };

  const targetLabel = target.data ? `${SESSION_TYPE_LABELS[target.data.type].name} · ${formatShortDate(target.data.date)}` : '고른 훈련';

  return (
    <Screen
      title={COACH_LABELS[coach].name}
      headerRight={
        <Stack direction="row" gap={2} align="center">
          <CoachAvatar coach={coach} size="header" />
          {/* 누르면 구독 화면으로 가는 동작은 구독(T-501, 출시 2단계)과 함께 붙인다 */}
          {usage && <Chip label={chatUsageLabel(usage.chat)} />}
        </Stack>
      }
      scroll={false}
      loading={history.isLoading}
      error={history.isError ? '대화를 불러오지 못했어요.' : undefined}
      onRetry={() => void history.refetch()}
      footer={
        <Stack gap={2}>
          {sessionId && (
            <Stack direction="row" gap={1} align="center">
              <Chip label={targetLabel} tone="info" />
              <IconButton icon="close" accessibilityLabel="대상 훈련 선택 해제" onPress={() => setSessionId(undefined)} />
            </Stack>
          )}
          <ScrollView horizontal keyboardShouldPersistTaps="handled">
            <Stack direction="row" gap={2}>
              {suggestions.data?.suggestions.map((s) => (
                <Button key={s.code} variant="secondary" label={s.text} disabled={waiting} onPress={() => start(s.text)} />
              ))}
            </Stack>
          </ScrollView>
          <Stack direction="row" gap={2} align="center">
            <Stack fill>
              <Field label="메시지">
                <TextInput value={draft} onChangeText={setDraft} maxLength={CHAT_MESSAGE_MAX_LENGTH} editable={!waiting} placeholder="코치에게 물어보세요" />
              </Field>
            </Stack>
            <Button label="보내기" disabled={waiting || !draft.trim()} onPress={() => start(draft)} />
          </Stack>
        </Stack>
      }
    >
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (scrollToLatest.current) {
            scroll.current?.scrollToEnd({ animated: false });
            scrollToLatest.current = false;
          }
        }}
        onScroll={({ nativeEvent }) => {
          if (nativeEvent.contentOffset.y <= 0) void loadMore();
        }}
        scrollEventThrottle={400}
      >
        <Stack>
          {loadError && <Text tone="error">{loadError}</Text>}
          {messages.length === 0 && !busy && (
            <>
              <CoachAvatar coach={coach} size="profile" />
              <Text variant="title2">무엇이든 편하게 물어보세요</Text>
              <Text tone="secondary">일정 조정, 훈련 방법, 기록 분석을 도와드려요.</Text>
            </>
          )}
          {messages.map((message, index) => {
            const date = localDateOf(message.createdAt);
            const previous = messages[index - 1];
            const card = message.card && (
              <ChatCardView
                card={message.card}
                usage={usage}
                state={message.card.type === 'proposal' ? cardStates[message.card.proposal.id] : undefined}
                disabled={busy}
                onApprove={(p) => void act(p, 'approve')}
                onCancel={(p) => void act(p, 'cancel')}
                onAlternative={(p) => void act(p, 'alternative')}
                onRetry={(p) => void act(p, cardStates[p.id]?.action ?? 'approve')}
                onOpenCalendar={() => router.navigate('/(tabs)/calendar')}
              />
            );
            return (
              <Stack key={message.id} gap={2}>
                {(!previous || localDateOf(previous.createdAt) !== date) && <DateDivider date={date} />}
                {message.role === 'system' ? (
                  <>
                    {message.content !== '' && <ChatSystemMessage>{message.content}</ChatSystemMessage>}
                    {card}
                  </>
                ) : (
                  <ChatBubble message={message} coach={coach}>
                    {card}
                  </ChatBubble>
                )}
                {message.id === trialNoticeAfter && <ChatSystemMessage>{TRIAL_EXHAUSTED_MESSAGE}</ChatSystemMessage>}
                {message.role === 'user' && message.status === 'failed' && (
                  <Stack gap={2} align="flex-end">
                    <Text tone="error">보내지 못했어요</Text>
                    <Button variant="secondary" label="다시 보내기" onPress={() => start(message.content)} disabled={busy} />
                  </Stack>
                )}
              </Stack>
            );
          })}
          {sending && <ChatBubble message={{ id: 'sending', role: 'user', content: sending, status: 'processing', createdAt: '', card: null }} coach={coach} />}
          {failure && (
            <Stack gap={2} align="flex-end">
              <ChatBubble message={{ id: 'failed', role: 'user', content: failure.request.content, status: 'failed', createdAt: '', card: null }} coach={coach} />
              <Text tone="error">보내지 못했어요</Text>
              <Button
                variant="secondary"
                label="다시 보내기"
                disabled={busy}
                onPress={() => void send({ ...failure.request, clientMessageId: failure.newId ? randomUUID() : failure.request.clientMessageId })}
              />
            </Stack>
          )}
          {((busy && sending) || restoring) && <TypingIndicator coach={coach} />}
        </Stack>
      </ScrollView>
    </Screen>
  );
}
