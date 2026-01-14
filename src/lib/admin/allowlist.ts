export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function emailInAllowlist(email: string | null | undefined, allowlist: string[]): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return allowlist.includes(normalized);
}
