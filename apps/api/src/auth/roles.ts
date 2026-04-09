import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access';

const statement = {
  ...defaultStatements,
  camera: ['create', 'read', 'update', 'delete', 'start', 'stop'],
  stream: ['view', 'manage'],
  apiKey: ['create', 'read', 'revoke'],
  recording: ['view', 'manage'],
} as const;

export const ac = createAccessControl(statement);

export const viewerRole = ac.newRole({
  camera: ['read'],
  stream: ['view'],
});

export const developerRole = ac.newRole({
  camera: ['read'],
  stream: ['view'],
  apiKey: ['create', 'read', 'revoke'],
});

export const operatorRole = ac.newRole({
  camera: ['create', 'read', 'update', 'delete', 'start', 'stop'],
  stream: ['view', 'manage'],
  recording: ['view', 'manage'],
});

export const adminRole = ac.newRole({
  camera: ['create', 'read', 'update', 'delete', 'start', 'stop'],
  stream: ['view', 'manage'],
  apiKey: ['create', 'read', 'revoke'],
  recording: ['view', 'manage'],
  ...adminAc.statements,
});

export const superAdminRole = ac.newRole({
  ...adminAc.statements,
});

// Export role-to-default-permissions map for use by permissions.ts
export const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  viewer: new Set(['camera:read', 'stream:view']),
  developer: new Set([
    'camera:read',
    'stream:view',
    'apiKey:create',
    'apiKey:read',
    'apiKey:revoke',
  ]),
  operator: new Set([
    'camera:create',
    'camera:read',
    'camera:update',
    'camera:delete',
    'camera:start',
    'camera:stop',
    'stream:view',
    'stream:manage',
    'recording:view',
    'recording:manage',
  ]),
  admin: new Set([
    'camera:create',
    'camera:read',
    'camera:update',
    'camera:delete',
    'camera:start',
    'camera:stop',
    'stream:view',
    'stream:manage',
    'apiKey:create',
    'apiKey:read',
    'apiKey:revoke',
    'recording:view',
    'recording:manage',
  ]),
};
