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
  NotFoundException,
} from '@nestjs/common';
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
  async update(@Param('id') id: string, @Body() body: unknown) {
    const result = UpdateStreamProfileSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.profileService.update(id, result.data);
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
