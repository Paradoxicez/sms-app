import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SrsModule } from '../srs/srs.module';
import { ClusterService } from './cluster.service';
import { ClusterController } from './cluster.controller';

@Module({
  imports: [PrismaModule, SrsModule],
  controllers: [ClusterController],
  providers: [ClusterService],
  exports: [ClusterService],
})
export class ClusterModule {}
