import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json에 더해, 계정마다 다른 로그인 설정을 .env에서 넣는다(T-106). 값이 없으면 Google 로그인 설정을 빼고 빌드한다
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
  const plugins: NonNullable<ExpoConfig['plugins']> = [...(config.plugins ?? [])];
  if (iosUrlScheme) plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  return { ...config, name: config.name ?? 'PaceMate', slug: config.slug ?? 'pacemate', plugins };
};
