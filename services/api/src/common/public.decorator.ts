import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/**
 * 앱이 호출하지 않는 경로(상태 확인, 웹훅, 내부 작업)에 붙인다.
 * 사용자 토큰과 앱 버전 헤더를 확인하지 않으므로, 웹훅과 내부 작업은 각자의 비밀값을 따로 검증해야 한다.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
