import {
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { getAuth } from '../auth/auth.config';
import { InviteUserDto } from './dto/invite-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  // TENANCY_CLIENT is the RLS-aware Prisma extension. Member and Invitation
  // tables have RLS enforced, so queries without CLS signals (ORG_ID or
  // IS_SUPERUSER) return empty. Super-admin callers set IS_SUPERUSER in
  // OrgAdminGuard so bypass matches; org admins set ORG_ID in the same
  // guard so tenant_isolation matches.
  constructor(@Inject(TENANCY_CLIENT) private readonly prisma: any) {}

  async inviteUser(orgId: string, inviterId: string, dto: InviteUserDto) {
    return this.prisma.invitation.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        email: dto.email,
        role: dto.role,
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        inviterId,
      },
    });
  }

  async createUser(orgId: string, dto: CreateUserDto) {
    // Delegate User + Account creation to Better Auth so password hashing uses
    // the exact same function used by sign-in verification. Doing it manually
    // (e.g., calling `better-auth/crypto.hashPassword` ourselves) produced a
    // hash that sign-in rejected as "Invalid password" — see Gap 15.2.
    const auth = getAuth();
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: dto.email,
        password: dto.password,
        name: dto.name,
      },
    });

    if (!signUpResult?.user?.id) {
      throw new BadRequestException('Failed to create user');
    }

    const userId = signUpResult.user.id;

    // Mark as pre-verified and keep platform role as 'user' (Member.role carries tenant role).
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, role: 'user' },
    });

    // Add as org member. TENANCY_CLIENT wraps this call in a transaction that
    // calls set_config('app.current_org_id', ...) from CLS — OrgAdminGuard
    // already set ORG_ID to the route's :orgId, so tenant_isolation matches.
    const member = await this.prisma.member.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: dto.role,
      },
    });

    return { user, member };
  }

  async listMembers(orgId: string) {
    return this.prisma.member.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async updateRole(orgId: string, userId: string, role: string) {
    const result = await this.prisma.member.updateMany({
      where: { organizationId: orgId, userId },
      data: { role },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Member not found in organization`);
    }
    return result;
  }

  /**
   * Returns the caller's Member row in the given organization, or throws 404.
   * Used by GET /api/organizations/:orgId/members/me for role detection.
   * Mitigates T-999.1-04 (information disclosure): caller can only look up
   * THEIR OWN Member row because userId comes from the authenticated session.
   */
  async getCallerMembership(orgId: string, userId: string) {
    const member = await this.prisma.member.findFirst({
      where: { organizationId: orgId, userId },
      select: { userId: true, organizationId: true, role: true },
    });
    if (!member) {
      throw new NotFoundException('Not a member of this organization');
    }
    return member;
  }

  async removeMember(orgId: string, userId: string) {
    // Check if user is an admin
    const member = await this.prisma.member.findFirst({
      where: { organizationId: orgId, userId },
    });
    if (!member) {
      throw new NotFoundException(`Member not found in organization`);
    }

    if (member.role === 'admin') {
      const adminCount = await this.prisma.member.count({
        where: { organizationId: orgId, role: 'admin' },
      });
      if (adminCount <= 1) {
        throw new ForbiddenException('Cannot remove the last admin');
      }
    }

    await this.prisma.member.deleteMany({
      where: { organizationId: orgId, userId },
    });

    return { removed: true };
  }
}
