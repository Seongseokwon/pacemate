import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, IconButton } from './button';
import { Stack } from './layout';
import { Heading, Text } from './text';
import { useReduceMotion, useTheme } from './theme';

type BottomSheetProps = { visible: boolean; onClose: () => void; title?: string; children: ReactNode };

/** 아래에서 올라오는 시트. 닫기 버튼, 바깥 누르기, 기기의 뒤로 가기로 닫힌다(UX-06). */
export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const offset = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (!visible || reduce) return;
    offset.setValue(t.spacing[12]);
    Animated.timing(offset, { toValue: 0, duration: t.duration.medium, easing: t.ease.standard, useNativeDriver: true }).start();
  }, [offset, reduce, t, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: t.color.overlay }]}
        />
        <Animated.View
          accessibilityViewIsModal
          style={{
            maxHeight: '80%',
            paddingTop: t.spacing[4],
            paddingBottom: insets.bottom + t.spacing[4],
            borderTopLeftRadius: t.radius.page,
            borderTopRightRadius: t.radius.page,
            backgroundColor: t.color.background.surface,
            transform: [{ translateY: offset }],
            ...t.shadow.high,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing[3],
              paddingHorizontal: t.spacing[4],
              paddingBottom: t.spacing[2],
            }}
          >
            <View style={{ flex: 1 }}>{title !== undefined && <Heading level={2}>{title}</Heading>}</View>
            <IconButton icon="close" accessibilityLabel="닫기" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: t.spacing[4] }}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

type DialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제처럼 되돌릴 수 없는 일 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function Dialog({ visible, title, message, confirmLabel = '확인', cancelLabel = '취소', danger = false, onConfirm, onCancel }: DialogProps) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'center', padding: t.spacing[6], backgroundColor: t.color.overlay }}>
        <View
          accessibilityViewIsModal
          style={{
            gap: t.spacing[4],
            padding: t.spacing[6],
            borderRadius: t.radius.container,
            backgroundColor: t.color.background.surface,
            ...t.shadow.high,
          }}
        >
          <Stack gap={2}>
            <Heading level={2}>{title}</Heading>
            {message !== undefined && <Text tone="secondary">{message}</Text>}
          </Stack>
          <Stack direction="row" gap={2}>
            <Stack fill>
              <Button variant="secondary" label={cancelLabel} onPress={onCancel} />
            </Stack>
            <Stack fill>
              <Button variant={danger ? 'danger' : 'primary'} label={confirmLabel} onPress={onConfirm} />
            </Stack>
          </Stack>
        </View>
      </View>
    </Modal>
  );
}
