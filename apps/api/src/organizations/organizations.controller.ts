import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
} from './dto/create-organization.dto';

@ApiExcludeController()
@Controller('api/admin/organizations')
@UseGuards(SuperAdminGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  async create(@Body() body: unknown) {
    const result = CreateOrganizationSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.organizationsService.create(result.data);
  }

  @Get()
  async findAll() {
    return this.organizationsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const result = UpdateOrganizationSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.organizationsService.update(id, result.data);
  }

  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.organizationsService.deactivate(id);
  }
}
