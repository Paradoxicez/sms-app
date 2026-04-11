import { Global, Module } from '@nestjs/common';
import { StatusService } from './status.service';
import { StatusGateway } from './status.gateway';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Global()
@Module({
  imports: [WebhooksModule],
  providers: [StatusService, StatusGateway],
  exports: [StatusService, StatusGateway],
})
export class StatusModule {}
