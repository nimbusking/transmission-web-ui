function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

/** Compile query terms once; only the supplied task name participates in matching. */
export function createNameMatcher(query: string): (name?: string) => boolean {
  const terms = [...new Set(normalize(query).split(/\s+/u).filter(Boolean))];
  if (!terms.length) return () => true;
  return (name) => {
    const text = normalize(name ?? '');
    return terms.every((term) => text.includes(term));
  };
}
