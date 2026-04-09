import { Global, Module } from '@nestjs/common';
import { StatusService } from './status.service';
import { StatusGateway } from './status.gateway';

@Global()
@Module({
  providers: [StatusService, StatusGateway],
  exports: [StatusService, StatusGateway],
})
export class StatusModule {}
