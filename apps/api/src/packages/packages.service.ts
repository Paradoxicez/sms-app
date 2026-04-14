import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePackageDto) {
    return this.prisma.package.create({
      data: dto,
    });
  }

  async findAll() {
    return this.prisma.package.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const pkg = await this.prisma.package.findUnique({ where: { id } });
    if (!pkg) {
      throw new NotFoundException(`Package ${id} not found`);
    }
    return pkg;
  }

  async update(id: string, dto: UpdatePackageDto) {
    const existing = await this.findOne(id);

    // Merge features if provided (don't replace entire object)
    let data: any = { ...dto };
    if (dto.features) {
      data.features = {
        ...(existing.features as Record<string, boolean>),
        ...dto.features,
      };
    }

    return this.prisma.package.update({
      where: { id },
      data,
    });
  }

  async deactivate(id: string) {
    await this.findOne(id); // ensure exists
    return this.prisma.package.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
