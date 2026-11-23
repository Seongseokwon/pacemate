import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json에 더해, 계정마다 다른 로그인 설정을 .env에서 넣는다(T-106). 값이 없으면 Google 로그인 설정을 빼고 빌드한다
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
  const plugins: NonNullable<ExpoConfig['plugins']> = [...(config.plugins ?? [])];
  if (process.env.SENTRY_ORG && process.env.SENTRY_PROJECT) plugins.push(['@sentry/react-native/expo', { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }]);
  if (iosUrlScheme) plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  // Sign in with Apple 권한은 expo-apple-authentication이 설치되면 Expo가 자동으로 넣는다
  return { ...config, name: config.name ?? 'PaceMate', slug: config.slug ?? 'pacemate', plugins };
};
