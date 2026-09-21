const baseUrl = process.env.HONCHO_UI_URL ?? "http://127.0.0.1:3000";
const workspace = process.env.HONCHO_UI_WORKSPACE ?? "oasis";

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${payload.error ?? ""}`.trim());
  return payload;
}

const status = await get("/api/status");
if (!status.ok || status.selectedWorkspace !== workspace) {
  throw new Error(`status did not select workspace ${workspace}`);
}
const overview = await get(`/api/${encodeURIComponent(workspace)}`);
const memories = await get(`/api/${encodeURIComponent(workspace)}/memories?page=1&size=3`);
const peers = await get(`/api/${encodeURIComponent(workspace)}/peers`);
const sessions = await get(`/api/${encodeURIComponent(workspace)}/sessions`);

if (overview.workspace !== workspace || memories.total < 0 || peers.total < 0 || sessions.total < 0) {
  throw new Error("live API payload failed basic invariant checks");
}
if (memories.mode !== "recent" || memories.size !== 3) {
  throw new Error("recent memory listing did not preserve requested page size");
}

const peerId = peers.items[0]?.id;
const sessionId = sessions.items[0]?.id;
if (!peerId || !sessionId) throw new Error("live workspace has no peer/session for read-only smoke checks");

const context = await get(`/api/${encodeURIComponent(workspace)}/peers/${encodeURIComponent(peerId)}/context`);
const messages = await get(`/api/${encodeURIComponent(workspace)}/sessions/${encodeURIComponent(sessionId)}/messages`);
const searchObserver = peers.items[0]?.id;
const searchObserved = peers.items[1]?.id ?? searchObserver;
const semantic = searchObserver && searchObserved
  ? await get(`/api/${encodeURIComponent(workspace)}/memories?query=science&observer_id=${encodeURIComponent(searchObserver)}&observed_id=${encodeURIComponent(searchObserved)}&size=1`)
  : null;

// Feature additions: read-only routes on live data.
const stats = await get(`/api/${encodeURIComponent(workspace)}/stats`);
const journal = await get(`/api/${encodeURIComponent(workspace)}/journal?limit=5`);
const queue = await get(`/api/${encodeURIComponent(workspace)}/queue`);
const summaries = await get(`/api/${encodeURIComponent(workspace)}/sessions/${encodeURIComponent(sessionId)}/summaries`);
const exportResponse = await fetch(`${baseUrl}/api/${encodeURIComponent(workspace)}/export?format=markdown`);
if (!exportResponse.ok) throw new Error(`export: HTTP ${exportResponse.status}`);
const exportText = await exportResponse.text();
if (!exportText.includes("# Honcho export —")) throw new Error("export markdown did not include the header");
const messageSearchResponse = await fetch(`${baseUrl}/api/${encodeURIComponent(workspace)}/search`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: "memory", limit: 3 }),
});
if (!messageSearchResponse.ok) throw new Error(`message search: HTTP ${messageSearchResponse.status}`);
const messageSearch = await messageSearchResponse.json();
if (messageSearch.mode !== "message-search") throw new Error("message search did not label its mode");
// Dream scheduling is validated read-only: an invalid dream type must be rejected before any deriver work.
const invalidDream = await fetch(`${baseUrl}/api/${encodeURIComponent(workspace)}/dreams`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ observer: peerId, dream_type: "not-a-dream" }),
});
if (invalidDream.status !== 400) throw new Error(`invalid dream should be rejected with 400, got ${invalidDream.status}`);

const serialized = JSON.stringify({ status, overview, memories, peers, sessions, context, messages, semantic, stats, journal, queue, summaries, messageSearch }).toLowerCase();
if (semantic && semantic.mode !== "semantic") throw new Error("semantic search did not return semantic mode");
if (semantic && semantic.size < 1) throw new Error("semantic search returned an invalid page size");
if (stats.stats.totalAvailable < 0 || stats.queue.pending_work_units < 0) throw new Error("stats payload failed invariant checks");
if (!Array.isArray(journal.items)) throw new Error("journal did not return an items array");
if (summaries.id !== sessionId) throw new Error("summaries did not echo the session id");

for (const secretMarker of ["bearer ", "api_key", "apikey", "jwt_secret"]) {
  if (serialized.includes(secretMarker)) throw new Error(`possible credential marker leaked in UI API responses: ${secretMarker}`);
}

console.log(JSON.stringify({
  baseUrl,
  workspace,
  status: "ok",
  listing: status.workspaceListing,
  peers: peers.total,
  sessions: sessions.total,
  memories: memories.total,
  messages: messages.total,
  peerContext: Boolean(context.peer_id),
  statsTotal: stats.stats.totalAvailable,
  messageSearchHits: messageSearch.items.length,
  exportBytes: exportText.length,
}));
