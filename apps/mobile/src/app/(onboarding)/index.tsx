import type { ContinuousRun, Experience } from '@pacemate/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ME_KEY } from '@/api/me';
import { saveProfile } from '@/api/profile';
import { isRedirectError } from '@/api/query-client';
import {
  canProceed,
  isLastStep,
  loadDraft,
  nextStep,
  type OnboardingDraft,
  previousStep,
  progressOf,
  saveDraft,
  type Step,
  STEPS,
  toProfileRequest,
} from '@/onboarding/draft';
import { GoalFields } from '@/onboarding/goal-fields';
import {
  Button,
  Field,
  Heading,
  NumberInput,
  Screen,
  SegmentedControl,
  SelectableCard,
  showToast,
  Stack,
  Stepper,
  Text,
  WeekdayPicker,
} from '@/ui';

const QUESTIONS: Record<Step, string> = {
  experience: '달리기를 얼마나 해 보셨어요?',
  continuousRun: '쉬지 않고 얼마나 달릴 수 있나요?',
  weeklyKm: '요즘 일주일에 몇 km 정도 달리세요?',
  recentRecord: '최근 기록이나 평소 속도를 알려 주세요',
  schedule: '일주일에 몇 번, 무슨 요일에 달릴 수 있나요?',
  goalDistance: '어떤 거리를 목표로 할까요?',
  goalTime: '목표 기록이 있나요?',
  raceDate: '나갈 대회 날짜가 정해져 있나요?',
};

const EXPERIENCES: [Experience, string][] = [
  ['none', '처음이에요'],
  ['under_6m', '6개월이 안 됐어요'],
  ['under_2y', '6개월에서 2년 사이예요'],
  ['over_2y', '2년 넘게 했어요'],
];
const CONTINUOUS_RUNS: [ContinuousRun, string][] = [
  ['under_10m', '10분 미만'],
  ['under_30m', '10~30분'],
  ['under_60m', '30~60분'],
  ['over_60m', '60분 이상'],
];
const RUN_COUNTS = (['2', '3', '4', '5'] as const).map((value) => ({ value, label: `${value}번` }));

/** 답하지 않고 넘어갈 수 있는 질문과 그 버튼의 이름, 넘어갈 때 비우는 답(UI_UX §6.2) */
const SKIPS: Partial<Record<Step, { label: string; clear: Partial<OnboardingDraft> }>> = {
  weeklyKm: { label: '잘 모르겠어요', clear: { weeklyKm: null } },
  recentRecord: { label: '잘 모르겠어요', clear: { recordKm: null, recordMin: null, recordSec: null } },
  goalTime: { label: '건너뛰기', clear: { goalHour: null, goalMin: null, goalSec: null } },
  raceDate: { label: '건너뛰기', clear: { raceDate: null } },
};

function Choices<T extends string>({ options, value, onChange }: { options: [T, string, string?][]; value: T | null; onChange: (value: T) => void }) {
  return (
    <Stack>
      {options.map(([option, label, description]) => (
        <SelectableCard
          key={option}
          accessibilityLabel={description ? `${label}, ${description}` : label}
          selected={value === option}
          onPress={() => onChange(option)}
        >
          <Text variant="label">{label}</Text>
          {description && (
            <Text variant="supporting" tone="secondary">
              {description}
            </Text>
          )}
        </SelectableCard>
      ))}
    </Stack>
  );
}

const NumberField = ({ label, ...input }: { label: string; value: number | null; onChange: (value: number | null) => void; decimal?: boolean }) => (
  <Stack fill>
    <Field label={label}>
      <NumberInput {...input} />
    </Field>
  </Stack>
);

/** 온보딩(F02, PRD §5.3). 한 화면에 질문 하나. 답은 기기에 저장해 두고 마지막에 프로필로 보낸다. */
export default function Onboarding() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);

  useEffect(() => {
    void loadDraft().then(setDraft);
  }, []);

  const save = useMutation({
    mutationFn: saveProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      // 다음 화면(계획 미리보기)은 시작 경로가 정한다(F01-R09)
      router.replace('/');
    },
    onError: (error) => {
      if (!isRedirectError(error)) showToast(error.message);
    },
  });

  if (!draft) return <Screen loading />;

  const step = STEPS[draft.step] ?? STEPS[0];
  const last = isLastStep(draft);
  const skip = SKIPS[step];

  const update = (patch: Partial<OnboardingDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    void saveDraft(next);
    return next;
  };

  const goNext = (patch: Partial<OnboardingDraft> = {}) => {
    if (!last) return void update({ ...patch, step: nextStep({ ...draft, ...patch }) });
    // 목표만 정할 때는 프로필이 이미 있어 저장하지 않고 미리보기로 간다(UI_UX §6.3)
    if (draft.goalOnly) {
      update(patch);
      return router.replace('/(onboarding)/plan-preview');
    }
    const profile = toProfileRequest(update(patch));
    if (profile) return save.mutate(profile);
    // 저장해 둔 답이 지금의 입력 범위와 맞지 않는 경우다. 답은 그대로 두고 처음 질문부터 다시 확인하게 한다
    update({ ...patch, step: 0 });
    showToast('답변을 다시 확인해 주세요.');
  };

  const content: Record<Step, ReactNode> = {
    experience: <Choices options={EXPERIENCES} value={draft.experience} onChange={(experience) => update({ experience })} />,
    continuousRun: <Choices options={CONTINUOUS_RUNS} value={draft.continuousRun} onChange={(continuousRun) => update({ continuousRun })} />,
    weeklyKm: (
      <Field label="일주일 동안 달린 거리 (km)" help="0부터 100까지 넣을 수 있어요. 요즘 달리지 않았다면 0을 넣어 주세요.">
        <NumberInput decimal value={draft.weeklyKm} onChange={(weeklyKm) => update({ weeklyKm })} />
      </Field>
    ),
    recentRecord: (
      <Stack gap={4}>
        <SegmentedControl
          value={draft.recordMode}
          options={[
            { value: 'record', label: '거리와 시간' },
            { value: 'pace', label: '1km당 시간' },
          ]}
          onChange={(recordMode) => update({ recordMode, recordKm: null, recordMin: null, recordSec: null })}
        />
        {draft.recordMode === 'record' && (
          <Field label="달린 거리 (km)">
            <NumberInput decimal value={draft.recordKm} onChange={(recordKm) => update({ recordKm })} />
          </Field>
        )}
        <Stack direction="row">
          <NumberField label="분" value={draft.recordMin} onChange={(recordMin) => update({ recordMin })} />
          <NumberField label="초" value={draft.recordSec} onChange={(recordSec) => update({ recordSec })} />
        </Stack>
      </Stack>
    ),
    schedule: (
      <Stack gap={4}>
        <SegmentedControl
          value={draft.runCount === null ? '' : (String(draft.runCount) as (typeof RUN_COUNTS)[number]['value'])}
          options={RUN_COUNTS}
          onChange={(count) => update({ runCount: Number(count) })}
        />
        <WeekdayPicker value={draft.weekdays} onChange={(weekdays) => update({ weekdays })} />
        {draft.runCount !== null && draft.weekdays.length < draft.runCount && (
          <Text variant="supporting" tone="secondary">
            달릴 수 있는 요일을 {draft.runCount}개 이상 골라 주세요.
          </Text>
        )}
      </Stack>
    ),
    goalDistance: <GoalFields step="goalDistance" draft={draft} update={update} />,
    goalTime: <GoalFields step="goalTime" draft={draft} update={update} />,
    raceDate: <GoalFields step="raceDate" draft={draft} update={update} />,
  };

  return (
    <Screen
      onBack={draft.step > 0 ? () => update({ step: previousStep(draft) }) : undefined}
      // C2: 머리글 오른쪽에 "7 / 9"
      headerRight={
        <Text variant="supporting" tone="secondary" tabular>{`${progressOf(draft).current} / ${progressOf(draft).total}`}</Text>
      }
      footer={
        <Stack>
          {skip && <Button variant="text" label={skip.label} disabled={save.isPending} onPress={() => goNext(skip.clear)} />}
          <Button size="large" label={last ? '계획 만들기' : '다음'} disabled={!canProceed(draft)} loading={save.isPending} onPress={() => goNext()} />
        </Stack>
      }
    >
      <Stack gap={5}>
        <Stepper {...progressOf(draft)} />
        <Heading>{QUESTIONS[step]}</Heading>
        {content[step]}
      </Stack>
    </Screen>
  );
}
