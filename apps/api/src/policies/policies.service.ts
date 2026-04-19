import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';

export type PolicyLevel = 'CAMERA' | 'SITE' | 'PROJECT' | 'SYSTEM';

export interface ResolvedPolicy {
  ttlSeconds: number;
  maxViewers: number;
  domains: string[];
  allowNoReferer: boolean;
  rateLimit: number;
  sources: {
    ttlSeconds: PolicyLevel;
    maxViewers: PolicyLevel;
    domains: PolicyLevel;
    allowNoReferer: PolicyLevel;
    rateLimit: PolicyLevel;
  };
}

const SYSTEM_DEFAULTS: Omit<ResolvedPolicy, 'sources'> = {
  ttlSeconds: 7200,
  maxViewers: 10,
  domains: [],
  allowNoReferer: true,
  rateLimit: 100,
};

const LEVEL_PRIORITY: Record<string, number> = {
  CAMERA: 0,
  SITE: 1,
  PROJECT: 2,
  SYSTEM: 3,
};

@Injectable()
export class PoliciesService implements OnModuleInit {
  private readonly logger = new Logger(PoliciesService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    private readonly cls: ClsService,
  ) {}

  async onModuleInit() {
    // Seed runs outside any request, so there is no CLS context. The tenancy
    // extension requires a positive IS_SUPERUSER signal to bypass RLS — set it
    // explicitly for this bootstrap operation (SYSTEM policy has no orgId).
    await this.cls.run(async () => {
      this.cls.set('IS_SUPERUSER', 'true');
      await this.seedSystemDefault();
    });
  }

  async seedSystemDefault(): Promise<void> {
    const existing = await this.prisma.policy.findFirst({
      where: { level: 'SYSTEM' },
    });

    if (!existing) {
      await this.prisma.policy.create({
        data: {
          level: 'SYSTEM',
          name: 'System Default',
          orgId: null,
          ttlSeconds: SYSTEM_DEFAULTS.ttlSeconds,
          maxViewers: SYSTEM_DEFAULTS.maxViewers,
          domains: SYSTEM_DEFAULTS.domains,
          allowNoReferer: SYSTEM_DEFAULTS.allowNoReferer,
          rateLimit: SYSTEM_DEFAULTS.rateLimit,
        },
      });
      this.logger.log('System default policy seeded');
    }
  }

  async create(orgId: string, dto: CreatePolicyDto) {
    // Validate level matches foreign key
    this.validateLevelForeignKey(dto);

    return this.prisma.policy.create({
      data: {
        orgId: dto.level === 'SYSTEM' ? null : orgId,
        level: dto.level,
        name: dto.name,
        description: dto.description,
        ttlSeconds: dto.ttlSeconds,
        maxViewers: dto.maxViewers,
        domains: dto.domains,
        allowNoReferer: dto.allowNoReferer,
        rateLimit: dto.rateLimit,
        cameraId: dto.cameraId,
        siteId: dto.siteId,
        projectId: dto.projectId,
      },
    });
  }

  async findAll(orgId: string) {
    return this.prisma.policy.findMany({
      where: {
        OR: [{ orgId }, { level: 'SYSTEM' }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const policy = await this.prisma.policy.findUnique({ where: { id } });
    if (!policy) {
      throw new NotFoundException(`Policy ${id} not found`);
    }
    return policy;
  }

  async update(id: string, dto: UpdatePolicyDto) {
    await this.findOne(id); // Ensure exists
    return this.prisma.policy.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    const policy = await this.findOne(id);
    if (policy.level === 'SYSTEM' && policy.name === 'System Default') {
      throw new BadRequestException('Cannot delete system default policy');
    }
    return this.prisma.policy.delete({ where: { id } });
  }

  /**
   * THE CORE METHOD: Resolve effective policy for a camera.
   *
   * Queries camera to get siteId/projectId. Fetches policies at all 4 levels.
   * Sorts by priority (CAMERA=0, SITE=1, PROJECT=2, SYSTEM=3).
   * For each field, takes the first non-null/non-undefined value.
   *
   * IMPORTANT: empty array [] for domains is a VALID value (means allow all per D-14),
   * only null/undefined means "inherit".
   */
  async resolve(cameraId: string): Promise<ResolvedPolicy> {
    // Get camera with site and project info
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      include: { site: { include: { project: true } } },
    });

    if (!camera) {
      throw new NotFoundException(`Camera ${cameraId} not found`);
    }

    // Fetch policies at all 4 levels
    const policies = await this.prisma.policy.findMany({
      where: {
        OR: [
          { level: 'CAMERA', cameraId: camera.id },
          { level: 'SITE', siteId: camera.siteId },
          { level: 'PROJECT', projectId: camera.site.projectId },
          { level: 'SYSTEM' },
        ],
      },
    });

    // Sort by priority: CAMERA > SITE > PROJECT > SYSTEM
    policies.sort(
      (a: any, b: any) => LEVEL_PRIORITY[a.level] - LEVEL_PRIORITY[b.level],
    );

    // Start with hardcoded defaults as fallback
    const resolved: Omit<ResolvedPolicy, 'sources'> = { ...SYSTEM_DEFAULTS };

    // Default every source to SYSTEM -- covers the "no policies" fallback
    // (Test E) and any scalar field no policy supplies.
    const sources: ResolvedPolicy['sources'] = {
      ttlSeconds: 'SYSTEM',
      maxViewers: 'SYSTEM',
      domains: 'SYSTEM',
      allowNoReferer: 'SYSTEM',
      rateLimit: 'SYSTEM',
    };

    // Per-field merge for scalar fields: take first non-null/non-undefined value
    const scalarFields = ['ttlSeconds', 'maxViewers', 'allowNoReferer', 'rateLimit'] as const;

    for (const field of scalarFields) {
      for (const policy of policies) {
        const value = policy[field];
        if (value !== null && value !== undefined) {
          (resolved as any)[field] = value;
          sources[field] = policy.level as PolicyLevel;
          break;
        }
      }
    }

    // Domains uses array -- the highest-priority policy with a domains field wins
    // Since Prisma defaults domains to [], we use the first policy's domains in priority order
    // All policies have a domains array (never null due to @default([]))
    // The highest-priority policy's domains value is used
    if (policies.length > 0) {
      resolved.domains = policies[0].domains;
      sources.domains = policies[0].level as PolicyLevel;
    }

    return { ...resolved, sources };
  }

  private validateLevelForeignKey(dto: CreatePolicyDto): void {
    switch (dto.level) {
      case 'CAMERA':
        if (!dto.cameraId) {
          throw new BadRequestException('cameraId is required for CAMERA level policy');
        }
        break;
      case 'SITE':
        if (!dto.siteId) {
          throw new BadRequestException('siteId is required for SITE level policy');
        }
        break;
      case 'PROJECT':
        if (!dto.projectId) {
          throw new BadRequestException('projectId is required for PROJECT level policy');
        }
        break;
      case 'SYSTEM':
        // No foreign key required
        break;
    }
  }
}
