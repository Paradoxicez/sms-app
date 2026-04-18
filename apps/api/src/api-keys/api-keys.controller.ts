import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { FeatureGuard } from '../features/features.guard';
import { RequireFeature } from '../features/features.guard';
import { FeatureKey } from '../features/feature-key.enum';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeySchema } from './dto/create-api-key.dto';

@Controller('api/api-keys')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature(FeatureKey.API_KEYS)
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
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
    const result = CreateApiKeySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.apiKeysService.create(this.getOrgId(), result.data);
  }

  @Get()
  async findAll() {
    return this.apiKeysService.findAll(this.getOrgId());
  }

  @Get(':id/usage')
  async getUsage(
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    const numDays = days ? parseInt(days, 10) : 7;
    if (isNaN(numDays) || numDays < 1 || numDays > 90) {
      throw new BadRequestException('days must be between 1 and 90');
    }
    return this.apiKeysService.getUsageStats(id, numDays);
  }

  @Patch(':id/revoke')
  async revoke(@Param('id') id: string) {
    return this.apiKeysService.revoke(id, this.getOrgId());
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.apiKeysService.delete(id, this.getOrgId());
  }
}
