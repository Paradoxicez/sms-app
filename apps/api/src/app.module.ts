import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { AdminModule } from './admin/admin.module';
import { UsersModule } from './users/users.module';
import { FeaturesModule } from './features/features.module';
import { CamerasModule } from './cameras/cameras.module';
import { StreamsModule } from './streams/streams.module';
import { StatusModule } from './status/status.module';
import { SrsModule } from './srs/srs.module';
import { SettingsModule } from './settings/settings.module';
import { PoliciesModule } from './policies/policies.module';
import { PlaybackModule } from './playback/playback.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6380', 10),
      },
    }),
    PrismaModule,
    AuthModule,
    TenancyModule,
    AdminModule,
    UsersModule,
    FeaturesModule,
    CamerasModule,
    StatusModule,
    StreamsModule,
    SrsModule,
    SettingsModule,
    PoliciesModule,
    PlaybackModule,
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'global', ttl: 60000, limit: 100 },
        { name: 'tenant', ttl: 60000, limit: 60 },
        { name: 'apikey', ttl: 60000, limit: 30 },
      ],
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
