import {
  BadRequestException,
  Controller,
  Delete,
  HttpStatus,
  ParseFilePipeBuilder,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { AvatarService } from './avatar.service';

/**
 * AvatarController — authenticated user avatar upload/remove.
 *
 * Threat model mitigations:
 *   - T-16-01 (pixel-bomb DoS): Multer enforces 2 MB limit at the stream layer
 *     before any buffer is materialized. ParseFilePipeBuilder enforces it a second
 *     time at the handler layer (defense in depth).
 *   - T-16-03 (cross-user overwrite): userId is taken exclusively from
 *     req.user.id (attached by AuthGuard). Any `userId` field in the multipart
 *     body is silently ignored.
 *   - T-16-04 (auth bypass): @UseGuards(AuthGuard) at class level — every route
 *     requires a valid session; unauthenticated requests get 401.
 *   - T-16-06 (MIME-rename attack): ParseFilePipeBuilder's regex restricts
 *     Content-Type to jpeg/png/webp; AvatarService's sharp({ failOn: 'error' })
 *     rejects any disguised payload at decode time.
 */
@ApiExcludeController()
@UseGuards(AuthGuard)
@Controller('api/users/me/avatar')
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @Req() req: Request,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 2 * 1024 * 1024 })
        .addFileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file?.buffer) {
      throw new BadRequestException('Missing file upload.');
    }
    // userId from session ONLY — never from req.body or params
    const userId = (req as any).user.id;
    const url = await this.avatarService.uploadForUser(userId, file.buffer);
    return { url };
  }

  @Delete()
  async remove(@Req() req: Request): Promise<{ removed: true }> {
    await this.avatarService.removeForUser((req as any).user.id);
    return { removed: true };
  }
}
