export interface CacheEvent {
  key: string;
  sequence: number;
}

export function orderEvents(events: CacheEvent[]): CacheEvent[] {
  return [...events].sort((left, right) => left.sequence - right.sequence);
}
