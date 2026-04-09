import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PlaybackService } from './playback.service';

@Controller('api')
export class PlaybackController {
  constructor(
    private readonly playbackService: PlaybackService,
    private readonly cls: ClsService,
  ) {}

  private getOrgId(): string {
    const orgId = this.cls.get('ORG_ID');
    if (!orgId) {
      throw new BadRequestException('No active organization');
    }
    return orgId;
  }

  /**
   * Create a new playback session for a camera.
   * Returns { sessionId, hlsUrl, expiresAt }
   */
  @Post('cameras/:cameraId/sessions')
  @UseGuards(AuthGuard)
  async createSession(@Param('cameraId') cameraId: string) {
    return this.playbackService.createSession(cameraId, this.getOrgId());
  }

  /**
   * Get session info (public endpoint for embed page).
   * No AuthGuard -- accessible without authentication.
   */
  @Get('playback/sessions/:id')
  async getSession(@Param('id') id: string) {
    const session = await this.playbackService.getSession(id);
    if (!session) {
      throw new NotFoundException('Session not found or expired');
    }
    return session;
  }
}
