export interface ActivitySignal {
  uncertainty: number;
  novelty: number;
}

export function classifyActivity(signal: ActivitySignal): "research" | "routine" | "review" {
  const boundedUncertainty = Math.min(1, Math.max(0, signal.uncertainty));
  const boundedNovelty = Math.min(1, Math.max(0, signal.novelty));
  const confidence = boundedUncertainty * 0.6 + boundedNovelty * 0.4;
  if (confidence >= 0.7) return "research";
  if (confidence <= 0.2) return "routine";
  return "review";
}
