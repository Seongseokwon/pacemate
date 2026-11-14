import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * 아직 만들지 않은 화면의 자리 표시.
 * 화면을 구현하는 작업에서 UI_UX.md의 컴포넌트(T-109)로 바꾸고, 쓰는 곳이 없어지면 이 파일을 지운다.
 */
export function PlaceholderScreen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
});
