import "server-only";

import { z } from "zod";

import type { HonchoConfig } from "./honcho-config";

const metadataSchema = z.record(z.string(), z.unknown());

const workspaceSchema = z.object({
  id: z.string(),
  created_at: z.string().nullable(),
  metadata: metadataSchema.default({}),
  configuration: metadataSchema.default({}),
});

const peerSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  created_at: z.string(),
  metadata: metadataSchema.default({}),
  configuration: metadataSchema.default({}),
});

const sessionSchema = z.object({
  id: z.string(),
  is_active: z.boolean(),
  workspace_id: z.string(),
  metadata: metadataSchema.default({}),
  configuration: metadataSchema.default({}),
  created_at: z.string(),
});

const messageSchema = z.object({
  id: z.string(),
  content: z.string(),
  peer_id: z.string(),
  session_id: z.string(),
  metadata: metadataSchema.default({}),
  created_at: z.string(),
  workspace_id: z.string(),
  token_count: z.number().int(),
});

const conclusionSchema = z.object({
  id: z.string(),
  content: z.string(),
  observer_id: z.string(),
  observed_id: z.string(),
  session_id: z.string().nullable().default(null),
  level: z
    .enum(["explicit", "deductive", "inductive", "contradiction"])
    .default("explicit"),
  times_derived: z.number().int().nullable().default(null),
  created_at: z.string(),
});

const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    size: z.number().int().positive(),
    pages: z.number().int().nonnegative(),
  });

const workspacePageSchema = pageSchema(workspaceSchema);
const peerPageSchema = pageSchema(peerSchema);
const sessionPageSchema = pageSchema(sessionSchema);
const messagePageSchema = pageSchema(messageSchema);
const conclusionPageSchema = pageSchema(conclusionSchema);

const queueStatusSchema = z.object({
  total_work_units: z.number().int(),
  completed_work_units: z.number().int(),
  in_progress_work_units: z.number().int(),
  pending_work_units: z.number().int(),
  sessions: z.record(z.string(), z.unknown()).nullable().optional(),
});

const peerContextSchema = z.object({
  peer_id: z.string(),
  target_id: z.string(),
  representation: z.string().nullable().default(null),
  peer_card: z.array(z.string()).nullable().default(null),
});

const summarySchema = z.object({
  content: z.string(),
  message_id: z.string(),
  summary_type: z.string(),
  created_at: z.string(),
  token_count: z.number().int(),
});

const sessionSummariesSchema = z.object({
  id: z.string(),
  short_summary: summarySchema.nullable().default(null),
  long_summary: summarySchema.nullable().default(null),
});

const workingRepresentationSchema = z.object({
  representation: z.string(),
});

const sessionContextSchema = z.object({
  id: z.string(),
  messages: z.array(messageSchema),
  summary: summarySchema.nullable().default(null),
  peer_representation: z.string().nullable().default(null),
  peer_card: z.array(z.string()).nullable().default(null),
});

const scopeSchema = z.object({
  id: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
  session_count: z.number().int().nullable().default(null),
});

const scopeStatusSchema = z.object({
  backfill_status: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});

const webhookEndpointSchema = z.object({
  id: z.string(),
  workspace_id: z.string().nullable().default(null),
  url: z.string(),
  created_at: z.string(),
});

const scopePageSchema = pageSchema(scopeSchema);
const webhookPageSchema = pageSchema(webhookEndpointSchema);

const dialecticResponseSchema = z.object({
  content: z.string().nullable(),
});

export type Workspace = z.infer<typeof workspaceSchema>;
export type Peer = z.infer<typeof peerSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Conclusion = z.infer<typeof conclusionSchema>;
export type PeerContext = z.infer<typeof peerContextSchema>;
export type WorkspacePage = z.infer<typeof workspacePageSchema>;
export type PeerPage = z.infer<typeof peerPageSchema>;
export type SessionPage = z.infer<typeof sessionPageSchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;
export type ConclusionPage = z.infer<typeof conclusionPageSchema>;
export type QueueStatus = z.infer<typeof queueStatusSchema>;
export type Summary = z.infer<typeof summarySchema>;
export type SessionSummaries = z.infer<typeof sessionSummariesSchema>;
export type SessionContext = z.infer<typeof sessionContextSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type ScopeStatus = z.infer<typeof scopeStatusSchema>;
export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;
export type ScopePage = z.infer<typeof scopePageSchema>;
export type WebhookPage = z.infer<typeof webhookPageSchema>;

export type ConclusionFilters = {
  observer_id?: string;
  observed_id?: string;
  session_id?: string;
  level?: Conclusion["level"];
  /** Case-insensitive substring match on conclusion content (Honcho `icontains`). */
  contains?: string;
};

export type SessionFilters = {
  /** Case-insensitive substring match on the session id (Honcho `icontains`). */
  id_contains?: string;
};

export const MAX_TEXT_FILTER_LENGTH = 500;

function boundedTextFilter(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TEXT_FILTER_LENGTH) {
    throw new Error(`Text filter must be between 1 and ${MAX_TEXT_FILTER_LENGTH} characters.`);
  }
  return trimmed;
}

export const REASONING_LEVELS = ["minimal", "low", "medium", "high", "max"] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];
export type DreamType = "omni" | "card_refresh";
export const MAX_DIALECTIC_QUERY_LENGTH = 10_000;

export type ConclusionSearchFilters = {
  observer: string;
  observed: string;
  level?: Conclusion["level"];
};

export const MAX_PEER_CARD_FACTS = 512;
export const MAX_PEER_CARD_FACT_LENGTH = 2_000;
export const MAX_PEER_CARD_BYTES = 256_000;
export const MAX_WORKSPACE_DISCOVERY_PAGES = 20;
export const MAX_WORKSPACE_DISCOVERY_ITEMS = MAX_WORKSPACE_DISCOVERY_PAGES * 100;

export type WorkspaceDiscovery = {
  items: Workspace[];
  truncated: boolean;
};

function collectWorkspacePage(items: Workspace[], page: WorkspacePage): Workspace[] {
  return [...items, ...page.items].slice(0, MAX_WORKSPACE_DISCOVERY_ITEMS);
}

export function parseWorkspaceId(value: string): string {
  return parseResourceId(value, "workspace");
}

export function parseResourceId(value: string, label = "resource"): string {
  const resource = value.trim();
  if (!/^[a-zA-Z0-9_-]{1,512}$/.test(resource)) {
    throw new Error(`Invalid ${label} identifier.`);
  }
  return resource;
}

function parsePage(value: string | null, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error("Invalid pagination value.");
  }
  return parsed;
}

function pageParams(page: number, size: number): string {
  return `page=${parsePage(String(page), 1)}&size=${parsePage(String(size), 50, 100)}`;
}

function validateSessionId(value: string): string {
  return parseResourceId(value, "session");
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

export class HonchoClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;

  constructor(config: HonchoConfig) {
    this.#apiKey = config.apiKey;
    this.#baseUrl = config.baseUrl;
  }

  async listWorkspaces(): Promise<WorkspacePage> {
    return this.request(
      `/v3/workspaces/list?page=1&size=100`,
      "POST",
      {},
      workspacePageSchema,
    );
  }

  async listAllWorkspaces(): Promise<WorkspaceDiscovery> {
    const first = await this.listWorkspaces();
    const pageLimit = Math.min(first.pages, MAX_WORKSPACE_DISCOVERY_PAGES);
    let items = first.items.slice(0, MAX_WORKSPACE_DISCOVERY_ITEMS);
    for (let page = 2; page <= pageLimit && items.length < MAX_WORKSPACE_DISCOVERY_ITEMS; page += 1) {
      const nextPage = await this.request(
        `/v3/workspaces/list?page=${page}&size=100`,
        "POST",
        {},
        workspacePageSchema,
      );
      items = collectWorkspacePage(items, nextPage);
    }
    return {
      items,
      truncated: first.pages > pageLimit || first.total > MAX_WORKSPACE_DISCOVERY_ITEMS,
    };
  }

  async listPeers(workspace: string, page = 1, size = 100): Promise<PeerPage> {
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/peers/list?${pageParams(page, size)}`,
      "POST",
      {},
      peerPageSchema,
    );
  }

  async listSessions(workspace: string, page = 1, size = 50, filters?: SessionFilters): Promise<SessionPage> {
    const body = filters?.id_contains !== undefined
      ? { filters: { id: { icontains: boundedTextFilter(filters.id_contains) } } }
      : {};
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/sessions/list?${pageParams(page, size)}`,
      "POST",
      body,
      sessionPageSchema,
    );
  }

  async deleteSession(workspace: string, sessionId: string): Promise<void> {
    const session = validateSessionId(sessionId);
    // Honcho answers 202 Accepted and finishes the deletion asynchronously via its queue.
    await this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/sessions/${pathSegment(session)}`,
      "DELETE",
      undefined,
      z.unknown(),
    );
  }

  async deleteWebhook(workspace: string, endpointId: string): Promise<void> {
    const endpoint = parseResourceId(endpointId, "webhook");
    await this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/webhooks/${pathSegment(endpoint)}`,
      "DELETE",
      undefined,
      z.unknown(),
    );
  }

  async listConclusions(
    workspace: string,
    options: { page?: number; size?: number; filters?: ConclusionFilters } = {},
  ): Promise<ConclusionPage> {
    const { page = 1, size = 50, filters = {} } = options;
    const { contains, ...columnFilters } = filters;
    const upstreamFilters: Record<string, unknown> = { ...columnFilters };
    if (contains !== undefined) upstreamFilters.content = { icontains: boundedTextFilter(contains) };
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/conclusions/list?${pageParams(page, size)}`,
      "POST",
      { filters: upstreamFilters },
      conclusionPageSchema,
    );
  }

  async queryConclusions(
    workspace: string,
    query: string,
    filters: ConclusionSearchFilters,
    topK = 20,
  ): Promise<Conclusion[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery.length > 500) {
      throw new Error("Search query must be between 1 and 500 characters.");
    }
    const boundedTopK = Number.isFinite(topK) && topK > 0
      ? Math.min(Math.max(Math.trunc(topK), 1), 100)
      : 20;
    const observer = parseResourceId(filters.observer, "observer");
    const observed = parseResourceId(filters.observed, "observed");
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/conclusions/query`,
      "POST",
      {
        query: normalizedQuery,
        top_k: boundedTopK,
        filters: {
          observer,
          observed,
          ...(filters.level ? { level: filters.level } : {}),
        },
      },
      z.array(conclusionSchema),
    );
  }

  async createConclusion(
    workspace: string,
    input: {
      content: string;
      observer_id: string;
      observed_id: string;
      session_id?: string | null;
    },
  ): Promise<Conclusion> {
    const content = input.content.trim();
    if (!content || content.length > 65_535) {
      throw new Error("Memory content must be between 1 and 65,535 characters.");
    }
    const observer = parseResourceId(input.observer_id, "observer");
    const observed = parseResourceId(input.observed_id, "observed");
    const session = input.session_id === undefined || input.session_id === null
      ? null
      : parseResourceId(input.session_id, "session");
    const result = await this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/conclusions`,
      "POST",
      {
        conclusions: [
          {
            content,
            observer_id: observer,
            observed_id: observed,
            session_id: session,
          },
        ],
      },
      z.array(conclusionSchema),
    );
    const created = result[0];
    if (!created) {
      throw new Error("Honcho created no conclusion.");
    }
    return created;
  }

  async deleteConclusion(workspace: string, conclusionId: string): Promise<void> {
    await this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/conclusions/${pathSegment(conclusionId)}`,
      "DELETE",
      undefined,
      z.undefined(),
    );
  }

  async getPeerContext(
    workspace: string,
    observerId: string,
    targetId?: string,
  ): Promise<PeerContext> {
    const observer = parseResourceId(observerId, "peer");
    const target = targetId === undefined ? undefined : parseResourceId(targetId, "target");
    const query = target ? `?target=${pathSegment(target)}` : "";
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/peers/${pathSegment(observer)}/context${query}`,
      "GET",
      undefined,
      peerContextSchema,
    );
  }

  async setPeerCard(
    workspace: string,
    observerId: string,
    facts: string[],
    targetId?: string,
  ): Promise<PeerContext["peer_card"]> {
    const observer = parseResourceId(observerId, "peer");
    const target = targetId === undefined ? undefined : parseResourceId(targetId, "target");
    const query = target ? `?target=${pathSegment(target)}` : "";
    const cleanFacts = facts.map((fact) => fact.trim()).filter(Boolean);
    if (cleanFacts.some((fact) => fact.length > MAX_PEER_CARD_FACT_LENGTH)) {
      throw new Error(`Peer card facts must be at most ${MAX_PEER_CARD_FACT_LENGTH} characters.`);
    }
    const serializedFacts = JSON.stringify(cleanFacts);
    if (cleanFacts.length > MAX_PEER_CARD_FACTS || new TextEncoder().encode(serializedFacts).length > MAX_PEER_CARD_BYTES) {
      throw new Error(`Peer card must contain at most ${MAX_PEER_CARD_FACTS} facts and ${MAX_PEER_CARD_BYTES.toLocaleString()} serialized bytes.`);
    }
    const result = await this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/peers/${pathSegment(observer)}/card${query}`,
      "PUT",
      { peer_card: cleanFacts },
      z.object({ peer_card: z.array(z.string()).nullable() }),
    );
    return result.peer_card;
  }

  async listMessages(
    workspace: string,
    sessionId: string,
    page = 1,
    size = 50,
  ): Promise<MessagePage> {
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/sessions/${pathSegment(validateSessionId(sessionId))}/messages/list?${pageParams(page, size)}`,
      "POST",
      {},
      messagePageSchema,
    );
  }

  async getQueueStatus(workspace: string): Promise<QueueStatus> {
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/queue/status`,
      "GET",
      undefined,
      queueStatusSchema,
    );
  }

  async chatWithPeer(
    workspace: string,
    peerId: string,
    options: { query: string; target?: string; sessionId?: string; reasoningLevel?: ReasoningLevel; stream?: boolean },
  ): Promise<{ content: string | null } | Response> {
    const query = options.query.trim();
    if (!query || query.length > MAX_DIALECTIC_QUERY_LENGTH) {
      throw new Error(`Chat query must be between 1 and ${MAX_DIALECTIC_QUERY_LENGTH.toLocaleString()} characters.`);
    }
    const observer = parseResourceId(peerId, "peer");
    const reasoningLevel = options.reasoningLevel ?? "low";
    if (!REASONING_LEVELS.includes(reasoningLevel)) {
      throw new Error(`Unsupported reasoning level: ${String(reasoningLevel)}.`);
    }
    const body: Record<string, unknown> = {
      query,
      stream: options.stream === true,
      reasoning_level: reasoningLevel,
    };
    if (options.target !== undefined && options.target !== "") {
      body.target = parseResourceId(options.target, "target");
    }
    if (options.sessionId !== undefined && options.sessionId !== "") {
      body.session_id = parseResourceId(options.sessionId, "session");
    }
    if (options.stream === true) {
      return this.request(
        `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/peers/${pathSegment(observer)}/chat`,
        "POST",
        body,
        z.any(),
        120_000,
        true,
      ) as Promise<Response>;
    }
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/peers/${pathSegment(observer)}/chat`,
      "POST",
      body,
      dialecticResponseSchema,
      120_000,
    );
  }

  async getWorkingRepresentation(
    workspace: string,
    peerId: string,
    options: {
      target?: string;
      sessionId?: string;
      searchQuery?: string;
      searchTopK?: number;
      searchMaxDistance?: number;
      includeMostFrequent?: boolean;
      maxConclusions?: number;
    } = {},
  ): Promise<{ representation: string }> {
    const observer = parseResourceId(peerId, "peer");
    const searchTopK = options.searchTopK;
    if (searchTopK !== undefined && !Number.isFinite(searchTopK)) {
      throw new Error("search_top_k must be a finite number.");
    }
    const maxConclusions = options.maxConclusions;
    if (maxConclusions !== undefined && !Number.isFinite(maxConclusions)) {
      throw new Error("max_conclusions must be a finite number.");
    }
    const searchMaxDistance = options.searchMaxDistance;
    if (searchMaxDistance !== undefined && !Number.isFinite(searchMaxDistance)) {
      throw new Error("search_max_distance must be a finite number.");
    }
    const body: Record<string, unknown> = {};
    if (options.target !== undefined && options.target !== "") {
      body.target = parseResourceId(options.target, "target");
    }
    if (options.sessionId !== undefined && options.sessionId !== "") {
      body.session_id = parseResourceId(options.sessionId, "session");
    }
    if (options.searchQuery !== undefined && options.searchQuery !== "") {
      body.search_query = options.searchQuery;
      if (searchTopK !== undefined) body.search_top_k = Math.min(Math.max(Math.trunc(searchTopK), 1), 100);
      if (maxConclusions !== undefined) body.max_conclusions = Math.min(Math.max(Math.trunc(maxConclusions), 1), 100);
      if (searchMaxDistance !== undefined) body.search_max_distance = Math.min(Math.max(searchMaxDistance, 0), 1);
      if (options.includeMostFrequent !== undefined) body.include_most_frequent = options.includeMostFrequent;
    }
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/peers/${pathSegment(observer)}/representation`,
      "POST",
      body,
      workingRepresentationSchema,
      60_000,
    );
  }

  async listSessionSummaries(workspace: string, sessionId: string): Promise<SessionSummaries> {
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/sessions/${pathSegment(validateSessionId(sessionId))}/summaries`,
      "GET",
      undefined,
      sessionSummariesSchema,
    );
  }

  async getSessionContext(workspace: string, sessionId: string): Promise<SessionContext> {
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/sessions/${pathSegment(validateSessionId(sessionId))}/context`,
      "GET",
      undefined,
      sessionContextSchema,
    );
  }

  async listScopes(workspace: string, page = 1, size = 100): Promise<ScopePage> {
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/scopes/list?${pageParams(page, size)}`,
      "POST",
      { filters: {} },
      scopePageSchema,
    );
  }

  async listAllScopes(workspace: string): Promise<{ items: Scope[]; total: number; truncated: boolean }> {
    const first = await this.listScopes(workspace, 1, 100);
    const pageLimit = Math.min(first.pages, MAX_WORKSPACE_DISCOVERY_PAGES);
    let items = first.items.slice(0, MAX_WORKSPACE_DISCOVERY_ITEMS);
    for (let page = 2; page <= pageLimit && items.length < MAX_WORKSPACE_DISCOVERY_ITEMS; page += 1) {
      const next = await this.listScopes(workspace, page, 100);
      items = [...items, ...next.items].slice(0, MAX_WORKSPACE_DISCOVERY_ITEMS);
    }
    return { items, total: first.total, truncated: first.pages > pageLimit || first.total > items.length };
  }

  async listScopeSessions(workspace: string, scopeId: string, page = 1, size = 100): Promise<SessionPage> {
    const scope = parseResourceId(scopeId, "scope");
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/scopes/${pathSegment(scope)}/sessions/list?${pageParams(page, size)}`,
      "POST",
      {},
      sessionPageSchema,
    );
  }

  async getScopeStatus(workspace: string, scopeId: string): Promise<ScopeStatus> {
    const scope = parseResourceId(scopeId, "scope");
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/scopes/${pathSegment(scope)}/status`,
      "GET",
      undefined,
      scopeStatusSchema,
    );
  }

  async listWebhooks(workspace: string, page = 1, size = 100): Promise<WebhookPage> {
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/webhooks?${pageParams(page, size)}`,
      "GET",
      undefined,
      webhookPageSchema,
    );
  }

  async searchMessages(workspace: string, query: string, limit = 20): Promise<Message[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery.length > 500) {
      throw new Error("Search query must be between 1 and 500 characters.");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Search limit must be between 1 and 100.");
    }
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/search`,
      "POST",
      { query: normalizedQuery, limit },
      z.array(messageSchema),
    );
  }

  async searchPeerMessages(workspace: string, peerId: string, query: string, limit = 20): Promise<Message[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery.length > 500) {
      throw new Error("Search query must be between 1 and 500 characters.");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Search limit must be between 1 and 100.");
    }
    const observer = parseResourceId(peerId, "peer");
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/peers/${pathSegment(observer)}/search`,
      "POST",
      { query: normalizedQuery, limit },
      z.array(messageSchema),
    );
  }

  async scheduleDream(
    workspace: string,
    input: { observer: string; observed?: string; dreamType: DreamType; sessionId?: string; rebuild?: boolean },
  ): Promise<void> {
    const observer = parseResourceId(input.observer, "observer");
    if (input.dreamType !== "omni" && input.dreamType !== "card_refresh") {
      throw new Error(`Unsupported dream type: ${String(input.dreamType)}.`);
    }
    const body: Record<string, unknown> = {
      observer,
      dream_type: input.dreamType,
      rebuild: Boolean(input.rebuild),
    };
    if (input.observed !== undefined && input.observed !== "") {
      body.observed = parseResourceId(input.observed, "observed");
    }
    if (input.sessionId !== undefined && input.sessionId !== "") {
      body.session_id = parseResourceId(input.sessionId, "session");
    }
    await this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/schedule_dream`,
      "POST",
      body,
      z.undefined(),
    );
  }

  private async request<T extends z.ZodType>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body: unknown,
    schema: T,
    timeoutMs = 15_000,
    raw = false,
  ): Promise<z.infer<T>> {
    const response = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const payload = (await response.json()) as { detail?: unknown };
        if (typeof payload.detail === "string") {
          const boundedDetail = payload.detail
            .replace(/bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
            .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted]")
            .replace(/((?:token|jwt|api[_ -]?key|authorization))\s*(?::|=)\s*(?:bearer\s+)?[^\s,;]+/gi, "$1=[redacted]")
            .slice(0, 500);
          detail = boundedDetail ? ` ${boundedDetail}` : "";
        }
      } catch {
        // Keep the status-only error when Honcho does not return JSON.
      }
      throw new Error(`Honcho returned HTTP ${response.status}.${detail}`);
    }

    if (raw) {
      return response as z.infer<T>;
    }

    if (response.status === 204 || (response.status === 202 && method === "DELETE")) {
      // Drain/cancel the body so the keep-alive socket is released.
      await response.body?.cancel().catch(() => undefined);
      return undefined as z.infer<T>;
    }

    return schema.parse(await response.json());
  }
}
