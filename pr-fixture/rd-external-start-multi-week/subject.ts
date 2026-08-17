export interface EvidenceEvent {
  id: string;
  sequence: number;
  payload: string;
}

export function recoverEvidence(events: EvidenceEvent[], maximumGap: number): EvidenceEvent[] {
  if (!Number.isSafeInteger(maximumGap) || maximumGap < 0) {
    throw new RangeError("maximumGap must be a non-negative integer");
  }
  const latestById = new Map<string, EvidenceEvent>();
  for (const event of events) {
    const current = latestById.get(event.id);
    if (!current || event.sequence > current.sequence) latestById.set(event.id, event);
  }
  const ordered = [...latestById.values()].sort((left, right) => left.sequence - right.sequence);
  return ordered.filter((event, index) => index === 0 || event.sequence - ordered[index - 1].sequence <= maximumGap);
}
