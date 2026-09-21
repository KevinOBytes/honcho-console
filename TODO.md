<!-- GENERATED VIEW — short-horizon work only. Normative scope lives in docs/. -->

# Active Work

Generated: 2026-09-21

## In progress

None. The feature wave (dialectic Q&A, representation inspector, peer/global message search, session summaries, dream controls + queue, change journal, replace diff preview, session↔memory cross-links, export/backup, composition dashboard) is implemented, tested (117 tests), built, smoke-verified live, and browser-QA'd.

## Ready

No committed follow-on scope. Candidate ideas, each requiring a boundary/requirement review first:

- Journal viewer filtering by action/workspace and a "clear journal" action (currently append-only, view-only).
- Streaming dialectic responses (Honcho supports `stream`) instead of a single blocking answer.
- Workspace-level dream scheduling and dream history, if Honcho exposes it.

New deployment, remote access, authentication, bulk mutation, or additional dependencies require an explicit request and boundary review.

## Blocked

Nothing is currently blocked. Honcho itself must be running for live data and mutation workflows; the UI should show an actionable disconnected state when it is not.
