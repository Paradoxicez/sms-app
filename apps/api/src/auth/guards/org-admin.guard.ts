import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { getAuth } from '../auth.config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * OrgAdminGuard allows:
 *   - Super admin (session.user.role === 'admin') — access to any org.
 *   - Org admin (Member.role === 'admin' for the :orgId route param) — access to own org only.
 *
 * Rejects:
 *   - Missing session → UnauthorizedException (401)
 *   - Cross-tenant write attempts by an org admin of a DIFFERENT org → ForbiddenException (403)
 *     (Mitigates threat T-999.1-03: elevation of privilege / cross-tenant write)
 *   - Non-admin members (operator/developer/viewer) → ForbiddenException (403)
 *   - Missing :orgId route param → ForbiddenException (403)
 */
@Injectable()
export class OrgAdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

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

    const rawOrgId = request.params?.orgId;
    const orgId = Array.isArray(rawOrgId) ? rawOrgId[0] : rawOrgId;
    if (!orgId || typeof orgId !== 'string') {
      throw new ForbiddenException('orgId route param required');
    }

    // Super admin bypass — User.role='admin' has full platform access. Set
    // IS_SUPERUSER in CLS so downstream Prisma queries through the tenancy
    // extension emit set_config('app.is_superuser','true',...) and the
    // superuser_bypass_* RLS policies match, letting the query see rows in
    // any tenant (the route's :orgId scopes writes via tenant_isolation).
    if (session.user.role === 'admin') {
      this.cls.set('IS_SUPERUSER', 'true');
      this.cls.set('ORG_ID', orgId);
      (request as any).user = session.user;
      (request as any).session = session.session;
      return true;
    }

    const member = await this.prisma.member.findFirst({
      where: {
        userId: session.user.id,
        organizationId: orgId,
        role: 'admin',
      },
    });

    if (!member) {
      throw new ForbiddenException('Org admin access required');
    }

    // Org admin path — set ORG_ID so tenant_isolation policy scopes queries
    // to this tenant. Guards elsewhere (AuthGuard) do the same for mounted
    // AuthGuard routes; this controller uses OrgAdminGuard standalone.
    this.cls.set('ORG_ID', orgId);
    (request as any).user = session.user;
    (request as any).session = session.session;

    return true;
  }
}
