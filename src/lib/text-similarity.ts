export type TokenSet = Set<string>;

export function tokenize(text: string): TokenSet {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g);
  return new Set(tokens ?? []);
}

export function jaccard(a: TokenSet, b: TokenSet): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export function textSimilarity(a: string, b: string): number {
  return jaccard(tokenize(a), tokenize(b));
}