import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto) {
    try {
      return await this.prisma.organization.create({
        data: {
          id: randomUUID(),
          ...dto,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Organization with this slug already exists');
      }
      throw error;
    }
  }

  async findAll() {
    return this.prisma.organization.findMany({
      where: { slug: { not: 'system' } },
      include: { package: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        package: true,
        _count: { select: { members: true } },
      },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    await this.findOne(id); // ensure exists
    return this.prisma.organization.update({
      where: { id },
      data: dto,
    });
  }

  async deactivate(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    if (org.slug === 'system') {
      throw new ForbiddenException('Cannot deactivate the System organization');
    }
    return this.prisma.organization.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async assignPackage(id: string, packageId: string) {
    await this.findOne(id); // ensure exists
    return this.prisma.organization.update({
      where: { id },
      data: { packageId },
    });
  }
}
