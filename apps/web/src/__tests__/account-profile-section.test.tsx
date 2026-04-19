// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-02 Task T4.
import { describe, it } from "vitest";

describe("AccountProfileSection", () => {
  it.todo('renders section title "Profile" and description "Your display name and avatar."');
  it.todo("renders 96x96 Avatar with AvatarImage when user.image set, fallback initials otherwise");
  it.todo("Upload new avatar button triggers hidden file input (accept image/jpeg,image/png,image/webp)");
  it.todo('shows client-side error toast "Image too large. Maximum 2 MB." when file > 2 MB (no POST)');
  it.todo('shows client-side error toast "Unsupported format. Use JPEG, PNG, or WebP." for disallowed MIME (no POST)');
  it.todo('POSTs to /api/users/me/avatar with FormData field "file" on valid selection');
  it.todo("after upload success, calls authClient.updateUser({ image: returnedUrl })");
  it.todo("Remove button is hidden when user.image is null, visible when set");
  it.todo("Remove button calls DELETE /api/users/me/avatar then authClient.updateUser({ image: null })");
  it.todo("Display name Save changes button is disabled until the field is dirty");
  it.todo('Save changes submits authClient.updateUser({ name }) and shows success toast "Display name updated"');
});
