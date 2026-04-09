import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all enabled features for an organization.
   * Returns the features JSONB from the org's assigned package.
   * If no package is assigned, returns empty object (no features enabled).
   */
  async getOrgFeatures(orgId: string): Promise<Record<string, boolean>> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { package: { select: { features: true } } },
    });

    if (!org || !org.package) {
      return {};
    }

    return (org.package.features as Record<string, boolean>) ?? {};
  }

  /**
   * Check if a specific feature is enabled for an organization.
   * Returns true only if the org has a package AND that package
   * has the feature explicitly set to true.
   */
  async checkFeature(orgId: string, featureKey: string): Promise<boolean> {
    const features = await this.getOrgFeatures(orgId);
    return features[featureKey] === true;
  }
}
