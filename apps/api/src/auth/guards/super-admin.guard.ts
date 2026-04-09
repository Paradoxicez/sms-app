import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { auth } from '../auth.config';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const headers = new Headers();

    // Convert Express headers to standard Headers
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(', '));
      }
    }

    const session = await auth.api.getSession({ headers });

    if (!session) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Better Auth admin plugin sets role = "admin" for super admins
    if (session.user.role !== 'admin') {
      throw new UnauthorizedException('Super admin access required');
    }

    return true;
  }
}
