import type { CreateMeRequest } from '@pacemate/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { createMe, ME_KEY } from '@/api/me';
import { isRedirectError } from '@/api/query-client';
import { Button, Divider, Icon, List, ListItem, Screen, showToast, Stack, Text } from '@/ui';

// 약관·정책 문서의 버전. 문서가 바뀌면 올린다. 지금은 초안이다(D-A5, D-12)
const CONSENT_VERSION = 'draft-1';

type ConsentKey = 'agreedTerms' | 'agreedPrivacy' | 'agreedHealthData';

const items = (): { key: ConsentKey; title: string; url?: string }[] => [
  { key: 'agreedTerms', title: '이용약관', url: process.env.EXPO_PUBLIC_TERMS_URL },
  { key: 'agreedPrivacy', title: '개인정보 처리방침', url: process.env.EXPO_PUBLIC_PRIVACY_URL },
  { key: 'agreedHealthData', title: '운동 데이터 처리', url: process.env.EXPO_PUBLIC_HEALTH_DATA_URL },
];

const Check = ({ on }: { on: boolean }) => <Icon name="check" tone={on ? 'accent' : 'disabled'} />;

/** 필수 동의(F01-R02, UI_UX §6.1). 세 항목을 모두 체크해야 가입할 수 있다. */
export default function Consent() {
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState<Record<ConsentKey, boolean>>({ agreedTerms: false, agreedPrivacy: false, agreedHealthData: false });
  const all = Object.values(agreed).every(Boolean);

  const submit = useMutation({
    mutationFn: (body: CreateMeRequest) => createMe(body),
    onSuccess: (me) => {
      queryClient.setQueryData(ME_KEY, me);
      router.replace('/');
    },
    onError: (error) => {
      if (!isRedirectError(error)) showToast(error.message);
    },
  });

  return (
    <Screen
      title="약관 동의"
      footer={
        <Button
          size="large"
          label="동의하고 시작하기"
          disabled={!all}
          loading={submit.isPending}
          onPress={() => submit.mutate({ consentVersion: CONSENT_VERSION, agreedTerms: true, agreedPrivacy: true, agreedHealthData: true })}
        />
      }
    >
      <Stack>
        <Text tone="secondary">서비스를 쓰려면 아래 내용에 모두 동의해야 해요.</Text>
        <ListItem
          title="모두 동의"
          accessibilityLabel={`모두 동의, ${all ? '선택됨' : '선택 안 됨'}`}
          left={<Check on={all} />}
          onPress={() => setAgreed({ agreedTerms: !all, agreedPrivacy: !all, agreedHealthData: !all })}
        />
        <Divider />
        <List>
          {items().map(({ key, title, url }) => (
            <ListItem
              key={key}
              title={`${title} (필수)`}
              accessibilityLabel={`${title} 필수, ${agreed[key] ? '선택됨' : '선택 안 됨'}`}
              left={<Check on={agreed[key]} />}
              right={
                url && (
                  <Button
                    variant="text"
                    label="전문 보기"
                    onPress={() => {
                      Linking.openURL(url).catch(() => showToast('문서를 열지 못했어요. 잠시 후 다시 시도해 주세요.'));
                    }}
                  />
                )
              }
              onPress={() => setAgreed({ ...agreed, [key]: !agreed[key] })}
            />
          ))}
        </List>
      </Stack>
    </Screen>
  );
}
