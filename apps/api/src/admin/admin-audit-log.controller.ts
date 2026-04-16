import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { AdminAuditLogService } from './admin-audit-log.service';
import { auditQuerySchema } from '../audit/dto/audit-query.dto';

@ApiTags('Admin Audit Log')
@Controller('api/admin/audit-log')
@UseGuards(SuperAdminGuard)
export class AdminAuditLogController {
  constructor(
    private readonly adminAuditLogService: AdminAuditLogService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get platform-wide audit log entries (super admin only)',
  })
  @ApiResponse({ status: 200, description: 'Paginated audit log entries' })
  async findAll(@Query() query: Record<string, any>) {
    const result = auditQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten().fieldErrors);
    }
    return this.adminAuditLogService.findAll(result.data);
  }
}
