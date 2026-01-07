export interface ActivitySignal {
  uncertainty: number;
  novelty: number;
}

export function classifyActivity(signal: ActivitySignal): "research" | "routine" | "review" {
  const confidence = signal.uncertainty * 0.6 + signal.novelty * 0.4;
  if (confidence >= 0.7) return "research";
  if (confidence <= 0.2) return "routine";
  return "review";
}
