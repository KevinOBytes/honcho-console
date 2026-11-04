<!-- GENERATED VIEW — short-horizon work only. Normative scope lives in docs/. -->

# Active Work

Generated: 2026-09-21

## In progress

None. The 0.2.0 wave shipped 2026-11-04: session context view, memory triage (Jaccard duplicate groups + confirmed delete), growth breakdown by level/observer, journal filters + NDJSON export, streaming dialectic, scope-aware views, and a read-only webhook audit listing. All implemented with tests, built, smoke-verified live, and released as v0.2.0 against Honcho v3.5.

## Ready

Candidate ideas, each requiring a boundary/requirement review first:

- Dream history UI: the Honcho server (as of v3.5) exposes `schedule_dream` and queue status but no dream-history listing API; revisit when the server ships one.
- Workspace-scope recall preview per scope (Honcho supports scope-scoped chat/representation; the console shows scopes read-only today).
- Semantic search across all sessions with a composition dashboard time-range picker.

New deployment, remote access, authentication, bulk mutation, or additional dependencies require an explicit request and boundary review.

## Blocked

Nothing is currently blocked. Honcho itself must be running for live data and mutation workflows; the UI should show an actionable disconnected state when it is not.
