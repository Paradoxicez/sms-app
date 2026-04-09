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
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PoliciesService } from './policies.service';
import { CreatePolicySchema } from './dto/create-policy.dto';
import { UpdatePolicySchema } from './dto/update-policy.dto';

@Controller('api/policies')
@UseGuards(AuthGuard)
export class PoliciesController {
  constructor(
    private readonly policiesService: PoliciesService,
    private readonly cls: ClsService,
  ) {}

  private getOrgId(): string {
    const orgId = this.cls.get('ORG_ID');
    if (!orgId) {
      throw new BadRequestException('No active organization');
    }
    return orgId;
  }

  @Post()
  async create(@Body() body: unknown) {
    const result = CreatePolicySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.policiesService.create(this.getOrgId(), result.data);
  }

  @Get()
  async findAll() {
    return this.policiesService.findAll(this.getOrgId());
  }

  @Get('resolve/:cameraId')
  async resolve(@Param('cameraId') cameraId: string) {
    return this.policiesService.resolve(cameraId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.policiesService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const result = UpdatePolicySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.policiesService.update(id, result.data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.policiesService.remove(id);
  }
}
