import { describe, it } from 'vitest';

describe('SrsLogGateway', () => {
  it.todo('accepts connection from admin role client');
  it.todo('rejects connection from non-admin role client');
  it.todo('starts tail process on first client connection');
  it.todo('stops tail process when last client disconnects');
  it.todo('emits srs:log events with line, level, and timestamp');
  it.todo('parses log level from SRS log format');
  it.todo('kills tail process on module destroy');
});
