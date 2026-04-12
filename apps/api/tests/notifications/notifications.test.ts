import { describe, it } from 'vitest';

describe('NotificationsService', () => {
  describe('createForCameraEvent', () => {
    it.todo('creates notifications for users with enabled preference for event type');
    it.todo('skips users with disabled preference for event type');
    it.todo('emits notification:new via NotificationsGateway to user room');
  });

  describe('findForUser', () => {
    it.todo('returns paginated notifications for the given userId');
    it.todo('filters to unread only when unreadOnly=true');
  });

  describe('markAsRead', () => {
    it.todo('sets read=true for the specified notification');
  });

  describe('markAllAsRead', () => {
    it.todo('sets read=true for all unread notifications of the user');
  });

  describe('getPreferences / updatePreference', () => {
    it.todo('returns all preferences for a user');
    it.todo('upserts preference for a specific event type');
  });
});

describe('NotificationsGateway', () => {
  it.todo('joins user to user:{userId} room on connection');
  it.todo('emits notification:new to correct user room');
});

describe('StatusService -> Notifications integration', () => {
  it.todo('calls createForCameraEvent on camera status transition to online/offline/degraded/reconnecting');
  it.todo('does not throw if notification creation fails (fire-and-forget)');
});
