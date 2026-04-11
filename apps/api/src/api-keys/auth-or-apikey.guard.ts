import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Request } from 'express';
import { ApiKeyGuard } from './api-key.guard';
import { AuthGuard } from '../auth/guards/auth.guard';

@Injectable()
export class AuthOrApiKeyGuard implements CanActivate {
  private apiKeyGuard!: ApiKeyGuard;
  private authGuard!: AuthGuard;

  constructor(private readonly moduleRef: ModuleRef) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Lazy-resolve guards to avoid cross-module DI issues
    if (!this.apiKeyGuard) {
      this.apiKeyGuard = this.moduleRef.get(ApiKeyGuard, { strict: false });
    }
    if (!this.authGuard) {
      this.authGuard = this.moduleRef.get(AuthGuard, { strict: false });
    }

    const request = context.switchToHttp().getRequest<Request>();
    const hasApiKey = !!request.headers['x-api-key'];

    if (hasApiKey) {
      return this.apiKeyGuard.canActivate(context);
    }

    // Fall back to session auth
    return this.authGuard.canActivate(context);
  }
}
