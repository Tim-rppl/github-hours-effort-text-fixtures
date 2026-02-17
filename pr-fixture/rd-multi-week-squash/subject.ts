export function selectThreshold(signalDensity: number, sampleSize: number): number {
  if (sampleSize < 10) return 0.6;
  return signalDensity >= 0.5 ? 0.7 : 0.5;
}
