import {
  Controller,
  Param,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { StreamsService } from './streams.service';

@Controller('api/cameras')
@UseGuards(AuthGuard)
export class StreamsController {
  constructor(private readonly streamsService: StreamsService) {}

  @Post(':id/stream/start')
  @HttpCode(HttpStatus.OK)
  async startStream(@Param('id') id: string) {
    await this.streamsService.startStream(id);
    return { message: 'Stream starting', cameraId: id };
  }

  @Post(':id/stream/stop')
  @HttpCode(HttpStatus.OK)
  async stopStream(@Param('id') id: string) {
    await this.streamsService.stopStream(id);
    return { message: 'Stream stopped', cameraId: id };
  }
}
