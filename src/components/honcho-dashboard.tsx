"use client";

import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Database,
  FileText,
  Filter,
  LoaderCircle,
  MessageSquareText,
  Network,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  Conclusion,
  ConclusionPage,
  Message,
  MessagePage,
  Peer,
  PeerContext,
  Session,
} from "@/lib/honcho-client";
import { compactId, formatDate, jsonPreview } from "@/lib/format";

type Section = "overview" | "memories" | "peers" | "sessions";
type Level = "all" | Conclusion["level"];

type StatusPayload = {
  ok: boolean;
  baseUrl?: string;
  isRemote?: boolean;
  configuredWorkspace?: string | null;
  selectedWorkspace?: string | null;
  workspaces?: Array<{ id: string; created_at: string | null }>;
  error?: string;
  workspaceListing?: "available" | "configured" | "truncated" | "unauthorized" | "unavailable";
};

type PeerPagePayload = { items: Peer[]; total: number; page: number; size: number; pages: number };
type SessionPagePayload = { items: Session[]; total: number; page: number; size: number; pages: number };

type WorkspacePayload = {
  workspace: string;
  peers: PeerPagePayload;
  sessions: SessionPagePayload;
  conclusions: ConclusionPage;
  queue: { pending_work_units: number; total_work_units: number; completed_work_units: number; in_progress_work_units: number };
};
type RecentFilter = { observer_id?: string; observed_id?: string };
type PeerOptions = { items: Peer[]; total: number; page: number; size: number; pages: number };

const PEER_OPTION_PAGE_SIZE = 100;
const MAX_PEER_OPTION_PAGES = 20;

function peerOptionPageUrl(workspace: string, page: number) {
  return `/api/${encodeURIComponent(workspace)}/peers?page=${page}&size=${PEER_OPTION_PAGE_SIZE}`;
}

function mergePeerPages(pages: PeerOptions[]) {
  return pages.flatMap((page) => page.items).slice(0, MAX_PEER_OPTION_PAGES * PEER_OPTION_PAGE_SIZE);
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with HTTP ${response.status}.`);
  }
  return payload;
}

function sectionTitle(section: Section): string {
  return {
    overview: "Workspace overview",
    memories: "Memory browser",
    peers: "Peer context",
    sessions: "Session archive",
  }[section];
}

function StatCard({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
  accent: "mint" | "violet" | "amber" | "blue";
}) {
  return (
    <article className={`stat-card stat-${accent}`}>
      <div className="stat-card-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-detail">{detail}</span>
    </article>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <AlertTriangle size={17} aria-hidden="true" />
      <span>{message}</span>
      {onRetry ? (
        <button className="button button-quiet" type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="loading-stack" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export function HonchoDashboard() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [workspace, setWorkspace] = useState("");
  const [workspaceDraft, setWorkspaceDraft] = useState("");
  const [workspaceData, setWorkspaceData] = useState<WorkspacePayload | null>(null);
  const [statusError, setStatusError] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const workspaceRequestRef = useRef(0);
  const selectedWorkspaceRef = useRef("");
  const workspaceViewGenerationRef = useRef(0);
  const refreshRequestRef = useRef(0);
  const workspaceInitializedRef = useRef(false);
  const preferredWorkspaceRef = useRef<string | null>(null);

  const readPreferredWorkspace = useCallback(() => {
    if (preferredWorkspaceRef.current !== null) return preferredWorkspaceRef.current;
    try {
      const candidate = window.localStorage.getItem("honcho-console.workspace")?.trim() ?? "";
      preferredWorkspaceRef.current = /^[a-zA-Z0-9_-]{1,512}$/.test(candidate) ? candidate : "";
    } catch {
      preferredWorkspaceRef.current = "";
    }
    return preferredWorkspaceRef.current;
  }, []);

  const persistPreferredWorkspace = useCallback((workspaceId: string) => {
    preferredWorkspaceRef.current = workspaceId;
    try {
      window.localStorage.setItem("honcho-console.workspace", workspaceId);
    } catch {
      // localStorage can be unavailable in privacy-restricted browser contexts.
    }
  }, []);

  const loadWorkspace = useCallback(async (workspaceId: string) => {
    if (!workspaceId) return;
    const requestId = ++workspaceRequestRef.current;
    selectedWorkspaceRef.current = workspaceId;
    setLoadingWorkspace(true);
    setWorkspaceError("");
    setWorkspaceData(null);
    try {
      const nextData = await requestJson<WorkspacePayload>(`/api/${encodeURIComponent(workspaceId)}`);
      if (requestId !== workspaceRequestRef.current || selectedWorkspaceRef.current !== workspaceId) return;
      setWorkspaceData(nextData);
    } catch (error) {
      if (requestId !== workspaceRequestRef.current || selectedWorkspaceRef.current !== workspaceId) return;
      setWorkspaceError(error instanceof Error ? error.message : "Unable to load workspace.");
      setWorkspaceData(null);
    } finally {
      if (requestId === workspaceRequestRef.current) setLoadingWorkspace(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusError("");
    try {
      const payload = await requestJson<StatusPayload>("/api/status");
      setStatus(payload);
      if (!payload.ok) {
        setStatusError(payload.error ?? "Honcho connection is unavailable.");
        return;
      }
      if (workspaceInitializedRef.current) return;
      const preferredWorkspace = readPreferredWorkspace();
      const initialWorkspace = preferredWorkspace || payload.selectedWorkspace || "";
      if (!initialWorkspace) return;
      workspaceInitializedRef.current = true;
      persistPreferredWorkspace(initialWorkspace);
      selectedWorkspaceRef.current = initialWorkspace;
      setWorkspace(initialWorkspace);
      setWorkspaceDraft(initialWorkspace);
      void loadWorkspace(initialWorkspace);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Unable to connect to Honcho.");
    }
  }, [loadWorkspace, persistPreferredWorkspace, readPreferredWorkspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  const applyWorkspace = async () => {
    const nextWorkspace = workspaceDraft.trim();
    if (!/^[a-zA-Z0-9_-]{1,512}$/.test(nextWorkspace)) {
      setWorkspaceError("Workspace IDs use letters, numbers, underscores, and hyphens only.");
      return;
    }
    setWorkspaceError("");
    workspaceInitializedRef.current = true;
    workspaceViewGenerationRef.current += 1;
    persistPreferredWorkspace(nextWorkspace);
    selectedWorkspaceRef.current = nextWorkspace;
    setWorkspaceData(null);
    setWorkspace(nextWorkspace);
    setWorkspaceDraft(nextWorkspace);
    setActiveSection("overview");
    setSidebarOpen(false);
    await loadWorkspace(nextWorkspace);
  };

  const retryWorkspace = () => {
    if (workspace) void loadWorkspace(workspace);
    else void loadStatus();
  };

  const refreshStatus = async (): Promise<boolean> => {
    setStatusError("");
    try {
      const payload = await requestJson<StatusPayload>("/api/status");
      setStatus(payload);
      if (!payload.ok) {
        setStatusError(payload.error ?? "Honcho connection is unavailable.");
        return false;
      }
      return true;
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Unable to connect to Honcho.");
      return false;
    }
  };

  const handleWorkspaceChange = (nextWorkspace: string) => {
    workspaceInitializedRef.current = true;
    workspaceViewGenerationRef.current += 1;
    persistPreferredWorkspace(nextWorkspace);
    selectedWorkspaceRef.current = nextWorkspace;
    setWorkspaceData(null);
    setWorkspaceError("");
    setWorkspace(nextWorkspace);
    setWorkspaceDraft(nextWorkspace);
    setActiveSection("overview");
    setSidebarOpen(false);
    void loadWorkspace(nextWorkspace);
  };

  const refresh = async () => {
    const refreshId = ++refreshRequestRef.current;
    const currentWorkspace = selectedWorkspaceRef.current || workspace;
    const viewGeneration = workspaceViewGenerationRef.current;
    setRefreshing(true);
    try {
      const statusLoaded = await refreshStatus();
      if (!statusLoaded
        || refreshId !== refreshRequestRef.current
        || viewGeneration !== workspaceViewGenerationRef.current
        || selectedWorkspaceRef.current !== currentWorkspace
      ) return;
      if (currentWorkspace) {
        setWorkspaceData(null);
        await loadWorkspace(currentWorkspace);
        if (
          refreshId === refreshRequestRef.current
          && viewGeneration === workspaceViewGenerationRef.current
          && selectedWorkspaceRef.current === currentWorkspace
        ) {
          setRefreshGeneration((generation) => generation + 1);
        }
      }
    } finally {
      if (refreshId === refreshRequestRef.current) setRefreshing(false);
    }
  };

  const peers = workspaceData?.peers.items ?? [];
  const sessions = workspaceData?.sessions.items ?? [];
  const recentMemories = workspaceData?.conclusions.items ?? [];
  const activeSessionCount = sessions.filter((session) => session.is_active).length;
  const queuePending = typeof workspaceData?.queue.pending_work_units === "number"
    ? workspaceData.queue.pending_work_units
    : 0;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><BrainCircuit size={21} aria-hidden="true" /></div>
          <div>
            <strong>Honcho</strong>
            <span>memory control</span>
          </div>
          <button className="mobile-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="sidebar-section-label">Workspace</div>
        <div className="workspace-rail-card">
          <span className="status-dot" data-online={Boolean(status?.ok)} />
          <div className="workspace-rail-copy">
            <strong>{workspace || "Not selected"}</strong>
            <span>{status?.ok ? (status.isRemote ? "Remote API connected" : "Local API connected") : "Connection unavailable"}</span>
          </div>
          <Server size={16} aria-hidden="true" />
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <div className="sidebar-section-label">Explore</div>
          <NavButton section="overview" active={activeSection} onSelect={setActiveSection} icon={<Activity size={17} />} label="Overview" />
          <NavButton section="memories" active={activeSection} onSelect={setActiveSection} icon={<Sparkles size={17} />} label="Memories" count={workspaceData?.conclusions.total} />
          <NavButton section="peers" active={activeSection} onSelect={setActiveSection} icon={<UsersRound size={17} />} label="Peers" count={workspaceData?.peers.total} />
          <NavButton section="sessions" active={activeSection} onSelect={setActiveSection} icon={<MessageSquareText size={17} />} label="Sessions" count={workspaceData?.sessions.total} />
        </nav>

        <div className="sidebar-footer">
          <div className="local-only-note">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>{status?.isRemote ? "Remote mode enabled" : "Local-only console"}<br /><em>Credentials stay server-side</em></span>
          </div>
          <span className="version-label">HONCHO CONSOLE · 0.1.0</span>
        </div>
      </aside>

      {sidebarOpen ? <button className="sidebar-scrim" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" /> : null}

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-title">
            <button className="mobile-menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
              <PanelLeft size={19} aria-hidden="true" />
            </button>
            <div>
              <span className="eyebrow">HONCHO / {workspace || "NO WORKSPACE"}</span>
              <h1>{sectionTitle(activeSection)}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <WorkspacePicker
              draft={workspaceDraft}
              setDraft={setWorkspaceDraft}
              workspaces={status?.workspaces ?? []}
              configuredWorkspace={status?.configuredWorkspace ?? null}
              onApply={() => void applyWorkspace()}
              onSelectWorkspace={handleWorkspaceChange}
              />
            <button className="icon-button" type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh data" title="Refresh data">
              <RefreshCw size={17} className={refreshing ? "spin" : ""} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {statusError ? <ErrorBanner message={statusError} onRetry={() => void loadStatus()} /> : null}
          {workspaceError ? <ErrorBanner message={workspaceError} onRetry={retryWorkspace} /> : null}
          {!status && !statusError ? <LoadingRows count={5} /> : null}
          {status && !statusError && !workspace ? (
            <WorkspaceEmptyState draft={workspaceDraft} setDraft={setWorkspaceDraft} onApply={() => void applyWorkspace()} />
          ) : null}
          {workspace && workspaceData ? (
            <>
              {activeSection === "overview" ? <OverviewView data={workspaceData} activeSessionCount={activeSessionCount} queuePending={queuePending} onNavigate={setActiveSection} /> : null}
              {activeSection === "memories" ? <MemoriesView key={`${workspace}-${refreshGeneration}`} workspace={workspace} peers={peers} initialItems={recentMemories} initialTotal={workspaceData.conclusions.total} onChanged={() => { if (selectedWorkspaceRef.current === workspace) void loadWorkspace(workspace); }} /> : null}
              {activeSection === "peers" ? <PeersView key={`${workspace}-${refreshGeneration}`} workspace={workspace} initialPage={workspaceData.peers} /> : null}
              {activeSection === "sessions" ? <SessionsView key={`${workspace}-${refreshGeneration}`} workspace={workspace} initialPage={workspaceData.sessions} /> : null}
            </>
          ) : null}
          {workspace && loadingWorkspace && !workspaceData ? <LoadingRows count={6} /> : null}
        </div>
      </main>
    </div>
  );
}

function NavButton({
  section,
  active,
  onSelect,
  icon,
  label,
  count,
}: {
  section: Section;
  active: Section;
  onSelect: (section: Section) => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button className={`nav-button ${active === section ? "nav-active" : ""}`} type="button" onClick={() => onSelect(section)}>
      {icon}
      <span>{label}</span>
      {typeof count === "number" ? <small>{count.toLocaleString()}</small> : null}
    </button>
  );
}

function WorkspacePicker({
  draft,
  setDraft,
  workspaces,
  configuredWorkspace,
  onApply,
  onSelectWorkspace,
}: {
  draft: string;
  setDraft: (value: string) => void;
  workspaces: Array<{ id: string; created_at: string | null }>;
  configuredWorkspace: string | null;
  onApply: () => void;
  onSelectWorkspace: (workspace: string) => void;
}) {
  return (
    <div className="workspace-picker">
      <label htmlFor="workspace-select">Workspace</label>
      <div className="workspace-picker-control">
        <Database size={15} aria-hidden="true" />
        <input
          id="workspace-select"
          list="honcho-workspaces"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const selected = workspaces.find((item) => item.id === event.target.value);
            if (selected) onSelectWorkspace(selected.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") onApply();
          }}
          placeholder="workspace id"
          aria-label="Workspace identifier"
        />
        <datalist id="honcho-workspaces">
          {workspaces.map((item) => <option key={item.id} value={item.id}>{item.id === configuredWorkspace ? "Configured default" : "Available"}</option>)}
        </datalist>
        <ChevronDown size={14} aria-hidden="true" />
      </div>
    </div>
  );
}

function WorkspaceEmptyState({ draft, setDraft, onApply }: { draft: string; setDraft: (value: string) => void; onApply: () => void }) {
  return (
    <section className="empty-workspace-page">
      <div className="empty-workspace-icon"><Database size={28} aria-hidden="true" /></div>
      <span className="eyebrow">CONNECTION READY · WORKSPACE REQUIRED</span>
      <h2>Select a workspace to begin</h2>
      <p>Honcho is reachable, but no default workspace was configured. Choose one discovered from the API or enter a workspace identifier.</p>
      <div className="workspace-empty-form">
        <label htmlFor="empty-workspace">Workspace identifier</label>
        <div className="inline-form-row">
          <input id="empty-workspace" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onApply(); }} placeholder="e.g. oasis" />
          <button className="button button-primary" type="button" onClick={onApply}>Open workspace <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </div>
    </section>
  );
}

function OverviewView({
  data,
  activeSessionCount,
  queuePending,
  onNavigate,
}: {
  data: WorkspacePayload;
  activeSessionCount: number;
  queuePending: number;
  onNavigate: (section: Section) => void;
}) {
  const latest = data.conclusions.items.slice(0, 5);
  return (
    <div className="page-grid">
      <section className="hero-card">
        <div>
          <span className="eyebrow eyebrow-light">ACTIVE WORKSPACE</span>
          <h2>{data.workspace}</h2>
          <p>Read, reason about, and carefully curate the memory state behind your agent.</p>
        </div>
        <div className="hero-orbit" aria-hidden="true"><div /><div /><div /></div>
        <div className="hero-foot"><span><span className="status-dot" data-online="true" /> Honcho API online</span><span className="mono">v3 / loopback</span></div>
      </section>

      <section className="stats-grid">
        <StatCard label="Memories" value={data.conclusions.total.toLocaleString()} detail="Conclusions in workspace" icon={<Sparkles size={17} />} accent="mint" />
        <StatCard label="Peers" value={data.peers.total} detail="Known participants" icon={<UsersRound size={17} />} accent="violet" />
        <StatCard label="Sessions" value={data.sessions.total.toLocaleString()} detail={`${activeSessionCount} active on loaded page`} icon={<MessageSquareText size={17} />} accent="blue" />
        <StatCard label="Queue" value={queuePending} detail="Pending work units" icon={<Clock3 size={17} />} accent="amber" />
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">LATEST SIGNAL</span><h2>Recent memory</h2></div>
          <button className="button button-quiet" type="button" onClick={() => onNavigate("memories")}>Browse all <ArrowRight size={15} aria-hidden="true" /></button>
        </div>
        {latest.length ? <MemoryTable items={latest} compact onSelect={() => onNavigate("memories")} /> : <EmptyState icon={<Sparkles size={21} />} title="No conclusions yet" body="This workspace has no stored conclusions." />}
      </section>

      <section className="overview-lower-grid">
        <section className="panel compact-panel">
          <div className="panel-heading"><div><span className="eyebrow">PEER GRAPH</span><h2>Participants</h2></div><button className="text-button" type="button" onClick={() => onNavigate("peers")}>View peers</button></div>
          <div className="peer-chip-list">
            {data.peers.items.slice(0, 6).map((peer) => <span className="peer-chip" key={peer.id}><span className="avatar avatar-small">{peer.id.slice(0, 1).toUpperCase()}</span>{peer.id}</span>)}
            {!data.peers.items.length ? <span className="muted">No peers returned.</span> : null}
          </div>
        </section>
        <section className="panel compact-panel">
          <div className="panel-heading"><div><span className="eyebrow">ACTIVITY</span><h2>Recent sessions</h2></div><button className="text-button" type="button" onClick={() => onNavigate("sessions")}>Open archive</button></div>
          <div className="mini-session-list">
            {data.sessions.items.slice(0, 4).map((session) => <div className="mini-session" key={session.id}><span className={`session-pip ${session.is_active ? "session-live" : ""}`} /><div><strong>{compactId(session.id, 22)}</strong><span>{formatDate(session.created_at)}</span></div><span className="mono">{session.is_active ? "ACTIVE" : "CLOSED"}</span></div>)}
            {!data.sessions.items.length ? <span className="muted">No sessions returned.</span> : null}
          </div>
        </section>
      </section>
    </div>
  );
}

function MemoryTable({ items, compact = false, onSelect }: { items: Conclusion[]; compact?: boolean; onSelect: (item: Conclusion) => void }) {
  return (
    <div className={`memory-table ${compact ? "memory-table-compact" : ""}`}>
      <div className="memory-table-head"><span>Memory</span><span>Relationship</span><span>Level</span><span>Created</span></div>
      {items.map((item) => (
        <button className="memory-row" type="button" key={item.id} onClick={() => onSelect(item)}>
          <span className="memory-copy"><strong>{item.content}</strong><small className="mono">{compactId(item.id, 18)}</small></span>
          <span className="relationship"><span>{compactId(item.observer_id, 13)}</span><ArrowRight size={13} aria-hidden="true" /><span>{compactId(item.observed_id, 13)}</span></span>
          <span><LevelBadge level={item.level} /></span>
          <span className="date-cell">{formatDate(item.created_at)}</span>
        </button>
      ))}
    </div>
  );
}

function LevelBadge({ level }: { level: Conclusion["level"] }) {
  return <span className={`level-badge level-${level}`}>{level}</span>;
}

function MemoriesView({ workspace, peers, initialItems, initialTotal, onChanged }: { workspace: string; peers: Peer[]; initialItems: Conclusion[]; initialTotal: number; onChanged: () => void }) {
  const [pageData, setPageData] = useState<ConclusionPage>({ items: initialItems, total: initialTotal, page: 1, size: initialItems.length || 20, pages: Math.max(1, Math.ceil(initialTotal / (initialItems.length || 20))) });
  const [peerOptions, setPeerOptions] = useState<PeerOptions>(() => ({ items: peers, total: peers.length, page: 1, size: PEER_OPTION_PAGE_SIZE, pages: peers.length ? 1 : 0 }));
  const [peerOptionsError, setPeerOptionsError] = useState("");
  const peerOptionItems = peerOptions.items.length ? peerOptions.items : peers;
  const [query, setQuery] = useState("");
  const [searchObserver, setSearchObserver] = useState(peers[0]?.id ?? "");
  const [searchObserved, setSearchObserved] = useState(peers[1]?.id ?? peers[0]?.id ?? "");
  const [browseObserver, setBrowseObserver] = useState("");
  const [browseObserved, setBrowseObserved] = useState("");
  const peerOptionsRequestRef = useRef(0);

  useEffect(() => {
    const requestId = ++peerOptionsRequestRef.current;
    const loadPeerOptions = async () => {
      const firstPage = await requestJson<PeerOptions>(peerOptionPageUrl(workspace, 1));
      if (requestId !== peerOptionsRequestRef.current) return;
      setPeerOptions(firstPage);
      setPeerOptionsError("");
      if (firstPage.pages <= 1) return;
      const pageCount = Math.min(firstPage.pages, MAX_PEER_OPTION_PAGES);
      const remaining = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, index) => requestJson<PeerOptions>(peerOptionPageUrl(workspace, index + 2))),
      );
      if (requestId !== peerOptionsRequestRef.current) return;
      setPeerOptions({ ...firstPage, items: mergePeerPages([firstPage, ...remaining]), page: 1, pages: 1 });
      if (firstPage.pages > pageCount) setPeerOptionsError("Peer options are limited to the first 2,000 peers.");
    };
    void loadPeerOptions().catch((loadError) => {
      if (requestId === peerOptionsRequestRef.current) setPeerOptionsError(loadError instanceof Error ? loadError.message : "Unable to load peer options.");
    });
    return () => { peerOptionsRequestRef.current += 1; };
  }, [peers, workspace]);
  const [level, setLevel] = useState<Level>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Conclusion | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const memoryRequestRef = useRef(0);

  const load = useCallback(async (nextPage: number, nextQuery = query, nextLevel = level, filters: RecentFilter = { observer_id: browseObserver || undefined, observed_id: browseObserved || undefined }) => {
    const requestId = ++memoryRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(nextPage), size: "30" });
      if (nextQuery.trim()) {
        if (!searchObserver || !searchObserved) {
          throw new Error("Select both an observer and observed peer for semantic search.");
        }
        params.set("query", nextQuery.trim());
        params.set("observer_id", searchObserver);
        params.set("observed_id", searchObserved);
      }
      if (nextLevel !== "all") params.set("level", nextLevel);
      if (!nextQuery.trim()) {
        if (filters.observer_id) params.set("observer_id", filters.observer_id);
        if (filters.observed_id) params.set("observed_id", filters.observed_id);
      }
      const payload = await requestJson<ConclusionPage & { mode?: string }>(`/api/${encodeURIComponent(workspace)}/memories?${params}`);
      if (requestId !== memoryRequestRef.current) return;
      setPageData(payload);
      setPage(nextPage);
      setHasLoaded(true);
      setSelected((current) => current ? payload.items.find((item) => item.id === current.id) ?? null : null);
    } catch (loadError) {
      if (requestId !== memoryRequestRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load memories.");
    } finally {
      if (requestId === memoryRequestRef.current) setLoading(false);
    }
  }, [browseObserved, browseObserver, level, query, searchObserved, searchObserver, workspace]);

  useEffect(() => {
    if (hasLoaded) return;
    const timer = window.setTimeout(() => void load(1, "", "all"), 0);
    return () => window.clearTimeout(timer);
  }, [hasLoaded, load]);

  const handleSelect = (item: Conclusion) => {
    setShowNew(false);
    setSelected(item);
  };

  return (
    <div className="page-grid">
      <section className="section-intro">
        <div><span className="eyebrow">CONCLUSIONS / {pageData.total.toLocaleString()} TOTAL</span><h2>Memory browser</h2><p>Chronological facts and derived observations stored for this workspace.</p></div>
        <button className="button button-primary" type="button" onClick={() => { setSelected(null); setShowNew(true); }}><Plus size={16} aria-hidden="true" /> Add memory</button>
      </section>
      <section className="panel toolbar-panel">
        <div className="search-control"><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(1); }} placeholder="Search memory semantically…" aria-label="Search memory" /></div>
        {query ? <>
          <select className="select-control search-scope-control" value={searchObserver} onChange={(event) => setSearchObserver(event.target.value)} aria-label="Semantic search observer">
            <option value="">Observer…</option>
            {peerOptionItems.map((peer) => <option key={peer.id} value={peer.id}>{peer.id}</option>)}
          </select>
          <select className="select-control search-scope-control" value={searchObserved} onChange={(event) => setSearchObserved(event.target.value)} aria-label="Semantic search observed peer">
            <option value="">Observed…</option>
            {peerOptionItems.map((peer) => <option key={peer.id} value={peer.id}>{peer.id}</option>)}
          </select>
        </> : <>
          <select className="select-control search-scope-control" value={browseObserver} onChange={(event) => { setBrowseObserver(event.target.value); void load(1, query, level, { observer_id: event.target.value || undefined, observed_id: browseObserved || undefined }); }} aria-label="Filter recent memories by observer"><option value="">Any observer</option>{peerOptionItems.map((peer) => <option key={peer.id} value={peer.id}>{peer.id}</option>)}</select>
          <select className="select-control search-scope-control" value={browseObserved} onChange={(event) => { setBrowseObserved(event.target.value); void load(1, query, level, { observer_id: browseObserver || undefined, observed_id: event.target.value || undefined }); }} aria-label="Filter recent memories by observed peer"><option value="">Any observed peer</option>{peerOptionItems.map((peer) => <option key={peer.id} value={peer.id}>{peer.id}</option>)}</select>
        </>}
        <select className="select-control" value={level} onChange={(event) => { const next = event.target.value as Level; setLevel(next); void load(1, query, next, { observer_id: browseObserver || undefined, observed_id: browseObserved || undefined }); }} aria-label="Filter by memory level">
          <option value="all">All levels</option><option value="explicit">Explicit</option><option value="deductive">Deductive</option><option value="inductive">Inductive</option><option value="contradiction">Contradiction</option>
        </select>
        <button className="button button-secondary" type="button" onClick={() => void load(1, query, level, { observer_id: browseObserver || undefined, observed_id: browseObserved || undefined })}><Search size={15} aria-hidden="true" /> Search</button>
        <span className="toolbar-note"><Filter size={14} aria-hidden="true" /> {query ? "Semantic results · scoped to relationship" : "Newest first"}</span>
      </section>
      {error ? <ErrorBanner message={error} onRetry={() => void load(page, query, level, { observer_id: browseObserver || undefined, observed_id: browseObserved || undefined })} /> : null}
      <section className={`panel data-panel ${loading ? "panel-loading" : ""}`}>
        <div className="panel-heading"><div><span className="eyebrow">MEMORY LEDGER</span><h2>{query ? "Search results" : "All conclusions"}</h2></div><span className="table-count">{pageData.total.toLocaleString()} records</span></div>
        {loading ? <LoadingRows count={6} /> : pageData.items.length ? <MemoryTable items={pageData.items} onSelect={handleSelect} /> : <EmptyState icon={<Archive size={21} />} title="No matching memory" body="Try a broader query or remove the active level filter." />}
        <Pagination page={pageData.page} pages={pageData.pages} onPage={(next) => void load(next, query, level, { observer_id: browseObserver || undefined, observed_id: browseObserved || undefined })} />
      </section>
      {peerOptionsError ? <ErrorBanner message={peerOptionsError} /> : null}
      {selected || showNew ? <MemoryEditor workspace={workspace} peers={peerOptionItems} selected={selected} onClose={() => { setSelected(null); setShowNew(false); }} onSaved={() => { setSelected(null); setShowNew(false); void load(1, query, level, { observer_id: browseObserver || undefined, observed_id: browseObserved || undefined }); onChanged(); }} /> : null}
    </div>
  );
}

function Pagination({ page, pages, onPage, disabled = false }: { page: number; pages: number; onPage: (page: number) => void; disabled?: boolean }) {
  if (pages <= 1) return null;
  return <div className="pagination"><button className="icon-button" type="button" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ArrowLeft size={15} aria-hidden="true" /></button><span>Page <strong>{page}</strong> of <strong>{pages}</strong></span><button className="icon-button" type="button" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ArrowRight size={15} aria-hidden="true" /></button></div>;
}

function MemoryEditor({ workspace, peers, selected, onClose, onSaved }: { workspace: string; peers: Peer[]; selected: Conclusion | null; onClose: () => void; onSaved: () => void }) {
  const [content, setContent] = useState(selected?.content ?? "");
  const [observer, setObserver] = useState(selected?.observer_id ?? peers[0]?.id ?? "");
  const [observed, setObserved] = useState(selected?.observed_id ?? peers[1]?.id ?? peers[0]?.id ?? "");
  const [sessionId, setSessionId] = useState(selected?.session_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEditing = Boolean(selected);

  const save = async () => {
    if (!content.trim() || !observer || !observed) {
      setError("Content, observer, and observed peer are required.");
      return;
    }
    if (isEditing && !window.confirm("Replace this memory? Honcho has no update endpoint; this creates the new record before deleting the original.")) return;
    setSaving(true);
    setError("");
    try {
      const endpoint = `/api/${encodeURIComponent(workspace)}/memories${selected ? `/${encodeURIComponent(selected.id)}` : ""}`;
      const payload = selected ? { content, observer_id: observer, observed_id: observed, session_id: sessionId || null, original: selected } : { content, observer_id: observer, observed_id: observed, session_id: sessionId || null };
      await requestJson(endpoint, { method: selected ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save memory.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm("Delete this memory permanently? This cannot be undone.")) return;
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/${encodeURIComponent(workspace)}/memories/${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      onSaved();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to delete memory.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editor-overlay" role="presentation">
      <div className="editor-scrim" onClick={onClose} />
      <aside className="editor-drawer" role="dialog" aria-modal="true" aria-labelledby="memory-editor-title">
        <div className="drawer-heading"><div><span className="eyebrow">{isEditing ? "EDIT CONCLUSION" : "NEW CONCLUSION"}</span><h2 id="memory-editor-title">{isEditing ? "Curate memory" : "Add memory"}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close editor"><X size={17} aria-hidden="true" /></button></div>
        {error ? <ErrorBanner message={error} /> : null}
        <label className="field-label" htmlFor="memory-content">Content</label>
        <textarea id="memory-content" className="memory-editor-textarea" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write a concise fact or observation…" autoFocus />
        <div className="field-grid">
          <label className="field-label">Observer<select className="select-control" value={observer} onChange={(event) => setObserver(event.target.value)}>{peers.map((peer) => <option key={peer.id} value={peer.id}>{peer.id}</option>)}</select></label>
          <label className="field-label">Observed<select className="select-control" value={observed} onChange={(event) => setObserved(event.target.value)}>{peers.map((peer) => <option key={peer.id} value={peer.id}>{peer.id}</option>)}</select></label>
        </div>
        <label className="field-label" htmlFor="memory-session">Session ID <span className="optional-label">optional</span></label>
        <input id="memory-session" className="text-input" value={sessionId} onChange={(event) => setSessionId(event.target.value)} placeholder="Attach to a session (optional)" />
        {selected ? <div className="record-meta"><span><span className="eyebrow">RECORD ID</span><code>{selected.id}</code></span><span><span className="eyebrow">LEVEL</span><LevelBadge level={selected.level} /></span></div> : null}
        <div className="drawer-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>{selected ? <button className="button button-danger-ghost" type="button" onClick={() => void remove()} disabled={saving}><Trash2 size={15} aria-hidden="true" /> Delete</button> : null}<button className="button button-primary" type="button" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}{isEditing ? "Replace memory" : "Create memory"}</button></div>
        <p className="drawer-footnote"><ShieldCheck size={14} aria-hidden="true" /> Destructive actions require confirmation. Replacement is create-first, delete-second.</p>
      </aside>
    </div>
  );
}

function PeersView({ workspace, initialPage }: { workspace: string; initialPage: PeerPagePayload }) {
  const [observer, setObserver] = useState(initialPage.items[0]?.id ?? "");
  const [target, setTarget] = useState("");
  const [peerOptions, setPeerOptions] = useState<PeerOptions>(() => ({ items: initialPage.items, total: initialPage.total, page: initialPage.page, size: initialPage.size, pages: initialPage.pages }));
  const [peerOptionsError, setPeerOptionsError] = useState("");
  const allPeerOptionsRequestRef = useRef(0);
  const peerOptionItems = peerOptions.items.length ? peerOptions.items : initialPage.items;
  const [context, setContext] = useState<PeerContext | null>(null);
  const [cardDraft, setCardDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pageData, setPageData] = useState<PeerPagePayload>(initialPage);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [requestedPage, setRequestedPage] = useState(1);
  const peerPageRequestRef = useRef(0);
  const contextRequestRef = useRef(0);
  const contextSelectionRef = useRef("");

  useEffect(() => {
    const requestId = ++allPeerOptionsRequestRef.current;
    const loadAllPeerOptions = async () => {
      const firstPage = await requestJson<PeerPagePayload>(peerOptionPageUrl(workspace, 1));
      if (requestId !== allPeerOptionsRequestRef.current) return;
      const pageCount = Math.min(firstPage.pages, MAX_PEER_OPTION_PAGES);
      const remaining = await Promise.all(
        Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => requestJson<PeerPagePayload>(peerOptionPageUrl(workspace, index + 2))),
      );
      if (requestId !== allPeerOptionsRequestRef.current) return;
      setPeerOptions({ ...firstPage, items: mergePeerPages([firstPage, ...remaining]), page: 1, pages: 1 });
      setPeerOptionsError(firstPage.pages > pageCount ? "Peer options are limited to the first 2,000 peers." : "");
    };
    void loadAllPeerOptions().catch((loadError) => {
      if (requestId === allPeerOptionsRequestRef.current) setPeerOptionsError(loadError instanceof Error ? loadError.message : "Unable to load peer options.");
    });
    return () => { allPeerOptionsRequestRef.current += 1; };
  }, [initialPage.items, initialPage.page, initialPage.pages, initialPage.size, initialPage.total, workspace]);

  const loadPeersPage = async (nextPage: number) => {
    const requestId = ++peerPageRequestRef.current;
    setRequestedPage(nextPage);
    setPageLoading(true);
    setPageError("");
    try {
      const url = `/api/${encodeURIComponent(workspace)}/peers?page=${nextPage}&size=100`;
      const nextPageData = await requestJson<PeerPagePayload>(url);
      if (requestId !== peerPageRequestRef.current) return;
      setPageData(nextPageData);
      setObserver((current) => nextPageData.items.some((peer) => peer.id === current) ? current : nextPageData.items[0]?.id ?? "");
      setTarget((current) => current && nextPageData.items.some((peer) => peer.id === current) ? current : "");
      setContext(null);
      setCardDraft("");
      setError("");
    } catch (pageLoadError) {
      if (requestId !== peerPageRequestRef.current) return;
      setPageError(pageLoadError instanceof Error ? pageLoadError.message : "Unable to load peers.");
    } finally {
      if (requestId === peerPageRequestRef.current) setPageLoading(false);
    }
  };

  const loadContext = useCallback(async (selectedObserver = observer, selectedTarget = target) => {
    if (!selectedObserver) return;
    const validTarget = selectedTarget && selectedTarget !== selectedObserver ? selectedTarget : "";
    if (selectedTarget === selectedObserver) setTarget("");
    const requestId = ++contextRequestRef.current;
    const requestKey = `${workspace}/${selectedObserver}/${validTarget}`;
    contextSelectionRef.current = requestKey;
    setLoading(true);
    setError("");
    try {
      const query = validTarget ? `?target=${encodeURIComponent(validTarget)}` : "";
      const next = await requestJson<PeerContext>(`/api/${encodeURIComponent(workspace)}/peers/${encodeURIComponent(selectedObserver)}/context${query}`);
      const stillCurrent = requestId === contextRequestRef.current && contextSelectionRef.current === requestKey;
      if (!stillCurrent) return;
      setContext(next);
      setCardDraft((next.peer_card ?? []).join("\n"));
    } catch (loadError) {
      if (requestId !== contextRequestRef.current || contextSelectionRef.current !== requestKey) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load peer context.");
    } finally {
      if (requestId === contextRequestRef.current && contextSelectionRef.current === requestKey) setLoading(false);
    }
  }, [observer, target, workspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContext(), 0);
    return () => window.clearTimeout(timer);
  }, [loadContext]);

  const saveCard = async () => {
    if (!window.confirm("Replace this peer card with the edited facts?")) return;
    const savedObserver = observer;
    const savedTarget = target && target !== observer ? target : "";
    const savedSelectionKey = `${workspace}/${savedObserver}/${savedTarget}`;
    setSaving(true);
    setError("");
    try {
      const query = savedTarget ? `?target=${encodeURIComponent(savedTarget)}` : "";
      await requestJson(`/api/${encodeURIComponent(workspace)}/peers/${encodeURIComponent(savedObserver)}/card${query}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts: cardDraft.split("\n").map((fact) => fact.trim()).filter(Boolean) }) });
      if (contextSelectionRef.current === savedSelectionKey) await loadContext(savedObserver, savedTarget);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save peer card.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-grid">
      <section className="section-intro"><div><span className="eyebrow">PEERS / {pageData.total.toLocaleString()} TOTAL</span><h2>Peer context</h2><p>Inspect the representation and peer card Honcho maintains for a relationship.</p></div><div className="context-pill"><Network size={15} aria-hidden="true" /> Observer perspective</div></section>
      <section className="peer-layout">
        <div className="panel peer-selector-panel">
          <div className="panel-heading"><div><span className="eyebrow">RELATIONSHIP</span><h2>Choose perspective</h2></div><UserRound size={19} aria-hidden="true" /></div>
          <label className="field-label">Observer<select className="select-control" value={observer} onChange={(event) => { const nextObserver = event.target.value; setObserver(nextObserver); if (target === nextObserver) setTarget(""); void loadContext(nextObserver, target === nextObserver ? "" : target); }}>{peerOptionItems.map((peer) => <option key={peer.id} value={peer.id}>{peer.id}</option>)}</select></label>
          <label className="field-label">Target <span className="optional-label">optional</span><select className="select-control" value={target} onChange={(event) => { const nextTarget = event.target.value; setTarget(nextTarget); void loadContext(observer, nextTarget); }}><option value="">Self / observer&apos;s own card</option>{peerOptionItems.filter((peer) => peer.id !== observer).map((peer) => <option key={peer.id} value={peer.id}>{peer.id}</option>)}</select></label>
          <div className="relationship-diagram"><div className="diagram-node"><span className="avatar">{observer.slice(0, 1).toUpperCase()}</span><strong>{observer || "—"}</strong><small>observer</small></div><div className="diagram-line"><ArrowRight size={17} aria-hidden="true" /></div><div className="diagram-node"><span className="avatar avatar-violet">{(target || observer).slice(0, 1).toUpperCase()}</span><strong>{target || observer || "—"}</strong><small>{target ? "target" : "self"}</small></div></div>
          <button className="button button-secondary button-full" type="button" onClick={() => void loadContext()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} aria-hidden="true" /> Refresh context</button>
        </div>
        <div className="peer-detail-column">
          {error ? <ErrorBanner message={error} onRetry={() => void loadContext()} /> : null}
          {loading && !context ? <LoadingRows count={4} /> : null}
          {context ? <>
            <section className="panel representation-panel"><div className="panel-heading"><div><span className="eyebrow">GENERATED VIEW</span><h2>Representation</h2></div><BrainCircuit size={19} aria-hidden="true" /></div><div className="representation-copy">{context.representation ? context.representation.split("\n").map((line, index) => <p key={`${index}-${line}`}>{line || "\u00a0"}</p>) : <span className="muted">No representation returned for this relationship.</span>}</div></section>
            <section className="panel card-editor-panel"><div className="panel-heading"><div><span className="eyebrow">CURATED FACTS</span><h2>Peer card</h2></div><Pencil size={18} aria-hidden="true" /></div><p className="panel-help">One fact per line. This is the editable, human-curated layer.</p><textarea className="card-textarea" value={cardDraft} onChange={(event) => setCardDraft(event.target.value)} placeholder="No peer card facts yet…" aria-label="Peer card facts" /><div className="card-editor-footer"><span className="mono">{cardDraft.split("\n").filter((line) => line.trim()).length} facts</span><button className="button button-primary" type="button" onClick={() => void saveCard()} disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Save peer card</button></div></section>
          </> : null}
        </div>
      </section>
      {pageError ? <ErrorBanner message={pageError} onRetry={() => void loadPeersPage(requestedPage)} /> : null}
      {peerOptionsError ? <ErrorBanner message={peerOptionsError} /> : null}
      <Pagination page={pageData.page} pages={pageData.pages} disabled={pageLoading} onPage={(next) => void loadPeersPage(next)} />
    </div>
  );
}

function SessionsView({ workspace, initialPage }: { workspace: string; initialPage: SessionPagePayload }) {
  const sessions = initialPage.items;
  const [selected, setSelected] = useState<Session | null>(null);
  const [messages, setMessages] = useState<MessagePage | null>(null);
  const [messagePage, setMessagePage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionPageData, setSessionPageData] = useState<SessionPagePayload>(initialPage);
  const [sessionPageLoading, setSessionPageLoading] = useState(false);
  const [sessionPageError, setSessionPageError] = useState("");
  const [requestedPage, setRequestedPage] = useState(1);
  const sessionPageRequestRef = useRef(0);
  const messageRequestRef = useRef(0);

  const loadSessionsPage = async (nextPage: number) => {
    const requestId = ++sessionPageRequestRef.current;
    setRequestedPage(nextPage);
    setSessionPageLoading(true);
    setSessionPageError("");
    try {
      const url = `/api/${encodeURIComponent(workspace)}/sessions?page=${nextPage}&size=50`;
      const nextPageData = await requestJson<SessionPagePayload>(url);
      if (requestId !== sessionPageRequestRef.current) return;
      setSessionPageData(nextPageData);
    } catch (pageLoadError) {
      if (requestId !== sessionPageRequestRef.current) return;
      setSessionPageError(pageLoadError instanceof Error ? pageLoadError.message : "Unable to load sessions.");
    } finally {
      if (requestId === sessionPageRequestRef.current) setSessionPageLoading(false);
    }
  };

  const loadMessages = useCallback(async (session: Session, page = 1) => {
    const requestId = ++messageRequestRef.current;
    setSelected(session);
    setMessagePage(page);
    setLoading(true);
    setError("");
    try {
      const next = await requestJson<MessagePage>(`/api/${encodeURIComponent(workspace)}/sessions/${encodeURIComponent(session.id)}/messages?page=${page}&size=50`);
      if (requestId !== messageRequestRef.current) return;
      setMessages(next);
    } catch (loadError) {
      if (requestId !== messageRequestRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load messages.");
      setMessages(null);
    } finally {
      if (requestId === messageRequestRef.current) setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    if (sessions[0] && !selected) {
      const timer = window.setTimeout(() => void loadMessages(sessions[0]), 0);
      return () => window.clearTimeout(timer);
    }
  }, [loadMessages, selected, sessions]);

  return (
    <div className="page-grid">
      <section className="section-intro"><div><span className="eyebrow">SESSIONS / {sessionPageData.total.toLocaleString()} TOTAL</span><h2>Session archive</h2><p>Inspect conversation history without mutating messages.</p></div><div className="context-pill"><Archive size={15} aria-hidden="true" /> Immutable history view</div></section>
      <section className="session-layout">
        <div className="panel session-list-panel"><div className="panel-heading"><div><span className="eyebrow">RECENT SESSIONS</span><h2>{sessionPageData.total.toLocaleString()} total</h2></div><MessageSquareText size={18} aria-hidden="true" /></div>{sessionPageError ? <ErrorBanner message={sessionPageError} onRetry={() => void loadSessionsPage(requestedPage)} /> : null}<div className="session-list">{sessionPageData.items.map((session) => <button className={`session-list-row ${selected?.id === session.id ? "session-selected" : ""}`} type="button" key={session.id} onClick={() => void loadMessages(session)}><span className={`session-pip ${session.is_active ? "session-live" : ""}`} /><span className="session-list-copy"><strong>{compactId(session.id, 26)}</strong><small>{formatDate(session.created_at)}</small></span><span className="mono">{session.is_active ? "LIVE" : "CLOSED"}</span></button>)}{!sessionPageData.items.length ? <EmptyState icon={<MessageSquareText size={20} />} title="No sessions" body="No sessions were returned for this workspace." /> : null}</div><Pagination page={sessionPageData.page} pages={sessionPageData.pages} disabled={sessionPageLoading} onPage={(next) => void loadSessionsPage(next)} /></div>
        <div className="panel messages-panel"><div className="panel-heading"><div><span className="eyebrow">MESSAGE STREAM</span><h2>{selected ? compactId(selected.id, 28) : "Select a session"}</h2></div>{selected ? <span className={`state-badge ${selected.is_active ? "state-active" : ""}`}>{selected.is_active ? "Active" : "Closed"}</span> : null}</div>{error ? <ErrorBanner message={error} onRetry={() => { if (selected) void loadMessages(selected, messagePage); }} /> : null}{loading ? <LoadingRows count={5} /> : messages?.items.length ? <><div className="message-stream">{messages.items.map((message) => <MessageRow key={message.id} message={message} />)}</div><Pagination page={messages.page} pages={messages.pages} onPage={(page) => { if (selected) void loadMessages(selected, page); }} /></> : <EmptyState icon={<MessageSquareText size={21} />} title="No messages in view" body={selected ? "This session has no messages on the selected page." : "Choose a session to inspect its message stream."} />}</div>
      </section>
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  return <article className="message-row"><div className="message-avatar">{message.peer_id.slice(0, 1).toUpperCase()}</div><div className="message-body"><div className="message-meta"><strong>{message.peer_id}</strong><span>{formatDate(message.created_at)}</span><span className="mono">{message.token_count} tok</span></div><p>{message.content}</p></div></article>;
}
