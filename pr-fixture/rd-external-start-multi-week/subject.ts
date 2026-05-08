export interface EvidenceEvent {
  id: string;
  sequence: number;
  payload: string;
}

export function recoverEvidence(events: EvidenceEvent[]): EvidenceEvent[] {
  const latestById = new Map<string, EvidenceEvent>();
  for (const event of events) {
    const current = latestById.get(event.id);
    if (!current || event.sequence > current.sequence) latestById.set(event.id, event);
  }
  return [...latestById.values()].sort((left, right) => left.sequence - right.sequence);
}
