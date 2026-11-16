/** 인증 서비스의 관리 기능. 계정 삭제에서 인증 서비스 쪽 사용자를 지운다(ARCHITECTURE §9). */
export interface AuthAdmin {
  deleteUser(userId: string): Promise<void>;
}

export const AUTH_ADMIN = Symbol('AUTH_ADMIN');

/** 인증 서비스의 관리 키가 생기기 전(D-A1)의 구현. 지우지 못한 것을 성공으로 넘기지 않는다. */
export class UnconfiguredAuthAdmin implements AuthAdmin {
  async deleteUser(): Promise<void> {
    throw new Error('인증 서비스의 관리 기능이 설정되지 않았다');
  }
}
