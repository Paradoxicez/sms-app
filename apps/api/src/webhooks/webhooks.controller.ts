import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { FeatureGuard } from '../features/features.guard';
import { RequireFeature } from '../features/features.guard';
import { FeatureKey } from '../features/feature-key.enum';
import { WebhooksService } from './webhooks.service';
import {
  CreateWebhookSchema,
  UpdateWebhookSchema,
} from './dto/create-webhook.dto';
import { Request } from 'express';

@ApiTags('Webhooks')
@Controller('api/webhooks')
@UseGuards(AuthGuard)
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly cls: ClsService,
  ) {}

  private getOrgId(): string {
    const orgId = this.cls.get('ORG_ID');
    if (!orgId) throw new BadRequestException('No active organization');
    return orgId;
  }

  @Post()
  @UseGuards(FeatureGuard)
  @RequireFeature(FeatureKey.WEBHOOKS)
  @ApiOperation({ summary: 'Create a webhook subscription' })
  @ApiResponse({ status: 201, description: 'Webhook created with signing secret' })
  async create(@Req() req: Request) {
    const parsed = CreateWebhookSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.webhooksService.create(this.getOrgId(), parsed.data);
  }

  @Get()
  @ApiOperation({ summary: 'List webhook subscriptions' })
  async findAll() {
    return this.webhooksService.findAll(this.getOrgId());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get webhook subscription details' })
  async findOne(@Param('id') id: string) {
    return this.webhooksService.findById(id, this.getOrgId());
  }

  @Patch(':id')
  @UseGuards(FeatureGuard)
  @RequireFeature(FeatureKey.WEBHOOKS)
  @ApiOperation({ summary: 'Update webhook subscription' })
  async update(@Param('id') id: string, @Req() req: Request) {
    const parsed = UpdateWebhookSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.webhooksService.update(id, this.getOrgId(), parsed.data);
  }

  @Delete(':id')
  @UseGuards(FeatureGuard)
  @RequireFeature(FeatureKey.WEBHOOKS)
  @ApiOperation({ summary: 'Delete webhook subscription' })
  async remove(@Param('id') id: string) {
    return this.webhooksService.delete(id, this.getOrgId());
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Get recent webhook deliveries' })
  async getDeliveries(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.webhooksService.getDeliveries(
      id,
      this.getOrgId(),
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
