import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { getAuth } from '../auth.config';

@Injectable()
export class SuperAdminGuard implements CanActivate {
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

    if (session.user.role !== 'admin') {
      throw new UnauthorizedException('Super admin access required');
    }

    // Set IS_SUPERUSER so downstream Prisma queries through the tenancy
    // extension bypass RLS and can read/write across every tenant — the
    // admin portal is by definition cross-tenant.
    this.cls.set('IS_SUPERUSER', 'true');
    (request as any).user = session.user;
    (request as any).session = session.session;

    return true;
  }
}
