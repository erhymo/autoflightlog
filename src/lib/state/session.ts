export type SessionUser = { uid: string; email: string };

const KEY = "pilotlog_session";

export function getSessionUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}

export function setSessionUser(user: SessionUser) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearSessionUser() {
  localStorage.removeItem(KEY);
}

