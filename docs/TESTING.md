# Testing

Honcho Console uses a small layered validation set:

- `npm run lint` — Next/React lint rules, including hook and accessibility checks.
- `npm run typecheck` — TypeScript project diagnostics.
- `npm test` — Vitest unit tests for configuration normalization, resource-ID validation, authenticated client requests, replacement sequencing, and formatting helpers.
- `npm run build` — production Next.js compilation and route generation.
- `npm run project-check` — repository-contract validation.
- `npm run smoke` — read-only live smoke against the running local app; set `HONCHO_UI_URL` and `HONCHO_UI_WORKSPACE` when needed. It checks status/default workspace selection, overview resources, memories, peers, sessions, context, messages, and response credential-marker absence. It never mutates Honcho.

Browser QA must inspect the overview, memory browser/editor, peer context/card editor, and session archive at desktop and narrow widths. Confirm keyboard names/focus states, no console errors, responsive overflow behavior, and explicit confirmation before destructive memory/card actions.
