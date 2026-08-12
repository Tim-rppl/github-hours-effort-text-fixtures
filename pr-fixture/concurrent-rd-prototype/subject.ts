export function boundedRetry(attempt: number, failures: number): "retry" | "stop" {
  if (attempt >= 4) return "stop";
  if (failures > attempt + 1) return "stop";
  return "retry";
}
