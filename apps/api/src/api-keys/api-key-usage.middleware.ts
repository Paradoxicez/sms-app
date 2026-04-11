import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ApiKeysService } from './api-keys.service';

@Injectable()
export class ApiKeyUsageMiddleware implements NestMiddleware {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const apiKey = (req as any).apiKey;
    if (!apiKey) {
      return next();
    }

    // Track response size for bandwidth
    let totalBytes = 0;

    const originalWrite = res.write;
    const originalEnd = res.end;

    res.write = function (this: Response, chunk: any, ...rest: any[]): boolean {
      if (chunk) {
        totalBytes += Buffer.byteLength(chunk);
      }
      return originalWrite.apply(this, [chunk, ...rest] as any);
    } as any;

    const apiKeysService = this.apiKeysService;
    const keyId = apiKey.id;

    res.end = function (this: Response, chunk: any, ...rest: any[]): Response {
      if (chunk) {
        totalBytes += Buffer.byteLength(chunk);
      }
      // Fire-and-forget usage recording
      apiKeysService.recordUsage(keyId, totalBytes).catch(() => {});
      return originalEnd.apply(this, [chunk, ...rest] as any);
    } as any;

    next();
  }
}
