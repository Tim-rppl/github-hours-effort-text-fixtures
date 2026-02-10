export function selectThreshold(signalDensity: number): number {
  return signalDensity >= 0.5 ? 0.7 : 0.5;
}
