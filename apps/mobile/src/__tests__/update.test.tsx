import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import Update from '../app/update';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(() => Promise.resolve(true)) }));

afterEach(() => {
  delete process.env.EXPO_PUBLIC_IOS_STORE_URL;
});

test('업데이트 안내와 스토어로 가는 버튼을 보여 준다 (F11-R06)', async () => {
  process.env.EXPO_PUBLIC_IOS_STORE_URL = 'https://apps.apple.com/app/id0000000000';
  await render(<Update />);
  expect(screen.getByText(/새 버전이 나왔어요/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '업데이트하러 가기' }));
  expect(Linking.openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id0000000000');
});

test('스토어 주소가 아직 없으면 열리지 않는 버튼을 두지 않는다', async () => {
  await render(<Update />);
  expect(screen.getByText(/새 버전이 나왔어요/)).toBeOnTheScreen();
  expect(screen.queryByRole('button')).toBeNull();
});
