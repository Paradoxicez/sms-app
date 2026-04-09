import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { getAuth } from '../auth/auth.config';
import { UsersService } from './users.service';
import { InviteUserSchema } from './dto/invite-user.dto';
import { CreateUserSchema } from './dto/create-user.dto';

/**
 * User management endpoints scoped to an organization.
 * All endpoints require org admin role.
 * For now, we use SuperAdminGuard as a placeholder until org-level guards are built.
 * In production, this should use an OrgRoles("admin") guard.
 */
@Controller('api/organizations/:orgId/users')
export class UsersController {
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

  @Post('invitations')
  async inviteUser(
    @Param('orgId') orgId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const result = InviteUserSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    const userId = await this.getSessionUserId(req);
    return this.usersService.inviteUser(orgId, userId, result.data);
  }

  @Post()
  async createUser(
    @Param('orgId') orgId: string,
    @Body() body: unknown,
  ) {
    const result = CreateUserSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.usersService.createUser(orgId, result.data);
  }

  @Get()
  async listMembers(@Param('orgId') orgId: string) {
    return this.usersService.listMembers(orgId);
  }

  @Patch(':userId')
  async updateRole(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() body: { role: string },
  ) {
    return this.usersService.updateRole(orgId, userId, body.role);
  }

  @Delete(':userId')
  async removeMember(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
  ) {
    return this.usersService.removeMember(orgId, userId);
  }
}
