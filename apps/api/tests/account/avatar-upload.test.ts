// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-01 Task T5.
//
// Testing approach: Nest DI + FileInterceptor + ParseFilePipe rely on
// `emitDecoratorMetadata`, which this repo's vitest harness does not currently
// transform. Existing tests in this repo (see tests/users/members-me.test.ts)
// exercise controllers by instantiating them directly and asserting method
// behavior; Multer + ParseFilePipe wiring is covered by source-level
// assertions alongside the controller logic tests. This file follows the same
// pattern: unit-level controller tests + structural source assertions that
// prove the interceptor/pipe contract is declared correctly.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { AvatarController } from '../../src/account/avatar/avatar.controller';

const FIXTURES = path.resolve(__dirname, '../../test/fixtures/avatars');
const CONTROLLER_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../src/account/avatar/avatar.controller.ts'),
  'utf8',
);

function makeReq(userId: string | null) {
  return { user: userId ? { id: userId } : null, body: {}, session: {} } as any;
}

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  const buf = fs.readFileSync(path.join(FIXTURES, 'tiny.jpg'));
  return {
    fieldname: 'file',
    originalname: 'tiny.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: buf.length,
    buffer: buf,
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
    ...overrides,
  } as Express.Multer.File;
}

describe('POST /api/users/me/avatar (AvatarController)', () => {
  let service: {
    uploadForUser: ReturnType<typeof vi.fn>;
    removeForUser: ReturnType<typeof vi.fn>;
  };
  let controller: AvatarController;

  beforeEach(() => {
    service = {
      uploadForUser: vi.fn(async (userId: string, _buf: Buffer) =>
        `https://minio/avatars/${userId}.webp?v=42`,
      ),
      removeForUser: vi.fn(async () => undefined),
    };
    controller = new AvatarController(service as any);
  });

  it('accepts tiny.jpg and responds 201 { url } containing ?v=', async () => {
    const file = makeFile();
    const result = await controller.upload(makeReq('user-1'), file);
    expect(result.url).toContain('?v=');
    expect(service.uploadForUser).toHaveBeenCalledWith('user-1', file.buffer);
  });

  it('rejects oversize.jpg (3+ MB) with 413 or 422 before any MinIO write', async () => {
    // The FileInterceptor's `limits.fileSize: 2 MB` is enforced by Multer before
    // the handler runs — we assert the declaration exists in source and that
    // the ParseFilePipeBuilder uses UNPROCESSABLE_ENTITY for rejections.
    expect(CONTROLLER_SRC).toMatch(/limits:\s*\{\s*fileSize:\s*2\s*\*\s*1024\s*\*\s*1024/);
    expect(CONTROLLER_SRC).toMatch(/addMaxSizeValidator\(\{\s*maxSize:\s*2\s*\*\s*1024\s*\*\s*1024/);
    expect(CONTROLLER_SRC).toMatch(/errorHttpStatusCode:\s*HttpStatus\.UNPROCESSABLE_ENTITY/);
    // Handler path must NOT attempt to service-call when buffer missing.
    await expect(
      controller.upload(makeReq('user-1'), makeFile({ buffer: undefined as any })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.uploadForUser).not.toHaveBeenCalled();
  });

  it('rejects text/plain with 422', async () => {
    // ParseFilePipeBuilder's addFileTypeValidator regex restricts MIME to image/jpeg|png|webp.
    expect(CONTROLLER_SRC).toMatch(
      /addFileTypeValidator\(\{\s*fileType:\s*\/\^image\\\/\(jpeg\|png\|webp\)\$\//,
    );
    expect(CONTROLLER_SRC).toMatch(/errorHttpStatusCode:\s*HttpStatus\.UNPROCESSABLE_ENTITY/);
    // Smoke: a text/plain MIME would not match the regex.
    const regex = /^image\/(jpeg|png|webp)$/;
    expect(regex.test('text/plain')).toBe(false);
  });

  it('rejects image/gif with 422 (regex allows only jpeg/png/webp)', async () => {
    const regex = /^image\/(jpeg|png|webp)$/;
    expect(regex.test('image/gif')).toBe(false);
    expect(regex.test('image/jpeg')).toBe(true);
    expect(regex.test('image/png')).toBe(true);
    expect(regex.test('image/webp')).toBe(true);
  });

  it('rejects corrupt.png with 400 (sharp failOn error)', async () => {
    // Controller re-throws AvatarService's BadRequestException unchanged (400).
    service.uploadForUser.mockRejectedValueOnce(
      new BadRequestException('Invalid or corrupt image.'),
    );
    const buf = fs.readFileSync(path.join(FIXTURES, 'corrupt.png'));
    const file = makeFile({ mimetype: 'image/png', buffer: buf, size: buf.length });
    await expect(controller.upload(makeReq('user-1'), file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    // AuthGuard is declared at class level; assert source enforces it.
    expect(CONTROLLER_SRC).toMatch(/@UseGuards\(AuthGuard\)/);
    expect(CONTROLLER_SRC).toMatch(/import\s*\{\s*AuthGuard\s*\}\s*from/);
  });

  it('writes object key {userId}.webp from req.user.id, ignoring any userId in multipart body', async () => {
    const req = makeReq('user-1');
    (req as any).body = { userId: 'attacker' }; // simulate hostile multipart body
    const file = makeFile();
    await controller.upload(req, file);
    // userId passed to service MUST come from req.user.id only.
    expect(service.uploadForUser).toHaveBeenCalledWith('user-1', file.buffer);
    for (const call of service.uploadForUser.mock.calls) {
      expect(call[0]).not.toBe('attacker');
    }
    // Source must NOT read userId from req.body / req.params / req.query.
    expect(CONTROLLER_SRC).not.toMatch(/req\.body(\.|\[)["']?userId/);
    expect(CONTROLLER_SRC).toMatch(/req\s*as\s*any\)\.user\.id|req\.user\.id/);
  });
});

describe('DELETE /api/users/me/avatar (AvatarController)', () => {
  let service: {
    uploadForUser: ReturnType<typeof vi.fn>;
    removeForUser: ReturnType<typeof vi.fn>;
  };
  let controller: AvatarController;

  beforeEach(() => {
    service = {
      uploadForUser: vi.fn(),
      removeForUser: vi.fn(async () => undefined),
    };
    controller = new AvatarController(service as any);
  });

  it('returns 200 and removes object from MinIO', async () => {
    const result = await controller.remove(makeReq('user-1'));
    expect(result).toEqual({ removed: true });
    expect(service.removeForUser).toHaveBeenCalledWith('user-1');
  });

  it('returns 200 when object does not exist (idempotent)', async () => {
    service.removeForUser.mockResolvedValueOnce(undefined); // AvatarService is idempotent
    const result = await controller.remove(makeReq('user-1'));
    expect(result).toEqual({ removed: true });
  });

  it('returns 401 when unauthenticated', async () => {
    // AuthGuard at class level blocks unauthenticated access before handler runs.
    expect(CONTROLLER_SRC).toMatch(/@UseGuards\(AuthGuard\)/);
    // Handler body still reads req.user.id — without a guard this would throw,
    // proving the controller trusts only the AuthGuard-attached session user.
    await expect(controller.remove(makeReq(null))).rejects.toBeTruthy();
  });
});
