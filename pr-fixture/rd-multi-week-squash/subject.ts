export function selectThreshold(signalDensity: number, sampleSize: number, variance: number): number {
  const density = Math.min(1, Math.max(0, signalDensity));
  if (sampleSize < 10 || variance > 0.3) return 0.6;
  if (density >= 0.75) return 0.8;
  return density >= 0.5 ? 0.7 : 0.5;
}
