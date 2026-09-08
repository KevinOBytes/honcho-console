---
document_id: boundaries
status: current
owner: Kevin O'Connor
last_reviewed: 2026-09-04
review_interval_days: 90
---

# Boundaries

These `BOUNDARY-*` statements are hard constraints. Do not weaken one to simplify implementation or make a test pass.

## Product scope and non-goals

- BOUNDARY-SCOPE-001: The product is a single-user, local-only Honcho inspection and curation console.
- BOUNDARY-SCOPE-002: Remote deployment, multi-user authentication, workspace administration, direct database editing, bulk deletion, and session/message mutation are non-goals.
- BOUNDARY-SCOPE-003: “Memory” means Honcho conclusions and peer cards; generated representations are inspectable but not directly editable.

## Trust boundaries

- BOUNDARY-TRUST-001: Browser input is untrusted. Route handlers validate and bound every body, query value, path identifier, page number, and text field before calling Honcho.
- BOUNDARY-TRUST-002: Honcho responses are untrusted external data and must be parsed before rendering or using IDs in subsequent requests.

## Data classification boundaries

- BOUNDARY-DATA-001: Conclusions, peer cards, representations, sessions, and messages may contain highly sensitive personal data. Keep them local and never place real records in fixtures, telemetry, logs, screenshots committed to Git, or error tracking.
- BOUNDARY-DATA-002: JWTs and API keys are secrets. They may be read only in server-side modules and must never appear in client bundles or API responses.

## Authentication and authorization invariants

- BOUNDARY-AUTH-001: The app binds to `127.0.0.1`; browser access relies on local-machine trust only. Any non-loopback exposure requires a new authentication and authorization design before code or deployment.
- BOUNDARY-AUTH-002: The configured workspace is only a default. The client may select a discovered workspace or submit a syntactically validated workspace identifier; the Honcho credential remains the authorization authority. The client cannot submit an arbitrary upstream URL.

## Package and import boundaries

- BOUNDARY-PKG-001: Client components may call same-origin `/api/*` routes but may not import the server-only config or Honcho client modules.
- BOUNDARY-PKG-002: Honcho transport, schemas, and mutation sequencing live under `src/lib`; route handlers stay thin and UI components do not construct authenticated upstream requests.

## Allowed and prohibited dependencies

- BOUNDARY-DEP-001: Runtime dependencies are limited to Next.js/React, Zod validation, and Lucide icons. Do not add an ORM, state framework, analytics SDK, remote font, or component framework without explicit approval.
- BOUNDARY-DEP-002: Native `fetch` is the only Honcho transport. There is no direct PostgreSQL or Redis client.

## External-service boundaries

- BOUNDARY-EXT-001: Honcho base URLs must resolve to loopback hostnames or addresses unless `HONCHO_ALLOW_REMOTE=true` is deliberately set by the operator; the UI must make remote mode conspicuous if ever enabled.
- BOUNDARY-EXT-002: No other service may be contacted at runtime.

## Logging and telemetry boundaries

- BOUNDARY-LOG-001: No analytics or telemetry. Errors shown to the user may include status and a bounded Honcho detail but never authorization headers, tokens, full config objects, or unrelated response data.

## Migration and compatibility boundaries

- BOUNDARY-MIG-001: Use only documented Honcho v3 endpoints. Because conclusions have no update endpoint, replacement is create-first/delete-second with rollback attempted on failure.
- BOUNDARY-MIG-002: Support both camelCase and snake_case key names used by current local Honcho config files without rewriting those files.

## Operational boundaries

- BOUNDARY-OPS-001: The app does not start, stop, repair, or reconfigure Honcho containers.
- BOUNDARY-OPS-002: A disconnected app remains read-only except for retrying connection; it must not synthesize mock records that look real.
- BOUNDARY-OPS-003: Delete and replace actions require an explicit confirmation in the current browser interaction.

## Actions requiring explicit human approval

- Enabling remote or non-loopback access.
- Adding authentication, a new external service, telemetry, or a production dependency.
- Adding bulk mutation or any operation that changes sessions/messages/workspaces.
- Editing the protected control plane or changing the project profile for deployment.
