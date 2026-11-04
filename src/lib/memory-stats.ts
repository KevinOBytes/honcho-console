export type StatsInputConclusion = {
  level: string;
  observer_id: string;
  observed_id: string;
  session_id: string | null;
  created_at: string;
};

export type MemoryStats = {
  analyzed: number;
  totalAvailable: number;
  truncated: boolean;
  byLevel: Array<{ level: string; count: number }>;
  topObservers: Array<{ id: string; count: number }>;
  topObserved: Array<{ id: string; count: number }>;
  topSessions: Array<{ id: string; count: number }>;
  oldest: string | null;
  newest: string | null;
  daily: Array<{ date: string; count: number }>;
  dailyByLevel: Array<{ date: string; levels: Record<string, number> }>;
  dailyByObserver: Array<{ date: string; observers: Record<string, number> }>;
};

const LEVELS = ["explicit", "deductive", "inductive", "contradiction"] as const;
const DAILY_WINDOW_DAYS = 30;
const TOP_LIST_SIZE = 8;

function topCounts(counts: Map<string, number>): Array<{ id: string; count: number }> {
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, TOP_LIST_SIZE);
}

function utcDateKey(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function computeMemoryStats(
  conclusions: StatsInputConclusion[],
  totalAvailable: number,
  truncated: boolean,
): MemoryStats {
  const byLevel = new Map<string, number>(LEVELS.map((level) => [level, 0]));
  const observers = new Map<string, number>();
  const observed = new Map<string, number>();
  const sessions = new Map<string, number>();
  let oldest: string | null = null;
  let newest: string | null = null;
  const perDay = new Map<string, number>();
  const perDayByLevel = new Map<string, Record<string, number>>();
  const perDayByObserver = new Map<string, Record<string, number>>();

  for (const conclusion of conclusions) {
    byLevel.set(conclusion.level, (byLevel.get(conclusion.level) ?? 0) + 1);
    if (conclusion.observer_id) observers.set(conclusion.observer_id, (observers.get(conclusion.observer_id) ?? 0) + 1);
    if (conclusion.observed_id) observed.set(conclusion.observed_id, (observed.get(conclusion.observed_id) ?? 0) + 1);
    if (conclusion.session_id) sessions.set(conclusion.session_id, (sessions.get(conclusion.session_id) ?? 0) + 1);

    const dateKey = utcDateKey(conclusion.created_at);
    if (dateKey) {
      if (oldest === null || conclusion.created_at < oldest) oldest = conclusion.created_at;
      if (newest === null || conclusion.created_at > newest) newest = conclusion.created_at;
      perDay.set(dateKey, (perDay.get(dateKey) ?? 0) + 1);
      const levelBucket = perDayByLevel.get(dateKey) ?? {};
      levelBucket[conclusion.level] = (levelBucket[conclusion.level] ?? 0) + 1;
      perDayByLevel.set(dateKey, levelBucket);
      if (conclusion.observer_id) {
        const observerBucket = perDayByObserver.get(dateKey) ?? {};
        observerBucket[conclusion.observer_id] = (observerBucket[conclusion.observer_id] ?? 0) + 1;
        perDayByObserver.set(dateKey, observerBucket);
      }
    }
  }

  const daily: Array<{ date: string; count: number }> = [];
  const dailyByLevel: Array<{ date: string; levels: Record<string, number> }> = [];
  const dailyByObserver: Array<{ date: string; observers: Record<string, number> }> = [];
  const windowAnchor = newest ? new Date(`${utcDateKey(newest)}T00:00:00Z`) : new Date();
  for (let offset = DAILY_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const day = new Date(windowAnchor.getTime() - offset * 86_400_000);
    const key = day.toISOString().slice(0, 10);
    daily.push({ date: key, count: perDay.get(key) ?? 0 });
    dailyByLevel.push({ date: key, levels: perDayByLevel.get(key) ?? {} });
    dailyByObserver.push({ date: key, observers: perDayByObserver.get(key) ?? {} });
  }

  return {
    analyzed: conclusions.length,
    totalAvailable,
    truncated,
    byLevel: [...byLevel.entries()].map(([level, count]) => ({ level, count })),
    topObservers: topCounts(observers),
    topObserved: topCounts(observed),
    topSessions: topCounts(sessions),
    oldest,
    newest,
    daily,
    dailyByLevel,
    dailyByObserver,
  };
}
