import { Inject, Injectable } from '@nestjs/common';
import { type ProfileResponse, type SaveProfileRequest, WORKOUT_LIMITS } from '@pacemate/shared';
import type { ClassifyLevel } from '@pacemate/training-engine';
import { AppError } from '../common/app-error.js';
import { PrismaService } from '../db/prisma.service.js';
import type { RunnerProfile } from '../generated/prisma/client.js';
import { LEVEL_CLASSIFIER } from './level-classifier.js';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LEVEL_CLASSIFIER) private readonly classifyLevel: ClassifyLevel,
  ) {}

  async get(userId: string): Promise<ProfileResponse> {
    const profile = await this.prisma.runnerProfile.findUnique({ where: { userId } });
    if (!profile) throw new AppError('NOT_FOUND', '프로필이 아직 없어요.');
    return toResponse(profile);
  }

  /** 온보딩 완료 시, 그리고 활성 계획이 없을 때 프로필을 저장한다(API_SPEC §3.2). */
  async save(userId: string, input: SaveProfileRequest): Promise<ProfileResponse> {
    const activePlan = await this.prisma.trainingPlan.findFirst({ where: { userId, status: 'active' }, select: { id: true } });
    // 계획에 영향을 주는 변경은 변경 제안을 거친다(F02-R05)
    if (activePlan) throw new AppError('PLAN_ACTIVE', '진행 중인 계획이 있어요. 프로필은 변경 미리보기를 거쳐 바꿀 수 있어요.');

    const { recentRecord, ...rest } = input;
    const recentPaceSecPerKm = paceOf(recentRecord);
    const data = {
      ...rest,
      recentWeeklyKm: input.recentWeeklyKm ?? null,
      recentPaceSecPerKm,
      recentRecordKm: recentRecord && 'distanceKm' in recentRecord ? recentRecord.distanceKm : null,
    };
    const level = this.classifyLevel({ ...data, recentPaceSecPerKm });
    const profile = await this.prisma.runnerProfile.upsert({
      where: { userId },
      create: { userId, ...data, level },
      update: { ...data, level },
    });
    return toResponse(profile);
  }
}

/** 기록(거리+시간)은 km당 페이스로 환산한다(DATABASE §3.2). 환산한 페이스도 입력 범위 안이어야 한다(F02-R02). */
export function paceOf(record: SaveProfileRequest['recentRecord']): number | null {
  if (!record) return null;
  if ('paceSecPerKm' in record) return record.paceSecPerKm;
  const pace = Math.round(record.durationSec / record.distanceKm);
  const { min, max } = WORKOUT_LIMITS.paceSecPerKm;
  if (pace < min || pace > max) {
    throw new AppError('VALIDATION_ERROR', '입력한 내용을 확인해 주세요.', {
      fields: { recentRecord: '거리와 시간을 다시 확인해 주세요.' },
    });
  }
  return pace;
}

function toResponse(profile: RunnerProfile): ProfileResponse {
  const distanceKm = profile.recentRecordKm?.toNumber();
  const pace = profile.recentPaceSecPerKm;
  return {
    experience: profile.experience,
    continuousRun: profile.continuousRun,
    recentWeeklyKm: profile.recentWeeklyKm?.toNumber() ?? null,
    // 시간은 저장하지 않으므로 페이스에서 되돌린다. 입력한 값과 몇 초 다를 수 있다
    recentRecord:
      pace === null ? null : distanceKm === undefined ? { paceSecPerKm: pace } : { distanceKm, durationSec: Math.round(pace * distanceKm) },
    weeklyRunCount: profile.weeklyRunCount,
    preferredWeekdays: profile.preferredWeekdays,
    level: profile.level,
  };
}
