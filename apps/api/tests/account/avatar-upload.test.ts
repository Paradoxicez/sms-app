// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-01 Task T5.
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import type { INestApplication, ExecutionContext } from '@nestjs/common';
import { AvatarController } from '../../src/account/avatar/avatar.controller';
import { AvatarService } from '../../src/account/avatar/avatar.service';
import { AuthGuard } from '../../src/auth/guards/auth.guard';

const FIXTURES = path.resolve(__dirname, '../../test/fixtures/avatars');

// A mutable session so individual tests can flip authenticated / unauthenticated state.
const authState: { authenticated: boolean; userId: string } = {
  authenticated: true,
  userId: 'user-1',
};

const avatarService = {
  uploadForUser: vi.fn(async (userId: string, _buf: Buffer) =>
    `https://minio/avatars/${userId}.webp?v=42`,
  ),
  removeForUser: vi.fn(async (_userId: string) => undefined),
};

async function buildApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [AvatarController],
    providers: [{ provide: AvatarService, useValue: avatarService }],
  })
    .overrideGuard(AuthGuard)
    .useValue({
      canActivate: (ctx: ExecutionContext) => {
        if (!authState.authenticated) return false;
        const req = ctx.switchToHttp().getRequest();
        req.user = { id: authState.userId };
        req.session = { id: 'session-1' };
        return true;
      },
    })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0);
  return app;
}

function baseUrl(app: INestApplication): string {
  const server: any = app.getHttpServer();
  const addr = server.address();
  return `http://127.0.0.1:${addr.port}`;
}

describe('POST /api/users/me/avatar', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    app = await buildApp();
    url = `${baseUrl(app)}/api/users/me/avatar`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    authState.authenticated = true;
    authState.userId = 'user-1';
    avatarService.uploadForUser.mockClear();
    avatarService.removeForUser.mockClear();
  });

  it('accepts tiny.jpg and responds 201 { url } containing ?v=', async () => {
    const buf = fs.readFileSync(path.join(FIXTURES, 'tiny.jpg'));
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'image/jpeg' }), 'tiny.jpg');
    const res = await fetch(url, { method: 'POST', body: form });
    expect([200, 201]).toContain(res.status);
    const body = await res.json();
    expect(body.url).toContain('?v=');
    expect(avatarService.uploadForUser).toHaveBeenCalledWith('user-1', expect.any(Buffer));
  });

  it('rejects oversize.jpg (3+ MB) with 413 or 422 before any MinIO write', async () => {
    const buf = fs.readFileSync(path.join(FIXTURES, 'oversize.jpg'));
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'image/jpeg' }), 'oversize.jpg');
    const res = await fetch(url, { method: 'POST', body: form });
    expect([413, 422, 400]).toContain(res.status);
    expect(avatarService.uploadForUser).not.toHaveBeenCalled();
  });

  it('rejects text/plain with 422', async () => {
    const form = new FormData();
    form.append('file', new Blob(['hello world'], { type: 'text/plain' }), 'note.txt');
    const res = await fetch(url, { method: 'POST', body: form });
    expect(res.status).toBe(422);
    expect(avatarService.uploadForUser).not.toHaveBeenCalled();
  });

  it('rejects image/gif with 422 (regex allows only jpeg/png/webp)', async () => {
    // 1x1 transparent GIF
    const gif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64',
    );
    const form = new FormData();
    form.append('file', new Blob([gif], { type: 'image/gif' }), 'x.gif');
    const res = await fetch(url, { method: 'POST', body: form });
    expect(res.status).toBe(422);
    expect(avatarService.uploadForUser).not.toHaveBeenCalled();
  });

  it('rejects corrupt.png with 400 (sharp failOn error)', async () => {
    avatarService.uploadForUser.mockRejectedValueOnce(
      new (await import('@nestjs/common')).BadRequestException('Invalid or corrupt image.'),
    );
    const buf = fs.readFileSync(path.join(FIXTURES, 'corrupt.png'));
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'image/png' }), 'corrupt.png');
    const res = await fetch(url, { method: 'POST', body: form });
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    authState.authenticated = false;
    const buf = fs.readFileSync(path.join(FIXTURES, 'tiny.jpg'));
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'image/jpeg' }), 'tiny.jpg');
    const res = await fetch(url, { method: 'POST', body: form });
    expect([401, 403]).toContain(res.status);
    expect(avatarService.uploadForUser).not.toHaveBeenCalled();
  });

  it('writes object key {userId}.webp from req.user.id, ignoring any userId in multipart body', async () => {
    const buf = fs.readFileSync(path.join(FIXTURES, 'tiny.jpg'));
    const form = new FormData();
    form.append('userId', 'attacker');
    form.append('file', new Blob([buf], { type: 'image/jpeg' }), 'tiny.jpg');
    const res = await fetch(url, { method: 'POST', body: form });
    expect([200, 201]).toContain(res.status);
    expect(avatarService.uploadForUser).toHaveBeenCalledWith('user-1', expect.any(Buffer));
    // Defense-in-depth: no call with 'attacker' as userId
    for (const call of avatarService.uploadForUser.mock.calls) {
      expect(call[0]).not.toBe('attacker');
    }
  });
});

describe('DELETE /api/users/me/avatar', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    app = await buildApp();
    url = `${baseUrl(app)}/api/users/me/avatar`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    authState.authenticated = true;
    authState.userId = 'user-1';
    avatarService.removeForUser.mockClear();
  });

  it('returns 200 and removes object from MinIO', async () => {
    const res = await fetch(url, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(true);
    expect(avatarService.removeForUser).toHaveBeenCalledWith('user-1');
  });

  it('returns 200 when object does not exist (idempotent)', async () => {
    avatarService.removeForUser.mockResolvedValueOnce(undefined); // service is idempotent
    const res = await fetch(url, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('returns 401 when unauthenticated', async () => {
    authState.authenticated = false;
    const res = await fetch(url, { method: 'DELETE' });
    expect([401, 403]).toContain(res.status);
    expect(avatarService.removeForUser).not.toHaveBeenCalled();
  });
});
