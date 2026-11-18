import { View } from 'react-native';
import { useTheme } from './theme';

export type IllustrationName = 'plan' | 'chat' | 'progress';

/** 인트로의 그림 패널(C2 02a~02c). 패널 단계 색만으로 그린 간단한 도형이다. */
export function Illustration({ name }: { name: IllustrationName }) {
  const t = useTheme();
  const bar = (width: `${number}%`, accent = false) => ({
    width,
    height: t.spacing[6],
    borderRadius: t.radius.inner,
    backgroundColor: accent ? t.color.accentMuted : t.color.background.body,
  });
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        aspectRatio: 1.3,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radius.container,
        backgroundColor: t.color.background.raised,
      }}
    >
      {name === 'plan' && (
        <View style={{ width: '50%', gap: t.spacing[3] }}>
          {(['100%', '75%', '88%'] as const).map((width) => (
            <View key={width} style={[bar(width), { flexDirection: 'row', alignItems: 'center', paddingLeft: t.spacing[2] }]}>
              <View style={{ width: t.spacing[2], height: t.spacing[2], borderRadius: t.radius.full, backgroundColor: t.color.accentMuted }} />
            </View>
          ))}
        </View>
      )}
      {name === 'chat' && (
        <View style={{ width: '62%', gap: t.spacing[4] }}>
          <View style={[bar('70%'), { height: t.spacing[12], borderRadius: t.radius.chat }]} />
          <View style={[bar('70%', true), { height: t.spacing[12], borderRadius: t.radius.chat, alignSelf: 'flex-end' }]} />
        </View>
      )}
      {name === 'progress' && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing[2] }}>
          {[t.spacing[6], t.spacing[10], t.spacing[12] + t.spacing[2], t.spacing[12] + t.spacing[12]].map((height, index, all) => (
            <View
              key={height}
              style={{
                width: t.spacing[7],
                height,
                borderRadius: t.radius.inner / 2,
                backgroundColor: index === all.length - 1 ? t.color.accent : t.color.background.body,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
