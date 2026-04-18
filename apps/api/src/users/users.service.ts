import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
    const userId = randomUUID();

    // Create user
    const user = await this.prisma.user.create({
      data: {
        id: userId,
        name: dto.name,
        email: dto.email,
        emailVerified: true, // Admin-created accounts are pre-verified
        role: 'user', // Better Auth platform role (admin|user); Member.role carries tenant role
      },
    });

    // Hash password with Better Auth scrypt so sign-in via better-auth verifies correctly.
    // Use Function-indirect dynamic import so TS CommonJS transpile does NOT rewrite this
    // to require() — better-auth/crypto is ESM-only and fails under require().
    const dynImport = new Function('m', 'return import(m)') as (
      m: string,
    ) => Promise<{ hashPassword: (p: string) => Promise<string> }>;
    const { hashPassword } = await dynImport('better-auth/crypto');
    const hashedPassword = await hashPassword(dto.password);
    await this.prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: hashedPassword,
      },
    });

    // Add as org member — use $transaction with set_config to set RLS context
    // so the Member INSERT passes FORCE RLS policy for system org.
    const [, member] = await this.prisma.$transaction([
      this.prisma.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, TRUE)`,
      this.prisma.member.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          userId,
          role: dto.role,
        },
      }),
    ]);

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
