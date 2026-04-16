---
phase: quick
plan: 260416-oqr
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/package.json
autonomous: true
must_haves:
  truths:
    - "Next.js dev server starts with Turbopack enabled"
  artifacts:
    - path: "apps/web/package.json"
      provides: "Dev script with --turbopack flag"
      contains: "next dev --turbopack --port 3000"
  key_links: []
---

<objective>
Enable Turbopack for the Next.js dev server to improve development build speed.

Purpose: Turbopack is the recommended bundler for Next.js dev mode, providing significantly faster hot module replacement and startup times.
Output: Updated dev script in apps/web/package.json
</objective>

<context>
@apps/web/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enable Turbopack in dev script</name>
  <files>apps/web/package.json</files>
  <action>
In apps/web/package.json, update the "dev" script from:
```
"dev": "next dev --port 3000",
```
to:
```
"dev": "next dev --turbopack --port 3000",
```
No other changes needed.
  </action>
  <verify>
    <automated>grep '"dev"' apps/web/package.json | grep -q '\-\-turbopack' && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>The dev script in apps/web/package.json contains --turbopack flag</done>
</task>

</tasks>

<verification>
- `grep "turbopack" apps/web/package.json` shows the flag in the dev script
</verification>

<success_criteria>
- Dev script reads: "next dev --turbopack --port 3000"
</success_criteria>

<output>
After completion, create `.planning/quick/260416-oqr-enable-turbopack-for-next-js-dev-server/260416-oqr-SUMMARY.md`
</output>
