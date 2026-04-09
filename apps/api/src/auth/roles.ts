import { loadBetterAuthAccess } from './esm-loader';

// Role-to-default-permissions map (static, no ESM dependency)
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

const statement = {
  camera: ['create', 'read', 'update', 'delete', 'start', 'stop'],
  stream: ['view', 'manage'],
  apiKey: ['create', 'read', 'revoke'],
  recording: ['view', 'manage'],
} as const;

let _ac: any;
let _roles: { viewerRole: any; developerRole: any; operatorRole: any; adminRole: any; superAdminRole: any };

export async function initAccessControl() {
  if (_ac) return { ac: _ac, ..._roles };

  const { createAccessControl, defaultStatements, adminAc } = await loadBetterAuthAccess();

  _ac = createAccessControl({ ...defaultStatements, ...statement });

  const viewerRole = _ac.newRole({
    camera: ['read'],
    stream: ['view'],
  });

  const developerRole = _ac.newRole({
    camera: ['read'],
    stream: ['view'],
    apiKey: ['create', 'read', 'revoke'],
  });

  const operatorRole = _ac.newRole({
    camera: ['create', 'read', 'update', 'delete', 'start', 'stop'],
    stream: ['view', 'manage'],
    recording: ['view', 'manage'],
  });

  const adminRole = _ac.newRole({
    camera: ['create', 'read', 'update', 'delete', 'start', 'stop'],
    stream: ['view', 'manage'],
    apiKey: ['create', 'read', 'revoke'],
    recording: ['view', 'manage'],
    ...adminAc.statements,
  });

  const superAdminRole = _ac.newRole({
    ...adminAc.statements,
  });

  _roles = { viewerRole, developerRole, operatorRole, adminRole, superAdminRole };
  return { ac: _ac, ..._roles };
}
