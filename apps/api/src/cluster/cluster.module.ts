import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SrsModule } from '../srs/srs.module';
import { ClusterService } from './cluster.service';

@Module({
  imports: [PrismaModule, SrsModule],
  providers: [ClusterService],
  exports: [ClusterService],
})
export class ClusterModule {}
