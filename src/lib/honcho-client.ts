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

export type ConclusionFilters = {
  observer_id?: string;
  observed_id?: string;
  level?: Conclusion["level"];
};

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

  async listSessions(workspace: string, page = 1, size = 50): Promise<SessionPage> {
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/sessions/list?${pageParams(page, size)}`,
      "POST",
      {},
      sessionPageSchema,
    );
  }

  async listConclusions(
    workspace: string,
    options: { page?: number; size?: number; filters?: ConclusionFilters } = {},
  ): Promise<ConclusionPage> {
    const { page = 1, size = 50, filters = {} } = options;
    return this.request(
      `/v3/workspaces/${pathSegment(parseWorkspaceId(workspace))}/conclusions/list?${pageParams(page, size)}`,
      "POST",
      { filters },
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

  private async request<T extends z.ZodType>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body: unknown,
    schema: T,
  ): Promise<z.infer<T>> {
    const response = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
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

    if (response.status === 204) {
      return undefined as z.infer<T>;
    }

    return schema.parse(await response.json());
  }
}
