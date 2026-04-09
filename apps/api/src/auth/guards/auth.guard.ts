import {
  CanActivate,
  ExecutionContext,
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

    // Set org context from active organization
    const orgId = session.session?.activeOrganizationId;
    if (orgId) {
      this.cls.set('ORG_ID', orgId);
    }

    // Attach user to request for downstream use
    (request as any).user = session.user;
    (request as any).session = session.session;

    return true;
  }
}
