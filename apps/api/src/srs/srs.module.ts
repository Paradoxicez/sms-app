import { Module } from '@nestjs/common';
import { SrsCallbackController } from './srs-callback.controller';
import { SrsApiService } from './srs-api.service';

@Module({
  controllers: [SrsCallbackController],
  providers: [SrsApiService],
  exports: [SrsApiService],
})
export class SrsModule {}
