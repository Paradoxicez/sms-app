import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { StreamProfileService } from './stream-profile.service';
import { CreateStreamProfileSchema } from './dto/create-stream-profile.dto';
import { UpdateStreamProfileSchema } from './dto/update-stream-profile.dto';

@Controller('api')
@UseGuards(AuthGuard)
export class StreamProfileController {
  constructor(
    private readonly profileService: StreamProfileService,
    private readonly cls: ClsService,
  ) {}

  private getOrgId(): string {
    const orgId = this.cls.get('ORG_ID');
    if (!orgId) {
      throw new BadRequestException('No active organization');
    }
    return orgId;
  }

  @Post('stream-profiles')
  async create(@Body() body: unknown) {
    const result = CreateStreamProfileSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.profileService.create(this.getOrgId(), result.data);
  }

  @Get('stream-profiles')
  async findAll() {
    return this.profileService.findAll();
  }

  @Get('stream-profiles/:id')
  async findById(@Param('id') id: string) {
    const profile = await this.profileService.findById(id);
    if (!profile) {
      throw new NotFoundException('Stream profile not found');
    }
    return profile;
  }

  @Patch('stream-profiles/:id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const result = UpdateStreamProfileSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    // Phase 21 D-07: thread req.user into the service so the audit row's
    // triggeredBy field carries actor identity. NOT CLS — req.user is the
    // single, final source for Phase 21 (mirrors cameras.controller.ts:258).
    const user = (req as any).user;
    const triggeredBy =
      user?.id && user?.email
        ? { userId: user.id, userEmail: user.email }
        : ({ system: true } as const);
    return this.profileService.update(id, result.data, triggeredBy);
  }

  @Delete('stream-profiles/:id')
  async delete(@Param('id') id: string) {
    return this.profileService.delete(id);
  }

  @Post('stream-profiles/validate')
  async validate(@Body() body: unknown) {
    const result = CreateStreamProfileSchema.partial().safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    const warnings = this.profileService.validate(result.data);
    return { warnings };
  }
}
