import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { AdminModule } from './admin/admin.module';
import { UsersModule } from './users/users.module';
import { FeaturesModule } from './features/features.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    PrismaModule,
    AuthModule,
    TenancyModule,
    AdminModule,
    UsersModule,
    FeaturesModule,
  ],
})
export class AppModule {}
