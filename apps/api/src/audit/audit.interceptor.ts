import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ClsService } from 'nestjs-cls';
import { AuditService } from './audit.service';

const SKIP_PATHS = ['/api/srs/callbacks', '/api/health'];
const AUDITED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

const RESOURCE_MAP: Record<string, string> = {
  cameras: 'camera',
  projects: 'project',
  sites: 'site',
  policies: 'policy',
  'stream-profiles': 'streamProfile',
  'api-keys': 'apiKey',
  webhooks: 'webhook',
  users: 'user',
  organizations: 'organization',
  settings: 'settings',
};

const METHOD_TO_ACTION: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

const SENSITIVE_KEYS_PATTERN = /password|secret|token|apiKey|keyHash/i;

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(sanitizeBody);

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_KEYS_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeBody(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly cls: ClsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    if (!request) return next.handle();

    const method = request.method;
    const path: string = request.url || request.path || '';

    if (!AUDITED_METHODS.includes(method)) return next.handle();
    if (SKIP_PATHS.some((skip) => path.startsWith(skip))) return next.handle();

    const userId = request.user?.id;
    const orgId = this.cls.get('ORG_ID');
    if (!orgId) return next.handle();

    const action = METHOD_TO_ACTION[method] || 'update';

    // Derive resource from path. Strip query, then take the last non-id
    // segment — that is the ACTUAL resource being acted on. Using segments[1]
    // mis-classifies nested routes like POST /api/organizations/:orgId/users
    // as 'organization' when it is really creating a 'user'.
    const bare = path.split('?')[0];
    const segments = bare.split('/').filter(Boolean);
    const isIdLike = (s: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ||
      /^[A-Za-z0-9]{20,}$/.test(s) || // opaque ids (Better Auth nanoids)
      /^\d+$/.test(s); // numeric ids
    let resourceSegment = 'unknown';
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i] !== 'api' && !isIdLike(segments[i])) {
        resourceSegment = segments[i];
        break;
      }
    }
    const resource = RESOURCE_MAP[resourceSegment] || resourceSegment;

    const ip = request.ip || request.headers?.['x-forwarded-for'];
    const details = request.body ? sanitizeBody(request.body) : null;

    return next.handle().pipe(
      tap((responseData) => {
        const resourceId =
          responseData?.id || request.params?.id || null;

        this.auditService
          .log({
            orgId,
            userId,
            action,
            resource,
            resourceId,
            method,
            path,
            ip,
            details,
          })
          .catch(() => {});
      }),
    );
  }
}
