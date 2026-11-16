import { nextRoute } from './me';

test.each([
  [{ registered: false, onboardingCompleted: false }, '/consent'],
  [{ registered: true, onboardingCompleted: false }, '/(onboarding)'],
  [{ registered: true, onboardingCompleted: true }, '/(tabs)'],
] as const)('내 상태 %j이면 %s 화면으로 간다 (AC-F01-02, F01-R07)', (me, href) => {
  expect(nextRoute(me)).toBe(href);
});
