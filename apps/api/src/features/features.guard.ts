import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeaturesService } from './features.service';

export const FEATURE_KEY = 'required_feature';

/**
 * Decorator to mark an endpoint as requiring a specific feature.
 * Usage: @RequireFeature(FeatureKey.RECORDINGS)
 */
export const RequireFeature = (featureKey: string) =>
  SetMetadata(FEATURE_KEY, featureKey);

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featuresService: FeaturesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No feature requirement on this route
    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    // orgId can come from route params or from session's activeOrganizationId
    const orgId = request.params?.orgId;

    if (!orgId) {
      throw new ForbiddenException(
        'Organization context required for feature-gated endpoint',
      );
    }

    const isEnabled = await this.featuresService.checkFeature(
      orgId,
      requiredFeature,
    );

    if (!isEnabled) {
      throw new ForbiddenException(
        `Feature "${requiredFeature}" is not enabled for this organization`,
      );
    }

    return true;
  }
}
