# Development Batch 170 — Gateway requests reach Human review

Status: `verified` for the synthetic producer approval component; PV1-T5 remains `in_progress`.

An authenticated Gateway `capabilities.invoke` that requires approval now creates an inert, deduplicated pending request. `authority.evaluate` remains non-consuming and creates no approval. The record retains the exact target, arguments, normalized capability version, requesting principal, World, execution environment, Assistant, endpoint, participants, audience, original request key and original capability snapshot. A confirmation digest binds the structured review, snapshot digest and expiry. Pending requests expire within two minutes or at snapshot expiry, whichever is earlier. Capacity is bounded to 4096 stored approvals; unexpired or historical records are not silently evicted.

Studio lists only authorized-site Gateway requests, with bounded cursor pages (five records per UI page, at most fifty per API page). Each collapsible record has an effect summary, complete request identifier, status and labeled scope fields. Explicit checkbox confirmation enables approval. The browser sends only the confirmation digest. The server derives the approving identity from a current password or recovery-code session and verifies it again inside the serialized approval transaction. Workload credentials, Studio bearer credentials and bearer-created browser sessions cannot provide Gateway Human approval. A valid Human session survives page reload without being reissued or extended. Sign-out clears the review records. The site selector now wraps on phones rather than forcing horizontal overflow.

Approval persists a credential-free Human authentication record and audit entry. Approval itself calls no target. The original Gateway request must explicitly resume with the same key and exact scope, its approval reference and the original still-current snapshot; changed arguments, audience, key or source cannot reuse it. Admission and dispatch recheck approval expiry and custody. Duplicate resumes return the original action. Stored evidence checks reject missing snapshot bytes, invalid approval timestamps or missing Human proof. They detect inconsistent custody, not malicious rewriting of an entire trusted database. The store remains single-writer.

## Validation

- `npm test`: 222 tests pass, including 13 new authenticated HTTP approval cases. The test fixture lives outside the test discovery tree; the count contains no empty fixture-only test file.
- `node scripts/check-gateway-review-browser.mjs`: ten workflow checks pass using a disposable Chrome browser and generated local password against the actual Studio HTTP server. The check covers complete fields, keyboard disclosure/confirmation/approval, 1440px desktop and 390/320px widths, zero target calls from approval, one call after explicit resume, reload, markup rendered as text, five-record pagination and sign-out. It stops both browser and synthetic server. Optional Playwright module, browser executable and screenshot directory variables are documented in the QA script.
- `npm run validate`: 13 fixtures and 3 manifest checks pass. The published Gateway bundle and generated-client pins are unchanged.
- Documentation: 30 HTML pages pass local links, anchors, image paths, alt text, shared styles, feature map, manual index and affected-QA release checks. Four screenshots were captured from synthetic runtime data; desktop and phone review captures were visually inspected. This is agent verification, not Human acceptance.
- `git diff --check`: passed.

The earlier browser failure at 390px identified the actual site-bar overflow and was repaired. A subsequent run reached approval, one dispatch and pagination, then asserted sign-out before its HTTP request finished; the harness now awaits the visible sign-in state. Original failed logs remain in the local evidence archive. Final browser captures show the corrected confirmation-label alignment.

## Remaining work and boundaries

The actual canonical Lifestream capability/authority adapter, trusted host proposal source, grant UI and final dispatch remain open; this producer increment does not complete those paths. PWCE physical target-state preconditions, complete joint action scenarios and the broader policy-review lifecycle (including explicit rejection/modification and richer policy explanations) remain separate work. The new panel implements the current brightness approval path and expiry, not every general policy workflow. A restart invalidates retained Gateway authority/snapshots and requires a fresh request; it does not revive an old pending action.

No saved service was restarted; no deployment, live configuration/effect, personal-data import, training, model/provider selection or new Human acceptance occurred. The synthetic target reports completion only for its fixture call. Historical receipts, approved schema bytes and model-quality observations remain unchanged.

The enclosing commit binds this implementation against producer baseline `04b01abf1c5da5acec8247648c978b4ff07bea4c`. Raw logs and the documentation checker are retained locally under `lifestream/.lifestream/benchmarks/pwce-approval/2026-09-15`. The Lifestream successor receipt binds the published producer revision and separate-process consumer check.

## Evidence digests

- `pwce-approval-full-verified.log`: `5bb245526b0a9a62567b3582c74ef91909b56cb730dc24b2ba0102b62e024fcd`
- `pwce-approval-browser-verified.log`: `32170b1d133b68c7dbc1ff9b1c77758a86adcdc238326434399ac26cb5a2b6b3`
- `pwce-approval-validate.log`: `e31118fd431327a2355113d49120584018feac09e64cf4bcd476ecd7e5ec0cbb`
- `pwce-approval-docs.log`: `b94f19d87d3d4d59943c9b9c265b841c596dc22fa611266f83aa0bc06fb3140e`
