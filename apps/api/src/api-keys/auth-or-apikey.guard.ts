import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyGuard } from './api-key.guard';
import { AuthGuard } from '../auth/guards/auth.guard';

@Injectable()
export class AuthOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyGuard: ApiKeyGuard,
    private readonly authGuard: AuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const hasApiKey = !!request.headers['x-api-key'];

    if (hasApiKey) {
      return this.apiKeyGuard.canActivate(context);
    }

    // Fall back to session auth
    return this.authGuard.canActivate(context);
  }
}
