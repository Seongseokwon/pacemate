import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  Field,
  formatDate,
  IconButton,
  NumberInput,
  ScaleInput,
  Screen,
  SegmentedControl,
  SelectableCard,
  Selector,
  showToast,
  Text,
  TextInput,
  Toast,
} from '.';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

describe('Button', () => {
  test('누르면 동작을 실행한다', async () => {
    const onPress = jest.fn();
    await render(<Button label="저장" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test.each([{ disabled: true }, { loading: true }])('%o 상태에서는 눌리지 않는다', async (state) => {
    const onPress = jest.fn();
    await render(<Button label="저장" onPress={onPress} {...state} />);
    await fireEvent.press(screen.getByRole('button', { name: '저장' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });
});

test('IconButton은 접근성 이름으로 찾을 수 있다', async () => {
  const onPress = jest.fn();
  await render(<IconButton icon="close" accessibilityLabel="닫기" onPress={onPress} />);
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  expect(onPress).toHaveBeenCalled();
});

describe('Field', () => {
  test('이름표를 입력 요소의 접근성 이름으로 붙이고 도움말을 보여 준다', async () => {
    await render(
      <Field label="이름" help="다른 사람에게 보이지 않아요">
        <TextInput value="" onChangeText={() => undefined} />
      </Field>,
    );
    expect(screen.getByLabelText('이름')).toBeOnTheScreen();
    expect(screen.getByText('다른 사람에게 보이지 않아요')).toBeOnTheScreen();
  });

  test('오류가 있으면 도움말 대신 오류 문구를 보여 준다', async () => {
    await render(
      <Field label="이름" help="도움말" error="이름을 입력해 주세요">
        <TextInput value="" onChangeText={() => undefined} />
      </Field>,
    );
    expect(screen.getByText('이름을 입력해 주세요')).toBeOnTheScreen();
    expect(screen.queryByText('도움말')).toBeNull();
  });
});

describe('NumberInput', () => {
  function Harness({ decimal, onChange }: { decimal?: boolean; onChange: (value: number | null) => void }) {
    const [value, setValue] = useState<number | null>(null);
    return (
      <NumberInput
        testID="number"
        decimal={decimal}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  }

  test.each([
    { decimal: true, input: '12.5', text: '12.5', value: 12.5 },
    { decimal: true, input: '5.', text: '5.', value: 5 },
    { decimal: true, input: '1.2.3', text: '1.23', value: 1.23 },
    { decimal: true, input: '.', text: '.', value: null },
    { decimal: false, input: '12.5km', text: '125', value: 125 },
    { decimal: false, input: '', text: '', value: null },
  ])('소수 $decimal, 입력 "$input" → 글자 "$text", 값 $value', async ({ decimal, input, text, value }) => {
    const onChange = jest.fn();
    await render(<Harness decimal={decimal} onChange={onChange} />);
    await fireEvent.changeText(screen.getByTestId('number'), input);
    expect(onChange).toHaveBeenLastCalledWith(value);
    expect(screen.getByTestId('number')).toHaveDisplayValue(text);
  });

  test('밖에서 값이 바뀌면 글자도 바뀐다', async () => {
    const view = await render(<NumberInput testID="number" value={3} onChange={() => undefined} />);
    await view.rerender(<NumberInput testID="number" value={null} onChange={() => undefined} />);
    expect(screen.getByTestId('number')).toHaveDisplayValue('');
  });
});

test('Selector는 시트에서 고른 값을 알리고 시트를 닫는다', async () => {
  const onChange = jest.fn();
  const options = [
    { value: '5k', label: '5km 완주' },
    { value: '10k', label: '10km 완주' },
  ] as const;
  await render(
    <Field label="목표">
      <Selector value={null} options={options} onChange={onChange} />
    </Field>,
  );
  expect(screen.queryByText('10km 완주')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '목표, 선택해 주세요' }));
  await fireEvent.press(screen.getByText('10km 완주'));
  expect(onChange).toHaveBeenCalledWith('10k');
  expect(screen.queryByText('10km 완주')).toBeNull();
});

describe('ScaleInput', () => {
  test('1부터 최댓값까지 보여 주고 누른 값을 알린다', async () => {
    const onChange = jest.fn();
    await render(<ScaleInput value={null} onChange={onChange} max={10} />);
    expect(screen.getAllByRole('radio')).toHaveLength(10);
    await fireEvent.press(screen.getByRole('radio', { name: '10점 중 7점' }));
    expect(onChange).toHaveBeenCalledWith(7);
  });

  test('고른 값을 다시 누르면 선택을 지운다', async () => {
    const onChange = jest.fn();
    await render(<ScaleInput value={3} onChange={onChange} max={5} />);
    expect(screen.getByRole('radio', { name: '5점 중 3점' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: '5점 중 3점' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

test('SegmentedControl은 고른 항목을 표시하고 바꾼 값을 알린다', async () => {
  const onChange = jest.fn();
  const options = [
    { value: 'week', label: '주간' },
    { value: 'month', label: '월간' },
  ] as const;
  await render(<SegmentedControl value="week" options={options} onChange={onChange} />);
  expect(screen.getByRole('tab', { name: '주간' })).toBeSelected();
  await fireEvent.press(screen.getByRole('tab', { name: '월간' }));
  expect(onChange).toHaveBeenCalledWith('month');
});

test('SelectableCard는 선택 여부를 화면 낭독에 알린다', async () => {
  await render(
    <SelectableCard selected onPress={() => undefined} accessibilityLabel="프리미엄">
      <Text>프리미엄</Text>
    </SelectableCard>,
  );
  expect(screen.getByRole('button', { name: '프리미엄' })).toBeSelected();
});

test('Dialog는 확인과 취소를 따로 알린다', async () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  await render(<Dialog visible title="기록을 지울까요?" confirmLabel="지우기" danger onConfirm={onConfirm} onCancel={onCancel} />);
  await fireEvent.press(screen.getByRole('button', { name: '지우기' }));
  await fireEvent.press(screen.getByRole('button', { name: '취소' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test('Badge는 99를 넘으면 99+로 쓴다', async () => {
  await render(
    <>
      <Badge count={7} />
      <Badge count={100} />
    </>,
  );
  expect(screen.getByText('7')).toBeOnTheScreen();
  expect(screen.getByText('99+')).toBeOnTheScreen();
});

describe('Screen', () => {
  test('오류 상태에서는 본문 대신 오류 문장과 다시 시도 버튼을 보여 준다 (F05-R07)', async () => {
    const onRetry = jest.fn();
    await render(
      <Screen error="화면을 불러오지 못했어요" onRetry={onRetry}>
        <Text>본문</Text>
      </Screen>,
    );
    expect(screen.queryByText('본문')).toBeNull();
    expect(screen.getByText('화면을 불러오지 못했어요')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalled();
  });

  test('로딩 상태에서는 본문을 보여 주지 않는다', async () => {
    await render(
      <Screen loading>
        <Text>본문</Text>
      </Screen>,
    );
    expect(screen.queryByText('본문')).toBeNull();
    expect(screen.getByLabelText('불러오는 중')).toBeOnTheScreen();
  });

  test('머리글의 뒤로 가기 버튼을 누르면 동작을 실행한다', async () => {
    const onBack = jest.fn();
    await render(<Screen title="기록" onBack={onBack} />);
    expect(screen.getByRole('header', { name: '기록' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '뒤로' }));
    expect(onBack).toHaveBeenCalled();
  });
});

test('Toast는 알림을 띄웠다가 시간이 지나면 지운다', async () => {
  jest.useFakeTimers();
  await render(<Toast />);
  expect(screen.queryByText('저장했어요')).toBeNull();
  await act(async () => showToast('저장했어요'));
  expect(screen.getByText('저장했어요')).toBeOnTheScreen();
  await act(async () => jest.runAllTimers());
  expect(screen.queryByText('저장했어요')).toBeNull();
  jest.useRealTimers();
});

test('formatDate는 월 일 (요일)로 쓴다 (UI_UX §9.3)', () => {
  expect(formatDate('2026-11-19')).toBe('11월 19일 (목)');
  expect(formatDate('2027-01-03')).toBe('1월 3일 (일)');
});
