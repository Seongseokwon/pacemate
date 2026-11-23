import { COACH_LABELS, DEFAULT_COACH, PLAN_LIMITS, type Usage } from '@pacemate/shared';
import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { getMe, ME_KEY } from '@/api/me';
import { signOut } from '@/auth/session';
import { chatUsageLabel, rescheduleUsageValue } from '@/usage/labels';
import { Button, Card, Chip, CoachAvatar, Dialog, formatMonthDay, Icon, List, ListItem, ProgressBar, Screen, Section, showToast, Stack, Text } from '@/ui';

// 약관 문서와 문의 주소는 정해지면 .env로 넣는다(D-A5). 없으면 그 줄을 보여 주지 않는다
const LINKS = [
  { title: '이용약관', url: process.env.EXPO_PUBLIC_TERMS_URL },
  { title: '개인정보 처리방침', url: process.env.EXPO_PUBLIC_PRIVACY_URL },
  { title: '운동 데이터 처리 안내', url: process.env.EXPO_PUBLIC_HEALTH_DATA_URL },
];
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

const chevron = <Icon name="chevron" tone="neutral" />;

const openUrl = (url: string) => Linking.openURL(url).catch(() => showToast('열지 못했어요. 잠시 후 다시 시도해 주세요.'));

/** 마이페이지(PRD §5.8, UI_UX §6.7). 1단계 출시는 구독이 없어 요금제는 보여 주기만 한다(DECISIONS 2026-11-22). */
export default function Me() {
  const me = useQuery({ queryKey: ME_KEY, queryFn: getMe });
  const [confirmGoal, setConfirmGoal] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const coach = me.data?.coach ?? DEFAULT_COACH;
  const links = LINKS.filter((l): l is { title: string; url: string } => !!l.url);

  const leave = async () => {
    setConfirmSignOut(false);
    await signOut();
    router.replace('/login');
  };

  return (
    <Screen title="마이">
      <Stack>
        <List>
          <ListItem title="내 목표" accessibilityLabel="목표 바꾸기" onPress={() => setConfirmGoal(true)} right={chevron} />
          <ListItem title="프로필" accessibilityLabel="프로필 바꾸기" onPress={() => router.push({ pathname: '/goal-change', params: { mode: 'profile' } })} right={chevron} />
        </List>

        {me.data?.usage && <UsageCard usage={me.data.usage} />}

        <Section title="설정">
          <List>
            <ListItem
              title="AI 코치"
              accessibilityLabel={`AI 코치, 지금 코치 ${COACH_LABELS[coach].name}, 코치 바꾸기`}
              onPress={() => router.push('/coach-change')}
              right={
                me.data && (
                  <Stack direction="row" align="center" gap={2}>
                    <CoachAvatar coach={coach} size="header" />
                    <Text tone="secondary">{COACH_LABELS[coach].name}</Text>
                    {chevron}
                  </Stack>
                )
              }
            />
            {links.map((l) => (
              <ListItem key={l.title} title={l.title} onPress={() => void openUrl(l.url)} right={chevron} />
            ))}
            {SUPPORT_EMAIL && <ListItem title="문의하기" description={SUPPORT_EMAIL} onPress={() => void openUrl(`mailto:${SUPPORT_EMAIL}`)} right={chevron} />}
            <ListItem title="로그아웃" onPress={() => setConfirmSignOut(true)} right={chevron} />
            <ListItem title="계정 삭제" tone="danger" onPress={() => router.push('/delete-account')} right={chevron} />
          </List>
        </Section>

        {/* 공통 컴포넌트를 기기에서 확인하는 개발용 입구 */}
        {__DEV__ && <Button variant="secondary" label="컴포넌트 예시" onPress={() => router.push('/ui-gallery')} />}
      </Stack>

      <Dialog
        visible={confirmGoal}
        title="목표를 바꿀까요?"
        message="목표를 바꾸면 남은 계획이 새로 만들어져요. 지금까지의 기록과 진행률은 그대로 남아요."
        confirmLabel="바꾸기"
        onCancel={() => setConfirmGoal(false)}
        onConfirm={() => {
          setConfirmGoal(false);
          router.push('/goal-change');
        }}
      />
      <Dialog
        visible={confirmSignOut}
        title="로그아웃할까요?"
        message="다시 로그인하면 계획과 기록을 그대로 볼 수 있어요."
        confirmLabel="로그아웃"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => void leave()}
      />
    </Screen>
  );
}

/** 지금 요금제와 남은 이용량. AI 코치 화면과 같은 문구·값을 쓴다(F10-R07, AC-F10-08) */
function UsageCard({ usage }: { usage: Usage }) {
  const trial = usage.chat.pool === 'trial' || usage.reschedule.pool === 'trial';
  return (
    <Card>
      <Stack gap={3}>
        <Stack direction="row" justify="space-between" align="center">
          <Text variant="title2">현재 요금제</Text>
          <Chip label={usage.tier === 'pro' ? 'Pro' : '무료'} />
        </Stack>
        <UsageRow title="AI 대화" value={chatUsageLabel(usage.chat)} counter={usage.chat} />
        <UsageRow title="AI 일정 변경" value={rescheduleUsageValue(usage.reschedule)} counter={usage.reschedule} />
        <Text variant="supporting" tone="secondary">
          {trial && usage.tier === 'free'
            ? `체험분을 다 쓰면 매달 AI 대화 ${PLAN_LIMITS.free.chat}회 · 일정 변경 ${PLAN_LIMITS.free.reschedule}회`
            : `다음 초기화: ${formatMonthDay(usage.resetsOn)}`}
        </Text>
      </Stack>
    </Card>
  );
}

function UsageRow({ title, value, counter }: { title: string; value: string; counter: Usage['chat'] }) {
  return (
    <Stack gap={2}>
      <Stack direction="row" justify="space-between" align="center">
        <Text variant="title3">{title}</Text>
        <Text variant="title3">{value}</Text>
      </Stack>
      <ProgressBar value={counter.limit === 0 ? 1 : counter.used / counter.limit} accessibilityLabel={`${title} ${value}`} />
    </Stack>
  );
}
