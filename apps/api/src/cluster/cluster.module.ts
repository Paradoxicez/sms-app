import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { SrsModule } from '../srs/srs.module';
import { ClusterService } from './cluster.service';
import { ClusterController } from './cluster.controller';
import { ClusterHealthService } from './cluster-health.service';
import { ClusterHealthProcessor } from './cluster-health.processor';
import { ClusterGateway } from './cluster.gateway';

@Module({
  imports: [
    PrismaModule,
    SrsModule,
    BullModule.registerQueue({ name: 'cluster-health' }),
  ],
  controllers: [ClusterController],
  providers: [
    ClusterService,
    ClusterHealthService,
    ClusterHealthProcessor,
    ClusterGateway,
  ],
  exports: [ClusterService, ClusterHealthService],
})
export class ClusterModule {}
