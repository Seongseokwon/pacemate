import { Children, Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { Press } from './button';
import { Divider } from './layout';
import { Text } from './text';
import { useTheme } from './theme';

/** 행 사이에 구분선을 넣는다. */
export function List({ children }: { children: ReactNode }) {
  return (
    <View>
      {Children.toArray(children).map((child, index) => (
        <Fragment key={index}>
          {index > 0 && <Divider />}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

type ListItemProps = {
  title: string;
  description?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  /** 한 덩어리로 읽힐 문장. 없으면 제목과 설명을 읽는다 */
  accessibilityLabel?: string;
};

export function ListItem({ title, description, left, right, onPress, accessibilityLabel }: ListItemProps) {
  const t = useTheme();
  const style = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[3],
    minHeight: t.size.listRow,
    paddingVertical: t.spacing[2],
  } as const;
  const content = (
    <>
      {left}
      <View style={{ flex: 1 }}>
        <Text variant="title3">{title}</Text>
        {description !== undefined && (
          <Text variant="supporting" tone="secondary">
            {description}
          </Text>
        )}
      </View>
      {right}
    </>
  );
  return onPress ? (
    <Press accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={style}>
      {content}
    </Press>
  ) : (
    <View accessible={accessibilityLabel !== undefined} accessibilityLabel={accessibilityLabel} style={style}>
      {content}
    </View>
  );
}
