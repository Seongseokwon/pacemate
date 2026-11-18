import { SESSION_TYPE_LABELS, type SessionType } from '@pacemate/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  Badge,
  Banner,
  BottomSheet,
  Button,
  Card,
  Chip,
  ClickableCard,
  DateInput,
  Dialog,
  Divider,
  EmptyState,
  Field,
  Heading,
  Icon,
  IconButton,
  List,
  ListItem,
  NumberInput,
  ProgressBar,
  ScaleInput,
  Screen,
  Section,
  SegmentedControl,
  SelectableCard,
  Selector,
  showToast,
  Skeleton,
  Spinner,
  Stack,
  StatusDot,
  Stepper,
  Switch,
  Text,
  TextArea,
  TextInput,
} from '@/ui';

const SESSION_TYPES = Object.keys(SESSION_TYPE_LABELS) as SessionType[];
const GOALS = [
  { value: '5k', label: '5km 완주' },
  { value: '10k', label: '10km 완주' },
  { value: 'half', label: '하프 완주' },
] as const;
type Goal = (typeof GOALS)[number]['value'];

/** 공통 컴포넌트를 두 플랫폼에서 눈으로 확인하는 개발용 예시 화면(T-109). 출시 빌드에서는 열리지 않는다. */
export default function UiGallery() {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [plan, setPlan] = useState<'free' | 'premium'>('free');
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [distance, setDistance] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [condition, setCondition] = useState<number | null>(null);
  const [effort, setEffort] = useState<number | null>(null);
  const [notify, setNotify] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [progress, setProgress] = useState(0.3);
  const [state, setState] = useState<'ready' | 'loading' | 'error'>('ready');

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen
      title="컴포넌트 예시"
      onBack={() => router.back()}
      headerRight={<IconButton icon="more" accessibilityLabel="토스트 띄우기" onPress={() => showToast('저장했어요')} />}
      footer={<Button size="large" label="화면 전체 로딩 보기" onPress={() => { setState('loading'); setTimeout(() => setState('error'), 1500); }} />}
      loading={state === 'loading'}
      error={state === 'error' ? '화면을 불러오지 못했어요' : undefined}
      onRetry={() => setState('ready')}
    >
      <Stack gap={6}>
        <Section title="글자">
          <Text variant="display" tabular>D-42</Text>
          <Heading level={1}>화면 제목</Heading>
          <Heading level={2}>구역 제목</Heading>
          <Heading level={3}>행 제목</Heading>
          <Text>본문이에요. 편하게 대화할 수 있는 속도로 달려요.</Text>
          <Text variant="supporting" tone="secondary">보조 설명이에요.</Text>
          <Text variant="caption" tone="secondary">오전 7:30</Text>
        </Section>

        <Section title="버튼">
          <Button size="large" label="주 버튼 (큼)" onPress={() => showToast('주 버튼을 눌렀어요')} />
          <Button variant="secondary" label="보조 버튼" onPress={() => showToast('보조 버튼을 눌렀어요')} />
          <Button variant="text" label="글자만" onPress={() => showToast('글자 버튼을 눌렀어요')} />
          <Button variant="danger" label="위험" onPress={() => setDialog(true)} />
          <Button label="로딩" loading onPress={() => undefined} />
          <Button label="비활성" disabled onPress={() => undefined} />
          <Stack direction="row" align="center">
            <IconButton icon="add" accessibilityLabel="추가" onPress={() => showToast('추가')} />
            <IconButton icon="edit" accessibilityLabel="고치기" onPress={() => showToast('고치기')} />
            <IconButton icon="delete" accessibilityLabel="지우기" disabled onPress={() => undefined} />
          </Stack>
          <SegmentedControl
            value={view}
            options={[{ value: 'week', label: '주간' }, { value: 'month', label: '월간' }]}
            onChange={setView}
          />
        </Section>

        <Section title="아이콘">
          <Stack direction="row" wrap>
            {(['home', 'coach', 'calendar', 'record', 'profile', 'run', 'walk', 'flag', 'check', 'close', 'back', 'next', 'add', 'edit', 'delete', 'send', 'swap', 'warning', 'info', 'bell', 'crown', 'chevron', 'more'] as const).map(
              (name) => <Icon key={name} name={name} size="large" />,
            )}
          </Stack>
        </Section>

        <Section title="카드">
          <Card>
            <Stack gap={2}>
              <Heading level={2}>오늘의 훈련</Heading>
              <Text tone="secondary">가볍게 달리기 5km</Text>
            </Stack>
          </Card>
          <ClickableCard onPress={() => setSheet(true)}>
            <Text>눌러서 시트를 여는 카드</Text>
          </ClickableCard>
          <SelectableCard selected={plan === 'free'} onPress={() => setPlan('free')}>
            <Text>무료</Text>
          </SelectableCard>
          <SelectableCard selected={plan === 'premium'} onPress={() => setPlan('premium')}>
            <Text>프리미엄</Text>
          </SelectableCard>
        </Section>

        <Section title="입력">
          <Field label="이름" help="다른 사람에게 보이지 않아요">
            <TextInput value={name} onChangeText={setName} placeholder="이름을 입력해 주세요" />
          </Field>
          <Field label="거리" error={distance === 0 ? '0보다 큰 값을 입력해 주세요' : undefined}>
            <NumberInput value={distance} onChange={setDistance} decimal placeholder="5.0" />
          </Field>
          <Field label="메모">
            <TextArea value={memo} onChangeText={setMemo} placeholder="오늘 달리기는 어땠나요?" />
          </Field>
          <Field label="목표">
            <Selector value={goal} options={GOALS} onChange={setGoal} />
          </Field>
          <Field label="대회 날짜">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="컨디션">
            <ScaleInput value={condition} onChange={setCondition} max={5} />
          </Field>
          <Field label="운동 강도">
            <ScaleInput value={effort} onChange={setEffort} max={10} />
          </Field>
        </Section>

        <Section title="알림과 상태">
          <Banner status="info">내일은 쉬는 날이에요.</Banner>
          <Banner status="success">이번 주 훈련을 모두 마쳤어요.</Banner>
          <Banner status="warning">인터넷 연결을 확인해 주세요.</Banner>
          <Banner status="error">저장하지 못했어요. 다시 시도해 주세요.</Banner>
          <Stack direction="row" wrap align="center" gap={2}>
            <Chip label="예정" />
            <Chip label="완료" tone="success" icon="check" />
            <Chip label="미완료" tone="warning" />
            <Chip label="생략" tone="disabled" />
            <Badge count={3} />
            <Badge count={120} />
          </Stack>
          <Stack direction="row" wrap gap={2}>
            {SESSION_TYPES.map((type) => (
              <Chip key={type} label={SESSION_TYPE_LABELS[type].name} session={type} />
            ))}
          </Stack>
          <ProgressBar value={progress} accessibilityLabel="이번 주 진행률" />
          <Button variant="secondary" label="진행률 올리기" onPress={() => setProgress((value) => (value >= 1 ? 0 : value + 0.35))} />
          <Stepper current={2} total={5} />
          <Stack direction="row" align="center">
            <Spinner />
            <Skeleton shape="circle" />
            <Stack fill gap={2}>
              <Skeleton />
              <Skeleton short />
            </Stack>
          </Stack>
          <Skeleton shape="block" />
        </Section>

        <Section title="목록">
          <List>
            {SESSION_TYPES.map((type) => (
              <ListItem
                key={type}
                left={<StatusDot session={type} />}
                title={SESSION_TYPE_LABELS[type].name}
                description={SESSION_TYPE_LABELS[type].guidance}
                right={<Icon name="next" tone="neutral" />}
                onPress={() => showToast(SESSION_TYPE_LABELS[type].name)}
              />
            ))}
            <ListItem title="훈련 알림" right={<Switch value={notify} onValueChange={setNotify} accessibilityLabel="훈련 알림" />} />
          </List>
          <Divider />
          <EmptyState icon="record" message="아직 기록이 없어요" actionLabel="기록 추가" onAction={() => showToast('기록 추가')} />
        </Section>
      </Stack>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="훈련 상세">
        <Stack gap={4}>
          <Text>편한 속도로 평소보다 오래 달려요.</Text>
          <Button size="large" label="닫기" onPress={() => setSheet(false)} />
        </Stack>
      </BottomSheet>
      <Dialog
        visible={dialog}
        title="기록을 지울까요?"
        message="지운 기록은 되돌릴 수 없어요."
        confirmLabel="지우기"
        danger
        onConfirm={() => { setDialog(false); showToast('지웠어요'); }}
        onCancel={() => setDialog(false)}
      />
    </Screen>
  );
}
