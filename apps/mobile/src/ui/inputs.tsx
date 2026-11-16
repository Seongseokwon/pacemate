import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createContext, type ReactNode, useContext, useState } from 'react';
import {
  Platform,
  Switch as RNSwitch,
  TextInput as RNTextInput,
  type TextInputProps as RNTextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { Button, Press } from './button';
import { Icon, type IconName } from './icon';
import { Stack } from './layout';
import { List, ListItem } from './list';
import { BottomSheet } from './overlay';
import { Text } from './text';
import { useTheme } from './theme';

/** `Field`가 안쪽 입력 요소에 이름표와 오류 여부를 알려 준다. */
const FieldContext = createContext<{ label?: string; error?: string }>({});

type FieldProps = { label: string; help?: string; error?: string; children: ReactNode };

/** 이름표, 도움말, 오류 문구를 입력 요소에 붙인다. 오류는 색과 함께 문구로 알린다(§10). */
export function Field({ label, help, error, children }: FieldProps) {
  return (
    <FieldContext.Provider value={{ label, error }}>
      <Stack gap={2}>
        <Text variant="chip" tone="secondary">
          {label}
        </Text>
        {children}
        {error !== undefined ? (
          <Text variant="supporting" tone="error">
            {error}
          </Text>
        ) : (
          help !== undefined && (
            <Text variant="supporting" tone="secondary">
              {help}
            </Text>
          )
        )}
      </Stack>
    </FieldContext.Provider>
  );
}

function useInputFrame(): ViewStyle {
  const t = useTheme();
  const { error } = useContext(FieldContext);
  return {
    minHeight: t.size.input,
    paddingHorizontal: t.spacing[3],
    borderRadius: t.radius.element,
    borderWidth: t.size.border,
    borderColor: error !== undefined ? t.color.text.error : t.color.borderEmphasized,
    backgroundColor: t.color.background.surface,
  };
}

type InputProps = Omit<RNTextInputProps, 'style' | 'multiline' | 'placeholderTextColor' | 'maxFontSizeMultiplier'>;

function BaseInput({ multiline = false, ...rest }: InputProps & { multiline?: boolean }) {
  const t = useTheme();
  const frame = useInputFrame();
  const { label } = useContext(FieldContext);
  const { fontSize, lineHeight } = t.typography.body;
  return (
    <RNTextInput
      accessibilityLabel={label}
      maxFontSizeMultiplier={t.maxFontScale}
      placeholderTextColor={t.color.text.secondary}
      multiline={multiline}
      style={[
        frame,
        { fontSize, color: t.color.text.primary },
        // 한 줄 입력창에 줄 높이를 주면 iOS에서 글자가 세로 가운데에서 벗어난다
        multiline && { lineHeight, minHeight: t.size.block, paddingVertical: t.spacing[3], textAlignVertical: 'top' },
      ]}
      {...rest}
    />
  );
}

export function TextInput(props: InputProps) {
  return <BaseInput {...props} />;
}

export function TextArea(props: InputProps) {
  return <BaseInput multiline {...props} />;
}

type NumberInputProps = Omit<InputProps, 'value' | 'onChange' | 'onChangeText' | 'keyboardType'> & {
  value: number | null;
  onChange: (value: number | null) => void;
  /** 소수점을 받는다(거리 등) */
  decimal?: boolean;
};

const toNumber = (text: string): number | null => (text === '' || text === '.' ? null : Number(text));

export function NumberInput({ value, onChange, decimal = false, ...rest }: NumberInputProps) {
  // "5."처럼 입력 중인 글자를 지키려고 글자를 따로 들고 있는다
  const [text, setText] = useState(value === null ? '' : String(value));
  if (toNumber(text) !== value) setText(value === null ? '' : String(value));

  return (
    <BaseInput
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      value={text}
      onChangeText={(input) => {
        const digits = decimal ? input.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1') : input.replace(/\D/g, '');
        setText(digits);
        onChange(toNumber(digits));
      }}
      {...rest}
    />
  );
}

type SwitchProps = { value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean; accessibilityLabel?: string };

export function Switch({ value, onValueChange, disabled = false, accessibilityLabel }: SwitchProps) {
  const t = useTheme();
  const { label } = useContext(FieldContext);
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
      trackColor={{ false: t.color.borderEmphasized, true: t.color.accent }}
      thumbColor={t.color.background.surface}
      ios_backgroundColor={t.color.borderEmphasized}
    />
  );
}

/** 누르면 고르는 창이 열리는, 입력창 모양의 버튼 */
function PickerButton({ text, placeholder, icon, onPress }: { text?: string; placeholder: string; icon: IconName; onPress: () => void }) {
  const t = useTheme();
  const frame = useInputFrame();
  const { label } = useContext(FieldContext);
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={[label, text ?? placeholder].filter(Boolean).join(', ')}
      onPress={onPress}
      style={[frame, { flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }]}
    >
      <View style={{ flex: 1 }}>
        <Text tone={text === undefined ? 'secondary' : 'primary'} numberOfLines={1}>
          {text ?? placeholder}
        </Text>
      </View>
      <Icon name={icon} tone="neutral" />
    </Press>
  );
}

type SelectorProps<T extends string> = {
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  placeholder?: string;
};

export function Selector<T extends string>({ value, options, onChange, placeholder = '선택해 주세요' }: SelectorProps<T>) {
  const [open, setOpen] = useState(false);
  const { label } = useContext(FieldContext);
  return (
    <>
      <PickerButton
        text={options.find((option) => option.value === value)?.label}
        placeholder={placeholder}
        icon="chevron"
        onPress={() => setOpen(true)}
      />
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
        <List>
          {options.map((option) => (
            <ListItem
              key={option.value}
              title={option.label}
              right={option.value === value ? <Icon name="check" tone="accent" /> : undefined}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
        </List>
      </BottomSheet>
    </>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (value: number) => String(value).padStart(2, '0');

// 날짜 문자열을 기기 시간대의 자정으로 바꿨다가 같은 시간대로 되돌리므로 시간대와 무관하게 같은 날짜가 나온다
const toDate = (date: string): Date => {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const toDateString = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** `YYYY-MM-DD`를 "11월 19일 (목)" 형식으로 쓴다(§9.3). */
export const formatDate = (date: string): string => {
  const value = toDate(date);
  return `${value.getMonth() + 1}월 ${value.getDate()}일 (${WEEKDAYS[value.getDay()]})`;
};

type DateInputProps = {
  /** `YYYY-MM-DD` */
  value: string | null;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
};

/** 기기의 날짜 선택기를 쓴다. Android는 기기의 대화 상자, iOS는 시트 안의 달력이다(§11). */
export function DateInput({ value, onChange, min, max, placeholder = '날짜를 골라 주세요' }: DateInputProps) {
  const t = useTheme();
  const { label } = useContext(FieldContext);
  // iOS 시트가 열려 있는 동안 고르고 있는 날짜
  const [draft, setDraft] = useState<Date | null>(null);
  const limits = { minimumDate: min === undefined ? undefined : toDate(min), maximumDate: max === undefined ? undefined : toDate(max) };

  const open = () => {
    // 값이 없으면 고를 수 있는 범위 안에서 기기의 오늘에 가장 가까운 날에서 시작한다
    const now = new Date();
    const start =
      value !== null ? toDate(value)
      : limits.minimumDate && now < limits.minimumDate ? limits.minimumDate
      : limits.maximumDate && now > limits.maximumDate ? limits.maximumDate
      : now;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: start, mode: 'date', ...limits, onValueChange: (_event, date) => onChange(toDateString(date)) });
    } else {
      setDraft(start);
    }
  };

  return (
    <>
      <PickerButton text={value === null ? undefined : formatDate(value)} placeholder={placeholder} icon="calendar" onPress={open} />
      {draft !== null && (
        <BottomSheet visible onClose={() => setDraft(null)} title={label}>
          <Stack gap={4}>
            <DateTimePicker
              value={draft}
              mode="date"
              display="inline"
              locale="ko-KR"
              themeVariant={t.mode}
              accentColor={t.color.accent}
              {...limits}
              onValueChange={(_event, date) => setDraft(date)}
            />
            <Button
              label="확인"
              size="large"
              onPress={() => {
                onChange(toDateString(draft));
                setDraft(null);
              }}
            />
          </Stack>
        </BottomSheet>
      )}
    </>
  );
}

type ScaleInputProps = {
  /** 고르지 않았으면 `null`. 고른 값을 다시 누르면 `null`로 돌아간다 */
  value: number | null;
  onChange: (value: number | null) => void;
  max: 5 | 10;
};

const SCALE_ROW = 5;

/** 1부터 `max`까지 중 하나를 고른다. 터치 영역을 지키려고 한 줄에 다섯 칸씩 둔다. */
export function ScaleInput({ value, onChange, max }: ScaleInputProps) {
  const t = useTheme();
  const { label } = useContext(FieldContext);
  const rows = Array.from({ length: max / SCALE_ROW }, (_, row) => Array.from({ length: SCALE_ROW }, (_, i) => row * SCALE_ROW + i + 1));
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: t.spacing[2] }}>
      {rows.map((row) => (
        <Stack key={row[0]} direction="row" gap={2}>
          {row.map((step) => {
            const selected = step === value;
            return (
              <Press
                key={step}
                accessibilityRole="radio"
                accessibilityLabel={`${max}점 중 ${step}점`}
                accessibilityState={{ checked: selected }}
                onPress={() => onChange(selected ? null : step)}
                style={{
                  flex: 1,
                  minHeight: t.size.touch,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: t.radius.element,
                  borderWidth: t.size.border,
                  borderColor: selected ? t.color.accent : t.color.borderEmphasized,
                  backgroundColor: selected ? t.color.accent : t.color.background.surface,
                }}
              >
                <Text variant="label" tone={selected ? 'onAccent' : 'primary'} tabular>
                  {step}
                </Text>
              </Press>
            );
          })}
        </Stack>
      ))}
    </View>
  );
}
