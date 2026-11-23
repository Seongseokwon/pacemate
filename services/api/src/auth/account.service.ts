import { Inject, Injectable } from '@nestjs/common';
import { type AuthProvider, type Coach, type CreateMeRequest, DEFAULT_COACH, type MeResponse } from '@pacemate/shared';
import { AppError } from '../common/app-error.js';
import { PrismaService } from '../db/prisma.service.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { identityHash } from '../usage/identity-hash.js';
import { UsageService } from '../usage/usage.service.js';
import { AUTH_ADMIN, type AuthAdmin } from './auth-admin.js';

export const consentRequired = () => new AppError('CONSENT_REQUIRED', '약관 동의가 필요해요.');

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    @Inject(AUTH_ADMIN) private readonly authAdmin: AuthAdmin,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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
        identityHash: true,
        coach: true,
        profile: { select: { userId: true } },
        plans: { where: { status: 'active' }, select: { id: true }, take: 1 },
        subscription: true,
      },
    });
    if (user && !user.identityHash) {
      const hash = await this.getIdentityHash(userId, user.authProvider);
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.updateMany({ where: { id: userId, identityHash: null, deletionRequestedAt: null }, data: { identityHash: hash } });
        if (updated.count) await tx.usageTrial.upsert({ where: { identityHash: hash }, create: { identityHash: hash }, update: { accountDeletedAt: null } });
      });
    }
    const subscription = user?.subscription;
    return {
      registered: !!user,
      onboardingCompleted: !!user?.profile,
      hasActivePlan: !!user?.plans.length,
      authProvider: user?.authProvider ?? authProvider,
      coach: user?.coach ?? null,
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
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing || existing.deletionRequestedAt || !existing.identityHash) {
      const hash = await this.getIdentityHash(userId, authProvider);
      await this.prisma.$transaction(async (tx) => {
        await tx.user.createMany({ data: { id: userId, authProvider, identityHash: hash, ...consent }, skipDuplicates: true });
        await tx.user.updateMany({
          where: { id: userId, deletionRequestedAt: { not: null } },
          data: { ...consent, authProvider, identityHash: hash, coach: DEFAULT_COACH, createdAt: now, deletionRequestedAt: null },
        });
        await tx.user.updateMany({ where: { id: userId, identityHash: null, deletionRequestedAt: null }, data: { identityHash: hash } });
        await tx.usageTrial.upsert({ where: { identityHash: hash }, create: { identityHash: hash }, update: { accountDeletedAt: null } });
      });
    }
    return this.getMe(userId, authProvider);
  }

  private async getIdentityHash(userId: string, provider: AuthProvider): Promise<string> {
    if (!this.config.IDENTITY_HASH_SECRET) throw new Error('체험분 식별 비밀값이 설정되지 않았다');
    return identityHash(provider, await this.authAdmin.providerId(userId, provider), this.config.IDENTITY_HASH_SECRET);
  }

  /**
   * 고른 코치를 저장한다(F04-R11~R13). 이용량을 차감하지 않고 횟수를 제한하지 않는다.
   * 바꾼 이력과 저장된 대화는 그대로 두며, 다음 답변부터 말투만 바뀐다(DATABASE §8).
   */
  async setCoach(userId: string, coach: Coach): Promise<{ coach: Coach }> {
    const { count } = await this.prisma.user.updateMany({ where: { id: userId, deletionRequestedAt: null }, data: { coach } });
    if (count === 0) throw consentRequired();
    return { coach };
  }

  /**
   * 개인 데이터를 지운 뒤 인증 서비스의 사용자를 지운다(F01-R06, DI-11).
   * 인증 서비스 쪽이 실패하면 표시만 있는 행이 남고, 다시 호출하면 거기서부터 이어서 한다.
   */
  async delete(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw consentRequired();
      if (!user.deletionRequestedAt) {
        const now = new Date();
        if (user.identityHash) {
          await tx.usageTrial.upsert({ where: { identityHash: user.identityHash }, create: { identityHash: user.identityHash, accountDeletedAt: now }, update: { accountDeletedAt: now } });
        }
        // 연쇄 삭제로 개인 데이터를 지운 뒤 재시도용 표시만 남긴다(DATABASE §7)
        await tx.user.delete({ where: { id: userId } });
        await tx.user.create({ data: { ...user, deletionRequestedAt: now } });
      }
    });
    await this.authAdmin.deleteUser(userId);
    await this.prisma.user.deleteMany({ where: { id: userId } });
  }
}
