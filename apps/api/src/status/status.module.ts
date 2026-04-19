import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StatusService } from './status.service';
import { StatusGateway } from './status.gateway';
import { NotifyDispatchProcessor } from './processors/notify-dispatch.processor';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [
    WebhooksModule,
    PrismaModule,
    BullModule.registerQueue({ name: 'camera-notify' }),
  ],
  providers: [StatusService, StatusGateway, NotifyDispatchProcessor],
  exports: [StatusService, StatusGateway, BullModule],
})
export class StatusModule {}
