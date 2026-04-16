import {
  Controller,
  Delete,
  Get,
  Patch,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { NotificationsService } from './notifications.service';
import { updatePreferenceSchema } from './dto/notification-preference.dto';

@ApiTags('Notifications')
@Controller('api/notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  async findAll(
    @Req() req: any,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const userId = req.user.id;
    return this.notificationsService.findForUser(userId, {
      cursor,
      take: take ? parseInt(take, 10) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@Req() req: any) {
    const userId = req.user.id;
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.id;
    await this.notificationsService.markAsRead(userId, id);
    return { success: true };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@Req() req: any) {
    const userId = req.user.id;
    await this.notificationsService.markAllAsRead(userId);
    return { success: true };
  }

  @Delete('clear-all')
  @ApiOperation({ summary: 'Delete all notifications for current user' })
  async clearAll(@Req() req: any) {
    const userId = req.user.id;
    await this.notificationsService.clearAll(userId);
    return { success: true };
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getPreferences(@Req() req: any) {
    const userId = req.user.id;
    const orgId = this.cls.get('ORG_ID');
    return this.notificationsService.getPreferences(userId, orgId);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update a notification preference' })
  async updatePreference(@Req() req: any, @Body() body: any) {
    const parsed = updatePreferenceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    const userId = req.user.id;
    const orgId = this.cls.get('ORG_ID');
    return this.notificationsService.updatePreference(
      userId,
      orgId,
      parsed.data.eventType,
      parsed.data.enabled,
    );
  }
}
