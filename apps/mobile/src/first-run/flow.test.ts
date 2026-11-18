import { type FirstRunEvent, type FirstRunState, firstRunRoute, INITIAL_STATE, reduce } from './flow';

const me = (patch: Partial<{ registered: boolean; onboardingCompleted: boolean; hasActivePlan: boolean }> = {}) => ({
  registered: true,
  onboardingCompleted: false,
  hasActivePlan: false,
  ...patch,
});
const after = (...events: FirstRunEvent[]): FirstRunState => events.reduce(reduce, INITIAL_STATE);
const seen = after('introDone');

test('처음 실행하면 내 상태와 상관없이 인트로를 보여 주고, 본 뒤에는 보여 주지 않는다 (AC-F01-05, F01-R08)', () => {
  expect(firstRunRoute(INITIAL_STATE, null)).toBe('/intro');
  expect(firstRunRoute(INITIAL_STATE, me({ onboardingCompleted: true, hasActivePlan: true }))).toBe('/intro');
  expect(firstRunRoute(seen, null)).toBeNull();
});

test('동의 전이면 동의 화면으로 간다 (AC-F01-02)', () => {
  expect(firstRunRoute(seen, me({ registered: false }))).toBe('/consent');
});

test('온보딩을 마치지 않았으면 온보딩 시작 화면, [시작하기] 뒤에는 질문으로 간다 (F01-R07, F02-R08)', () => {
  expect(firstRunRoute(seen, me())).toBe('/(onboarding)/start');
  expect(firstRunRoute(after('introDone', 'onboardingStarted'), me())).toBe('/(onboarding)');
});

test('앱을 다시 열면 질문 중이었어도 온보딩 시작 화면부터 보여 준다 (F01-R07)', () => {
  const reopened = { ...after('introDone', 'onboardingStarted'), onboardingStartPassed: false };
  expect(firstRunRoute(reopened, me())).toBe('/(onboarding)/start');
});

test('[나중에 할게요]를 고르면 계획 없는 홈으로 가고, 다시 열어도 홈으로 간다 (AC-F01-06)', () => {
  const deferred = after('introDone', 'onboardingDeferred');
  expect(firstRunRoute(deferred, me())).toBe('/(tabs)');
  expect(firstRunRoute({ ...deferred, onboardingStartPassed: false }, me())).toBe('/(tabs)');
});

test('홈의 계획 만들기 카드로 온보딩을 다시 시작할 수 있다 (AC-F01-06)', () => {
  expect(firstRunRoute(after('introDone', 'onboardingDeferred', 'onboardingStarted'), me())).toBe('/(onboarding)');
});

test('온보딩 중 프로필을 저장하면 계획 미리보기로, 온보딩 밖에서 계획이 없으면 홈으로 간다', () => {
  expect(firstRunRoute(after('introDone', 'onboardingStarted'), me({ onboardingCompleted: true }))).toBe('/(onboarding)/plan-preview');
  expect(firstRunRoute(seen, me({ onboardingCompleted: true }))).toBe('/(tabs)');
});

test('계획을 확정하면 코치 고르기, 알림 권한을 차례로 거쳐 홈으로 간다 (F04-R12, F09-R03)', () => {
  const confirmed = after('introDone', 'onboardingStarted', 'planConfirmed');
  const withPlan = me({ onboardingCompleted: true, hasActivePlan: true });
  expect(firstRunRoute(confirmed, withPlan)).toBe('/coach-select');
  const coachChosen = reduce(confirmed, 'coachSelected');
  expect(firstRunRoute(coachChosen, withPlan)).toBe('/notification-permission');
  expect(firstRunRoute(reduce(coachChosen, 'notificationsDone'), withPlan)).toBe('/(tabs)');
});

test('코치 고르기를 마치기 전에 앱을 다시 열면 코치 고르기부터 이어 간다 (F04-R12)', () => {
  const confirmed = { ...after('introDone', 'onboardingStarted', 'planConfirmed'), onboardingStartPassed: false };
  expect(firstRunRoute(confirmed, me({ onboardingCompleted: true, hasActivePlan: true }))).toBe('/coach-select');
});

test('활성 계획이 있으면 홈으로 간다', () => {
  expect(firstRunRoute(seen, me({ onboardingCompleted: true, hasActivePlan: true }))).toBe('/(tabs)');
});
