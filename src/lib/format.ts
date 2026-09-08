export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function compactId(value: string, visible = 12): string {
  if (value.length <= visible) return value;
  return `${value.slice(0, visible - 1)}…`;
}

export function jsonPreview(value: Record<string, unknown> | null | undefined): string {
  if (!value || Object.keys(value).length === 0) return "No metadata";
  return JSON.stringify(value, null, 2);
}
