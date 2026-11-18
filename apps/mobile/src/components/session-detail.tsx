import { SESSION_TYPE_LABELS } from '@pacemate/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { getSession } from '@/api/plan';
import { coachHref, recordHref } from '@/navigation/links';
import {
  BottomSheet,
  Button,
  Chip,
  formatDate,
  formatDuration,
  formatPace,
  originalLine,
  sessionAmount,
  Skeleton,
  Stack,
  StatusChip,
  Text,
} from '@/ui';

/** 훈련 상세 시트(F06, PRD §5.6, UI_UX §6.5). `sessionId`가 null이면 닫혀 있다. */
export function SessionDetailSheet({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const detail = useQuery({ queryKey: ['session', sessionId], queryFn: () => getSession(sessionId!), enabled: sessionId !== null });
  const go = (href: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(href);
  };

  const session = detail.data;
  return (
    <BottomSheet visible={sessionId !== null} onClose={onClose} title={session ? formatDate(session.date) : '훈련 상세'}>
      {detail.isPending ? (
        <Stack>
          <Skeleton short />
          <Skeleton shape="block" />
        </Stack>
      ) : detail.isError ? (
        <Stack>
          <Text tone="secondary">{detail.error.message}</Text>
          <Button variant="secondary" label="다시 시도" onPress={() => void detail.refetch()} />
        </Stack>
      ) : (
        session && (
          <Stack gap={4}>
            <Stack direction="row" gap={2}>
              <Chip label={SESSION_TYPE_LABELS[session.type].name} session={session.type} />
              <StatusChip status={session.status} />
              {session.original && <Chip label="변경됨" tone="info" />}
            </Stack>
            <Stack gap={1}>
              <Text variant="display" tabular>
                {sessionAmount(session)}
              </Text>
              <Text tone="secondary">{SESSION_TYPE_LABELS[session.type].guidance}</Text>
              {session.runIntervalMin !== null && <Text tone="secondary">{`한 번에 ${session.runIntervalMin}분씩 달리고 걷기를 번갈아 해요`}</Text>}
              {session.paceRange && (
                <Text tone="secondary" tabular>
                  {`권장 페이스 ${formatPace(session.paceRange.minSecPerKm)} ~ ${formatPace(session.paceRange.maxSecPerKm)}`}
                </Text>
              )}
            </Stack>
            {session.original && <Text variant="supporting" tone="secondary">{originalLine(session.original)}</Text>}
            {session.workout ? (
              <Stack gap={1}>
                <Text variant="title3">기록</Text>
                <Text tone="secondary" tabular>
                  {`${sessionAmount({ distanceKm: session.workout.distanceKm, durationMin: null })} · ${formatDuration(session.workout.durationSec)} · ${formatPace(session.workout.paceSecPerKm)}`}
                </Text>
              </Stack>
            ) : (
              session.status !== 'skipped' && (
                <Button label="기록하기" onPress={() => go(recordHref({ date: session.date, sessionId: session.id }))} />
              )
            )}
            <Button variant="text" label="AI에게 변경 요청" onPress={() => go(coachHref({ sessionId: session.id }))} />
          </Stack>
        )
      )}
    </BottomSheet>
  );
}
