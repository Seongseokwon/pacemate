import { Inject, Injectable } from '@nestjs/common';
import type { AuthProvider, CreateMeRequest, MeResponse } from '@pacemate/shared';
import { AppError } from '../common/app-error.js';
import { PrismaService } from '../db/prisma.service.js';
import { UsageService } from '../usage/usage.service.js';
import { AUTH_ADMIN, type AuthAdmin } from './auth-admin.js';

export const consentRequired = () => new AppError('CONSENT_REQUIRED', '약관 동의가 필요해요.');

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    @Inject(AUTH_ADMIN) private readonly authAdmin: AuthAdmin,
  ) {}

  /** 필수 동의를 마친 계정인지. 삭제가 끝나지 않은 계정은 가입하지 않은 것으로 본다. */
  async isRegistered(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { deletionRequestedAt: true } });
    return !!user && !user.deletionRequestedAt;
  }

  async getMe(userId: string, authProvider: AuthProvider): Promise<MeResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletionRequestedAt: null },
      select: {
        authProvider: true,
        profile: { select: { userId: true } },
        plans: { where: { status: 'active' }, select: { id: true }, take: 1 },
        subscription: true,
      },
    });
    const subscription = user?.subscription;
    return {
      registered: !!user,
      onboardingCompleted: !!user?.profile,
      hasActivePlan: !!user?.plans.length,
      authProvider: user?.authProvider ?? authProvider,
      usage: await this.usage.get(userId),
      subscription: subscription
        ? {
            productId: subscription.productId,
            store: subscription.store,
            expiresAt: subscription.expiresAt.toISOString(),
            willRenew: subscription.willRenew,
          }
        : null,
    };
  }

  /** 필수 동의를 저장하고 계정을 만든다(F01-R02). 이미 가입한 계정이면 아무것도 바꾸지 않는다. */
  async register(userId: string, authProvider: AuthProvider, { consentVersion }: CreateMeRequest): Promise<MeResponse> {
    const now = new Date();
    const consent = { termsAgreedAt: now, privacyAgreedAt: now, healthDataAgreedAt: now, consentVersion };
    await this.prisma.user.createMany({ data: { id: userId, authProvider, ...consent }, skipDuplicates: true });
    // 삭제가 끝나지 않은 계정이 다시 가입하면 새 계정으로 시작한다. 개인 데이터는 이미 지워져 있다
    await this.prisma.user.updateMany({
      where: { id: userId, deletionRequestedAt: { not: null } },
      data: { ...consent, authProvider, createdAt: now, deletionRequestedAt: null },
    });
    return this.getMe(userId, authProvider);
  }

  /**
   * 개인 데이터를 지운 뒤 인증 서비스의 사용자를 지운다(F01-R06, DI-11).
   * 인증 서비스 쪽이 실패하면 표시만 있는 행이 남고, 다시 호출하면 거기서부터 이어서 한다.
   */
  async delete(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw consentRequired();

    if (!user.deletionRequestedAt) {
      // 행을 지워야 연쇄 삭제로 모든 테이블의 개인 데이터가 없어진다(DATABASE §7). 표시만 담은 행을 다시 만든다
      await this.prisma.$transaction([
        this.prisma.user.delete({ where: { id: userId } }),
        this.prisma.user.create({ data: { ...user, deletionRequestedAt: new Date() } }),
      ]);
    }
    await this.authAdmin.deleteUser(userId);
    await this.prisma.user.deleteMany({ where: { id: userId } });
  }
}
