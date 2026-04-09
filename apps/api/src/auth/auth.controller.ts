import { Controller, All, Req, Res, OnModuleInit } from '@nestjs/common';
import { Request, Response } from 'express';
import { initAuth } from './auth.config';
import { loadBetterAuthNode } from './esm-loader';

@Controller('api/auth')
export class AuthController implements OnModuleInit {
  private handler!: (req: Request, res: Response) => Promise<void>;

  async onModuleInit() {
    const auth = await initAuth();
    const { toNodeHandler } = await loadBetterAuthNode();
    this.handler = toNodeHandler(auth) as any;
  }

  @All('*path')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    return this.handler(req, res);
  }
}
