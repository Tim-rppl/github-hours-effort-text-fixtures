export interface EvidenceEvent {
  id: string;
  sequence: number;
  payload: string;
}

export function orderEvidence(events: EvidenceEvent[]): EvidenceEvent[] {
  return [...events].sort((left, right) => left.sequence - right.sequence);
}
