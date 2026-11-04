import { useEffect, useMemo, useState } from "react";
import { Layers, Link2, LoaderCircle, RefreshCw, Sparkles, Trash2, Webhook } from "lucide-react";

import type { SessionContext as SessionContextPayload, ScopeStatus, WebhookEndpoint } from "@/lib/honcho-client";

const LEVEL_COLORS: Record<string, string> = {
  explicit: "var(--accent-mint)",
  deductive: "var(--accent-violet)",
  inductive: "var(--accent-amber)",
  contradiction: "var(--accent-red)",
};

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with HTTP ${response.status}.`);
  }
  return payload;
}

function compactId(value: string, length = 18): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function formatDate(value: string): string {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function panelIntro(title: string, eyebrow: string, body: string) {
  return (
    <section className="section-intro">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// F1: Session context (read-only "what would be injected" view)
// ---------------------------------------------------------------------------

export function SessionContextPanel({ workspace, sessionId }: { workspace: string; sessionId: string }) {
  const [context, setContext] = useState<SessionContextPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchContext = async (signal?: AbortSignal) => {
    try {
      const payload = await apiFetch<{ session_context: SessionContextPayload }>(`/api/${encodeURIComponent(workspace)}/sessions/${encodeURIComponent(sessionId)}/context`, {
        signal,
      });
      setContext(payload.session_context);
      setError("");
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load session context.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ session_context: SessionContextPayload }>(`/api/${encodeURIComponent(workspace)}/sessions/${encodeURIComponent(sessionId)}/context`, {
      signal: controller.signal,
    })
      .then((payload) => { setContext(payload.session_context); setError(""); })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load session context.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspace, sessionId]);

  const reload = () => {
    setLoading(true);
    setError("");
    void fetchContext();
  };

  return (
    <div className="summaries-panel" aria-label="Session context">
      <div className="panel-heading context-panel-heading">
        <div><span className="eyebrow">INJECTED VIEW</span><h3>Session context</h3></div>
        <button className="text-button" type="button" onClick={reload} aria-label="Reload session context"><RefreshCw size={14} aria-hidden="true" /></button>
      </div>
      {error ? <span className="muted journal-empty">{error}</span> : null}
      {loading && !context && !error ? <span className="muted journal-empty">Loading context…</span> : null}
      {!loading && !error && context && context.messages.length === 0 && !context.summary && !context.peer_representation && !(context.peer_card?.length) ? <span className="muted journal-empty">No context assembled for this session yet.</span> : null}
      {!loading && !error && !context ? <span className="muted journal-empty">No context assembled for this session yet.</span> : null}
      {context ? (
        <div className="session-context-blocks">
          {context.summary ? (
            <details className="summary-block" open>
              <summary>Context summary <span className="mono">{context.summary.token_count} tok</span></summary>
              <p>{context.summary.content}</p>
            </details>
          ) : null}
          {context.peer_representation ? (
            <details className="summary-block" open>
              <summary>Peer representation <span className="mono">derived</span></summary>
              <p className="mono-wrap">{context.peer_representation}</p>
            </details>
          ) : null}
          {context.peer_card?.length ? (
            <details className="summary-block">
              <summary>Peer card <span className="mono">{context.peer_card.length} facts</span></summary>
              <ul className="peer-card-facts">
                {context.peer_card.map((fact, index) => <li key={`${fact}-${index}`}>{fact}</li>)}
              </ul>
            </details>
          ) : null}
          <div className="muted stats-note">
            {context.messages.length} message{context.messages.length === 1 ? "" : "s"} included in this context window. Summary and representation blocks are generated views, not stored memory.
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// F2: Memory triage (analysis-only duplicate groups)
// ---------------------------------------------------------------------------

type TriageGroup = {
  observer_id: string;
  observed_id: string;
  maxSimilarity: number;
  members: Array<{ id: string; level: string; times_derived: number | null; created_at: string; content: string }>;
};

type TriagePayload = {
  analyzed: number;
  totalAvailable: number;
  truncated: boolean;
  groups: TriageGroup[];
};

export function TriagePanel({ workspace }: { workspace: string }) {
  const [payload, setPayload] = useState<TriagePayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const fetchTriage = async (signal?: AbortSignal) => {
    try {
      const data = await apiFetch<TriagePayload>(`/api/${encodeURIComponent(workspace)}/triage?limit=100`, { signal });
      setPayload(data);
      setError("");
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load memory triage.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<TriagePayload>(`/api/${encodeURIComponent(workspace)}/triage?limit=100`, { signal: controller.signal })
      .then((data) => { setPayload(data); setError(""); })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load memory triage.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspace]);

  const reload = () => {
    setLoading(true);
    setError("");
    void fetchTriage();
  };

  const deleteOne = async (memoryId: string, refresh: boolean) => {
    if (!window.confirm(`Delete this conclusion? This cannot be undone and is recorded in the change journal.\n\n${memoryId}`)) return;
    setBusyIds((current) => new Set(current).add(memoryId));
    try {
      await apiFetch<never>(`/api/${encodeURIComponent(workspace)}/memories/${encodeURIComponent(memoryId)}`, { method: "DELETE" });
      if (refresh) void fetchTriage();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the conclusion.");
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(memoryId);
        return next;
      });
    }
  };

  const keepOldest = async (group: TriageGroup) => {
    const [oldest, ...duplicates] = group.members;
    if (!oldest || duplicates.length === 0) return;
    if (!window.confirm(`Keep the oldest memory and delete ${duplicates.length} near-duplicate(s)? Each deletion is confirmed separately in this dialog and recorded in the change journal.`)) return;
    for (const member of duplicates) {
      setBusyIds((current) => new Set(current).add(member.id));
      try {
        await apiFetch<never>(`/api/${encodeURIComponent(workspace)}/memories/${encodeURIComponent(member.id)}`, { method: "DELETE" });
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the conclusion.");
        break;
      } finally {
        setBusyIds((current) => {
          const next = new Set(current);
          next.delete(member.id);
          return next;
        });
      }
    }
    void fetchTriage();
  };

  return (
    <section className="panel triage-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">CURATION</span><h2>Memory triage</h2></div>
        <button className="text-button" type="button" onClick={reload} disabled={loading} aria-label="Reload triage"><RefreshCw size={15} className={loading ? "spin" : ""} aria-hidden="true" /></button>
      </div>
      <p className="panel-help">Near-duplicate conclusions detected server-side from a bounded scan (similarity threshold 0.8, by observer pair). Analysis is read-only; deletions require confirmation and are journaled.</p>
      {error ? <span className="muted journal-empty">{error}</span> : null}
      {loading && !payload && !error ? <span className="muted journal-empty">Scanning for near-duplicates…</span> : null}
      {payload && payload.groups.length === 0 ? <span className="muted journal-empty">No near-duplicate groups found in the scanned window.</span> : null}
      {payload ? (
        <>
          <div className="triage-groups">
            {payload.groups.map((group, index) => (
              <div className="triage-group" key={`${group.observer_id}-${group.observed_id}-${index}`}>
                <div className="triage-group-head">
                  <span className="mono">{compactId(group.observer_id, 14)} → {compactId(group.observed_id, 14)}</span>
                  <span className="state-badge">{(group.maxSimilarity * 100).toFixed(0)}% similar</span>
                  <button className="button button-quiet button-small" type="button" onClick={() => void keepOldest(group)} disabled={busyIds.size > 0}>Keep oldest, delete {group.members.length - 1}</button>
                </div>
                <div className="triage-members">
                  {group.members.map((member) => (
                    <article className="triage-member" key={member.id}>
                      <div className="triage-member-meta">
                        <span className={`level-badge level-${member.level}`}>{member.level}</span>
                        <span className="mono">{member.times_derived ?? 0}× derived</span>
                        <span>{formatDate(member.created_at)}</span>
                        <span className="mono triage-id">{compactId(member.id, 12)}</span>
                      </div>
                      <p>{member.content}</p>
                      <button className="button button-danger button-small" type="button" disabled={busyIds.has(member.id)} onClick={() => void deleteOne(member.id, true)}>
                        {busyIds.has(member.id) ? <LoaderCircle size={13} className="spin" aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />} Delete
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {payload.truncated ? <p className="muted stats-note">Scanned the {payload.analyzed.toLocaleString()} most recent of {payload.totalAvailable.toLocaleString()} conclusions; older records are not in this analysis.</p> : <p className="muted stats-note">{payload.analyzed.toLocaleString()} conclusions scanned.</p>}
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// F3: Memory growth (per-day x level + observer breakdown, SVG, no deps)
// ---------------------------------------------------------------------------

type GrowthBucket = { date: string; levels: Record<string, number> };
type ObserverBucket = { date: string; observers: Record<string, number> };

export function GrowthChart({ dailyByLevel = [], dailyByObserver = [] }: { dailyByLevel?: GrowthBucket[]; dailyByObserver?: ObserverBucket[] }) {
  const totals = useMemo(() => dailyByLevel.map((bucket) => Object.values(bucket.levels).reduce((sum, count) => sum + count, 0)), [dailyByLevel]);
  const max = Math.max(1, ...totals);
  const observerTotals = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bucket of dailyByObserver) {
      for (const [observer, count] of Object.entries(bucket.observers)) {
        counts.set(observer, (counts.get(observer) ?? 0) + count);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [dailyByObserver]);
  const width = 600;
  const height = 110;
  const barWidth = Math.max(2, (width / Math.max(1, dailyByLevel.length)) - 3);
  const levels = ["explicit", "deductive", "inductive", "contradiction"];

  return (
    <div className="growth-chart">
      <span className="eyebrow">Conclusions per day · last 30 days · by level</span>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stacked bar chart of conclusions per day by reasoning level" className="growth-svg">
        {dailyByLevel.map((bucket, index) => {
          const x = index * (barWidth + 3);
          let y = height;
          return (
            <g key={bucket.date}>
              {levels.map((level) => {
                const count = bucket.levels[level] ?? 0;
                if (count === 0) return null;
                const barHeight = (count / max) * (height - 4);
                y -= barHeight;
                return <rect key={level} x={x} y={y} width={barWidth} height={Math.max(1, barHeight)} fill={LEVEL_COLORS[level]} />;
              })}
            </g>
          );
        })}
      </svg>
      <div className="growth-legend">
        {levels.map((level) => <span key={level} className="growth-legend-item"><span className="growth-swatch" style={{ background: LEVEL_COLORS[level] }} />{level}</span>)}
      </div>
      <div className="stats-toplists">
        <div>
          <span className="eyebrow">Top observers · 30 days</span>
          {observerTotals.map(([observer, count]) => <span className="mono stat-topline" key={observer}>{compactId(observer, 16)} · {count.toLocaleString()}</span>)}
          {observerTotals.length === 0 ? <span className="muted">None</span> : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// F7: Scopes (read-only membership + status)
// ---------------------------------------------------------------------------

type ScopeInfo = { id: string; created_at: string; session_count: number | null };
type ScopeDetail = {
  scope: ScopeInfo | null;
  sessions: Array<{ id: string; is_active: boolean; created_at: string }>;
  session_total: number;
  status: ScopeStatus;
};

export function ScopesView({ workspace }: { workspace: string }) {
  const [scopes, setScopes] = useState<ScopeInfo[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScopeDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ scopes: ScopeInfo[]; total: number; truncated: boolean }>(`/api/${encodeURIComponent(workspace)}/scopes`, { signal: controller.signal })
      .then((payload) => { setScopes(payload.scopes); setError(""); })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to list scopes.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspace]);

  const loadDetail = async (scopeId: string) => {
    setSelectedId(scopeId);
    setDetail(null);
    try {
      const payload = await apiFetch<ScopeDetail>(`/api/${encodeURIComponent(workspace)}/scopes/${encodeURIComponent(scopeId)}`);
      setDetail(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load scope details.");
    }
  };

  return (
    <div className="page-grid">
      {panelIntro("Scopes", `SCOPES / ${scopes?.length ?? "…"}`, "Named session groupings that bound recall. Read-only membership and backfill status; editing scopes is not exposed by this console.")}
      {error ? <span className="muted journal-empty">{error}</span> : null}
      <section className="scopes-layout">
        <div className="panel session-list-panel">
          <div className="panel-heading"><div><span className="eyebrow">SCOPES</span><h2>{scopes?.length ?? 0} total</h2></div><Layers size={18} aria-hidden="true" /></div>
          {loading && !scopes ? <span className="muted journal-empty">Loading scopes…</span> : null}
          <div className="session-list">
            {scopes?.map((scope) => (
              <button className={`session-list-row ${selectedId === scope.id ? "session-selected" : ""}`} type="button" key={scope.id} onClick={() => void loadDetail(scope.id)}>
                <span className="session-pip session-live" />
                <span className="session-list-copy"><strong>{scope.id}</strong><small>{formatDate(scope.created_at)}</small></span>
                <span className="mono">{scope.session_count ?? "?"} sessions</span>
              </button>
            ))}
            {scopes && scopes.length === 0 ? <span className="muted journal-empty">No scopes exist in this workspace.</span> : null}
          </div>
        </div>
        <div className="panel messages-panel">
          <div className="panel-heading"><div><span className="eyebrow">MEMBERSHIP</span><h2>{selectedId ?? "Select a scope"}</h2></div><Link2 size={17} aria-hidden="true" /></div>
          {detail ? (
            <>
              {detail.sessions.length > 0 ? <div className="mini-session-list">{detail.sessions.map((session) => <div className="mini-session" key={session.id}><span className={`session-pip ${session.is_active ? "session-live" : ""}`} /><div><strong>{compactId(session.id, 24)}</strong><span>{formatDate(session.created_at)}</span></div><span className="mono">{session.is_active ? "ACTIVE" : "CLOSED"}</span></div>)}</div> : <span className="muted journal-empty">No sessions are members of this scope.</span>}
              <div className="muted stats-note">Backfill status: {Object.keys(detail.status.backfill_status).length > 0 ? Object.entries(detail.status.backfill_status).map(([session, state]) => `${compactId(session, 10)}: ${String((state as { state?: string }).state ?? "unknown")}`).join(" · ") : "no backfill jobs recorded"}</div>
            </>
          ) : <span className="muted journal-empty">Choose a scope to inspect its sessions and backfill state.</span>}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// F8: Webhooks (read-only listing)
// ---------------------------------------------------------------------------

export function WebhooksView({ workspace }: { workspace: string }) {
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ webhooks: WebhookEndpoint[]; total: number }>(`/api/${encodeURIComponent(workspace)}/webhooks`, { signal: controller.signal })
      .then((payload) => { setWebhooks(payload.webhooks); setError(""); })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to list webhooks.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspace]);

  return (
    <div className="page-grid">
      {panelIntro("Webhooks", "WEBHOOKS / OUTBOUND", "Endpoints this Honcho instance calls on queue activity. Read-only audit view; creating, testing, or deleting endpoints is not exposed by this console.")}
      {error ? <span className="muted journal-empty">{error}</span> : null}
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">ENDPOINTS</span><h2>{webhooks?.length ?? 0} configured</h2></div><Webhook size={18} aria-hidden="true" /></div>
        {loading && !webhooks && !error ? <span className="muted journal-empty">Loading webhooks…</span> : null}
        <div className="mini-session-list">
          {webhooks?.map((webhook) => (
            <div className="mini-session" key={webhook.id}>
              <span className="session-pip session-live" />
              <div><strong className="mono">{webhook.id}</strong><span className="mono-wrap">{webhook.url}</span></div>
              <span>{formatDate(webhook.created_at)}</span>
            </div>
          ))}
          {webhooks && webhooks.length === 0 ? <span className="muted journal-empty">No webhook endpoints are configured for this workspace.</span> : null}
        </div>
        <p className="panel-help"><Sparkles size={13} aria-hidden="true" /> Read-only: credentials and signed payloads are never fetched or rendered by this console.</p>
      </section>
    </div>
  );
}

// Re-export used by the dashboard for icon consistency.
export const TriageIcon = Sparkles;