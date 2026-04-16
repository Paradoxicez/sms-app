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
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { PackagesService } from './packages.service';
import { CreatePackageSchema } from './dto/create-package.dto';
import { UpdatePackageSchema } from './dto/update-package.dto';

@ApiExcludeController()
@Controller('api/admin/packages')
@UseGuards(SuperAdminGuard)
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Post()
  async create(@Body() body: unknown) {
    const result = CreatePackageSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.packagesService.create(result.data);
  }

  @Get()
  async findAll() {
    return this.packagesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.packagesService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const result = UpdatePackageSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.packagesService.update(id, result.data);
  }

  @Delete(':id')
  async deactivate(@Param('id') id: string) {
    return this.packagesService.deactivate(id);
  }
}
