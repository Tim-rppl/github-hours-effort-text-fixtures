export interface CacheEvent {
  key: string;
  sequence: number;
}

export function orderEvents(events: CacheEvent[]): CacheEvent[] {
  const latestByKey = new Map<string, CacheEvent>();
  for (const event of events) {
    const latest = latestByKey.get(event.key);
    if (!latest || event.sequence > latest.sequence) latestByKey.set(event.key, event);
  }
  return [...latestByKey.values()].sort((left, right) => left.sequence - right.sequence);
}
