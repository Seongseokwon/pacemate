import type { Provider } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service.js';
import { PlanService } from '../../plan/plan.service.js';
import { ProfileService } from '../../profile/profile.service.js';
import { ProposalService } from '../../proposal/proposal.service.js';
import { SummaryService } from '../../summary/summary.service.js';
import { proposalTools } from './proposal-tools.js';
import { queryTools } from './query-tools.js';
import { ToolRegistry } from './tool-registry.js';

/** 채팅에 쓰는 도구 7개(PRD §6.2)를 담은 레지스트리. 데이터를 바꾸는 도구는 등록하지 않는다(ARCHITECTURE §7.3의 5번) */
export const toolRegistryProvider: Provider = {
  provide: ToolRegistry,
  useFactory: (prisma: PrismaService, plans: PlanService, profiles: ProfileService, summaries: SummaryService, proposals: ProposalService) =>
    new ToolRegistry([...queryTools({ prisma, plans, profiles, summaries }), ...proposalTools(proposals)]),
  inject: [PrismaService, PlanService, ProfileService, SummaryService, ProposalService],
};
