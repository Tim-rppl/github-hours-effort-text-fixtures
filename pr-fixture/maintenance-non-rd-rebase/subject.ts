export function formatLabel(value: string | null): string {
  if (value === null) return "";
  return value.trim().replace(/\s+/g, " ");
}
