# NovaTech Store — Improvement Plan for OpenCode

## Instructions for the coding agent

Inspect the existing repository and implement the improvements below. Treat this document as a work plan, not proof that the findings still exist: **verify each finding against the current source before changing anything**.

### Working rules
- Preserve the current stack and overall design unless a change is necessary: HTML, CSS, vanilla JavaScript, Express, server-managed sessions, Multer, and the current JSON product store.
- Do not rewrite the application or introduce a frontend framework.
- Make focused, minimal changes that fit the existing code style.
- Inspect relevant files and existing tests before editing.
- Never weaken validation, authorization, or security controls to make a test pass.
- Do not expose secrets, real credentials, or `.env` contents. Keep `.env` ignored and use safe placeholders in `.env.example`.
- Do not delete bundled seed illustrations. Only remove user-uploaded files after verifying they are inside the uploads directory.
- Avoid unrelated features, visual redesigns, or new dependencies unless clearly justified.
- Run available checks after meaningful changes. Report any checks that could not be run and why.
- Do not claim a fix is verified unless the relevant test or manual check actually passes.

## Project context

The project is a university-demo digital-products storefront with an admin panel. It reportedly uses:
- HTML, CSS, and vanilla JavaScript for the frontend
- Node.js and Express for the backend/API
- Server-managed sessions for admin authentication
- Multer for image uploads
- A JSON file for product persistence

A previous review reported that JavaScript syntax checks passed and API smoke tests had 31 passes and 0 failures. These results are historical; rerun the current project's checks rather than assuming they still pass.

## Priority 1 — Fix confirmed functional issues

### 1. Make “Remove photo” actually remove an existing product image

**Reported locations:** `public/admin/js/admin.js` and `server/routes/products.js`.

Trace the edit-product flow, image preview state, request payload, and backend update behavior before making changes.

Expected behavior:
- When creating a product, removing a newly selected image clears the file input and preview.
- When editing a product with an existing uploaded image, clicking “Remove photo” marks the existing image for removal and hides its preview.
- Saving the edit sends an explicit removal signal (for example, `removeImage=true`).
- The backend removes the product's image reference only when the authenticated update explicitly requests removal. If neither a replacement image nor a removal request is supplied, preserve the existing image.
- If a new image is uploaded, it replaces the existing image according to the project's current behavior.
- After a successful update, safely remove the previous file only if it is a user-uploaded file inside the designated uploads directory. Never delete bundled assets such as files under `public/img/products/`.
- Reset removal state when opening, closing, cancelling, or successfully saving the modal. Failed saves must not accidentally lose the user's intended state.
- Handle replacement/removal without leaving orphaned uploads where practical.

Add regression tests for:
1. Updating a product with an uploaded image and no image-related change preserves the image.
2. Explicitly removing the image clears the stored image reference and safely deletes the old upload.
3. Replacing an uploaded image updates the reference and cleans up the previous upload.
4. Removing a newly selected file before creating/updating does not accidentally remove an existing server image.
5. A bundled seed image is never deleted by image removal.

### 2. Correct oversized-upload error messaging

**Reported location:** `server/routes/products.js`, in or near `handleUploadErrors()`.

- Inspect the configured maximum image size and current error-message calculation.
- Calculate the displayed size from the actual configured byte limit, using binary MiB consistently if the configuration is in bytes. For example:

  ```js
  const limitMb = (MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(2);
  ```

- Ensure the message accurately describes the configured limit; avoid a misleading hardcoded value.
- Where practical, avoid duplicated frontend limits; otherwise keep frontend and backend values/messages consistent.
- Add or update a test verifying the response message for an oversized upload.

**Resolved:** the limit is now 5,000,000 bytes, so both the server message and
the admin UI format sizes as decimal MB with trailing zeros trimmed
(`(bytes / 1000000).toFixed(2).replace(/\.?0+$/, '')`), which reports the real
limit as `5 MB` instead of the misleading `4.77 MB` a binary MiB calculation
would produce. `scripts/test-api.js` derives its expected message from
`GET /api/config` using the same rule, and adds below/at/above-limit cases.

## Priority 2 — Keep demo authentication simple

This is a local university demo, so do not add extra authentication hardening that is unnecessary for the assignment.

### 3. Preserve the existing login/session flow

- Inspect the current login, session, and logout behavior.
- Do **not** add session-ID regeneration after login as part of this task.
- Do not introduce login rate limiting or additional production-only security configuration unless the project already requires it.
- Preserve the existing login/logout behavior and ensure protected product write operations remain restricted to authenticated admins.
- Add or retain basic tests confirming correct/incorrect login behavior, authenticated writes, logout, and rejection of unauthenticated writes.
- Do not log passwords or session/cookie values.

Keep this scope limited: do not weaken existing authorization checks or deliberately introduce vulnerabilities; simply avoid adding the extra session-security work requested for a production deployment.

## Priority 3 — Make tests repeatable and documented

### 5. Expose and document the API smoke test

**Reported locations:** `package.json`, `scripts/test-api.js`, `README.md`.

- Inspect the existing test script and how it selects its target URL/port.
- Add an npm test script only if it accurately reflects how the test currently works (for example, `"test": "node scripts/test-api.js"` if a server must already be running).
- Prefer a one-command test workflow that starts an isolated test server, uses temporary/test data, and cleans up reliably if this can be achieved without destabilizing the app.
- Never run destructive tests against the developer's normal product data.
- Document prerequisites, environment variables, port configuration, commands, and whether a server must be started in a separate terminal.
- Ensure test cleanup runs on both success and failure.
- Keep dependencies limited and explain any new test dependency.

### 6. Add regression and edge-case coverage

Extend the existing tests where appropriate:
- Image removal, replacement, and preservation behavior.
- Invalid image signature rejection.
- Oversized upload rejection and accurate error message.
- Product fields containing HTML-like strings render as text, not executable HTML.
- Session regeneration, logout, and unauthorized write rejection.
- Product persistence after server restart.
- Unknown API route returns the documented JSON 404 shape.
- Tests must isolate or restore data/files they modify.

Do not claim browser behavior is covered by API tests. If browser automation is not already configured, either add a small appropriate suite if justified or document a concise manual QA checklist.

## Priority 4 — Browser QA, accessibility, and UX

### 7. Validate responsive layouts and main user journeys

If browser automation is available, run it. Otherwise, document and perform what can be checked in the available environment, without claiming visual verification if a browser was not used.

Check at minimum:
- Desktop viewport around 1440 px wide.
- Tablet viewport around 768 px wide.
- Mobile viewport around 375–390 px wide.
- Storefront navigation on keyboard and touch.
- Search and category filtering on narrow screens.
- Admin table overflow and horizontal scrolling.
- Modal height and scrolling on short displays.
- Product cards with long names/descriptions, different image aspect ratios, and missing images.
- Empty product list and no-search-results states.
- Visible keyboard focus and readable text contrast.
- Duplicate submissions during save/delete requests.
- Delete confirmation clearly identifies the product.

### 8. Improve modal accessibility

Where consistent with the current UI implementation:
- Close dialogs with Escape when appropriate.
- Move focus into the dialog on open.
- Keep keyboard focus inside an open modal.
- Restore focus to the triggering control on close.
- Prevent background interaction while a modal is open.
- Use appropriate dialog semantics and accessible labels.
- Ensure all controls have meaningful labels and visible focus indicators.
- Avoid introducing accessibility code that conflicts with existing modal behavior.

### 9. Improve image selection feedback

- Explain that leaving the image unchanged preserves the current image when editing.
- Make the removal action's effect visible before saving.
- Display the actual configured file-size limit.
- Provide a useful fallback when an image preview fails.
- Prevent duplicate save actions while a request is pending.

## Priority 5 — Upload hardening and maintainability

### 10. Consider stronger image validation

The reported implementation checks image signature bytes, but this does not prove the complete file is valid.

- Inspect the existing validation and dependencies first.
- If justified, use an established image-processing library such as `sharp` to decode and re-encode accepted uploads.
- Apply sensible width/height and file-size limits.
- Ensure malformed files fail safely and temporary files are cleaned up.
- Do not add a large dependency solely for appearance; explain the trade-off in the final report.
- If out of scope for the university demo, document the limitation instead.

### 11. Preserve safe rendering and consistent API errors

- Preserve the current use of DOM APIs and `textContent` for untrusted product text.
- Verify product names/descriptions containing HTML-like input are rendered as text.
- Keep backend validation as the source of truth, even when frontend validation exists.
- Keep API error response shapes consistent (for example, a general `error` plus field-level `errors` where appropriate).
- Keep configuration in one place where practical, including upload-size limits.
- Review JSON request-body limits and CSRF considerations according to the existing architecture and deployment scope.

### 12. Keep project structure and storage appropriate

- Do not include `node_modules/` in the submitted project ZIP; include `package.json` and `package-lock.json`.
- Ensure `.gitignore` excludes `node_modules/`, `.env`, and temporary test artifacts.
- Keep JSON persistence for this assignment unless a concrete requirement justifies a database change.
- If storage is expanded, consider SQLite before a more complex database.
- Do not migrate storage as part of this task unless necessary and explicitly justified.

## Definition of done

The task is complete when:
- Each reported finding has been verified against the current source and marked fixed, not applicable, or still outstanding.
- Image removal works and has regression coverage.
- Oversized-upload messages reflect the actual configured limit.
- Basic login/logout and authorization behavior is tested; no session-ID regeneration change is required for this demo.
- Test commands and setup are documented.
- Relevant automated checks have been run and actual results recorded.
- Any browser/visual checks not performed are explicitly listed as not verified.
- Existing functionality, design, and demo workflow are preserved unless a change is required.
- No secrets, user data, or destructive test artifacts are introduced or exposed.

## Final response required from OpenCode

After implementation, summarize:
1. What changed, grouped by priority.
2. Files changed and why.
3. Tests/checks actually run, including pass/fail counts.
4. Any tests or visual checks not run and why.
5. Security or compatibility considerations.
6. Remaining issues and recommended next steps.

Do not merely restate this plan. Inspect the repository, implement appropriate changes, run available checks, and report actual results. If a requested change is unsafe, unsupported, or out of scope, explain why instead of guessing.
