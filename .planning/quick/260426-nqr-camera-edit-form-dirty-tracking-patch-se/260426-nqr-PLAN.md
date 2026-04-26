---
phase: 260426-nqr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
  - apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx
  - apps/web/src/lib/audit/derive-action-label.ts
  - apps/web/src/lib/audit/__tests__/derive-action-label.test.ts
autonomous: true
requirements:
  - QUICK-260426-NQR
must_haves:
  truths:
    - "When a user opens Edit Camera, changes only the Name field, and clicks Save, the PATCH request body contains exactly { name: '<new>' } and no other keys"
    - "When a user opens Edit Camera and clicks Save without changing anything, no PATCH network request is made and the dialog closes"
    - "Audit log entries for single-field PATCHes (tags, description, location, siteId, streamUrl, needsTranscode) are labeled with their specific Action label, not the generic 'Updated camera'"
    - "Multi-field PATCH continues to render as 'Updated camera' (existing rule preserved)"
    - "CREATE mode (no `editing`/`camera` prop) is unchanged — POST still ships the full body it always did"
  artifacts:
    - path: "apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx"
      provides: "Dirty-tracking PATCH submission in edit mode via initialValues snapshot ref"
      contains: "initialValues"
    - path: "apps/web/src/lib/audit/derive-action-label.ts"
      provides: "Single-field rules for tags, description, location, siteId, streamUrl, needsTranscode"
      contains: "Updated tags"
    - path: "apps/web/src/lib/audit/__tests__/derive-action-label.test.ts"
      provides: "Unit tests covering all 7 new single-field rules + multi-field fallthrough"
    - path: "apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx"
      provides: "Dirty-tracking PATCH form test (only-name-changed → body has only name; nothing-changed → no PATCH)"
  key_links:
    - from: "camera-form-dialog.tsx initialValues ref"
      to: "handleSubmit isEditMode branch"
      via: "field-by-field comparison building partial body"
      pattern: "initialValues\\.current"
    - from: "PATCH /api/cameras/:id audit entries"
      to: "deriveActionLabel rule registry"
      via: "single-key meaningfulCameraKeys check"
      pattern: "meaningfulCameraKeys"
---

<objective>
Frontend-only refactor: make Edit Camera form send only changed fields (dirty-tracking PATCH) so audit `details` records exactly what changed, then extend `deriveActionLabel` so the Activity tab can show specific labels for single-field PATCHes (tags, description, location, siteId, streamUrl, needsTranscode) instead of the generic "Updated camera".

Purpose: Audit log currently always shows "Updated camera" for the Edit dialog because the form ships the full body on every save. Once dirty-tracking is in place, the existing "Renamed" / "Changed stream profile" rules from quick-260426-l5a will start firing correctly, and the new single-field rules in this plan will round out the coverage.

Output:
- camera-form-dialog.tsx: snapshots initial form values; submit handler diffs current vs. initial and PATCHes only changed keys; closes with no network call when nothing changed
- derive-action-label.ts: 6 new rules + tags/description/location added to CAMERA_MEANINGFUL_KEYS allowlist
- Both test files extended with the new cases
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
@apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx
@apps/web/src/lib/audit/derive-action-label.ts
@apps/web/src/lib/audit/__tests__/derive-action-label.test.ts
@apps/api/src/cameras/dto/update-camera.dto.ts

<interfaces>
<!-- Key contracts the executor needs. Do not re-derive from the codebase. -->

Backend `UpdateCameraSchema` (apps/api/src/cameras/dto/update-camera.dto.ts) — all keys optional, schema is `.strict()`:
```typescript
{
  name?: string (1-100)
  streamUrl?: string (rtsp/rtmp/rtmps/srt prefix)
  description?: string | null   // null = unset
  location?: { lat: number; lng: number } | null   // null = unset
  tags?: string[]
  thumbnail?: string | null
  streamProfileId?: string (uuid) | null   // null = unset
  siteId?: string (uuid)
  needsTranscode?: boolean
}
// ingestMode is REJECTED by .strict() — never include in PATCH body.
```

Current camera-form-dialog.tsx state shape (after edit-mode pre-fill at lines 142-152):
```typescript
name: string                   // camera.name
streamUrl: string              // camera.streamUrl
description: string            // camera.description ?? ''
lat: string                    // String(camera.location.lat) | ''
lng: string                    // String(camera.location.lng) | ''
tags: string                   // camera.tags?.join(', ') ?? ''  (comma-string form)
streamProfileId: string        // camera.streamProfileId ?? ''
siteId: string                 // camera.site?.id ?? ''
projectId: string              // camera.site?.project?.id ?? '' (NOT sent in PATCH; do not diff)
ingestMode: IngestMode         // IMMUTABLE post-create — do not diff or send
needsTranscode: boolean        // NOT YET in form state — see Task 1 note
```

Note: `needsTranscode` is mentioned in the task scope but is NOT a current `useState` field in the dialog (search shows no `needsTranscode` state in camera-form-dialog.tsx — it lives on the CodecMismatchBanner flow elsewhere). This means:
  - For Part A (form): there is nothing to diff for `needsTranscode` because the Edit dialog has no UI to toggle it. DO NOT add a new toggle. Skip `needsTranscode` from the dirty-tracker.
  - For Part B (audit labels): the rule is still required because OTHER call sites (CodecMismatchBanner) PATCH `{ needsTranscode: bool }` to the same endpoint and those audit entries should also get specific labels.

`deriveActionLabel` registry pattern (apps/web/src/lib/audit/derive-action-label.ts):
```typescript
const CAMERA_MEANINGFUL_KEYS = ["name","streamProfileId","streamUrl","siteId","ingestMode","needsTranscode"] as const
// NOTE: tags, description, location are NOT in this list yet — must add them in Task 2
// otherwise the new single-field rules will never match (key won't pass meaningfulCameraKeys filter).

function meaningfulCameraKeys(details): string[]   // returns subset of CAMERA_MEANINGFUL_KEYS present + !== undefined

type Rule = { match: (e: NormalizedEntry) => boolean; build: (e: NormalizedEntry) => string }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Dirty-tracking PATCH in camera-form-dialog.tsx + form test</name>
  <files>apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx, apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx</files>
  <behavior>
    - In edit mode, when user changes ONLY the Name field and clicks Save: PATCH body contains exactly `{ name: '<new>' }` (no streamUrl, no streamProfileId, no siteId, no tags, no description, no location)
    - In edit mode, when user clicks Save WITHOUT changing anything: zero PATCH calls fire and the dialog closes via `onOpenChange(false)` + `onSuccess()`
    - In edit mode, when user clears a previously-set description and clicks Save: PATCH body contains `{ description: null }`
    - In edit mode, when user clears both lat AND lng (which were previously set) and clicks Save: PATCH body contains `{ location: null }`
    - In edit mode, when user changes tags from "a, b" to "a, b, c": PATCH body contains `{ tags: ["a","b","c"] }` (array form, not comma-string)
    - CREATE mode (no `camera` prop): existing behavior preserved — POST body still includes name + (description if set) + location/tags/streamProfileId/streamUrl/ingestMode as today
  </behavior>
  <action>
### Part A — camera-form-dialog.tsx changes

1. **Add `initialValues` ref** alongside existing `pendingSiteIdRef` (around line 102):
   ```typescript
   const initialValuesRef = useRef<{
     name: string;
     streamUrl: string;
     description: string;
     lat: string;
     lng: string;
     tags: string;             // comma-joined form, matches state representation
     streamProfileId: string;
     siteId: string;
   } | null>(null);
   ```

2. **Capture snapshot in the existing `useEffect` (line 129-161)** AFTER all `setX` calls in the `if (camera)` branch and AFTER the create-mode branch. Set `initialValuesRef.current = null` when `!camera` (create mode flag — also acts as guard so dirty-tracker is never consulted in create mode). Specifically:
   - In `if (camera) { ... }` after `setSiteId(camera.site.id)`, append:
     ```typescript
     initialValuesRef.current = {
       name: camera.name || '',
       streamUrl: camera.streamUrl || '',
       description: camera.description || '',
       lat: camera.location?.lat != null ? String(camera.location.lat) : '',
       lng: camera.location?.lng != null ? String(camera.location.lng) : '',
       tags: camera.tags?.join(', ') || '',
       streamProfileId: camera.streamProfileId || '',
       siteId: camera.site?.id || '',
     };
     ```
   - In the `else` branch (create mode), set `initialValuesRef.current = null;`.

3. **Reset the ref in `resetForm()` (line 199-217)**: append `initialValuesRef.current = null;` so reopen-with-same-camera re-snapshots.

4. **Replace the edit-mode body construction (lines 263-281)** with a dirty-diff:
   - The current code (lines 251-261) builds a body unconditionally with name + description + location + tags + streamProfileId. In edit mode, REPLACE that with a fresh empty body and diff against `initialValuesRef.current`.
   - Refactor handleSubmit so that:
     ```typescript
     // Existing front-half (lines 232-249) unchanged: validation + setSaving/setError.

     try {
       if (isEditMode && initialValuesRef.current) {
         const init = initialValuesRef.current;
         const body: Record<string, unknown> = {};

         const trimmedName = name.trim();
         if (trimmedName !== init.name) body.name = trimmedName;

         // streamUrl: pull mode only (push mode is server-managed; D-01 immutable).
         if (ingestMode === 'pull') {
           const trimmedUrl = streamUrl.trim();
           if (trimmedUrl !== init.streamUrl) body.streamUrl = trimmedUrl;
         }

         // description: '' clears a previously-set value → null
         const trimmedDesc = description.trim();
         if (trimmedDesc !== init.description) {
           body.description = trimmedDesc === '' ? null : trimmedDesc;
         }

         // tags: comma-string → normalized array, then deep-equal vs initial array
         const currentTagsArr = tags.split(',').map((t) => t.trim()).filter(Boolean);
         const initialTagsArr = init.tags.split(',').map((t) => t.trim()).filter(Boolean);
         const tagsChanged =
           currentTagsArr.length !== initialTagsArr.length ||
           currentTagsArr.some((t, i) => t !== initialTagsArr[i]);
         if (tagsChanged) body.tags = currentTagsArr;

         // streamProfileId: '' clear → null
         if (streamProfileId !== init.streamProfileId) {
           body.streamProfileId = streamProfileId || null;
         }

         // siteId: UUID string compare
         if (siteId && siteId !== init.siteId) body.siteId = siteId;

         // location: send full {lat,lng} if either changed; null if both cleared and both were set.
         const latChanged = lat !== init.lat;
         const lngChanged = lng !== init.lng;
         if (latChanged || lngChanged) {
           if (lat === '' && lng === '' && init.lat !== '' && init.lng !== '') {
             body.location = null;
           } else if (lat !== '' && lng !== '') {
             body.location = { lat: parseFloat(lat), lng: parseFloat(lng) };
           }
           // else: partial fill (one filled, one empty) — skip; current pre-submit guard
           // doesn't require both, but PATCHing a half-coordinate is invalid. Leave it
           // out of the body and let the user notice the missing input.
         }

         if (Object.keys(body).length === 0) {
           // Nothing changed — close without firing the PATCH.
           resetForm();
           onOpenChange(false);
           onSuccess();
           return;
         }

         const response = await apiFetch<{ restartTriggered?: boolean }>(
           `/api/cameras/${camera.id}`,
           { method: 'PATCH', body: JSON.stringify(body) },
         );
         if (response?.restartTriggered) {
           toast.info('Stream restarting with new profile');
         }

         resetForm();
         onOpenChange(false);
         onSuccess();
         return;
       }

       // CREATE mode: keep the existing body construction + branches verbatim
       // (lines 251-314 minus the isEditMode branch). Build full body, then run
       // create-push or create-pull paths.
       const body: Record<string, unknown> = { name: name.trim() };
       if (description.trim()) body.description = description.trim();
       if (lat && lng) body.location = { lat: parseFloat(lat), lng: parseFloat(lng) };
       if (tags.trim()) body.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
       body.streamProfileId = streamProfileId || null;

       if (ingestMode === 'push') {
         body.ingestMode = 'push';
         const response = await apiFetch<{ id: string; ingestMode: string; streamUrl: string }>(
           `/api/sites/${siteId}/cameras`,
           { method: 'POST', body: JSON.stringify(body) },
         );
         if (response?.streamUrl) {
           setCreatedUrl(response.streamUrl);
           setPhase('reveal');
           return;
         }
       } else {
         body.streamUrl = streamUrl.trim();
         body.ingestMode = 'pull';
         await apiFetch(`/api/sites/${siteId}/cameras`, {
           method: 'POST', body: JSON.stringify(body),
         });
       }

       resetForm();
       onOpenChange(false);
       onSuccess();
     } catch (err) {
       // Existing catch block unchanged (lines 319-340).
     } finally {
       setSaving(false);
     }
     ```

5. **DO NOT** modify any other behavior:
   - Validation guards (lines 232-245)
   - Error handling catch block (lines 319-340)
   - Push reveal phase (handleRevealDone)
   - canSubmit memo
   - All useEffects above handleSubmit (open-driven fetch, default-profile pre-select, project→sites cascade)
   - JSX form body
   - `streamProfileError` clearing in Select.onValueChange

6. **Toast import already exists** (line 6: `import { toast } from 'sonner';`). Do not introduce a new toast call for the no-change path — silent close is the desired UX. Existing `toast.info('Stream restarting with new profile')` stays.

### Part A — camera-form-dialog.test.tsx test additions

Append a new `describe` block at the end of the file (after the `quick 260426-lg5` block, before the closing of the file):

```typescript
describe('CameraFormDialog dirty-tracking PATCH — quick 260426-nqr', () => {
  function captureFetch() {
    const fn = apiFetch as unknown as ApiFetchMock;
    fn.mockImplementation(async (path: string, options?: RequestInit) => {
      // Echo PATCH body back so tests can inspect what was actually sent.
      if (options?.method === 'PATCH' && /\/api\/cameras\/[^/]+$/.test(path)) {
        return {};
      }
      if (path === '/api/projects') return [{ id: 'proj-1', name: 'Project 1' }];
      if (path === '/api/stream-profiles') {
        return [{ id: 'p1', name: 'Default', isDefault: true }];
      }
      if (path === '/api/cameras') return [];
      if (path.startsWith('/api/projects/') && path.endsWith('/sites')) {
        return [{ id: 'site-1', name: 'Site 1' }];
      }
      return [];
    });
    return fn;
  }

  it('edit mode: changing only Name → PATCH body has exactly { name } and nothing else', async () => {
    const fn = captureFetch();
    renderDialog({
      camera: {
        id: 'c1',
        name: 'Old Name',
        streamUrl: 'rtsp://h/s',
        description: 'desc',
        location: { lat: 1, lng: 2 },
        tags: ['a', 'b'],
        streamProfileId: 'p1',
        site: { id: 'site-1', name: 'Site 1', project: { id: 'proj-1', name: 'Project 1' } },
      },
    });

    // Wait for initial pre-fill to settle.
    await waitFor(() => {
      expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Old Name');
    });

    await typeName('New Name');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Save Camera|Save Changes/ }),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Camera|Save Changes/ }));

    await waitFor(() => {
      const patchCall = fn.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body).toEqual({ name: 'New Name' });
    });
  });

  it('edit mode: no changes + Save → no PATCH fires, dialog closes via onOpenChange(false)', async () => {
    const fn = captureFetch();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    renderDialog({
      camera: {
        id: 'c1',
        name: 'Same',
        streamUrl: 'rtsp://h/s',
        streamProfileId: 'p1',
        site: { id: 'site-1', name: 'Site 1', project: { id: 'proj-1', name: 'Project 1' } },
      },
      onOpenChange,
      onSuccess,
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Save Camera|Save Changes/ }),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Camera|Save Changes/ }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSuccess).toHaveBeenCalled();
    });
    const patchCalls = fn.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(0);
  });
});
```

Reuse the existing top-level `installDefaultApiMocks`, `renderDialog`, `typeName` helpers and `vi.mock('@/lib/api')` setup at the top of the file. No new mocks required.
  </action>
  <verify>
    <automated>cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && pnpm --filter @sms-platform/web test --run camera-form-dialog</automated>
  </verify>
  <done>
    All existing camera-form-dialog tests still pass; 2 new dirty-tracking tests pass; pnpm web build succeeds with no TypeScript errors in this file.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend deriveActionLabel with single-field rules + tests</name>
  <files>apps/web/src/lib/audit/derive-action-label.ts, apps/web/src/lib/audit/__tests__/derive-action-label.test.ts</files>
  <behavior>
    - PATCH /api/cameras/:id with details `{ tags: [...] }` → `Updated tags`
    - PATCH /api/cameras/:id with details `{ description: '...' }` (or null) → `Updated description`
    - PATCH /api/cameras/:id with details `{ location: {...} }` (or null) → `Updated location`
    - PATCH /api/cameras/:id with details `{ siteId: '<uuid>' }` → `Moved to another site`
    - PATCH /api/cameras/:id with details `{ streamUrl: '...' }` → `Updated stream URL`
    - PATCH /api/cameras/:id with details `{ needsTranscode: true }` → `Toggled auto-transcode ON`
    - PATCH /api/cameras/:id with details `{ needsTranscode: false }` → `Toggled auto-transcode OFF`
    - PATCH /api/cameras/:id with details `{ name: 'X', tags: [...] }` (multi-field) → still `Updated camera`
    - Existing rules unchanged: `Renamed → "X"`, `Changed stream profile`, `Toggled maintenance ON/OFF`, etc.
  </behavior>
  <action>
### Part B — derive-action-label.ts changes

1. **Extend `CAMERA_MEANINGFUL_KEYS`** (line 53-60) to include the three currently-missing keys:
   ```typescript
   const CAMERA_MEANINGFUL_KEYS = [
     "name",
     "streamProfileId",
     "streamUrl",
     "siteId",
     "ingestMode",
     "needsTranscode",
     "tags",          // ← NEW
     "description",   // ← NEW
     "location",      // ← NEW
   ] as const
   ```
   This is the gating allowlist used by `meaningfulCameraKeys()`. Without these additions, the new single-field rules below will never match because `meaningfulCameraKeys` filters them out.

2. **Insert 6 new rules into the `RULES` array** between rule 8 ("Change stream profile", line ~138-145) and rule 9 ("Generic update", line ~147-153). Order matters: each new rule must come BEFORE rule 9 so the single-key check fires first; the multi-key fallback must remain LAST among the PATCH /api/cameras/:id rules.

   ```typescript
   // 8a. Update tags — only `tags` is present.
   {
     match: (e) => {
       if (e.signature !== "PATCH /api/cameras/:id") return false
       const keys = meaningfulCameraKeys(e.details)
       return keys.length === 1 && keys[0] === "tags"
     },
     build: () => "Updated tags",
   },
   // 8b. Update description — only `description` is present.
   {
     match: (e) => {
       if (e.signature !== "PATCH /api/cameras/:id") return false
       const keys = meaningfulCameraKeys(e.details)
       return keys.length === 1 && keys[0] === "description"
     },
     build: () => "Updated description",
   },
   // 8c. Update location — only `location` is present.
   {
     match: (e) => {
       if (e.signature !== "PATCH /api/cameras/:id") return false
       const keys = meaningfulCameraKeys(e.details)
       return keys.length === 1 && keys[0] === "location"
     },
     build: () => "Updated location",
   },
   // 8d. Move to another site — only `siteId` is present.
   {
     match: (e) => {
       if (e.signature !== "PATCH /api/cameras/:id") return false
       const keys = meaningfulCameraKeys(e.details)
       return keys.length === 1 && keys[0] === "siteId"
     },
     build: () => "Moved to another site",
   },
   // 8e. Update stream URL — only `streamUrl` is present.
   {
     match: (e) => {
       if (e.signature !== "PATCH /api/cameras/:id") return false
       const keys = meaningfulCameraKeys(e.details)
       return keys.length === 1 && keys[0] === "streamUrl"
     },
     build: () => "Updated stream URL",
   },
   // 8f. Toggle auto-transcode — only `needsTranscode` is present (read its bool value).
   {
     match: (e) => {
       if (e.signature !== "PATCH /api/cameras/:id") return false
       const keys = meaningfulCameraKeys(e.details)
       return keys.length === 1 && keys[0] === "needsTranscode"
     },
     build: (e) =>
       e.details?.needsTranscode === true
         ? "Toggled auto-transcode ON"
         : "Toggled auto-transcode OFF",
   },
   ```

3. **Do NOT modify** rules 1-7 (start/stop/maintenance/rename/change-profile), rule 9 (multi-field "Updated camera"), or rules 10-11 (create/delete). The rule registry order must remain: maintenance ON/OFF (5,6), then single-field rules (7=name, 8=streamProfileId, 8a-8f=new), then multi-field fallback (9), then create/delete (10,11).

### Part B — derive-action-label.test.ts test additions

Inside the existing `describe('deriveActionLabel', ...)` block, append 8 new `it` cases (mirror existing test style — use `entry({...})` factory + `CAMERA_UUID`):

```typescript
it("labels PATCH /api/cameras/:id with only tags as 'Updated tags'", () => {
  expect(
    deriveActionLabel(
      entry({
        method: "PATCH",
        path: `/api/cameras/${CAMERA_UUID}`,
        action: "update",
        details: { tags: ["outdoor", "entrance"] },
      }),
    ),
  ).toEqual({ label: "Updated tags" })
})

it("labels PATCH /api/cameras/:id with only description as 'Updated description'", () => {
  expect(
    deriveActionLabel(
      entry({
        method: "PATCH",
        path: `/api/cameras/${CAMERA_UUID}`,
        action: "update",
        details: { description: "Lobby south corner" },
      }),
    ),
  ).toEqual({ label: "Updated description" })
})

it("labels PATCH /api/cameras/:id with only location as 'Updated location'", () => {
  expect(
    deriveActionLabel(
      entry({
        method: "PATCH",
        path: `/api/cameras/${CAMERA_UUID}`,
        action: "update",
        details: { location: { lat: 13.7, lng: 100.5 } },
      }),
    ),
  ).toEqual({ label: "Updated location" })
})

it("labels PATCH /api/cameras/:id with only siteId as 'Moved to another site'", () => {
  expect(
    deriveActionLabel(
      entry({
        method: "PATCH",
        path: `/api/cameras/${CAMERA_UUID}`,
        action: "update",
        details: { siteId: "11111111-2222-3333-4444-555555555555" },
      }),
    ),
  ).toEqual({ label: "Moved to another site" })
})

it("labels PATCH /api/cameras/:id with only streamUrl as 'Updated stream URL'", () => {
  expect(
    deriveActionLabel(
      entry({
        method: "PATCH",
        path: `/api/cameras/${CAMERA_UUID}`,
        action: "update",
        details: { streamUrl: "rtsp://new-host/stream" },
      }),
    ),
  ).toEqual({ label: "Updated stream URL" })
})

it("labels PATCH /api/cameras/:id with needsTranscode:true as 'Toggled auto-transcode ON'", () => {
  expect(
    deriveActionLabel(
      entry({
        method: "PATCH",
        path: `/api/cameras/${CAMERA_UUID}`,
        action: "update",
        details: { needsTranscode: true },
      }),
    ),
  ).toEqual({ label: "Toggled auto-transcode ON" })
})

it("labels PATCH /api/cameras/:id with needsTranscode:false as 'Toggled auto-transcode OFF'", () => {
  expect(
    deriveActionLabel(
      entry({
        method: "PATCH",
        path: `/api/cameras/${CAMERA_UUID}`,
        action: "update",
        details: { needsTranscode: false },
      }),
    ),
  ).toEqual({ label: "Toggled auto-transcode OFF" })
})

it("labels PATCH /api/cameras/:id with multiple new fields (tags + description) as 'Updated camera' (multi-field fallback preserved)", () => {
  expect(
    deriveActionLabel(
      entry({
        method: "PATCH",
        path: `/api/cameras/${CAMERA_UUID}`,
        action: "update",
        details: { tags: ["a"], description: "b" },
      }),
    ),
  ).toEqual({ label: "Updated camera" })
})
```

Place all 8 cases between the existing `'Changed stream profile'` test (line ~89-100) and the existing multi-field `'Updated camera'` test (line ~102-113). Keep the existing multi-field test in place — the 8th new case above (`tags + description`) is an additional regression guard, not a replacement.
  </action>
  <verify>
    <automated>cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && pnpm --filter @sms-platform/web test --run derive-action-label</automated>
  </verify>
  <done>
    All existing 13 deriveActionLabel tests still pass; 8 new tests pass (7 single-field + 1 multi-field guard); CAMERA_MEANINGFUL_KEYS now includes tags/description/location.
  </done>
</task>

</tasks>

<out_of_scope>
The executor MUST NOT do any of the following. If a constraint feels limiting, surface a checkpoint — do NOT scope-creep.

- NO react-hook-form migration. Keep the 9 individual `useState` fields. Add dirty tracking on top via `useRef<typeof initialValues>` only.
- NO backend changes. Do not touch:
  - `apps/api/src/cameras/dto/update-camera.dto.ts`
  - `apps/api/src/cameras/cameras.service.ts` (already in working tree from a previous task — leave it alone for this plan; do NOT stage it)
  - Audit interceptor / audit-log service
  - Prisma schema or migrations
- NO touching `apps/web/src/components/pages/tenant-cameras-page.tsx` (no PATCH lives there).
- NO touching the maintenance toggle (`PATCH /api/cameras/:id/maintenance` — separate endpoint, separate flow, already labeled).
- NO touching bulk import (`apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx` — also dirty in the working tree, leave alone).
- NO expandable row work (deferred to a separate quick task).
- NO Thai or bilingual UI copy. All new strings English-only ("Updated tags", "Moved to another site", etc.).
- NO new toast library. Existing `sonner` `toast` is already imported; do not add anything new on the no-change close path (silent close is the desired UX).
- NO adding a `needsTranscode` form control to the Edit dialog. The audit rule for `needsTranscode` covers PATCHes from the CodecMismatchBanner flow that already exists elsewhere — the form itself does not need to grow this field.
- NO touching ANY currently-dirty files in the working tree that are unrelated to this task. The working tree currently shows modifications to:
  - `apps/api/src/cameras/cameras.service.ts`
  - `apps/api/src/cameras/dto/bulk-import.dto.ts`
  - `apps/api/tests/cameras/bulk-import.test.ts`
  - `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx`
  - `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx`
  These belong to a separate in-flight task. DO NOT include them in this commit.
</out_of_scope>

<staging_instructions>
After both tasks pass tests, stage ONLY these four paths (use exact paths, do not use `git add .` or `git add -A`):

```bash
git add \
  apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx \
  apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx \
  apps/web/src/lib/audit/derive-action-label.ts \
  apps/web/src/lib/audit/__tests__/derive-action-label.test.ts
```

Then verify with `git diff --cached --stat` that exactly these four files are staged and nothing else slipped in (no bulk-import files, no API service files, no Prisma files).
</staging_instructions>

<verification>
Run the two scoped test suites and the full web build:

```bash
cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app
pnpm --filter @sms-platform/web test --run derive-action-label camera-form-dialog
pnpm --filter @sms-platform/web build
```

Both must exit 0. No service restart required (frontend-only). No `pnpm db:push` required (no Prisma changes).
</verification>

<success_criteria>
- [ ] `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx`: edit-mode submit handler builds body via diff against `initialValuesRef.current`; empty body short-circuits to silent close; create-mode behavior byte-identical to before
- [ ] `apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx`: 2 new dirty-tracking tests pass, all existing tests still pass
- [ ] `apps/web/src/lib/audit/derive-action-label.ts`: CAMERA_MEANINGFUL_KEYS extended with tags/description/location; 6 new single-field rules registered between rule 8 and rule 9
- [ ] `apps/web/src/lib/audit/__tests__/derive-action-label.test.ts`: 8 new tests pass (7 single-field + 1 multi-field regression), all existing 13 tests still pass
- [ ] `pnpm --filter @sms-platform/web build` succeeds (TypeScript clean)
- [ ] Working tree shows ONLY these 4 files staged after `git add`; bulk-import / API / Prisma files remain unstaged in the working tree
</success_criteria>

<output>
After completion, create `.planning/quick/260426-nqr-camera-edit-form-dirty-tracking-patch-se/260426-nqr-SUMMARY.md` documenting:
- What changed (the 4 files + line-level summary)
- Why it matters (audit `details` now reflects what actually changed → unblocks deriveActionLabel rules)
- Verification commands run + their exit codes
- Any deviations from the plan (should be none)
</output>
