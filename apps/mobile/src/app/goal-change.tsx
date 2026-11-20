import { goalChangeRequestSchema, previewPlanRequestSchema, PROFILE_LIMITS, profileResponseSchema, proposalSchema, type GoalChangeRequest, type ProfileResponse, type Proposal } from '@pacemate/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { apiFetch, ApiClientError } from '@/api/client';
import { approveProposal, cancelProposal } from '@/api/chat';
import { isRedirectError } from '@/api/query-client';
import { ChatCardView } from '@/chat/chat-card';
import { proposalFailureOf, type ProposalFailure } from '@/chat/proposal-failure';
import { canProceed, isLastStep, NEW_GOAL_DRAFT, nextStep, previousStep, STEPS, toGoal, type OnboardingDraft } from '@/onboarding/draft';
import { GoalFields } from '@/onboarding/goal-fields';
import { Button, Field, Heading, NumberInput, Screen, SegmentedControl, Stack, Text, WeekdayPicker } from '@/ui';

const questions = { goalDistance: '어떤 거리를 목표로 할까요?', goalTime: '목표 기록이 있나요?', raceDate: '나갈 대회 날짜가 정해져 있나요?' } as const;

export default function GoalChange() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => apiFetch('/v1/profile', profileResponseSchema), enabled: mode === 'profile' });
  if (mode === 'profile' && !profile.data) return <Screen loading={profile.isLoading} error={profile.isError ? '프로필을 불러오지 못했어요.' : undefined} onRetry={() => void profile.refetch()} />;
  return <ChangeFlow mode={mode === 'profile' ? 'profile' : 'goal'} profile={profile.data} />;
}

function ChangeFlow({ mode, profile }: { mode: 'goal' | 'profile'; profile?: ProfileResponse }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OnboardingDraft>(NEW_GOAL_DRAFT);
  const [count, setCount] = useState(profile?.weeklyRunCount ?? 2);
  const [weekdays, setWeekdays] = useState(profile?.preferredWeekdays ?? []);
  const [weeklyKm, setWeeklyKm] = useState<number | null>(null);
  const [needDistance, setNeedDistance] = useState(false);
  const [request, setRequest] = useState<GoalChangeRequest>();
  const [proposal, setProposal] = useState<Proposal>();
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<ProposalFailure>();
  const [experience, setExperience] = useState(profile?.experience ?? 'none');
  const [continuousRun, setContinuousRun] = useState(profile?.continuousRun ?? 'under_10m');
  const [finished, setFinished] = useState(false);
  const create = useMutation({
    mutationFn: (body: GoalChangeRequest) => apiFetch('/v1/proposals/goal-change', proposalSchema, { method: 'POST', body }),
    onSuccess: (value) => { setProposal(value); setNeedDistance(false); setError(undefined); },
    onError: (value) => { if (isRedirectError(value)) return; if (value instanceof ApiClientError && value.code === 'RECENT_DISTANCE_REQUIRED') { setNeedDistance(true); setError(undefined); } else setError(value.message); },
  });
  const apply = useMutation({
    mutationFn: approveProposal,
    onSuccess: async () => { await Promise.all([['home'], ['sessions'], ['me'], ['profile'], ['chat']].map((queryKey) => queryClient.invalidateQueries({ queryKey }))); setFinished(true); setError(undefined); setFailure(undefined); },
    onError: (value) => { if (!isRedirectError(value)) { const next = proposalFailureOf(value); if (next.kind === 'expired') setProposal((old) => old && { ...old, status: 'expired' }); else setFailure(next); } },
  });
  const cancel = useMutation({ mutationFn: cancelProposal, onSuccess: () => router.back(), onError: (value) => { if (!isRedirectError(value)) setError(value.message); } });
  const submit = (body: GoalChangeRequest) => { setRequest(body); setError(undefined); create.mutate(body); };
  const busy = create.isPending || apply.isPending || cancel.isPending;
  if (finished) return <Screen title="계획을 바꿨어요" onBack={() => router.back()}><Button label="확인" onPress={() => router.back()} /></Screen>;
  if (proposal) return <Screen title="변경 미리보기" onBack={() => cancel.mutate(proposal.id)}><Stack><ChatCardView card={{ type: 'proposal', proposal }} disabled={busy} state={{ pending: apply.isPending ? 'approve' : cancel.isPending ? 'cancel' : undefined, ...(failure ? { failure } : {}) }} onApprove={() => apply.mutate(proposal.id)} onCancel={() => cancel.mutate(proposal.id)} onAlternative={() => cancel.mutate(proposal.id)} onRetry={() => apply.mutate(proposal.id)} onOpenCalendar={() => router.navigate('/(tabs)/calendar')} /></Stack></Screen>;
  if (needDistance) return <Screen title="요즘 일주일에 얼마나 달려요?" onBack={() => setNeedDistance(false)} footer={<Button label="다음" disabled={weeklyKm === null || weeklyKm < PROFILE_LIMITS.recentWeeklyKm.min || weeklyKm > PROFILE_LIMITS.recentWeeklyKm.max} loading={busy} onPress={() => request && submit({ ...request, profile: { ...request.profile, recentWeeklyKm: weeklyKm } })} />}><Field label="일주일 동안 달린 거리 (km)"><NumberInput decimal value={weeklyKm} onChange={setWeeklyKm} /></Field>{error && <Text tone="error">{error}</Text>}</Screen>;
  if (mode === 'profile') return <Screen title="프로필 바꾸기" onBack={() => router.back()} footer={<Button label="변경 미리보기" disabled={weekdays.length < count} loading={busy} onPress={() => submit({ profile: { experience, continuousRun, weeklyRunCount: count, preferredWeekdays: weekdays } })} />}><Stack><Heading level={2}>달리기를 얼마나 해 보셨어요?</Heading><SegmentedControl value={experience} options={[{value: 'none', label: '처음'}, {value: 'under_6m', label: '6개월 미만'}, {value: 'under_2y', label: '2년 미만'}, {value: 'over_2y', label: '2년 이상'}]} onChange={setExperience} /><Heading level={2}>쉬지 않고 얼마나 달릴 수 있나요?</Heading><SegmentedControl value={continuousRun} options={[{value: 'under_10m', label: '10분 미만'}, {value: 'under_30m', label: '10~30분'}, {value: 'under_60m', label: '30~60분'}, {value: 'over_60m', label: '60분 이상'}]} onChange={setContinuousRun} /><Heading level={2}>일주일에 몇 번 달릴 수 있나요?</Heading><SegmentedControl value={String(count)} options={['2', '3', '4', '5'].map((value) => ({ value, label: `${value}번` }))} onChange={(value) => setCount(Number(value))} /><WeekdayPicker value={weekdays} onChange={setWeekdays} />{weekdays.length < count && <Text tone="secondary">달릴 수 있는 요일을 {count}개 이상 골라 주세요.</Text>}{error && <Text tone="error">{error}</Text>}</Stack></Screen>;
  const step = STEPS[draft.step] as keyof typeof questions;
  const update = (patch: Partial<OnboardingDraft>) => setDraft((old) => ({ ...old, ...patch }));
  const next = (patch: Partial<OnboardingDraft> = {}) => {
    const nextDraft = { ...draft, ...patch };
    if (!isLastStep(nextDraft)) return setDraft({ ...nextDraft, step: nextStep(nextDraft) });
    const goal = previewPlanRequestSchema.safeParse(toGoal(nextDraft));
    const body = goalChangeRequestSchema.safeParse({ goal: goal.data });
    if (goal.success && body.success) submit(body.data); else setError('목표를 다시 확인해 주세요.');
  };
  const optional = step === 'goalTime' || step === 'raceDate';
  return <Screen title="목표 바꾸기" onBack={() => draft.step === NEW_GOAL_DRAFT.step ? router.back() : update({ step: previousStep(draft) })} footer={<Stack>{optional && <Button variant="text" label="건너뛰기" disabled={busy} onPress={() => next(step === 'goalTime' ? { goalHour: null, goalMin: null, goalSec: null } : { raceDate: null })} />}<Button label={isLastStep(draft) ? '변경 미리보기' : '다음'} disabled={!canProceed(draft)} loading={busy} onPress={() => next()} /></Stack>}><Stack><Heading>{questions[step]}</Heading><GoalFields step={step} draft={draft} update={update} />{error && <Text tone="error">{error}</Text>}</Stack></Screen>;
}
