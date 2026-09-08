# Documentation Index

Each document answers one distinct question. Keep behavior in requirements and hard constraints in boundaries rather than duplicating them across files.

| Question | Document |
| --- | --- |
| What is Honcho Console, and how do I run it? | `README.md` |
| How must an agent work in this repository? | `AGENTS.md` |
| What observable behavior must the tool provide? | `docs/REQUIREMENTS.md` |
| What constraints must never be crossed? | `docs/BOUNDARIES.md` |
| How is behavior verified? | `docs/TESTING.md` |
| What work is immediately pending? | `TODO.md` |

This repository intentionally uses the lean `library` contract because the browser UI is a loopback-only internal tool, not a deployed web application. If it becomes remotely reachable, change the profile and add architecture, operations, testing, threat-model, security, contribution, and ADR documents before deployment.

For any code change, read `docs/BOUNDARIES.md` first, map the work to a requirement in `docs/REQUIREMENTS.md`, and use the commands in `AGENTS.md` to prove completion.
