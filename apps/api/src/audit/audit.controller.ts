import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { FeatureGuard, RequireFeature } from '../features/features.guard';
import { FeatureKey } from '../features/feature-key.enum';
import { AuditService } from './audit.service';
import { auditQuerySchema } from './dto/audit-query.dto';

@ApiTags('Audit Log')
@Controller('api/audit-log')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature(FeatureKey.AUDIT_LOG)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries (paginated)' })
  async findAll(@Query() query: any) {
    const parsed = auditQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    const orgId = this.cls.get('ORG_ID');
    return this.auditService.findAll(orgId, parsed.data);
  }
}
