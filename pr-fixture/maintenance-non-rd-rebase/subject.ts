export function formatLabel(value: string | null): string {
  if (value === null || value.trim() === "") return "";
  return value.trim().replace(/\s+/g, " ");
}
