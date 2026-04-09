/**
 * Known feature keys that can be toggled per package.
 * New features are added here as phases ship.
 * The JSONB field on Package can contain any key,
 * but guards validate against these known keys.
 */
export enum FeatureKey {
  RECORDINGS = 'recordings',
  WEBHOOKS = 'webhooks',
  MAP = 'map',
  AUDIT_LOG = 'auditLog',
  API_KEYS = 'apiKeys',
}
