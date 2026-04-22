import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MembersController } from './members.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, ClsModule],
  controllers: [UsersController, MembersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
