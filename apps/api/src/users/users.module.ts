import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MembersController } from './members.controller';
import { AuthGuard } from '../auth/guards/auth.guard';

@Module({
  imports: [ClsModule],
  controllers: [UsersController, MembersController],
  providers: [UsersService, AuthGuard],
  exports: [UsersService],
})
export class UsersModule {}
