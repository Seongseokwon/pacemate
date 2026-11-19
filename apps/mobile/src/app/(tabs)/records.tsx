import { SESSION_TYPE_LABELS, WORKOUT_LIMITS, type CreateWorkoutRequest, type CreateWorkoutResponse, type Workout } from '@pacemate/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useState } from 'react';
import { Modal, Platform } from 'react-native';
import { ApiClientError } from '@/api/client';
import { isRedirectError } from '@/api/query-client';
import { createWorkout, deleteWorkout, getCandidates, getWorkouts, getWorkoutStats, updateWorkout } from '@/api/workouts';
import { importHealthkitWorkouts } from '@/health/healthkit';
import { BottomSheet, Button, Card, DateInput, Dialog, EmptyState, Field, formatDate, Heading, List, ListItem, NumberInput, ProgressBar, ScaleInput, Screen, SegmentedControl, Selector, Stack, Text, TextArea } from '@/ui';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const paceText = (seconds: number) => `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, '0')}초/km`;
const durationText = (seconds: number) => `${Math.floor(seconds / 3600)}시간 ${Math.floor(seconds % 3600 / 60)}분 ${seconds % 60}초`;
const message = (error: unknown) => error instanceof Error ? error.message : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.';

export default function Records() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Workout | 'new' | null>(null);
  const [selected, setSelected] = useState<Workout | null>(null);
  const [result, setResult] = useState<CreateWorkoutResponse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const list = useInfiniteQuery({ queryKey: ['workouts'], queryFn: ({ pageParam }) => getWorkouts(pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: (last) => last.hasMore ? last.items.at(-1)?.id : undefined });
  const stats = useQuery({ queryKey: ['workout-stats'], queryFn: getWorkoutStats });
  const refresh = async () => { await client.invalidateQueries(); };
  const remove = useMutation({ mutationFn: deleteWorkout, onSuccess: async () => { setDeleting(false); setSelected(null); await refresh(); }, onError: (error) => { if (!isRedirectError(error)) { setDeleting(false); setDeleteError(message(error)); } } });
  const health = useMutation({ mutationFn: importHealthkitWorkouts, onSuccess: async (result) => { setHealthMessage(`${result.imported}개 기록을 가져왔어요. ${result.skipped}개는 중복 또는 저장할 수 없는 기록이에요.`); await refresh(); }, onError: (error) => { if (!isRedirectError(error)) setHealthMessage(message(error)); void refresh(); } });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const failure = list.error ?? stats.error;
  return (
    <Screen title="기록" loading={list.isLoading || stats.isLoading} error={failure && !isRedirectError(failure) ? message(failure) : undefined} onRetry={() => { void list.refetch(); void stats.refetch(); }} headerRight={<Button label="기록 추가" variant="text" onPress={() => setEditing('new')} />} onRefresh={() => { void refresh(); }}>
      <Stack gap={5}>
        {Platform.OS === 'ios' && <Button variant="secondary" label="건강 앱에서 가져오기" loading={health.isPending} onPress={() => { setHealthMessage(null); health.mutate(); }} />}
        {healthMessage && <Text>{healthMessage}</Text>}
        {stats.data && <Stack gap={3}>
          <Stack direction="row"><Stack fill><Card><Text>이번 주 거리</Text><Heading level={2}>{stats.data.week.distanceKm}km</Heading></Card></Stack><Stack fill><Card><Text>이번 주 횟수</Text><Heading level={2}>{stats.data.week.count}회</Heading></Card></Stack></Stack>
          <Stack direction="row"><Stack fill><Card><Text>이번 달 거리</Text><Heading level={2}>{stats.data.month.distanceKm}km</Heading></Card></Stack><Stack fill><Card><Text>이번 달 횟수</Text><Heading level={2}>{stats.data.month.count}회</Heading></Card></Stack></Stack>
        </Stack>}
        <Heading level={2}>운동 기록</Heading>
        {items.length === 0 ? <EmptyState icon="info" message="아직 운동 기록이 없어요." actionLabel="기록 추가" onAction={() => setEditing('new')} /> : <List>{items.map((item, index) => <Stack key={item.id}>{(index === 0 || items[index - 1]?.date.slice(0, 7) !== item.date.slice(0, 7)) && <Text variant="label">{item.date.slice(0, 4)}년 {Number(item.date.slice(5, 7))}월</Text>}<ListItem title={`${item.distanceKm}km · ${formatDate(item.date)}`} description={`${durationText(item.durationSec)} · ${paceText(item.paceSecPerKm)}${item.source === 'healthkit' ? ' · Apple 건강' : ''}`} onPress={() => setSelected(item)} /></Stack>)}</List>}
        {list.hasNextPage && <Button variant="secondary" label="더 보기" loading={list.isFetchingNextPage} onPress={() => { void list.fetchNextPage(); }} />}
        {list.isFetchNextPageError && <Text tone="error">기록을 더 불러오지 못했어요. 다시 시도해 주세요.</Text>}
      </Stack>
      <BottomSheet visible={selected !== null && !deleting && editing === null} title="운동 기록" onClose={() => { setSelected(null); setDeleteError(null); }}><Stack gap={4}>{selected && <><Text>{formatDate(selected.date)} · {selected.distanceKm}km</Text><Text>{durationText(selected.durationSec)} · {paceText(selected.paceSecPerKm)}</Text>{selected.source === 'healthkit' && <Text>Apple 건강에서 가져옴</Text>}{selected.averageHeartRate != null && <Text>평균 심박수 {selected.averageHeartRate}회/분</Text>}{selected.rpe !== null && <Text>운동 강도 {selected.rpe}/10</Text>}{selected.memo && <Text>통증: {selected.memo}</Text>}{deleteError && <Text tone="error">{deleteError}</Text>}<Button label="수정하기" onPress={() => { setEditing(selected); setDeleteError(null); }} /><Button variant="danger" label="삭제하기" onPress={() => setDeleting(true)} /></>}</Stack></BottomSheet>
      <Dialog visible={deleting} title="기록을 삭제할까요?" message="연결된 훈련의 완료 표시도 사라져요." danger confirmLabel="삭제" onCancel={() => setDeleting(false)} onConfirm={() => { if (selected && !remove.isPending) remove.mutate(selected.id); }} />
      <Modal visible={editing !== null} animationType="slide" onRequestClose={() => { setEditing(null); setSelected(null); setResult(null); }}>
        <BottomTabBarHeightContext.Provider value={undefined}>
        {editing !== null && <WorkoutForm workout={editing === 'new' ? null : editing} onBack={() => setEditing(null)} onSaved={async (saved) => { if (saved) setResult(saved); else { setEditing(null); setSelected(null); } await refresh(); }} />}
        <BottomSheet visible={result !== null} title="기록을 저장했어요" onClose={() => { setResult(null); setEditing(null); setSelected(null); }}><Stack gap={4}>{result && <><Text>{result.coachLine.text}</Text>{result.weekProgress && <><Text>이번 주 {result.weekProgress.completed}/{result.weekProgress.planned}회</Text><ProgressBar value={result.weekProgress.planned ? result.weekProgress.completed / result.weekProgress.planned : 0} accessibilityLabel="이번 주 훈련 진행률" /></>}<Button label="확인" onPress={() => { setResult(null); setEditing(null); setSelected(null); }} /></>}</Stack></BottomSheet>
        </BottomTabBarHeightContext.Provider>
      </Modal>
    </Screen>
  );
}

function WorkoutForm({ workout, onBack, onSaved }: { workout: Workout | null; onBack: () => void; onSaved: (result: CreateWorkoutResponse | null) => Promise<void> }) {
  const [date, setDate] = useState(workout?.date ?? today());
  const [distance, setDistance] = useState<number | null>(workout?.distanceKm ?? null);
  const [hour, setHour] = useState<number | null>(workout ? Math.floor(workout.durationSec / 3600) : null);
  const [minute, setMinute] = useState<number | null>(workout ? Math.floor(workout.durationSec % 3600 / 60) : null);
  const [second, setSecond] = useState<number | null>(workout ? workout.durationSec % 60 : null);
  const [rpe, setRpe] = useState<number | null>(workout?.rpe ?? null);
  const [pain, setPain] = useState<'no' | 'yes'>(workout?.memo ? 'yes' : 'no');
  const [memo, setMemo] = useState(workout?.memo ?? '');
  const [chosenSession, setChosenSession] = useState<string | null>(workout ? workout.plannedSessionId ?? 'free' : null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<'WORKOUT_DUPLICATE' | 'PACE_OUT_OF_RANGE' | null>(null);
  const [confirmed, setConfirmed] = useState({ confirmDuplicate: false, confirmPace: false });
  const candidates = useQuery({ queryKey: ['workout-candidates', date], queryFn: () => getCandidates(date) });
  const sessionId = chosenSession ?? candidates.data?.items.find((s) => s.date === date)?.id ?? 'free';
  const seconds = (hour ?? 0) * 3600 + (minute ?? 0) * 60 + (second ?? 0);
  const valid = distance !== null && distance >= WORKOUT_LIMITS.distanceKm.min && distance <= WORKOUT_LIMITS.distanceKm.max && seconds >= WORKOUT_LIMITS.durationSec.min && seconds <= WORKOUT_LIMITS.durationSec.max && (minute ?? 0) < 60 && (second ?? 0) < 60 && date <= today() && (pain === 'no' || memo.trim().length > 0);
  const mutation = useMutation({ mutationFn: async (flags: typeof confirmed) => {
    const body: CreateWorkoutRequest = { date, distanceKm: distance!, durationSec: seconds, rpe, memo: pain === 'yes' ? memo.trim() : null, plannedSessionId: sessionId === 'free' ? null : sessionId, ...flags };
    return workout ? (await updateWorkout(workout.id, body), null) : createWorkout(body);
  }, onSuccess: (response) => { void onSaved(response); }, onError: (err) => {
    if (err instanceof ApiClientError && (err.code === 'WORKOUT_DUPLICATE' || err.code === 'PACE_OUT_OF_RANGE')) setConfirmation(err.code);
    else if (!isRedirectError(err)) setError(message(err));
  } });
  const options = [{ value: 'free', label: '자유 러닝' }, ...(workout?.plannedSessionId ? [{ value: workout.plannedSessionId, label: '현재 연결된 훈련' }] : []), ...(candidates.data?.items ?? []).filter((s) => s.id !== workout?.plannedSessionId).map((s) => ({ value: s.id, label: `${formatDate(s.date)} · ${SESSION_TYPE_LABELS[s.type].name}` }))];
  const changeDate = (value: string) => { setDate(value); setChosenSession(null); };
  return <Screen title={workout ? '기록 수정' : '운동 기록'} onBack={onBack} footer={<Button label="저장" size="large" disabled={!valid || candidates.isLoading || candidates.isError} loading={mutation.isPending} onPress={() => { setError(null); setConfirmed({ confirmDuplicate: false, confirmPace: false }); mutation.mutate({ confirmDuplicate: false, confirmPace: false }); }} />}>
    <Stack gap={4}>
      <Field label="운동 날짜"><DateInput value={date} max={today()} onChange={changeDate} /></Field>
      <Field label="거리 (km)" help="0.1~100km를 입력해 주세요."><NumberInput decimal value={distance} onChange={setDistance} /></Field>
      <Stack direction="row"><Stack fill><Field label="시간"><NumberInput value={hour} onChange={setHour} /></Field></Stack><Stack fill><Field label="분"><NumberInput value={minute} onChange={setMinute} /></Field></Stack><Stack fill><Field label="초"><NumberInput value={second} onChange={setSecond} /></Field></Stack></Stack>
      <Text>평균 페이스: {distance && seconds > 0 ? paceText(Math.round(seconds / distance)) : '거리와 시간을 입력해 주세요'}</Text>
      <Field label="운동 강도 (선택)"><ScaleInput max={10} value={rpe} onChange={setRpe} /></Field>
      <Field label="통증이 있었나요?"><SegmentedControl value={pain} options={[{ value: 'no', label: '없었어요' }, { value: 'yes', label: '있었어요' }]} onChange={setPain} /></Field>
      {pain === 'yes' && <Field label="통증 내용"><TextArea placeholder="어디가 어떻게 아팠는지 적어 주세요" maxLength={500} value={memo} onChangeText={setMemo} /></Field>}
      <Field label="연결할 훈련"><Selector value={sessionId} options={options} onChange={setChosenSession} /></Field>
      {candidates.isError && !isRedirectError(candidates.error) && <Stack><Text tone="error">훈련 후보를 불러오지 못했어요.</Text><Button label="다시 시도" variant="secondary" onPress={() => { void candidates.refetch(); }} /></Stack>}
      {error && <Text tone="error">{error}</Text>}
    </Stack>
    <Dialog visible={confirmation !== null} title={confirmation === 'WORKOUT_DUPLICATE' ? '같은 기록이 있어요' : '페이스를 확인해 주세요'} message="입력한 내용이 맞으면 저장을 계속해 주세요." confirmLabel="계속 저장" onCancel={() => setConfirmation(null)} onConfirm={() => { const next = { ...confirmed, ...(confirmation === 'WORKOUT_DUPLICATE' ? { confirmDuplicate: true } : { confirmPace: true }) }; setConfirmed(next); setConfirmation(null); mutation.mutate(next); }} />
  </Screen>;
}
