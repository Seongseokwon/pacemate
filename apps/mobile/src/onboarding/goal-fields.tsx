import type { GoalDistance } from '@pacemate/shared';
import { DateInput, Field, NumberInput, SelectableCard, Stack, Text } from '@/ui';
import type { OnboardingDraft, Step } from './draft';

const distances: [GoalDistance, string, string?][] = [
  ['five_k', '5km'], ['ten_k', '10km'], ['half', '하프마라톤 (21.1km)'], ['none', '아직 목표가 없어요', '가볍게 시작하고 싶어요'],
];

export function GoalFields({ step, draft, update }: { step: Step; draft: OnboardingDraft; update: (patch: Partial<OnboardingDraft>) => void }) {
  if (step === 'goalDistance') return <Stack>{distances.map(([value, label, description]) => <SelectableCard key={value} selected={draft.goalDistance === value} accessibilityLabel={description ? `${label}, ${description}` : label} onPress={() => update(value === 'none' ? { goalDistance: value, goalHour: null, goalMin: null, goalSec: null, raceDate: null } : { goalDistance: value })}><Text variant="label">{label}</Text>{description && <Text variant="supporting" tone="secondary">{description}</Text>}</SelectableCard>)}</Stack>;
  if (step === 'goalTime') return <Stack direction="row">{([['시간', 'goalHour'], ['분', 'goalMin'], ['초', 'goalSec']] as const).map(([label, key]) => <Stack fill key={key}><Field label={label}><NumberInput value={draft[key]} onChange={(value) => update({ [key]: value })} /></Field></Stack>)}</Stack>;
  if (step === 'raceDate') {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const min = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return <Field label="대회 날짜"><DateInput value={draft.raceDate} min={min} onChange={(raceDate) => update({ raceDate })} /></Field>;
  }
  return null;
}
