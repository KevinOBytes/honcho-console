# Honcho Console

A local-only web console for inspecting and curating a self-hosted [Honcho](https://github.com/plastic-labs/honcho) instance. The server keeps the Honcho credential; the browser never sees it, and the app binds to `127.0.0.1` by default.

Honcho (by Plastic Labs) has no first-party admin UI. The only public alternative we could find is a browser-only SPA that keeps a JWT in browser storage, so it expects you to front it with Cloudflare Access or Tailscale. This project takes the opposite approach: credentials stay in a server process that reads your existing `~/.honcho/config.json`, all Honcho traffic goes through same-origin API routes, and the app refuses non-loopback endpoints unless an operator explicitly opts in.

What you get:

- Connection health with peer, memory, and session totals, plus workspace discovery from the credential's permissions
- Browse conclusions progressively as you scroll, with explicit Load more and Load all controls, plus filters and separate semantic search
- Create, replace (create-then-delete with rollback), and delete conclusions; destructive actions require explicit confirmation
- Peer cards: view the representation and edit the card itself
- Recent sessions and their messages, read-only

## Quickstart

Prerequisites: Node.js 22.12 or newer and a local Honcho v3 instance running at `http://127.0.0.1:8000`.

```
git clone https://github.com/KevinOBytes/honcho-console.git
cd honcho-console
npm install
npm run dev
```

Open `http://127.0.0.1:3000`. By default the server reads the existing Honcho connection from `~/.honcho/config.json`. Environment variables in `.env.local` can override it; copy `.env.example` for the supported names. The configured workspace is the initial selection when present; if the credential can enumerate workspaces, the UI exposes those choices, and the identifier remains editable. The API key is never exposed to browser JavaScript.

## Included workflows

- View live connection health and peer, memory, and session totals for a configured, discovered, or manually entered workspace.
- Browse and filter conclusions, load more on scroll, or choose Load all to fetch every reported page sequentially with progress and a Stop control. Stop pauses automatic loading until an explicit loading action or filter reset. Large workspaces can take time and memory; browsing stays paged by default. Run semantic search separately, add a conclusion, replace its content, or delete it after confirmation.
- Browse peers, inspect the observer-to-target representation, and edit the corresponding peer card.
- Browse recent sessions and inspect their messages without modifying conversation history.

Honcho does not expose an in-place conclusion update endpoint. Replace creates the corrected conclusion first and deletes the old conclusion only after creation succeeds; the server attempts rollback if deletion fails.

## Run inside the Honcho compose stack

The Honcho stack's `docker-compose.yml` can host the console as a fifth `console`
service (requires `~/.dockerignore`-aware multi-stage build from this repo's
`Dockerfile`). It publishes `127.0.0.1:3100` only and reaches the API on the
compose network as `http://api:8000`. Because that hostname is not loopback, the
container runs with `HONCHO_ALLOW_REMOTE=true` (the operator opt-in defined in
`BOUNDARIES.md`); the UI shows "Remote mode enabled" as a result. The
workspace JWT is passed via `env_file` from a chmod-600 file and stays
server-side. The change journal persists on the `console-journal` volume.

```bash
# one-time secret (from your existing ~/.honcho/config.json)
#   echo "HONCHO_API_KEY=$(jq -r '.hosts.hermes.api_key' ~/.honcho/config.json)" > ~/Server/honcho/.console.env
#   chmod 600 ~/Server/honcho/.console.env
cd ~/Server/honcho && docker compose up -d --build console
# open http://127.0.0.1:3100
```

The original host-side flow (`npm run dev`) remains supported and still binds
`127.0.0.1`.

## Validation

    npm run check
    npm run build
    npm run project-check

## Status

A personal project, built in September 2026, running against a local Honcho container. Remote Honcho endpoints, authentication for multiple browser users, direct database access, bulk deletion, and deployment are deliberately out of scope; see `docs/BOUNDARIES.md` for the full threat model.

## Documentation

Start with `docs/INDEX.md`. Agents must then read `docs/BOUNDARIES.md` and `docs/REQUIREMENTS.md` before changing behavior.

## License

[MIT](LICENSE)
