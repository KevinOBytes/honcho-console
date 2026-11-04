import { type TokenSet, jaccard, tokenize } from "./text-similarity";

export type TriageConclusion = {
  id: string;
  observer_id: string;
  observed_id: string;
  level: string;
  times_derived: number | null;
  created_at: string;
  content: string;
};

export type DuplicateGroup = {
  observer_id: string;
  observed_id: string;
  members: TriageConclusion[];
  maxSimilarity: number;
};

const DEFAULT_SIMILARITY_THRESHOLD = 0.8;
const DEFAULT_MAX_GROUPS_PER_PAIR = 25;

type PairEntry = { item: TriageConclusion; tokens: TokenSet };
type PairClusters = Array<{ representative: TokenSet; members: TriageConclusion[] }>;

export function findDuplicateGroups(
  conclusions: TriageConclusion[],
  threshold = DEFAULT_SIMILARITY_THRESHOLD,
  maxGroupsPerPair = DEFAULT_MAX_GROUPS_PER_PAIR,
): DuplicateGroup[] {
  const pairs = new Map<string, PairEntry[]>();
  for (const item of conclusions) {
    const key = `${item.observer_id}\u0000${item.observed_id}`;
    const entries = pairs.get(key) ?? [];
    entries.push({ item, tokens: tokenize(item.content) });
    pairs.set(key, entries);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, entries] of pairs) {
    const [observerId, observedId] = key.split("\u0000");
    const clusters: PairClusters = [];
    for (const entry of entries) {
      let bestIndex = -1;
      let bestSimilarity = 0;
      for (let index = 0; index < clusters.length; index += 1) {
        const similarity = jaccard(entry.tokens, clusters[index].representative);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestIndex = index;
        }
      }
      if (bestIndex >= 0 && bestSimilarity >= threshold) {
        clusters[bestIndex].members.push(entry.item);
      } else if (clusters.length < maxGroupsPerPair) {
        clusters.push({ representative: entry.tokens, members: [entry.item] });
      }
    }
    for (const cluster of clusters) {
      if (cluster.members.length > 1) {
        const members = [...cluster.members].sort((a, b) => a.created_at.localeCompare(b.created_at));
        groups.push({
          observer_id: observerId,
          observed_id: observedId,
          members,
          maxSimilarity: bestSimilarityForCluster(members, threshold),
        });
      }
    }
  }

  return groups.sort((a, b) => b.maxSimilarity - a.maxSimilarity || a.members.length - b.members.length);
}

function bestSimilarityForCluster(members: TriageConclusion[], threshold: number): number {
  let best = threshold;
  for (let i = 0; i < members.length; i += 1) {
    const a = tokenize(members[i].content);
    for (let j = i + 1; j < members.length; j += 1) {
      const similarity = jaccard(a, tokenize(members[j].content));
      if (similarity > best) best = similarity;
    }
  }
  return best;
}