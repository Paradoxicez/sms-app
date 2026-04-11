import {
  Controller,
  Param,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { StreamsService } from './streams.service';

@ApiTags('Streams')
@Controller('api/cameras')
@UseGuards(AuthGuard)
export class StreamsController {
  constructor(private readonly streamsService: StreamsService) {}

  @Post(':id/stream/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start streaming for a camera' })
  @ApiResponse({ status: 200, description: 'Stream starting' })
  @ApiResponse({ status: 404, description: 'Camera not found' })
  @ApiParam({ name: 'id', description: 'Camera ID' })
  async startStream(@Param('id') id: string) {
    await this.streamsService.startStream(id);
    return { message: 'Stream starting', cameraId: id };
  }

  @Post(':id/stream/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop streaming for a camera' })
  @ApiResponse({ status: 200, description: 'Stream stopped' })
  @ApiResponse({ status: 404, description: 'Camera not found' })
  @ApiParam({ name: 'id', description: 'Camera ID' })
  async stopStream(@Param('id') id: string) {
    await this.streamsService.stopStream(id);
    return { message: 'Stream stopped', cameraId: id };
  }
}
