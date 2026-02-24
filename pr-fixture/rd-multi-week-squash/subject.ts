export function selectThreshold(signalDensity: number, sampleSize: number, variance: number): number {
  if (sampleSize < 10 || variance > 0.3) return 0.6;
  if (signalDensity >= 0.75) return 0.8;
  return signalDensity >= 0.5 ? 0.7 : 0.5;
}
