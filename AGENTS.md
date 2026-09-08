# Agent Operating Contract

## Project

Honcho Console is a local-only Next.js internal tool for browsing Honcho conclusions, peers, peer cards, representations, sessions, and messages. It may mutate conclusions and peer cards only through the documented Honcho HTTP API; it is not a database administration console and is not intended for network deployment.

## Authority and reading order

1. `docs/BOUNDARIES.md` defines hard constraints and has highest authority.
2. `docs/REQUIREMENTS.md` defines observable required behavior.
3. `docs/INDEX.md` routes documentation questions.
4. `TODO.md` is informational and never overrides normative documents.

## Required workflow

1. Read `docs/INDEX.md` and the applicable normative files.
2. Identify the affected `REQ-*` and `BOUNDARY-*` IDs.
3. Write a failing behavior test before production code.
4. Make the smallest coherent change.
5. Run fast validation and then full validation before claiming completion.
6. Update documentation when behavior or a boundary changes.

## Hard rules

- Keep the app loopback-only unless a human explicitly approves a new threat model and authentication layer.
- Keep the Honcho API key and local config file contents server-side; never serialize credentials to a client response, HTML, logs, fixtures, or screenshots.
- Use only Honcho v3 HTTP endpoints. Never connect directly to Honcho PostgreSQL or Redis.
- Require an explicit UI confirmation for deletion or conclusion replacement.
- Do not add telemetry, analytics, remote fonts, or unrelated services.
- Never weaken a boundary to make a test pass, and never claim completion without real validation output.

## Commands

- Bootstrap: `npm install`
- Fast validation: `npm run check`
- Full validation: `npm run validate`
- Test: `npm test`
- Docs contract validation: `npm run project-check`

## Definition of done

The changed workflow has a test that failed first and now passes; lint, TypeScript, tests, production build, project-contract validation, a live local API smoke test, and browser visual inspection all pass. Destructive behavior must retain an explicit confirmation step.

## Agent compatibility

`AGENTS.md` is the single canonical control file. Do not create a `CLAUDE.md` shim.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
