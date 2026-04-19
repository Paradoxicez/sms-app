// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-02 Task T4.
import { describe, it } from "vitest";

describe("AccountSecuritySection", () => {
  it.todo("renders Current password, New password, Confirm new password fields + PasswordStrengthBar");
  it.todo('section description is "Update your password. You will be signed out of other devices."');
  it.todo("submit disabled until all 3 fields filled and validation passes");
  it.todo('validates new password min 8 chars with error copy "Password must be at least 8 characters."');
  it.todo('validates newPassword !== currentPassword with error copy "New password must be different from your current password."');
  it.todo('validates confirmPassword matches newPassword with error copy "Passwords do not match."');
  it.todo("calls authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })");
  it.todo('on INVALID_PASSWORD error code, sets inline error on Current password field with copy "Current password is incorrect."');
  it.todo('on success, shows toast "Password changed. Signed out from other devices." and resets form');
});
