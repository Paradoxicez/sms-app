import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { createHash } from 'crypto';
import { Request } from 'express';
import { ApiKeysService } from './api-keys.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    const keyRecord = await this.apiKeysService.findByHash(keyHash);

    if (!keyRecord || keyRecord.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Set org context in CLS for downstream guards and services
    this.cls.set('ORG_ID', keyRecord.orgId);
    (request as any).apiKey = keyRecord;

    // Fire-and-forget: update lastUsedAt
    this.apiKeysService.updateLastUsed(keyRecord.id).catch(() => {});

    return true;
  }
}
