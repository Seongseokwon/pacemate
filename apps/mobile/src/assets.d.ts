// 앱에 넣는 이미지 파일. 번들러가 이미지 소스로 바꾼다
declare module '*.png' {
  const source: import('react-native').ImageSourcePropType;
  export default source;
}
