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

The UI shall list paginated Honcho conclusions and support peer/level filters plus semantic search while preserving the source IDs, reasoning level, session association, and creation timestamp.

#### Acceptance criteria
- Empty, loading, error, and populated states are distinct.
- Pagination reports the API total and never silently presents a partial list as complete.
- Semantic results are labeled separately from chronological browsing.

#### Verification
- Route and UI tests for conclusion normalization, filtering, and result-state rendering.
- Browser inspection against live `oasis` data.

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
