import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { getAuth } from '../auth.config';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const headers = new Headers();

    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(', '));
      }
    }

    const auth = getAuth();
    const session = await auth.api.getSession({ headers });

    if (!session) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Gap 15.1 — positive-signal tenancy:
    //   - Authenticated user WITH activeOrganizationId  -> tenant-scoped (ORG_ID)
    //   - Authenticated admin WITHOUT activeOrganizationId -> superuser (IS_SUPERUSER)
    //   - Authenticated non-admin WITHOUT activeOrganizationId -> 403, never reaches Prisma
    //
    // Super admin identifier matches SuperAdminGuard contract: session.user.role === 'admin'.
    const orgId = session.session?.activeOrganizationId;
    const isSuperAdmin = session.user?.role === 'admin';

    if (!orgId && !isSuperAdmin) {
      throw new ForbiddenException(
        'No active organization. User must be a member of at least one organization.',
      );
    }

    if (orgId) {
      this.cls.set('ORG_ID', orgId);
    }
    if (isSuperAdmin) {
      this.cls.set('IS_SUPERUSER', 'true');
    }

    // Attach user to request for downstream use
    (request as any).user = session.user;
    (request as any).session = session.session;

    return true;
  }
}
