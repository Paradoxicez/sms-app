import { Controller, All, Req, Res, OnModuleInit } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { initAuth } from './auth.config';
import { loadBetterAuthNode } from './esm-loader';

@ApiExcludeController()
// ThrottlerModule uses NAMED throttlers ('global','tenant','apikey') in
// app.module.ts — bare @SkipThrottle() only writes metadata for the implicit
// 'default' throttler and is therefore a NO-OP for this app. Spell out every
// named throttler so Better Auth's internal CSRF + session + sign-in calls do
// not share the global per-IP pool with dashboard polling. See debug session
// .planning/debug/srs-callback-throttler-429.md for the full root-cause trace.
@SkipThrottle({ global: true, tenant: true, apikey: true })
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
