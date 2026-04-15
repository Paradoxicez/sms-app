import {
  Controller,
  Get,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { getAuth } from '../auth/auth.config';
import { UsersService } from './users.service';

/**
 * MembersController — separate controller for /api/organizations/:orgId/members/*.
 * Kept distinct from UsersController so the 'members/me' route isn't forced
 * under OrgAdminGuard (any authenticated member can query their own role).
 */
@UseGuards(AuthGuard)
@Controller('api/organizations/:orgId/members')
export class MembersController {
  constructor(private readonly usersService: UsersService) {}

  private async getSessionUserId(request: Request): Promise<string> {
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
    return session.user.id;
  }

  /**
   * GET /api/organizations/:orgId/members/me
   * Returns the caller's Member row ({ userId, organizationId, role }).
   * 401 when no session, 404 when caller is not a member of :orgId.
   */
  @Get('me')
  async getMyMembership(
    @Param('orgId') orgId: string,
    @Req() req: Request,
  ) {
    const userId = await this.getSessionUserId(req);
    return this.usersService.getCallerMembership(orgId, userId);
  }
}
