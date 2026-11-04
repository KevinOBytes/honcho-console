---
document_id: requirements
status: current
owner: Kevin O'Connor
last_reviewed: 2026-09-04
review_interval_days: 90
---

# Requirements

Honcho Console provides a small, safe local surface for understanding and correcting the memory state used by Hermes without exposing credentials or requiring direct database access. IDs use `REQ-<AREA>-<NNN>`; every requirement below is Accepted and Must priority.

### REQ-CONN-001 — Local Honcho connection

**Status:** Accepted
**Priority:** Must

The server shall resolve the Honcho base URL and API key from explicit environment variables or the existing local Honcho config, discover the workspaces available to that credential, and use the configured workspace as an editable default when one exists.

#### Acceptance criteria
- The browser receives connection status, available workspace identifiers, the configured default when present, and non-secret endpoint metadata, never the API key.
- The configured workspace is selected by default; otherwise the first available workspace is selected, and the user may choose or type a validated workspace identifier.
- Missing, malformed, unauthorized, and unreachable configurations produce an actionable error state.
- Trailing slashes and supported legacy config key names are normalized.

#### Verification
- Unit tests in `src/lib/honcho-config.test.ts` and `src/lib/honcho-client.test.ts`.
- Live smoke request through `/api/status` against the local Honcho container.

### REQ-MEM-001 — Browse and search memory

**Status:** Accepted
**Priority:** Must

The UI shall progressively append paginated Honcho conclusions when the end of the visible list enters the viewport, with manual Load more and explicit Load all controls, and support peer/level filters plus separate semantic search while preserving source IDs, reasoning level, session association, and creation timestamp.

#### Acceptance criteria
- Empty, loading, error, and populated states are distinct.
- Progressive browsing reports loaded unique records and the API total, never silently presenting a partial list as complete. Page overlap is deduplicated by conclusion ID.
- Load all reads remaining pages sequentially, shows progress, and can be stopped without discarding already loaded records or automatically restarting. Errors retain earlier pages and retry the failed page in its correct mode.
- Changing browse filters or running semantic search resets the accumulated chronological list. A failed reset disables further appends until page one succeeds. Editing a search query or its peer scope cancels stale in-flight results. Semantic results do not auto-page.
- Semantic results are labeled separately from chronological browsing.

#### Verification
- Route and UI tests for conclusion normalization, filtering, progressive loading, stop/reset behavior, and result-state rendering.
- Browser inspection against live `oasis` data, loading a bounded number of pages rather than automatically fetching the full workspace.

### REQ-MEM-002 — Curate memory safely

**Status:** Accepted
**Priority:** Must

The UI shall create, replace, and delete conclusions through the Honcho v3 API, with explicit confirmation for replacement and deletion.

#### Acceptance criteria
- Creation requires non-empty content and valid observer and observed peers.
- Replacement creates the corrected conclusion before deleting the original and attempts rollback if deletion fails.
- Delete and replace actions cannot run from an unconfirmed accidental click.
- Successful mutations refresh the visible data; errors preserve user input and report what failed.

#### Verification
- Transaction tests in `src/lib/conclusion-mutations.test.ts`.
- Browser workflow validation using a temporary test conclusion that is removed afterward.

### REQ-PEER-001 — Inspect and edit peer memory views

**Status:** Accepted
**Priority:** Must

The UI shall list peers, retrieve observer-to-target representations and context, and allow the user to replace the selected peer card as an ordered list of facts.

#### Acceptance criteria
- Observer and target are always explicit in the UI.
- Representation and card loading failures do not erase the previous visible selection.
- Saving a peer card requires confirmation and sends only the displayed list of non-empty facts.

#### Verification
- Request-building unit tests and a read-only live browser inspection; mutation behavior is covered with a local test double.

### REQ-SESSION-001 — Inspect sessions and messages

**Status:** Accepted
**Priority:** Must

The UI shall list recent sessions and display a selected session's paginated messages without exposing controls that mutate conversation history.

#### Acceptance criteria
- Session totals and page state reflect the Honcho response.
- Message author, timestamp, token count, and content remain visible and keyboard reachable.
- Long content wraps without forcing horizontal page scrolling.

#### Verification
- Response-normalization tests and live browser inspection of a recent session.

### REQ-PEER-002 — Dialectic question answering

**Status:** Accepted
**Priority:** Should

The UI shall let the operator ask a natural-language question about a peer and display the Honcho deriver's dialectic answer, with an explicit reasoning-level control (minimal through max) and an optional observed-peer target.

#### Acceptance criteria
- Questions are validated and bounded (maximum 10,000 characters) before the request.
- The answer renders as generated text with clear "generated view" labeling and loading/error states.
- The request timeout accommodates LLM latency without blocking other panels.
- No answer is persisted to Honcho by the console; the exchange remains read-only.

#### Verification
- Component test for the ask flow and live request against the local deriver at the minimal reasoning level.

### REQ-PEER-003 — Working representation inspector

**Status:** Accepted
**Priority:** Should

The UI shall request and display a peer's working representation, optionally scoped by a search query, result cap, and observed target, without exposing any control that persists the generated text.

#### Acceptance criteria
- Search top-K and maximum-conclusion bounds are validated (non-finite rejected, out-of-range silently clamped).
- The scoped representation renders with an explicit clear action and loading/error states.
- Generated output is labeled as a derived view, never as stored memory.

#### Verification
- Component test for the inspector flow and live request with a scoped query.

### REQ-PEER-004 — Deriver dreams and queue visibility

**Status:** Accepted
**Priority:** Should

The UI shall surface the deriver queue status and allow the operator to schedule a dream (`omni` or `card_refresh`, with rebuild for card refreshes) only after an explicit confirmation in the current browser interaction.

#### Acceptance criteria
- Dream type is constrained to values Honcho accepts; invalid values are rejected client-side and server-side with 400.
- Scheduling requires confirmation identical in strictness to destructive memory actions.
- After scheduling, the queue widget shows pending, in-progress, and total work units from the response.
- The panel states plainly that dreams trigger real server-side derivation work.

#### Verification
- Route test rejecting an invalid dream type before any upstream call; component test proving no request fires when confirmation is declined and a validated POST fires when accepted.

### REQ-MEM-003 — Global and peer message search

**Status:** Accepted
**Priority:** Should

The UI shall search message content across the workspace (global) and within one peer (per-peer), label results as message search distinct from semantic memory search, and link each hit to its originating session.

#### Acceptance criteria
- Query and result limit are validated and bounded before the request.
- Results show peer, timestamp, originating session identifier, and content.
- The per-peer search is reachable from the peer view; the global search has its own navigation entry.
- Keyboard submission (Enter) triggers the search.

#### Verification
- Route tests for both scopes and a live search returning hits with a session jump.

### REQ-MEM-004 — Memory composition dashboard

**Status:** Accepted
**Priority:** Should

The overview shall summarize memory composition: totals by level, conclusions per day over the last 30 days, most active observers, busiest sessions, and an explicit note when analysis truncates at the server cap.

#### Acceptance criteria
- Composition aggregates are computed server-side from paginated conclusion listing up to a documented cap (5,000 records), with truncation stated when totals exceed the cap.
- Session links in the panel open the originating session.
- Missing or failed stats degrade to an error banner with retry, never to fabricated numbers.

#### Verification
- Unit tests for the aggregation math and truncation flag; route test; live run against a workspace with thousands of conclusions.

### REQ-MEM-005 — Local change journal

**Status:** Accepted
**Priority:** Should

The console shall record an append-only local audit trail of every memory and card mutation it performs, viewable in the overview.

#### Acceptance criteria
- Entries record timestamp, action, workspace, a bounded summary, affected identifiers, and truncated before/after content.
- The journal lives outside the repo (`~/.honcho-console/change-journal.jsonl` by default, overridable via `HONCHO_CONSOLE_JOURNAL_PATH`) with file mode 0600.
- Journaling is best-effort: a journal failure never blocks or rolls back the underlying mutation.
- The overview lists the most recent entries with clear empty-state copy.

#### Verification
- Unit tests for append/reading and permissions; route tests proving mutations record entries; component test for the panel.

### REQ-MEM-006 — Export / backup

**Status:** Accepted
**Priority:** Should

The overview shall offer one-click export of every conclusion and peer card in the workspace as JSON or Markdown, delivered as a local browser download.

#### Acceptance criteria
- Export reflects the complete workspace (pagination handled server-side) without truncation.
- The response is a download attachment; nothing is written server-side or sent to any external service.
- Markdown export renders conclusions grouped by level with a clear header.

#### Verification
- Unit tests for both builders; route test with attachment headers; live smoke asserting byte size and header text.

### REQ-SESSION-002 — Session summaries

**Status:** Accepted
**Priority:** Should

The session view shall display a selected session's stored short and long summaries when they exist and an explicit empty state when they do not.

#### Acceptance criteria
- Summaries render as distinct blocks labeled short/long without overwriting the message stream.
- Absence of summaries shows copy that explains no summaries exist yet.
- Failures surface a retry banner rather than blank space.

#### Verification
- Component test with a summarized session and a live empty-summary session.

### REQ-UX-001 — Usable local dashboard

**Status:** Accepted
**Priority:** Must

The interface shall be responsive, keyboard operable, accessible at common desktop and narrow viewport sizes, and visually distinguish navigation, controls, data, warnings, and destructive actions.

#### Acceptance criteria
- Interactive controls have accessible names and visible focus states.
- The app remains usable at 375 CSS pixels and at a desktop viewport.
- Reduced-motion preferences disable non-essential animation.
- No console errors occur during primary workflows.

#### Verification
- Component tests with Testing Library.
- Browser screenshots, keyboard checks, viewport checks, and console inspection.

### REQ-SESSION-003 — Session context view

**Status:** Accepted
**Priority:** Should

The session view shall display the Honcho session context payload (summary, peer representation, peer card, and message window assembled by the server) as a read-only "injected view" next to the raw message stream.

#### Acceptance criteria
- The request is read-only (`GET /v3/.../sessions/{id}/context` via a same-origin route) and never mutates Honcho.
- Summary and representation blocks are labeled as generated/derived views.
- A session with no assembled context shows an explicit empty state; failures show an error with retry.
- Generated content is never persisted or presented as stored memory.

#### Verification
- Route test for payload pass-through and identifier validation; component test for populated and empty states.

### REQ-PEER-005 — Streaming dialectic

**Status:** Accepted
**Priority:** Should

The dialectic panel shall offer an optional streaming mode that pipes the upstream answer as it arrives and renders it progressively, keeping the existing non-streaming path.

#### Acceptance criteria
- Query length and reasoning-level validation are identical in both modes (maximum 10,000 characters).
- Streaming requests forward `stream: true`; the console passes through the upstream content-type and disables buffering.
- Partial text renders incrementally with the streaming state labeled; empty streams degrade to an explicit empty response.
- The exchange remains read-only; nothing is persisted.

#### Verification
- Parser unit tests for SSE/plain chunk streams; route tests for stream passthrough and non-stream contract failures.

### REQ-MEM-007 — Memory triage for curation

**Status:** Accepted
**Priority:** Should

The overview shall offer a triage view that detects near-duplicate conclusions from a bounded scan and supports deleting duplicates through the existing confirmed, journaled mutation path.

#### Acceptance criteria
- The scan is bounded (5,000 records hard cap) and reports analyzed/total with an explicit truncation note.
- Near-duplicates are grouped by observer/observed pairs using a token-set similarity threshold of 0.8 with no external dependencies.
- Group members show level, derivation count, timestamp, and truncated content; destructive actions reuse the existing confirmation and change-journal invariants.
- Analysis is read-only; deletion is the only mutation and always requires confirmation.

#### Verification
- Similarity/clustering unit tests; route tests for bounds, filters, and truncation; component test for the delete-after-confirm flow.

### REQ-MEM-008 — Memory growth breakdown

**Status:** Accepted
**Priority:** Should

The composition dashboard shall break the last-30-days conclusion counts down by reasoning level and by observer, rendered without a charting dependency.

#### Acceptance criteria
- Buckets are computed server-side from the same bounded scan as the existing 30-day sparkline.
- The stacked bar view shows per-level segments and a legend; the observer list shows the top contributors for the window.
- Missing or failed breakdown data degrades to the existing sparkline, never to fabricated numbers.

#### Verification
- Aggregation unit tests; dashboard component test tolerant of pre-breakdown payloads; live run against a workspace with thousands of conclusions.

### REQ-MEM-009 — Journal filters and export

**Status:** Accepted
**Priority:** Should

The recent-changes panel shall filter the change journal by action or workspace and export the filtered view as a local NDJSON download.

#### Acceptance criteria
- Filters are validated server-side (action set, workspace identifier, bounded limits).
- Export returns a download attachment (`.jsonl`) bounded to the most recent 5,000 matching entries and never writes anything server-side.
- The journal remains append-only; export and filtering never modify it.

#### Verification
- Filter/export route tests; journal library tests for filtered reads; live smoke asserting the export attachment.

### REQ-SCOPE-001 — Scope-aware views

**Status:** Accepted
**Priority:** Should

A Scopes section shall list the workspace scopes with membership and backfill status, read-only.

#### Acceptance criteria
- Scope listing, per-scope session membership, and backfill job state come from same-origin routes backed by Honcho v3 scope endpoints.
- Unknown scopes and empty workspaces produce explicit empty states; failures surface with retry.
- No scope creation, membership mutation, or backfill triggering is exposed.

#### Verification
- Route tests for list/detail and validation; component test for listing and selection.

### REQ-WEB-001 — Webhook audit listing

**Status:** Accepted
**Priority:** Should

A Webhooks section shall list the configured outbound webhook endpoints for the workspace, read-only.

#### Acceptance criteria
- Listing comes from a same-origin route backed by `GET /v3/.../webhooks`.
- Endpoint URL, identifier, and creation time are shown; an empty workspace shows an explicit empty state.
- Creating, testing, or deleting endpoints is not exposed; no credentials or signed payloads are fetched or rendered.

#### Verification
- Route test and component test for populated and empty states.
