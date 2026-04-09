import { Controller, All, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.config';

@Controller('api/auth')
export class AuthController {
  private readonly handler = toNodeHandler(auth);

  @All('*path')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    return this.handler(req, res);
  }
}
