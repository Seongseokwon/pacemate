// 테스트에는 네이티브 모듈이 없다. 로그인 SDK를 불러오는 화면도 테스트할 수 있게 Google 로그인 모듈을 대신한다(T-106)
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn(), hasPlayServices: jest.fn(), signIn: jest.fn(), signOut: jest.fn(() => Promise.resolve(null)) },
  isSuccessResponse: (response: { type?: string } | undefined) => response?.type === 'success',
}));
