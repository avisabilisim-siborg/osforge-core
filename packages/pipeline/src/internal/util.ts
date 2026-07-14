export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isFuture(value: string, now: string): boolean {
  const valueTime = Date.parse(value);
  const nowTime = Date.parse(now);
  return Number.isFinite(valueTime) && Number.isFinite(nowTime) && valueTime > nowTime;
}

export function isAtOrBefore(value: string, now: string): boolean {
  const valueTime = Date.parse(value);
  const nowTime = Date.parse(now);
  return Number.isFinite(valueTime) && Number.isFinite(nowTime) && valueTime <= nowTime;
}

export function isValidTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}
