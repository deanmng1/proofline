// Accept UTC with seconds and optional millisecond precision; never invoke local-time parsing.
export function assertUtcTimestamp(value: string): string {
  const match =
    typeof value === "string"
      ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value)
      : null;
  if (!match) throw new Error("A valid ISO-UTC timestamp is required.");
  const canonical = `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
  const parsed = new Date(canonical);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical)
    throw new Error("A valid ISO-UTC timestamp is required.");
  return value;
}
