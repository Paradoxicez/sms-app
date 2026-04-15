import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
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
  constructor(private readonly prisma: PrismaService) {}

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

    // Super admin bypass — User.role='admin' has full platform access.
    if (session.user.role === 'admin') {
      return true;
    }

    const rawOrgId = request.params?.orgId;
    const orgId = Array.isArray(rawOrgId) ? rawOrgId[0] : rawOrgId;
    if (!orgId || typeof orgId !== 'string') {
      throw new ForbiddenException('orgId route param required');
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

    return true;
  }
}
